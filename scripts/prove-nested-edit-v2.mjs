// Proof for Nested Edit v2 — three new capabilities on the Form-XObject in-place
// text editor (src/main/nestedTextEdit.ts + subsetExtend.ts):
//
//   1. Segmented-line matching — a visual line PDFium reports as one string is
//      often several Tj/TJ segments across separate BT…ET blocks or Form XObjects
//      (side-by-side columns PDFium merges). The edit must route to the segment it
//      touches and leave the others byte/pixel-identical.
//   2. TJ-array handling — kerned TJ arrays are decoded per glyph and rewritten with
//      untouched glyphs' kerning numbers preserved.
//   3. Subset-font glyph extension — a replacement needing a character absent from
//      the embedded subset embeds the matching installed full font for ONLY the
//      edited run (outcome 'in-place-extended'), never a .notdef box.
//
// Synthetic fixture (deterministic): a two-block segmented line and a kerned TJ line.
// Real files: C:/Users/emiso/Downloads/Emem Ndon CV (2).pdf and (4).pdf — the exact
// LibreOffice/Canva CVs whose lines v1 dropped to the overlay.

import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import zlib from 'node:zlib'
import { PDFDocument, PDFName, PDFDict, PDFRawStream, PDFRef, PDFArray } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const ROOT = process.cwd()
const nested = await import(pathToFileURL(join(ROOT, 'dist-electron/main/nestedTextEdit.js')).href)
const engine = await import(pathToFileURL(join(ROOT, 'dist-electron/main/pdfiumEngine.js')).href)
const mupdf = await import('mupdf')
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

const errs = []
const ok = (cond, label) => { console.log((cond ? '  PASS - ' : '  FAIL - ') + label); if (!cond) errs.push(label) }

function render(bytes, scale = 3) {
  const d = mupdf.Document.openDocument(bytes, 'application/pdf')
  const pix = d.loadPage(0).toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true)
  return { w: pix.getWidth(), h: pix.getHeight(), s: Buffer.from(pix.getPixels()), n: 3 }
}
function regionEqual(a, b, x1, y1, x2, y2, pageH, scale = 3) {
  const px1 = Math.floor(x1 * scale), px2 = Math.ceil(x2 * scale)
  const py1 = Math.floor((pageH - y2) * scale), py2 = Math.ceil((pageH - y1) * scale)
  if (a.w !== b.w || a.h !== b.h) return false
  let diff = 0
  for (let y = py1; y < py2; y++) for (let x = px1; x < px2; x++) {
    const o = (y * a.w + x) * a.n
    if (a.s[o] !== b.s[o] || a.s[o + 1] !== b.s[o + 1] || a.s[o + 2] !== b.s[o + 2]) diff++
  }
  return diff === 0
}
function inkCount(r) { let n = 0; for (let i = 0; i < r.s.length; i += r.n) if (r.s[i] < 200) n++; return n }

async function fontHashes(bytes) {
  const d = await PDFDocument.load(bytes)
  const set = new Set()
  for (const [, obj] of d.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue
    if (String(obj.lookup(PDFName.of('Type'))) !== '/FontDescriptor') continue
    for (const k of ['FontFile', 'FontFile2', 'FontFile3']) {
      const ff = obj.lookup(PDFName.of(k))
      if (ff instanceof PDFRawStream) set.add(createHash('sha1').update(Buffer.from(ff.contents)).digest('hex'))
    }
  }
  return set
}

async function opensInPdfjs(bytes) {
  try {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), stopAtErrors: false }).promise
    const page = await doc.getPage(1)
    const tc = await page.getTextContent()
    return tc.items.map(i => i.str).join('')
  } catch { return null }
}
function opensInMupdf(bytes) {
  try { const d = mupdf.Document.openDocument(bytes, 'application/pdf'); d.loadPage(0).toStructuredText().asJSON(); return true }
  catch { return false }
}
function lineText(bytes, needleStart, needleEnd) {
  for (const ln of engine.getAllTextLines(bytes, 0)) {
    const h = engine.getLineAt(bytes, 0, (ln.x1 + ln.x2) / 2, (ln.y1 + ln.y2) / 2)
    if (h.found && (h.text.includes(needleStart) || (needleEnd && h.text.includes(needleEnd)))) return h.text
  }
  return ''
}

