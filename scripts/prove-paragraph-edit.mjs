// Headless proof of paragraph reflow editing (getParagraphAt / replaceParagraphAt).
//
// Builds a page with a heading, a 4-line body paragraph (one text object per
// line, Word-style), and a footer line. Then:
//   1. getParagraphAt on line 2 must return the WHOLE paragraph (4 lines joined),
//      not the heading or footer.
//   2. replaceParagraphAt with longer text must reflow into more lines, wrapped
//      to the paragraph width, leaving heading + footer untouched.
//   3. The same call with a system substitute font must also work.

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const ROOT = process.cwd()
const engine = await import(pathToFileURL(join(ROOT, 'dist-electron/main/pdfiumEngine.js')).href)
console.log('PDFium available:', engine.isAvailable())

async function makeTestPdf() {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const times = await doc.embedFont(readFileSync('C:/Windows/Fonts/times.ttf'), { subset: false })
  const helv = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([500, 400])
  page.drawText('PROFESSIONAL SUMMARY', { x: 40, y: 350, size: 16, font: helv })
  const body = [
    'Well Completions Professional with nineteen years of experience',
    'leading complex well completions across diverse rig types',
    'globally. Proven track record in QAQC management, achieving',
    'ISO 9001 certification and full HSE compliance.',
  ]
  body.forEach((line, i) => page.drawText(line, { x: 40, y: 320 - i * 14, size: 11, font: times }))
  page.drawText('Footer: page 1 of 1', { x: 40, y: 60, size: 9, font: helv })
  return Buffer.from(await doc.save())
}

const before = await makeTestPdf()
const errs = []

// 1. Paragraph detection — click inside body line 2 (y ≈ 306+4)
const hit = engine.getParagraphAt(before, 0, 150, 309)
console.log('\n=== getParagraphAt(150, 309) ===')
console.log('found:', hit.found, '| editable:', hit.editable, '| lines:', hit.lineCount,
  '| align:', hit.align, '| fontSize:', hit.fontSize.toFixed(1), '| leading:', hit.leading.toFixed(1))
console.log('rect:', [hit.x1, hit.y1, hit.x2, hit.y2].map(v => v.toFixed(0)).join(','))
console.log('text:', JSON.stringify(hit.text))
console.log('fontName:', hit.fontName, '| fontLoadable:', hit.fontLoadable)

if (!hit.found) errs.push('paragraph not found')
if (hit.lineCount !== 4) errs.push(`expected 4 lines, got ${hit.lineCount}`)
if (!hit.text.startsWith('Well Completions Professional')) errs.push('paragraph text does not start with line 1')
if (!hit.text.endsWith('HSE compliance.')) errs.push('paragraph text does not end with line 4')
if (hit.text.includes('PROFESSIONAL SUMMARY')) errs.push('heading leaked into paragraph')
if (hit.text.includes('Footer')) errs.push('footer leaked into paragraph')
if (hit.align !== 'left') errs.push(`expected left align, got ${hit.align}`)

// 2. Reflow replace with longer text (no substitute font → reuse original handle)
const newText = 'Senior Well Completions Professional with over twenty years of experience leading and supervising complex well completion campaigns across jack-up rigs, lift barges and offshore platforms worldwide. Demonstrated record of zero-incident HSE performance and ISO 9001 quality systems.'
const r1 = engine.replaceParagraphAt(before, 0, 150, 309, newText, null)
console.log('\n=== replaceParagraphAt (original font handle) ===')
console.log('new line count:', r1.lineCount)
const runs1 = engine.getPageTextRuns(r1.bytes, 0).map(r => r.text.trim()).filter(Boolean)
runs1.forEach(t => console.log('  • ' + t))
const joined1 = runs1.join(' ')
if (!joined1.includes('twenty years of experience')) errs.push('[reflow] new text missing')
if (joined1.includes('nineteen years')) errs.push('[reflow] old paragraph text still present')
if (!joined1.includes('PROFESSIONAL SUMMARY')) errs.push('[reflow] heading lost')
if (!joined1.includes('Footer: page 1 of 1')) errs.push('[reflow] footer lost')
if (r1.lineCount < 5) errs.push(`[reflow] expected >4 wrapped lines for longer text, got ${r1.lineCount}`)

// Wrapped lines must respect the paragraph width (x2 ≈ 460 → allow small tolerance)
const wide = engine.getPageTextRuns(r1.bytes, 0).filter(r => r.x2 > hit.x2 + 6 && !r.text.includes('Footer') && !r.text.includes('SUMMARY'))
if (wide.length) errs.push(`[reflow] ${wide.length} line(s) overflow the paragraph width`)

// 3. Substitute font path (full installed font)
const arial = readFileSync('C:/Windows/Fonts/arial.ttf')
const r2 = engine.replaceParagraphAt(before, 0, 150, 309, newText, arial)
const runs2 = engine.getPageTextRuns(r2.bytes, 0).map(r => r.text.trim()).filter(Boolean)
console.log('\n=== replaceParagraphAt (substitute: Arial) ===')
console.log('new line count:', r2.lineCount)
if (!runs2.join(' ').includes('twenty years of experience')) errs.push('[substitute] new text missing')

const tmp = mkdtempSync(join(tmpdir(), 'monstera-para-'))
writeFileSync(join(tmp, 'before.pdf'), before)
writeFileSync(join(tmp, 'after-orig-font.pdf'), r1.bytes)
writeFileSync(join(tmp, 'after-arial.pdf'), r2.bytes)

console.log('\n=== RESULT ===')
if (errs.length === 0) {
  console.log('  PASS — paragraph detected, reflowed, wrapped to width; neighbours intact.')
} else {
  errs.forEach(e => console.log('  FAIL - ' + e))
  process.exitCode = 1
}
console.log('  artifacts:', tmp)
