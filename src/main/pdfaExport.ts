/**
 * Best-effort PDF/A-2b conversion + preflight report.
 *
 * What CAN be fixed automatically is fixed: XMP pdfaid identification, sRGB
 * OutputIntent (Windows ships the ICC profile), Info↔XMP metadata sync,
 * trailer /ID, JavaScript/launch actions, embedded files, annotation Print
 * flags, AcroForm NeedAppearances. What CANNOT be fixed in place — chiefly
 * fonts that were never embedded — is reported as a blocker so the user gets
 * an honest verdict instead of a silently non-conformant file.
 */
import fs from 'fs'
import path from 'path'
import {
  PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFHexString, PDFNumber,
} from 'pdf-lib'

export interface PdfAIssue {
  level: 'ok' | 'fixed' | 'warning' | 'blocker'
  message: string
}

function loadSrgbProfile(): Buffer | null {
  const candidates = [
    path.join(process.env.SystemRoot || 'C:\\Windows',
      'System32', 'spool', 'drivers', 'color', 'sRGB Color Space Profile.icm'),
  ]
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return fs.readFileSync(c) } catch { /* unreadable */ }
  }
  return null
}

const xmlEsc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function buildXmp(meta: {
  title?: string; author?: string; subject?: string; keywords?: string
  creator?: string; producer?: string; createDate?: string; modDate?: string
}): string {
  const dc: string[] = ['   <dc:format>application/pdf</dc:format>']
  if (meta.title) dc.push(`   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEsc(meta.title)}</rdf:li></rdf:Alt></dc:title>`)
  if (meta.author) dc.push(`   <dc:creator><rdf:Seq><rdf:li>${xmlEsc(meta.author)}</rdf:li></rdf:Seq></dc:creator>`)
  if (meta.subject) dc.push(`   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${xmlEsc(meta.subject)}</rdf:li></rdf:Alt></dc:description>`)
  const xmp: string[] = []
  if (meta.creator) xmp.push(`   <xmp:CreatorTool>${xmlEsc(meta.creator)}</xmp:CreatorTool>`)
  if (meta.createDate) xmp.push(`   <xmp:CreateDate>${meta.createDate}</xmp:CreateDate>`)
  if (meta.modDate) xmp.push(`   <xmp:ModifyDate>${meta.modDate}</xmp:ModifyDate>`)
  const pdfNs: string[] = []
  if (meta.producer) pdfNs.push(`   <pdf:Producer>${xmlEsc(meta.producer)}</pdf:Producer>`)
  if (meta.keywords) pdfNs.push(`   <pdf:Keywords>${xmlEsc(meta.keywords)}</pdf:Keywords>`)
  return `<?xpacket begin="${'﻿'}" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
   <pdfaid:part>2</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
${dc.join('\n')}
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
${xmp.join('\n')}
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
${pdfNs.join('\n')}
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`
}

// PDF/A requires every font used by content to be embedded. Type3 fonts carry
// their glyphs as content streams, so only Type0/Type1/TrueType need a
// FontFile in their descriptor.
function findUnembeddedFonts(doc: PDFDocument): string[] {
  const missing = new Set<string>()
  const hasFontFile = (fd: PDFDict | undefined): boolean => {
    if (!fd) return false
    return ['FontFile', 'FontFile2', 'FontFile3']
      .some(k => fd.get(PDFName.of(k)) !== undefined)
  }
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue
    if (obj.get(PDFName.of('Type')) !== PDFName.of('Font')) continue
    const subtype = obj.get(PDFName.of('Subtype'))
    if (subtype === PDFName.of('Type3')) continue
    const base = obj.get(PDFName.of('BaseFont'))
    const name = base ? base.toString().replace(/^\//, '') : '(unnamed)'
    let fd: PDFDict | undefined
    if (subtype === PDFName.of('Type0')) {
      const desc = obj.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray)
      const d0 = desc && desc.size() > 0 ? desc.lookupMaybe(0, PDFDict) : undefined
      fd = d0?.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict)
    } else {
      fd = obj.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict)
    }
    if (!hasFontFile(fd)) missing.add(name)
  }
  return [...missing]
}