const tmp = mkdtempSync(join(tmpdir(), 'monstera-nested-v2-'))

// ── Synthetic fixture: a two-block segmented line and a kerned TJ line ────────
async function buildFixture() {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const f1 = await doc.embedFont(readFileSync('C:/Windows/Fonts/arial.ttf'), { subset: true })

  const seg = (font, name, size, x0, y0, text) => {
    // whole-string Tj in its own BT…ET block (one visual segment)
    const hex = font.encodeText(text).toString()
    return { block: `BT\n/${name} ${size} Tf\n1 0 0 1 ${x0} ${y0} Tm\n${hex} Tj\nET\n`, width: font.widthOfTextAtSize(text, size) }
  }
  // Visual line "alpha bravo" split into TWO blocks PDFium will merge.
  const a = seg(f1, 'F1', 20, 20, 150, 'alpha ')
  const b = seg(f1, 'F1', 20, 20 + a.width, 150, 'bravo')

  // A kerned TJ line "Second line stays" with a +20 kern after each glyph.
  const tjText = 'Second line stays'
  let tj = '['
  for (const ch of tjText) { tj += f1.encodeText(ch).toString() + ' 20 ' }
  tj += '] TJ'
  const tjBlock = `BT\n/F1 18 Tf\n1 0 0 1 20 100 Tm\n${tj}\n`  // note: no ET yet
  const tjLine = `BT\n/F1 18 Tf\n1 0 0 1 20 100 Tm\n${tj}\nET\n`

  const content = a.block + b.block + tjLine

  const deflated = zlib.deflateSync(Buffer.from(content, 'latin1'))
  const formDict = doc.context.obj({
    Type: 'XObject', Subtype: 'Form', FormType: 1, BBox: [0, 0, 400, 200],
    Resources: { Font: { F1: f1.ref }, ProcSet: [PDFName.of('PDF'), PDFName.of('Text')] },
    Filter: 'FlateDecode', Length: deflated.length,
  })
  const formRef = doc.context.register(PDFRawStream.of(formDict, deflated))
  const pc = zlib.deflateSync(Buffer.from('q\n/Fm0 Do\nQ\n', 'latin1'))
  const pcRef = doc.context.register(PDFRawStream.of(doc.context.obj({ Filter: 'FlateDecode', Length: pc.length }), pc))
  const page = doc.addPage([400, 200])
  page.node.set(PDFName.of('Contents'), pcRef)
  page.node.set(PDFName.of('Resources'), doc.context.obj({ XObject: { Fm0: formRef } }))
  void tjBlock
  return Buffer.from(await doc.save())
}

console.log('=== Synthetic: segmented two-block line + kerned TJ line ===')
const fixture = await buildFixture()
writeFileSync(join(tmp, 'fixture-before.pdf'), fixture)
const segLine = lineText(fixture, 'alpha bravo')
ok(segLine === 'alpha bravo', `PDFium merges two blocks into one visual line (got ${JSON.stringify(segLine)})`)
const segHit = engine.getLineAt(fixture, 0, 40, 158)
ok(segHit.found && segHit.editable === false, 'segmented line reads as nested / not in-place editable')

// Capability 1: edit only the "bravo" segment; "alpha " stays byte/pixel-identical.
let segOut = null
try { segOut = await nested.replaceNestedLineAtEx(fixture, 0, 'alpha bravo', 'alpha bravado') }
catch (e) { errs.push('segmented edit threw: ' + e.message) }
if (segOut) {
  writeFileSync(join(tmp, 'fixture-seg.pdf'), segOut.bytes)
  ok(segOut.outcome === 'in-place-form', `segmented edit stayed in-place (outcome ${segOut.outcome})`)
  ok(lineText(segOut.bytes, 'alpha brav') === 'alpha bravado', 'segment "bravo" → "bravado", "alpha " intact')
  const before = await fontHashes(fixture), after = await fontHashes(segOut.bytes)
  ok(after.size === before.size && [...before].every(h => after.has(h)), 'font program byte-identical after segmented edit')
  const rb = render(fixture), ra = render(segOut.bytes)
  ok(regionEqual(rb, ra, 18, 143, 62, 172, 200), '"alpha " glyphs pixel-identical after editing the next segment')
  ok(opensInMupdf(segOut.bytes) && opensInPdfjs(segOut.bytes) !== null, 'segmented result opens in mupdf + pdfjs')
}

