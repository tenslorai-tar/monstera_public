// Inspect every embedded font program in a PDF: report the BaseFont name (what
// the PDF dictionary declares) vs the REAL name table inside the embedded font
// program (what the outlines actually are). Resolves the Aptos-vs-DIN mystery.
import { readFileSync } from 'node:fs'
import zlib from 'node:zlib'
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const path = process.argv[2] || 'C:/Users/emiso/Downloads/pages14.pdf'
const bytes = readFileSync(path)
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })

function inflate(stream) {
  const raw = Buffer.from(stream.getContents())
  const filter = stream.dict.get(PDFName.of('Filter'))
  const name = filter?.toString?.() ?? ''
  if (name.includes('FlateDecode')) {
    try { return zlib.inflateSync(raw) } catch { try { return zlib.inflateRawSync(raw) } catch { return raw } }
  }
  return raw
}

let n = 0
for (const [, obj] of doc.context.enumerateIndirectObjects()) {
  if (!(obj instanceof PDFDict)) continue
  if (obj.get(PDFName.of('Type')) !== PDFName.of('Font')) continue
  const baseFont = obj.get(PDFName.of('BaseFont'))
  const subtype = obj.get(PDFName.of('Subtype'))
  const dicts = [obj]
  const df = obj.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray)
  if (df) for (let i = 0; i < df.size(); i++) { const d = df.lookup(i); if (d instanceof PDFDict) dicts.push(d) }

  for (const d of dicts) {
    const fd = d.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict)
    if (!fd) continue
    let prog = null, kind = ''
    for (const k of ['FontFile2', 'FontFile3', 'FontFile']) {
      const s = fd.lookupMaybe(PDFName.of(k), PDFRawStream)
      if (s) { prog = s; kind = k; break }
    }
    n++
    const decl = baseFont?.toString?.() ?? '(none)'
    if (!prog) { console.log(`#${n} BaseFont=${decl} subtype=${subtype} — NOT embedded`); continue }
    let real = '(unparsed)', glyphs = '?', cover = '?'
    try {
      const buf = inflate(prog)
      const f = fontkit.create(buf)
      real = `${f.familyName} | sub=${f.subfamilyName} | ps=${f.postscriptName}`
      glyphs = f.numGlyphs
      const test = '0123456789ABCabc"/-. '
      const missing = [...test].filter(c => { try { return !f.hasGlyphForCodePoint(c.codePointAt(0)) } catch { return true } })
      cover = missing.length ? `MISSING [${missing.join('')}]` : 'full 0-9 A-C a-c symbols'
    } catch (e) { real = `(parse error: ${e.message})` }
    console.log(`#${n} BaseFont=${decl}  [${kind}]`)
    console.log(`    embedded real name: ${real}`)
    console.log(`    numGlyphs=${glyphs}   typing coverage: ${cover}`)
  }
}
console.log(`\nTotal font objects: ${n}`)