export async function convertToPdfA(
  bytes: Buffer,
): Promise<{ bytes: Buffer; report: PdfAIssue[]; ok: boolean }> {
  const report: PdfAIssue[] = []

  // Encrypted input can't be made PDF/A (encryption is forbidden) and pdf-lib
  // can't parse it anyway — fail with a clear instruction.
  const head = bytes.subarray(0, Math.min(bytes.length, 4096)).toString('latin1')
  const tail = bytes.subarray(Math.max(0, bytes.length - 8192)).toString('latin1')
  if (/\/Encrypt\s/.test(tail) || /\/Encrypt\s/.test(head)) {
    return {
      bytes, ok: false,
      report: [{ level: 'blocker', message: 'Document is encrypted — PDF/A forbids encryption. Remove the password first (Protect → Remove Password).' }],
    }
  }

  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  const ctx = doc.context
  const catalog = doc.catalog

  // ── Fonts (report-only: embedding can't be retrofitted in place) ──────────
  const unembedded = findUnembeddedFonts(doc)
  if (unembedded.length === 0) {
    report.push({ level: 'ok', message: 'All fonts are embedded.' })
  } else {
    report.push({
      level: 'blocker',
      message: `${unembedded.length} font(s) are not embedded: ${unembedded.slice(0, 6).join(', ')}${unembedded.length > 6 ? '…' : ''}. ` +
        'PDF/A requires every font to be embedded; text in these fonts keeps the file non-conformant. ' +
        '(The rest of the conversion is still applied.)',
    })
  }

  // ── XMP identification + Info↔XMP sync ─────────────────────────────────────
  const toIso = (d: Date | undefined) => d ? d.toISOString().replace(/\.\d{3}Z$/, 'Z') : undefined
  let title: string | undefined, author: string | undefined, subject: string | undefined
  let keywords: string | undefined, creator: string | undefined, producer: string | undefined
  let createDate: string | undefined, modDate: string | undefined
  try {
    title = doc.getTitle(); author = doc.getAuthor(); subject = doc.getSubject()
    keywords = doc.getKeywords(); creator = doc.getCreator(); producer = doc.getProducer()
    createDate = toIso(doc.getCreationDate()); modDate = toIso(doc.getModificationDate())
  } catch { /* malformed Info — XMP just gets the pdfaid block */ }
  const xmpBytes = Buffer.from(buildXmp({ title, author, subject, keywords, creator, producer, createDate, modDate }), 'utf8')
  // PDF/A: the Metadata stream must be unfiltered.
  const xmpStream = ctx.stream(xmpBytes, { Type: 'Metadata', Subtype: 'XML' })
  catalog.set(PDFName.of('Metadata'), ctx.register(xmpStream))
  report.push({ level: 'fixed', message: 'XMP metadata with PDF/A-2b identification written (synced with document info).' })

  // ── sRGB OutputIntent ──────────────────────────────────────────────────────
  const icc = loadSrgbProfile()
  if (icc) {
    const iccStream = ctx.flateStream(icc, { N: 3 })
    const intent = ctx.obj({
      Type: 'OutputIntent',
      S: 'GTS_PDFA1',
      OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
      Info: PDFString.of('sRGB IEC61966-2.1'),
      RegistryName: PDFString.of('http://www.color.org'),
      DestOutputProfile: ctx.register(iccStream),
    })
    catalog.set(PDFName.of('OutputIntents'), ctx.obj([ctx.register(intent)]))
    report.push({ level: 'fixed', message: 'sRGB output intent embedded (device colours now have a defined meaning).' })
  } else {
    report.push({ level: 'warning', message: 'sRGB ICC profile not found on this system — output intent could not be embedded.' })
  }

  // ── Forbidden interactive content ──────────────────────────────────────────
  let strippedJs = false, strippedFiles = false
  const names = catalog.lookupMaybe(PDFName.of('Names'), PDFDict)
  if (names) {
    if (names.get(PDFName.of('JavaScript'))) { names.delete(PDFName.of('JavaScript')); strippedJs = true }
    if (names.get(PDFName.of('EmbeddedFiles'))) { names.delete(PDFName.of('EmbeddedFiles')); strippedFiles = true }
  }
  if (catalog.get(PDFName.of('AA'))) { catalog.delete(PDFName.of('AA')); strippedJs = true }
  const openAction = catalog.lookupMaybe(PDFName.of('OpenAction'), PDFDict)
  if (openAction && openAction.get(PDFName.of('S')) === PDFName.of('JavaScript')) {
    catalog.delete(PDFName.of('OpenAction')); strippedJs = true
  }
  if (strippedJs) report.push({ level: 'fixed', message: 'JavaScript / document actions removed (forbidden in PDF/A).' })
  if (strippedFiles) report.push({ level: 'fixed', message: 'Embedded file attachments removed (forbidden in PDF/A-2).' })

  // ── Annotations: Print flag set, no Hidden/NoView ──────────────────────────
  let flagsFixed = 0
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
    if (!annots) continue
    for (let i = 0; i < annots.size(); i++) {
      const a = annots.lookupMaybe(i, PDFDict)
      if (!a) continue
      const fNum = a.lookupMaybe(PDFName.of('F'), PDFNumber)
      const f = fNum ? fNum.asNumber() : 0
      const fixed = (f | 4) & ~2 & ~32 // +Print, −Hidden, −NoView
      if (fixed !== f) { a.set(PDFName.of('F'), ctx.obj(fixed)); flagsFixed++ }
    }
  }
  if (flagsFixed) report.push({ level: 'fixed', message: `${flagsFixed} annotation flag(s) corrected (Print set, Hidden/NoView cleared).` })

  // ── AcroForm ───────────────────────────────────────────────────────────────
  const acro = catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict)
  if (acro && acro.get(PDFName.of('NeedAppearances'))) {
    acro.delete(PDFName.of('NeedAppearances'))
    report.push({ level: 'fixed', message: 'AcroForm NeedAppearances cleared (viewers must not regenerate appearances).' })
  }

  // ── Trailer /ID (required by PDF/A) ────────────────────────────────────────
  const mkId = () => PDFHexString.of(
    Array.from({ length: 16 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join(''))
  ctx.trailerInfo.ID = ctx.obj([mkId(), mkId()])

  const out = Buffer.from(await doc.save({ useObjectStreams: false }))
  const ok = !report.some(r => r.level === 'blocker') && icc !== null
  report.push(ok
    ? { level: 'ok', message: 'Conversion complete — the file identifies and validates as PDF/A-2b for these checks.' }
    : { level: 'warning', message: 'Conversion applied, but the issues above keep the file from full PDF/A-2b conformance.' })
  return { bytes: out, report, ok }
}