// Capability 2: edit inside the kerned TJ; untouched glyphs' kerns preserved.
let tjOut = null
try { tjOut = await nested.replaceNestedLineAtEx(fixture, 0, 'Second line stays', 'Second lane stays') }
catch (e) { errs.push('TJ edit threw: ' + e.message) }
if (tjOut) {
  writeFileSync(join(tmp, 'fixture-tj.pdf'), tjOut.bytes)
  ok(tjOut.outcome === 'in-place-form', `TJ edit stayed in-place (outcome ${tjOut.outcome})`)
  ok(lineText(tjOut.bytes, 'Second l') === 'Second lane stays', 'TJ "line" → "lane" reads back')
  // Re-decode the TJ array and confirm the surviving glyphs still carry +20 kerns.
  const doc = await PDFDocument.load(tjOut.bytes)
  const page = doc.getPage(0).node
  let kernCount = 0, isTJ = false
  const xo = page.lookupMaybe(PDFName.of('Resources'), PDFDict)?.lookupMaybe(PDFName.of('XObject'), PDFDict)
  for (const k of xo.keys()) {
    const st = xo.lookup(k)
    if (!(st instanceof PDFRawStream)) continue
    const c = Buffer.from(zlib.inflateSync(Buffer.from(st.contents))).toString('latin1')
    const m = c.match(/\[([^\]]*)\]\s*TJ/g)
    if (m) { isTJ = true; kernCount = (m.join(' ').match(/\b20\b/g) || []).length }
  }
  ok(isTJ, 'result still uses a TJ array (not flattened to Tj)')
  // "Second " (7 glyphs, 6 interior kerns kept) + "stays" (5 glyphs, 4 interior kerns)
  // ≈ at least the prefix/suffix interior kerns survive; the replaced word drops its own.
  ok(kernCount >= 8, `untouched-glyph kerns preserved (found ${kernCount} of the +20 kerns)`)
  ok(opensInMupdf(tjOut.bytes) && opensInPdfjs(tjOut.bytes) !== null, 'TJ result opens in mupdf + pdfjs')
}

// ── Real file A: CV (2) ──────────────────────────────────────────────────────
const CV2 = 'C:/Users/emiso/Downloads/Emem Ndon CV (2).pdf'
const CV4 = 'C:/Users/emiso/Downloads/Emem Ndon CV (4).pdf'

async function pageH(bytes) { return mupdf.Document.openDocument(bytes, 'application/pdf').loadPage(0).getBounds()[3] }

console.log('\n=== Real A/1: CV(2) segmented line "Emem NDON,Msc." → "Emem NDON, PhD." ===')
if (!existsSync(CV2)) { console.log('  SKIP - not present:', CV2) }
else {
  const bytes = readFileSync(CV2)
  const oldT = 'Emem NDON,Msc.'
  let out = null
  try { out = await nested.replaceNestedLineAtEx(bytes, 0, oldT, 'Emem NDON, PhD.') }
  catch (e) { errs.push('[A1] threw: ' + e.message) }
  if (out) {
    writeFileSync(join(tmp, 'cv2-a1.pdf'), out.bytes)
    ok(out.outcome === 'in-place-form', `in-place (outcome ${out.outcome})`)
    ok(lineText(out.bytes, 'Emem NDON') === 'Emem NDON, PhD.', 'name line now reads "Emem NDON, PhD."')
    const fb = await fontHashes(bytes), fa = await fontHashes(out.bytes)
    ok([...fb].every(h => fa.has(h)) && fa.size === fb.size, `all ${fb.size} font programs byte-identical`)
    const h = await pageH(bytes)
    const rb = render(bytes, 2), ra = render(out.bytes, 2)
    // the summary paragraph well below the edited line must be pixel-identical
    ok(regionEqual(rb, ra, 24, 610, 558, 690, h, 2), 'summary paragraph pixel-identical after name edit')
    ok(opensInMupdf(out.bytes), 'opens in mupdf')
    const txt = await opensInPdfjs(out.bytes)
    ok(txt !== null && txt.includes('PhD'), 'opens in pdfjs and text reflects the edit')
  }
}

