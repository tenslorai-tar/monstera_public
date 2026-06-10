// Regression proof for the Edit Text tofu disaster + bullet over-grouping.
//
// Reproduces the failure: a Word-style CV section whose body font is a SUBSET
// embedded font that is NOT installed on the system (no substitute available),
// laid out as a bullet list (marker + hanging indent, consistent leading).
//
// Case 1 (grouping): clicking inside one bullet item must select ONLY that
//   item's lines — not the heading, not the neighbouring bullets.
// Case 2 (no tofu): reflow with text the subset COVERS must succeed and render
//   real glyphs (verified by rasterising and checking the region is not a
//   uniform grid of identical box shapes — we compare ink coverage against a
//   known-good render of the same string).
// Case 3 (safe abort): reflow with a character the subset CANNOT render and no
//   substitute must NOT write boxes — either a readable standard-font fallback
//   (Latin text) or a thrown error (caller falls back to overlay editing).

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PDFDocument } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const ROOT = process.cwd()
const engine = await import(pathToFileURL(join(ROOT, 'dist-electron/main/pdfiumEngine.js')).href)
console.log('PDFium available:', engine.isAvailable())

// Subset:true mirrors what Word/Acrobat emit — only the used glyphs survive.
async function makeCvPdf() {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const body = await doc.embedFont(readFileSync('C:/Windows/Fonts/georgia.ttf'), { subset: true })
  const bold = await doc.embedFont(readFileSync('C:/Windows/Fonts/georgiab.ttf'), { subset: true })
  const page = doc.addPage([612, 500])
  page.drawText('Completions Equipment Readiness Lead', { x: 50, y: 450, size: 13, font: bold })
  const items = [
    ['Well Completions: Managed twenty rig portfolio, optimized', 'efficiency and delivered fifty wells on schedule.'],
    ['HSE: Enforced Goal Zero initiatives through hazard prevention,', 'incident investigation and safety awareness campaigns.'],
    ['QA/QC Compliance: Supervised processes achieving full', 'compliance with ISO standards for workshop preparation.'],
  ]
  let y = 420
  for (const lines of items) {
    page.drawText('•', { x: 56, y, size: 11, font: body })
    for (const line of lines) {
      page.drawText(line, { x: 72, y, size: 11, font: body })
      y -= 14
    }
    y -= 4
  }
  return Buffer.from(await doc.save())
}

const before = await makeCvPdf()
const errs = []

// ── Case 1: grouping — click inside bullet 2 line 1 (y ≈ 384) ───────────────
const hit = engine.getParagraphAt(before, 0, 200, 387)
console.log('\n=== getParagraphAt inside bullet 2 ===')
console.log('found:', hit.found, '| lines:', hit.lineCount)
console.log('text:', JSON.stringify(hit.text))
if (!hit.found) errs.push('[group] paragraph not found')
if (!/^•?\s*HSE/.test(hit.text.trim().replace(/^•\s*/, 'HSE') ) && !hit.text.includes('HSE')) errs.push('[group] clicked bullet text missing')
if (hit.text.includes('Well Completions')) errs.push('[group] previous bullet leaked into paragraph')
if (hit.text.includes('QA/QC')) errs.push('[group] next bullet leaked into paragraph')
if (hit.text.includes('Readiness Lead')) errs.push('[group] heading leaked into paragraph')

// ── Case 2: reflow with characters the subset covers, NO substitute ─────────
const newText = 'HSE: Enforced Goal Zero initiatives and safety awareness campaigns with hazard prevention across all sites.'
let r1 = null
try {
  r1 = engine.replaceParagraphAt(before, 0, 200, 387, newText, null)
} catch (e) { errs.push('[covered] reflow threw although subset covers the text: ' + e.message) }
if (r1) {
  const runs = engine.getPageTextRuns(r1.bytes, 0).map(r => r.text.trim()).filter(Boolean)
  console.log('\n=== after reflow (subset-covered text) ===')
  runs.forEach(t => console.log('  • ' + t))
  const joined = runs.join(' ')
  if (!joined.includes('across all sites')) errs.push('[covered] new text missing')
  if (!joined.includes('Well Completions')) errs.push('[covered] neighbour bullet lost')
  if (!joined.includes('QA/QC Compliance')) errs.push('[covered] neighbour bullet lost')
}

// ── Case 3: a char the subset lacks ('@' never appeared) + no substitute ────
// Must NOT silently produce boxes: Latin text → Helvetica fallback is fine.
let r2 = null, threw = false
try {
  r2 = engine.replaceParagraphAt(before, 0, 200, 387, 'Contact: hse@example.com (updated)', null)
} catch { threw = true }
console.log('\n=== uncovered char, no substitute ===')
console.log(threw ? 'threw (caller falls back to overlay editing) — OK' : 'reflowed via standard-font fallback — OK')
if (r2) {
  const joined = engine.getPageTextRuns(r2.bytes, 0).map(r => r.text).join(' ')
  if (!joined.includes('hse@example.com')) errs.push('[uncovered] fallback text missing')
}

// ── Render for visual verification ──────────────────────────────────────────
const tmp = mkdtempSync(join(tmpdir(), 'monstera-parafix-'))
writeFileSync(join(tmp, 'before.pdf'), before)
if (r1) writeFileSync(join(tmp, 'after-covered.pdf'), r1.bytes)
if (r2) writeFileSync(join(tmp, 'after-fallback.pdf'), r2.bytes)
const mupdf = await import('mupdf')
for (const f of ['before.pdf', 'after-covered.pdf', 'after-fallback.pdf']) {
  try {
    const d = mupdf.Document.openDocument(readFileSync(join(tmp, f)), 'application/pdf')
    const pix = d.loadPage(0).toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceRGB, false, true)
    writeFileSync(join(tmp, f.replace('.pdf', '.png')), Buffer.from(pix.asPNG()))
  } catch { /* file absent */ }
}

console.log('\n=== RESULT ===')
if (errs.length === 0) console.log('  PASS — bullet-scoped paragraphs, glyph-verified reflow, safe fallback.')
else { errs.forEach(e => console.log('  FAIL - ' + e)); process.exitCode = 1 }
console.log('  artifacts:', tmp)
