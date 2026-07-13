// Proof: the signature verifier detects tampering.
// 1. Generate a self-signed cert + PKCS#12.
// 2. Build a PDF, add a signature placeholder, sign it (same path as pdf:sign).
// 3. Verify → expect integrity 'valid', hashMatches true.
// 4. Flip one byte inside the signed byte-range → verify → expect 'modified'.
//
// Run: node scripts/prove-sig-verify.mjs
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const forge = require('node-forge')
const { PDFDocument } = require('pdf-lib')
const { SignPdf } = require('@signpdf/signpdf')
const { P12Signer } = require('@signpdf/signer-p12')
const { pdflibAddPlaceholder } = require('@signpdf/placeholder-pdf-lib')

// ── verify logic (mirror of the pdf:verifySignatures handler) ─────────────────
function verifySignatures(pdfBuf) {
  const results = []
  const latin = pdfBuf.toString('latin1')
  const brRe = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g
  const rawSigs = []
  let bm
  while ((bm = brRe.exec(latin))) {
    const br = [+bm[1], +bm[2], +bm[3], +bm[4]]
    const gap = pdfBuf.subarray(br[0] + br[1], br[2]).toString('latin1')
    const lt = gap.indexOf('<'); const gt = lt >= 0 ? gap.indexOf('>', lt) : -1
    if (lt < 0 || gt < 0) continue
    const hexStr = gap.slice(lt + 1, gt).replace(/[^0-9A-Fa-f]/g, '')
    if (!hexStr) continue
    rawSigs.push({ byteRange: br, contents: Buffer.from(hexStr, 'hex') })
  }
  const derLength = (buf) => {
    if (buf[0] !== 0x30) return buf.length
    let li = buf[1], off = 2
    if (li & 0x80) { const n = li & 0x7f; li = 0; for (let i = 0; i < n; i++) li = (li << 8) | buf[off++] }
    return off + li
  }
  const findAttr = (attrs, oid) => {
    for (const a of attrs) {
      try {
        const attrOid = forge.asn1.derToOid(a.value[0].value)
        if (attrOid === oid) return a.value[1].value[0].value
      } catch {}
    }
    return null
  }
  for (const sig of rawSigs) {
    let hashMatches = false, signatureValid = false, signerName = 'Unknown'
    const br = sig.byteRange
    try {
      const der = sig.contents.subarray(0, derLength(sig.contents))
      const p7 = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(der.toString('binary')))
      const raw = p7.rawCapture ?? {}
      const signedContent = Buffer.concat([
        pdfBuf.subarray(br[0], br[0] + br[1]),
        pdfBuf.subarray(br[2], br[2] + br[3]),
      ])
      const digestOid = raw.digestAlgorithm ? forge.asn1.derToOid(raw.digestAlgorithm) : null
      const hashName = (digestOid && forge.pki.oids[digestOid]) || 'sha256'
      const attrs = raw.authenticatedAttributes
      const signature = raw.signature
      if (attrs && attrs.length && signature) {
        const mdAttr = findAttr(attrs, forge.pki.oids.messageDigest)
        if (mdAttr != null) {
          const md = forge.md[hashName].create(); md.update(signedContent.toString('binary'))
          hashMatches = md.digest().getBytes() === mdAttr
        }
        const set = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, attrs)
        const attrDer = forge.asn1.toDer(set).getBytes()
        for (const cert of (p7.certificates ?? [])) {
          try {
            const vmd = forge.md[hashName].create(); vmd.update(attrDer)
            if (cert.publicKey.verify(vmd.digest().bytes(), signature)) { signatureValid = true; break }
          } catch {}
        }
      }
      const signer = (p7.certificates ?? [])[0]
      if (signer) signerName = signer.subject.getField('CN')?.value ?? 'Unknown'
    } catch (e) { /* unknown */ }
    const integrity = hashMatches && signatureValid ? 'valid' : (!hashMatches ? 'modified' : 'unknown')
    results.push({ signerName, hashMatches, signatureValid, integrity })
  }
  return results
}

// ── build a self-signed PKCS#12 ───────────────────────────────────────────────
function makeP12(passphrase) {
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date(Date.now() - 86400000)
  cert.validity.notAfter = new Date(Date.now() + 365 * 86400000)
  const attrs = [{ name: 'commonName', value: 'Monstera Test Signer' }, { name: 'organizationName', value: 'Tenslor Inc.' }]
  cert.setSubject(attrs); cert.setIssuer(attrs)
  cert.sign(keys.privateKey, forge.md.sha256.create())
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], passphrase, { algorithm: '3des' })
  return Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary')
}

async function main() {
  const pass = 'test1234'
  const p12 = makeP12(pass)

  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  page.drawText('Monstera signature integrity proof.', { x: 72, y: 720, size: 18 })
  await pdflibAddPlaceholder({ pdfDoc: doc, reason: 'Approved', contactInfo: '', name: 'Monstera Test Signer', location: '' })
  const prepared = Buffer.from(await doc.save({ useObjectStreams: false }))
  const signer = new P12Signer(p12, { passphrase: pass })
  const signed = Buffer.from(await new SignPdf().sign(prepared, signer))

  console.log('=== Signed document ===')
  const good = verifySignatures(signed)
  console.log(JSON.stringify(good, null, 2))

  // Tamper: flip one byte in the middle of the first signed span. (Content
  // streams are compressed so we target by offset, not by literal text.)
  const tampered = Buffer.from(signed)
  const m = tampered.toString('latin1').match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/)
  const br = [ +m[1], +m[2], +m[3], +m[4] ]
  const idx = br[0] + Math.floor(br[1] / 2)   // safely inside signed span 1
  tampered[idx] = tampered[idx] ^ 0x01         // flip one bit of one byte
  console.log('\n=== Tampered document (1 byte changed) ===')
  const bad = verifySignatures(tampered)
  console.log(JSON.stringify(bad, null, 2))

  // Assertions
  const okGood = good.length === 1 && good[0].integrity === 'valid' && good[0].hashMatches && good[0].signatureValid
  const okBad  = bad.length === 1 && bad[0].integrity === 'modified' && bad[0].hashMatches === false
  console.log('\n=== RESULT ===')
  console.log('signed → valid   :', okGood ? 'PASS' : 'FAIL')
  console.log('tampered → modified:', okBad ? 'PASS' : 'FAIL')
  if (!okGood || !okBad) process.exit(1)
  console.log('\nALL PASS — tamper detection works.')
}
main().catch(e => { console.error(e); process.exit(1) })
