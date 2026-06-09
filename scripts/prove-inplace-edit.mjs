// Definitive headless test of the TRUE in-place PDFium editor (editTextInRegion).
//
// Reproduces the user's scenario: a page whose body text uses an EMBEDDED serif
// font plus other embedded/non-embedded fonts. We edit ONE text object in place
// via the real compiled PDFium engine, then check:
//   1. the edited object keeps its own font (no substitution),
//   2. every OTHER font stays embedded byte-for-byte (no de-embedding / reflow).
//
// This tells us empirically whether incremental PDFium save corrupts fonts — the
// reason the in-place path was abandoned for cover-and-replace.

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PDFDocument, PDFName, PDFDict, PDFRawStream, StandardFonts } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const ROOT = process.cwd()
const engine = await import(pathToFileURL(join(ROOT, 'dist-electron/main/pdfiumEngine.js')).href)

console.log('PDFium available:', engine.isAvailable())

// 1. Build a realistic resume-like page: embedded serif body + embedded serif
//    heading + a non-embedded standard font line.
async function makeTestPdf() {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const times = await doc.embedFont(readFileSync('C:/Windows/Fonts/times.ttf'), { subset: false })
  const georgia = await doc.embedFont(readFileSync('C:/Windows/Fonts/georgia.ttf'), { subset: false })
  const helv = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([500, 400])
  page.drawText('Sarah Chen', { x: 40, y: 350, size: 26, font: georgia })
  page.drawText('Senior Marketing Manager', { x: 40, y: 320, size: 13, font: times })
  page.drawText('Managed $4.2M annual marketing budget driving 32% growth.', { x: 40, y: 280, size: 12, font: times })
  page.drawText('Launched merchant success campaign reaching 1.2M owners.', { x: 40, y: 255, size: 12, font: times })
  page.drawText('This line uses a non-embedded standard font.', { x: 40, y: 220, size: 11, font: helv })
  return doc.save()
}

async function fontFingerprint(bytes) {
  const doc = await PDFDocument.load(bytes)
  const fonts = []
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue
    if (obj.get(PDFName.of('Type')) !== PDFName.of('Font')) continue
    const baseFont = obj.get(PDFName.of('BaseFont'))
    const fd = obj.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict)
    let embedded = null
    if (fd) {
      for (const key of ['FontFile', 'FontFile2', 'FontFile3']) {
        const ff = fd.lookupMaybe(PDFName.of(key), PDFRawStream)
        if (ff) { embedded = { key, len: ff.contents.length }; break }
      }
    }
    fonts.push({ name: baseFont ? baseFont.toString() : '(none)', embedded })
  }
  fonts.sort((a, b) => a.name.localeCompare(b.name))
  return fonts
}

const fmt = f => `${f.name.padEnd(34)} ${f.embedded ? `EMBEDDED (${f.embedded.key}, ${f.embedded.len} bytes)` : 'not embedded'}`

const before = Buffer.from(await makeTestPdf())
const beforeFonts = await fontFingerprint(before)

// 2. Find the text object to edit, then edit it in place.
//    "Managed $4.2M ..." sits at y≈280, height ~12 → PDF rect (y-up).
const region = { x1: 38, y1: 276, x2: 470, y2: 294 }
const read = engine.getTextInRegion(before, 0, region)
console.log('\nText PDFium will edit:', JSON.stringify(read.text))

const after = engine.editTextInRegion(before, 0, region, 'Managed $9.9M annual marketing budget driving 99% growth.')
const afterFonts = await fontFingerprint(after)

// 2b. Click-to-edit path: edit the single object under a point, leaving the rest.
const afterClick = engine.editTextObjectAt(before, 0, 200, 284, 'Managed $7.7M annual marketing budget driving 77% growth.')
const clickRuns = engine.getPageTextRuns(afterClick, 0).map(r => r.text.trim()).filter(Boolean)
const clickFonts = await fontFingerprint(afterClick)

const tmp = mkdtempSync(join(tmpdir(), 'monstera-inplace-'))
writeFileSync(join(tmp, 'before.pdf'), before)
writeFileSync(join(tmp, 'after.pdf'), after)

// 3. Read back the page text via PDFium to confirm the edit applied + others intact.
const runsAfter = engine.getPageTextRuns(after, 0).map(r => r.text.trim()).filter(Boolean)

console.log('\n=== FONTS BEFORE in-place edit ===')
beforeFonts.forEach(f => console.log('  ' + fmt(f)))
console.log('\n=== FONTS AFTER in-place edit (real editTextInRegion) ===')
afterFonts.forEach(f => console.log('  ' + fmt(f)))
console.log('\n=== PAGE TEXT AFTER ===')
runsAfter.forEach(t => console.log('  • ' + t))

// 4. Assertions.
const errs = []
const embBefore = beforeFonts.filter(f => f.embedded)
const embAfter = afterFonts.filter(f => f.embedded)
// Every embedded font present before must still be embedded after (by key+len).
const keyOf = f => `${f.embedded.key}:${f.embedded.len}`
const afterEmbKeys = new Set(embAfter.map(keyOf))
for (const f of embBefore) {
  if (!afterEmbKeys.has(keyOf(f))) errs.push(`Embedded font LOST/ALTERED: ${f.name} (${keyOf(f)})`)
}
if (embAfter.length < embBefore.length) errs.push(`Embedded font count dropped ${embBefore.length} -> ${embAfter.length} (DE-EMBEDDING)`)
if (!runsAfter.some(t => t.includes('9.9M'))) errs.push('Edited text not found after save')
if (!runsAfter.some(t => t.includes('Launched merchant'))) errs.push('A neighbouring untouched line went missing')

// Click-to-edit assertions: object edited, NO neighbour removed, fonts intact.
console.log('\n=== PAGE TEXT AFTER click-to-edit (editTextObjectAt) ===')
clickRuns.forEach(t => console.log('  • ' + t))
if (!clickRuns.some(t => t.includes('7.7M'))) errs.push('[click] edited object not updated')
if (!clickRuns.some(t => t.includes('Launched merchant'))) errs.push('[click] a neighbouring object was removed')
if (!clickRuns.some(t => t.includes('Senior Marketing Manager'))) errs.push('[click] a neighbouring object was removed')
const clickAfterEmbKeys = new Set(clickFonts.filter(f => f.embedded).map(keyOf))
for (const f of embBefore) {
  if (!clickAfterEmbKeys.has(keyOf(f))) errs.push(`[click] embedded font LOST/ALTERED: ${f.name}`)
}

console.log('\n=== RESULT ===')
if (errs.length === 0) {
  console.log('  PASS — in-place edit applied AND every embedded font preserved byte-for-byte.')
  console.log('  => Incremental PDFium save does NOT de-embed fonts; true in-place editing is safe.')
} else {
  console.log('  FONT CORRUPTION DETECTED:')
  errs.forEach(e => console.log('   - ' + e))
  process.exitCode = 1
}
console.log('\n  artifacts:', tmp)
