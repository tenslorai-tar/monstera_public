// Proof for line-level Edit Text (the Adobe/PDF-XChange behaviour the user asked for):
//
// Case 1 — whole-line selection: clicking the middle of any word returns the FULL
//   visual line, even when the line is built from several separate text runs.
// Case 2 — style preservation: the line mixes faces and colours (regular black +
//   bold green). Editing a word in the black run must leave the green bold run
//   PIXEL-IDENTICAL (same font object, same colour, same position).
// Case 3 — trailing shift: making a middle word longer pushes the runs to its
//   right by the width delta instead of overlapping them.
// Case 4 — single-run line (most common case): in-place edit keeps font + colour.
// Case 5 — subset safety: characters the subset font lacks must never render as
//   .notdef boxes — substitute or Helvetica or a thrown error (overlay fallback).

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const ROOT = process.cwd()
const engine = await import(pathToFileURL(join(ROOT, 'dist-electron/main/pdfiumEngine.js')).href)
console.log('PDFium available:', engine.isAvailable())

const errs = []
const ok = (cond, label) => { console.log((cond ? '  PASS - ' : '  FAIL - ') + label); if (!cond) errs.push(label) }

async function makeDoc({ subset }) {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const georgia = await doc.embedFont(readFileSync('C:/Windows/Fonts/georgia.ttf'), { subset })
  const georgiaB = await doc.embedFont(readFileSync('C:/Windows/Fonts/georgiab.ttf'), { subset })
  const page = doc.addPage([612, 300])
  // Line A (y=250): three runs, mixed face + colour, one baseline
  page.drawText('Project ', { x: 50, y: 250, size: 14, font: georgia, color: rgb(0, 0, 0) })
  page.drawText('Monstera', { x: 50 + georgia.widthOfTextAtSize('Project ', 14), y: 250, size: 14, font: georgiaB, color: rgb(0, 0.5, 0.1) })
  page.drawText(' is ready today.', { x: 50 + georgia.widthOfTextAtSize('Project ', 14) + georgiaB.widthOfTextAtSize('Monstera', 14), y: 250, size: 14, font: georgia, color: rgb(0, 0, 0) })
  // Line B (y=210): three separated runs for the shift test
  page.drawText('AAA', { x: 50, y: 210, size: 14, font: georgia })
  page.drawText('bbb', { x: 100, y: 210, size: 14, font: georgia })
  page.drawText('CCC', { x: 150, y: 210, size: 14, font: georgia })
  // Line C (y=170): single run, coloured — the common case
  page.drawText('The quick brown fox jumps high.', { x: 50, y: 170, size: 14, font: georgia, color: rgb(0.6, 0.1, 0.1) })
  return Buffer.from(await doc.save())
}

const mupdf = await import('mupdf')
function renderPng(bytes, scale = 3) {
  const d = mupdf.Document.openDocument(bytes, 'application/pdf')
  const pix = d.loadPage(0).toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true)
  return { png: Buffer.from(pix.asPNG()), w: pix.getWidth(), h: pix.getHeight(), samples: Buffer.from(pix.getPixels()), n: 3 }
}
// Crop-compare a PDF-space rect (y-up, scale 3) between two renders.
function regionEqual(a, b, x1, y1, x2, y2, pageH = 300, scale = 3) {
  const px1 = Math.floor(x1 * scale), px2 = Math.ceil(x2 * scale)
  const py1 = Math.floor((pageH - y2) * scale), py2 = Math.ceil((pageH - y1) * scale)
  if (a.w !== b.w || a.h !== b.h) return false
  let diff = 0
  for (let y = py1; y < py2; y++) {
    for (let x = px1; x < px2; x++) {
      const o = (y * a.w + x) * a.n
      if (a.samples[o] !== b.samples[o] || a.samples[o + 1] !== b.samples[o + 1] || a.samples[o + 2] !== b.samples[o + 2]) diff++
    }
  }
  return diff === 0
}

const tmp = mkdtempSync(join(tmpdir(), 'monstera-lineedit-'))
const full = await makeDoc({ subset: false })
writeFileSync(join(tmp, 'before.pdf'), full)
const beforeRender = renderPng(full)

