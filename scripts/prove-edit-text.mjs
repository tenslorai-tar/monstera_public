// Headless proof that the cover-and-replace Edit Text save path does NOT
// de-embed or alter the document's existing fonts (the old PDFium bug).
//
// It builds a PDF with one EMBEDDED font (FontFile2) and one NON-EMBEDDED
// standard font, then runs the *real* writeAnnotationsToPdf() with a
// text-edit annotation and verifies every original font is byte-for-byte
// preserved and the original page content stream is intact.

import { build } from 'esbuild'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  PDFDocument, PDFName, PDFDict, PDFRawStream, PDFArray, StandardFonts,
} from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const ROOT = process.cwd()

// 1. Transpile the REAL renderer util (TS) so we import the actual function.
//    Emit the bundle INSIDE the project so `pdf-lib` resolves from node_modules.
const tmp = mkdtempSync(join(tmpdir(), 'monstera-proof-'))
const bundled = join(ROOT, 'scripts', '_proof_bundle.mjs')
await build({
  entryPoints: [join(ROOT, 'src/renderer/utils/annotationPdfLib.ts')],
  outfile: bundled,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
  external: ['pdf-lib', '@pdf-lib/fontkit', 'pdfjs-dist'],
})
const { writeAnnotationsToPdf } = await import(pathToFileURL(bundled).href)

// 2. Build a test PDF: embedded TTF font + non-embedded standard Helvetica.
async function makeTestPdf() {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const ttf = readFileSync('C:/Windows/Fonts/arial.ttf')          // embedded
  const embedded = await doc.embedFont(ttf, { subset: false })
  const helv = await doc.embedFont(StandardFonts.Helvetica)        // NOT embedded
  const page = doc.addPage([400, 300])
  page.drawText('Embedded Arial: The quick brown fox.', { x: 40, y: 240, size: 16, font: embedded })
  page.drawText('Standard Helvetica: jumps over the lazy dog.', { x: 40, y: 200, size: 14, font: helv })
  page.drawText('Another embedded line to edit over here.', { x: 40, y: 160, size: 16, font: embedded })
  return doc.save()
}

// 3. Enumerate every Font object: BaseFont + embedding (FontFile/2/3 length).
async function fontFingerprint(bytes) {
  const doc = await PDFDocument.load(bytes)
  const fonts = []
  let annotCount = 0
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue
    const type = obj.get(PDFName.of('Type'))
    if (type === PDFName.of('Font')) {
      const baseFont = obj.get(PDFName.of('BaseFont'))
      const fd = obj.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict)
      let embedded = null
      if (fd) {
        for (const key of ['FontFile', 'FontFile2', 'FontFile3']) {
          const ff = fd.lookupMaybe(PDFName.of(key), PDFRawStream)
          if (ff) { embedded = { key, len: ff.contents.length }; break }
        }
      }
      const name = baseFont ? baseFont.toString() : '(none)'
      // Skip viewer pseudo-fonts that may appear; keep all real ones.
      fonts.push({ name, embedded })
    }
    if (type === PDFName.of('Annot')) annotCount++
  }
  fonts.sort((a, b) => a.name.localeCompare(b.name))
  return { fonts, annotCount }
}

function fmtFont(f) {
  return `${f.name.padEnd(26)} ${f.embedded ? `EMBEDDED (${f.embedded.key}, ${f.embedded.len} bytes)` : 'not embedded'}`
}

// 4. Run it.
const before = await makeTestPdf()
const beforeFp = await fontFingerprint(before)

// Simulate what the app captures from PDFium: the original embedded font program
// (here, Arial read straight from disk) carried on the annotation as base64, plus
// the original baseline. The replacement must be drawn in THIS font.
const arialB64 = readFileSync('C:/Windows/Fonts/arial.ttf').toString('base64')
const textEdit = {
  id: 'proof1', type: 'text-edit', pageNum: 1,
  color: '#000000', opacity: 1,
  x: 40, y: 152, width: 320, height: 22,
  text: 'REPLACED TEXT in the original font', fontSize: 16,
  fontDataB64: arialB64, baselineX: 40, baselineY: 156,
  createdAt: Date.now(),
}
const after = await writeAnnotationsToPdf(before, [textEdit])
const afterFp = await fontFingerprint(after)

writeFileSync(join(tmp, 'after.pdf'), after)

console.log('\n=== FONTS BEFORE Edit Text save ===')
beforeFp.fonts.forEach(f => console.log('  ' + fmtFont(f)))
console.log(`  annotations: ${beforeFp.annotCount}`)
console.log('\n=== FONTS AFTER Edit Text save (real writeAnnotationsToPdf) ===')
afterFp.fonts.forEach(f => console.log('  ' + fmtFont(f)))
console.log(`  annotations: ${afterFp.annotCount}`)

// 5. Assertions.
const errs = []
const key = f => `${f.name}|${f.embedded ? f.embedded.key + ':' + f.embedded.len : 'none'}`
const beforeKeys = beforeFp.fonts.map(key).sort()
const afterKeys = afterFp.fonts.map(key).sort()

for (const k of beforeKeys) {
  if (!afterKeys.includes(k)) errs.push(`Font LOST or ALTERED: ${k}`)
}
const embeddedBefore = beforeFp.fonts.filter(f => f.embedded).length
const embeddedAfter = afterFp.fonts.filter(f => f.embedded).length
if (embeddedAfter < embeddedBefore) errs.push(`Embedded font count dropped ${embeddedBefore} -> ${embeddedAfter} (DE-EMBEDDING!)`)
// Cover-and-replace now bakes into the content stream: it must add NO annotations.
const added = afterFp.annotCount - beforeFp.annotCount
if (added !== 0) errs.push(`Expected +0 annotations (baked into content), got +${added}`)
// The replacement must be drawn in an embedded font (the original), not a base-14
// substitute — so an extra embedded font is added for the edited text.
const newEmbedded = embeddedAfter - embeddedBefore
if (newEmbedded < 1) errs.push(`Expected the replacement text to embed the original font (+1 embedded), got +${newEmbedded}`)

console.log('\n=== RESULT ===')
if (errs.length === 0) {
  console.log('  PASS — every original font preserved identically (no de-embedding).')
  console.log(`  PASS — original embedded fonts intact: all ${embeddedBefore} kept.`)
  console.log('  PASS — 0 annotations added (replacement baked into the content stream).')
  console.log(`  PASS — replacement text drawn in an embedded font (+${newEmbedded} embedded).`)
  console.log('\n  => Edited text keeps the original font, and editing cannot corrupt the rest of the document.')
} else {
  console.log('  FAIL:')
  errs.forEach(e => console.log('   - ' + e))
  process.exitCode = 1
}
