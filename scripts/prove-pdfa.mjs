// Headless proof of the PDF/A-2b converter.
//
// Case A: a PDF with an embedded font → expect ok=true and, structurally:
//   - catalog /Metadata stream, UNFILTERED, containing pdfaid part 2 / B
//   - /OutputIntents with GTS_PDFA1 + DestOutputProfile (N 3)
//   - trailer /ID present
// Case B: a PDF using a non-embedded standard font → expect a font blocker
//   and ok=false (honest report), with the fixes still applied.

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream, StandardFonts } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const ROOT = process.cwd()
const { convertToPdfA } = await import(pathToFileURL(join(ROOT, 'dist-electron/main/pdfaExport.js')).href)

async function makePdf(embedded) {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = embedded
    ? await doc.embedFont(readFileSync('C:/Windows/Fonts/georgia.ttf'), { subset: true })
    : await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([400, 300])
  page.drawText('Archival test document.', { x: 40, y: 200, size: 14, font })
  doc.setTitle('Archive Me')
  doc.setAuthor('Monstera')
  return Buffer.from(await doc.save())
}

const errs = []

async function inspect(outBytes, label) {
  const doc = await PDFDocument.load(outBytes)
  const cat = doc.catalog
  // Metadata stream
  const metaRef = cat.get(PDFName.of('Metadata'))
  const meta = metaRef ? doc.context.lookup(metaRef) : null
  if (!(meta instanceof PDFRawStream)) { errs.push(`[${label}] catalog /Metadata stream missing`); return }
  if (meta.dict.get(PDFName.of('Filter'))) errs.push(`[${label}] XMP metadata stream is filtered (forbidden)`)
  const xml = Buffer.from(meta.contents).toString('utf8')
  if (!xml.includes('<pdfaid:part>2</pdfaid:part>')) errs.push(`[${label}] pdfaid:part 2 missing`)
  if (!xml.includes('<pdfaid:conformance>B</pdfaid:conformance>')) errs.push(`[${label}] pdfaid:conformance B missing`)
  if (!xml.includes('Archive Me')) errs.push(`[${label}] dc:title not synced from Info`)
  // OutputIntents
  const oi = cat.lookupMaybe(PDFName.of('OutputIntents'), PDFArray)
  const oi0 = oi && oi.size() > 0 ? oi.lookupMaybe(0, PDFDict) : null
  if (!oi0) errs.push(`[${label}] OutputIntents missing`)
  else {
    if (oi0.get(PDFName.of('S'))?.toString() !== '/GTS_PDFA1') errs.push(`[${label}] OutputIntent S != GTS_PDFA1`)
    const prof = oi0.get(PDFName.of('DestOutputProfile'))
    const profStream = prof ? doc.context.lookup(prof) : null
    if (!profStream) errs.push(`[${label}] DestOutputProfile missing`)
  }
  // trailer ID
  if (!doc.context.trailerInfo.ID) errs.push(`[${label}] trailer /ID missing`)
  console.log(`[${label}] structural checks done`)
}

// Case A — embedded font
const a = await makePdf(true)
const ra = await convertToPdfA(a)
console.log('\n=== Case A (embedded font) ===')
ra.report.forEach(r => console.log(`  ${r.level.toUpperCase().padEnd(8)} ${r.message}`))
if (!ra.ok) errs.push('[A] expected ok=true for fully-embedded document')
if (!ra.report.some(r => r.level === 'ok' && r.message.includes('fonts are embedded'))) errs.push('[A] font check did not pass')
await inspect(ra.bytes, 'A')

// Case B — standard (non-embedded) font
const b = await makePdf(false)
const rb = await convertToPdfA(b)
console.log('\n=== Case B (non-embedded Helvetica) ===')
rb.report.forEach(r => console.log(`  ${r.level.toUpperCase().padEnd(8)} ${r.message}`))
if (rb.ok) errs.push('[B] expected ok=false when fonts are unembedded')
if (!rb.report.some(r => r.level === 'blocker' && r.message.includes('not embedded'))) errs.push('[B] missing font blocker')
await inspect(rb.bytes, 'B')

const tmp = mkdtempSync(join(tmpdir(), 'monstera-pdfa-'))
writeFileSync(join(tmp, 'pdfa-embedded.pdf'), ra.bytes)
writeFileSync(join(tmp, 'pdfa-unembedded.pdf'), rb.bytes)

console.log('\n=== RESULT ===')
if (errs.length === 0) console.log('  PASS — converter output is structurally PDF/A-2b and the report is honest.')
else { errs.forEach(e => console.log('  FAIL - ' + e)); process.exitCode = 1 }
console.log('  artifacts:', tmp)