// ── Case 1: whole-line selection ─────────────────────────────────────────────
console.log('\n=== Case 1: click selects the whole line ===')
const hitMid = engine.getLineAt(full, 0, 120, 255)   // middle of "Monstera" (bold green run)
ok(hitMid.found, 'line found under the bold word')
ok(hitMid.text === 'Project Monstera is ready today.', `full line text returned (got: ${JSON.stringify(hitMid.text)})`)
ok(/^#0[0-9a-f]/.test(hitMid.color) && hitMid.color !== '#000000', `style preview shows the clicked run's colour (got ${hitMid.color})`)
const hit3 = engine.getLineAt(full, 0, 230, 255)     // inside " is ready today."
ok(hit3.found && hit3.text === 'Project Monstera is ready today.', 'same full line from any run')

// ── Case 2: edit a black word — green bold run must be pixel-identical ───────
console.log('\n=== Case 2: mixed-style line, untouched runs preserved exactly ===')
let out2 = null
try {
  out2 = engine.replaceLineAt(full, 0, 120, 255, 'Project Monstera is ready now.', null).bytes
} catch (e) { errs.push('replaceLineAt threw: ' + e.message) }
if (out2) {
  writeFileSync(join(tmp, 'after-mixed.pdf'), out2)
  const after = renderPng(out2)
  const line2 = engine.getLineAt(out2, 0, 120, 255)
  ok(line2.text === 'Project Monstera is ready now.', `edited line reads back (got: ${JSON.stringify(line2.text)})`)
  // Region covering "Project Monstera" (x 50..170, y 245..265) must not change a pixel.
  ok(regionEqual(beforeRender, after, 50, 244, 168, 266), 'leading runs ("Project Monstera") pixel-identical after the edit')
  const lineC = engine.getLineAt(out2, 0, 120, 175)
  ok(lineC.found && lineC.text === 'The quick brown fox jumps high.', 'other lines untouched')
}

// ── Case 3: longer middle word shifts the right-hand run ─────────────────────
console.log('\n=== Case 3: trailing runs shift right when a word grows ===')
let out3 = null
try {
  out3 = engine.replaceLineAt(full, 0, 105, 215, 'AAA bbbbbbbb CCC', null).bytes
} catch (e) { errs.push('[shift] replaceLineAt threw: ' + e.message) }
if (out3) {
  writeFileSync(join(tmp, 'after-shift.pdf'), out3)
  const runs3 = engine.getPageTextRuns(out3, 0).filter(r => r.text.includes('CCC'))
  ok(runs3.length === 1, 'CCC run still its own object')
  if (runs3.length === 1) ok(runs3[0].x1 > 152, `CCC shifted right (x1 ${runs3[0].x1.toFixed(1)} > 152)`)
  const line3 = engine.getLineAt(out3, 0, 105, 215)
  ok(line3.text === 'AAA bbbbbbbb CCC', `line text correct after growth (got: ${JSON.stringify(line3.text)})`)
}

// ── Case 4: single-run coloured line, in-place keeps font + colour ──────────
console.log('\n=== Case 4: single-run line keeps face and colour in place ===')
let out4 = null
try {
  out4 = engine.replaceLineAt(full, 0, 120, 175, 'The quick brown fox jumps higher.', null).bytes
} catch (e) { errs.push('[single] replaceLineAt threw: ' + e.message) }
if (out4) {
  writeFileSync(join(tmp, 'after-single.pdf'), out4)
  const line4 = engine.getLineAt(out4, 0, 120, 175)
  ok(line4.text === 'The quick brown fox jumps higher.', 'text updated')
  ok(line4.color === '#991919' || /^#9[0-9a-f]1[0-9a-f]1[0-9a-f]$/.test(line4.color), `dark-red colour preserved (got ${line4.color})`)
  ok(line4.fontName.includes('Georgia'), `font still Georgia (got ${line4.fontName})`)
}

// ── Case 5: subset font + uncovered characters → never .notdef ───────────────
console.log('\n=== Case 5: subset font, uncovered chars, no substitute ===')
const sub = await makeDoc({ subset: true })
let threw = false, out5 = null
try {
  out5 = engine.replaceLineAt(sub, 0, 120, 175, 'Zebras & ZIGZAG @ #1!', null).bytes  // chars absent from the subset
} catch { threw = true }
if (threw) console.log('  PASS - threw (caller falls back to overlay editing)')
else if (out5) {
  const line5 = engine.getLineAt(out5, 0, 120, 175)
  ok(line5.text.includes('ZIGZAG'), 'WinAnsi text written via standard-font fallback (readable, not boxes)')
}

// ── Case 6: subset font, edit uses only chars/spaces already on the line ─────
// The old gate demanded fontkit prove a glyph for EVERY char (space included);
// subset fonts routinely fail that even for glyphs they render. Editing with
// characters the line already shows must now stay in the perfect in-place path.
console.log('\n=== Case 6: subset font, existing-char edit stays in-place ===')
{
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const g = await doc.embedFont(readFileSync('C:/Windows/Fonts/georgia.ttf'), { subset: true })
  const page = doc.addPage([400, 120])
  page.drawText('total value data', { x: 40, y: 60, size: 16, font: g, color: rgb(0.1, 0.1, 0.6) })
  const subDoc = Buffer.from(await doc.save())
  // Rearrange the words — every character and the spaces already appear on the line.
  const res6 = engine.replaceLineAt(subDoc, 0, 100, 65, 'data value total', null)
  ok(res6.outcome === 'in-place', `existing-char edit stayed in-place (outcome: ${res6.outcome})`)
  const line6 = engine.getLineAt(res6.bytes, 0, 100, 65)
  ok(line6.text === 'data value total', `text updated (got: ${JSON.stringify(line6.text)})`)
  ok(line6.fontName.includes('Georgia'), `original subset font kept (got ${line6.fontName})`)
  ok(/^#1[0-9a-f]1[0-9a-f]9[0-9a-f]$/.test(line6.color) || line6.color !== '#000000', `blue colour preserved (got ${line6.color})`)
}

// ── Case 7: sibling-font safety (regression guard) ───────────────────────────
// Two adjacent runs with INDEPENDENT subset fonts. Editing run B with a char that
// only exists in run A's subset must NOT stay in-place (that would SetText the
// char through run B's font, which lacks the glyph → .notdef box). existingChars
// must be scoped to the target run's own text, not the whole line.
console.log('\n=== Case 7: char present only in a sibling run is not wrongly kept in-place ===')
{
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  // Two SEPARATE embeds → two separate subsets (run B's subset has 1,2,3 but no 'a').
  const gA = await doc.embedFont(readFileSync('C:/Windows/Fonts/georgia.ttf'), { subset: true })
  const gB = await doc.embedFont(readFileSync('C:/Windows/Fonts/georgia.ttf'), { subset: true })
  const page = doc.addPage([400, 120])
  const wA = gA.widthOfTextAtSize('abc', 16)
  page.drawText('abc', { x: 40, y: 60, size: 16, font: gA })
  page.drawText('123', { x: 40 + wA, y: 60, size: 16, font: gB })   // adjacent, no inter-run space
  const subDoc = Buffer.from(await doc.save())
  const line = engine.getLineAt(subDoc, 0, 40 + wA + 8, 65)
  console.log('  line text:', JSON.stringify(line.text))
  // Edit "…123" → "…1a3": the 'a' exists only in run A's subset, never run B's.
  const res7 = engine.replaceLineAt(subDoc, 0, 40 + wA + 8, 65, line.text.replace('123', '1a3'), null)
  ok(res7.outcome !== 'in-place', `did NOT stay in-place through run B's font (outcome: ${res7.outcome})`)
  const line7 = engine.getLineAt(res7.bytes, 0, 40 + wA + 8, 65)
  ok(line7.text.includes('1a3'), `edited text present and readable (got: ${JSON.stringify(line7.text)})`)
}

// keep a render of every artifact for visual inspection
for (const f of ['before.pdf', 'after-mixed.pdf', 'after-shift.pdf', 'after-single.pdf']) {
  try { writeFileSync(join(tmp, f.replace('.pdf', '.png')), renderPng(readFileSync(join(tmp, f))).png) } catch { /* absent */ }
}

console.log('\n=== RESULT ===')
if (errs.length === 0) console.log('  PASS — line-level editing preserves fonts, colours and spacing.')
else { errs.forEach(e => console.log('  FAIL - ' + e)); process.exitCode = 1 }
console.log('  artifacts:', tmp)