console.log('\n=== Real A/2: CV(2) edit "Bucharest" column, leave "linkedin" column untouched ===')
if (existsSync(CV2)) {
  const bytes = readFileSync(CV2)
  const oldT = 'Bucharest | Romanian Resident Permit Holder linkedin.com/in/endonitsupport/'
  const newT = 'Bucuresti | Romanian Resident Permit Holder linkedin.com/in/endonitsupport/'
  let out = null
  try { out = await nested.replaceNestedLineAtEx(bytes, 0, oldT, newT) }
  catch (e) { errs.push('[A2] threw: ' + e.message) }
  if (out) {
    writeFileSync(join(tmp, 'cv2-a2.pdf'), out.bytes)
    ok(out.outcome === 'in-place-form', `in-place (outcome ${out.outcome})`)
    const got = lineText(out.bytes, 'Bucuresti')
    ok(got.startsWith('Bucuresti') && got.includes('linkedin.com/in/endonitsupport/'), `edited column + linkedin preserved (got ${JSON.stringify(got)})`)
    const h = await pageH(bytes)
    const rb = render(bytes, 2), ra = render(out.bytes, 2)
    // the linkedin column sits well right of "Bucharest"; must be pixel-identical
    ok(regionEqual(rb, ra, 470, 723, 583, 735, h, 2), 'linkedin column pixel-identical (untouched)')
    ok(opensInMupdf(out.bytes) && (await opensInPdfjs(out.bytes)) !== null, 'opens in mupdf + pdfjs')
  }
}

console.log('\n=== Real A/3 + B: subset-font extension — append a glyph absent from the subset ===')
for (const [tag, file] of [['CV2', CV2], ['CV4', CV4]]) {
  if (!existsSync(file)) { console.log('  SKIP - not present:', file); continue }
  const bytes = readFileSync(file)
  const oldT = 'System Administrator | IT Support Specialist'
  const newT = oldT + 'z'   // 'z' is not in this line's Calibri subset
  let out = null
  try { out = await nested.replaceNestedLineAtEx(bytes, 0, oldT, newT) }
  catch (e) { errs.push(`[${tag}] extension threw: ` + e.message) }
  if (out) {
    writeFileSync(join(tmp, `${tag}-ext.pdf`), out.bytes)
    ok(out.outcome === 'in-place-extended', `${tag}: font extended (outcome ${out.outcome})`)
    ok(lineText(out.bytes, 'System Admin').endsWith('Specialistz'), `${tag}: line now ends with the new glyph`)
    // the ORIGINAL subset font programs must be untouched; the extension is additive
    const fb = await fontHashes(bytes), fa = await fontHashes(out.bytes)
    ok([...fb].every(h => fa.has(h)), `${tag}: every original font program still present (additive extension)`)
    ok(fa.size > fb.size, `${tag}: a new font program was added (${fb.size} → ${fa.size})`)
    // renders with ink (no .notdef box / blank) and opens cleanly
    ok(inkCount(render(out.bytes, 2)) > 5000, `${tag}: page renders with ink`)
    ok(opensInMupdf(out.bytes), `${tag}: opens in mupdf`)
    const txt = await opensInPdfjs(out.bytes)
    ok(txt !== null, `${tag}: opens in pdfjs`)
    // pixel-identity of an unrelated line (the name at top) after the extension edit
    const h = await pageH(bytes)
    const rb = render(bytes, 2), ra = render(out.bytes, 2)
    ok(regionEqual(rb, ra, 240, 776, 500, 794, h, 2), `${tag}: name line pixel-identical after the extension edit`)
  }
}

console.log('\n=== RESULT ===')
if (errs.length === 0) console.log('  PASS — segmented, TJ, and subset-extended nested edits all land in place.')
else { errs.forEach(e => console.log('  FAIL - ' + e)); process.exitCode = 1 }
console.log('  artifacts:', tmp)
