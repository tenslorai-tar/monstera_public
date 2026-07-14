// Proof for Nested Edit v2.1 — two upgrades to the Form-XObject in-place editor
// (src/main/nestedTextEdit.ts + subsetExtend.ts + systemFonts.ts):
//
//   1. Position-based duplicate-line disambiguation — when two byte-identical visual
//      lines exist, the clicked line's PAGE-SPACE bbox routes the edit to the right
//      one (its form-content origin mapped to page space via the Form XObject
//      placement CTM). Without a bbox the edit still throws (never silently edits a
//      duplicate).
//   2. Explicit substitute-font tier — when the embedded font's family is NOT
//      installed, pick the closest metric-compatible installed font of the SAME
//      serif class + style (outcome 'in-place-substituted'), a distinct, toasted
//      result. Ordering: exact family installed → 'in-place-extended'; not installed
//      → 'in-place-substituted'.
//
// Synthetic fixture: TWO byte-identical lines nested in a Form XObject at different
// Y. Real file: C:/Users/emiso/Downloads/Emem Ndon CV (2).pdf — name line is
// BAAAAA+InriaSerif-Regular (Inria Serif NOT installed → substitute tier); the
// role line is CAAAAA+Calibri (installed → extension tier).

import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import zlib from 'node:zlib'
import { PDFDocument, PDFName, PDFDict, PDFRawStream, PDFRef } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const ROOT = process.cwd()
const nested = await import(pathToFileURL(join(ROOT, 'dist-electron/main/nestedTextEdit.js')).href)
const engine = await import(pathToFileURL(join(ROOT, 'dist-electron/main/pdfiumEngine.js')).href)
const sysfonts = await import(pathToFileURL(join(ROOT, 'dist-electron/main/systemFonts.js')).href)
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
    const tc = await (await doc.getPage(1)).getTextContent()
    return tc.items.map(i => i.str).join('')
  } catch { return null }
}
function opensInMupdf(bytes) {
  try { const d = mupdf.Document.openDocument(bytes, 'application/pdf'); d.loadPage(0).toStructuredText().asJSON(); return true }
  catch { return false }
}
// Map each visual line to its text and vertical position.
function lines(bytes) {
  return engine.getAllTextLines(bytes, 0).map(ln => {
    const h = engine.getLineAt(bytes, 0, (ln.x1 + ln.x2) / 2, (ln.y1 + ln.y2) / 2)
    return { text: h.found ? h.text : '', y: (ln.y1 + ln.y2) / 2, x1: ln.x1, y1: ln.y1, x2: ln.x2, y2: ln.y2 }
  })
}
function isSerifFamily(family) {
  const rf = sysfonts.resolveSystemFont(family, false, false)
  if (!rf) return null
  let fk = fontkit.create(rf.data)
  if (fk.fonts && fk.fonts.length) fk = fk.fonts[0]
  const os2 = fk['OS/2'] ?? {}
  return sysfonts.classifySerif(os2.sFamilyClass, os2.panose, family)
}

const tmp = mkdtempSync(join(tmpdir(), 'monstera-nested-v2_1-'))

// ── Synthetic fixture: two byte-identical lines nested in a Form XObject ────────
async function buildDupFixture() {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const f1 = await doc.embedFont(readFileSync('C:/Windows/Fonts/arial.ttf'), { subset: true })
  const hex = f1.encodeText('Repeated line here').toString()
  const seg = (y) => `BT\n/F1 20 Tf\n1 0 0 1 20 ${y} Tm\n${hex} Tj\nET\n`
  // Same text at y=150 (upper) and y=100 (lower) — the two Tj byte strings are identical.
  const content = seg(150) + seg(100)
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
  return Buffer.from(await doc.save())
}

console.log('=== Cap 1: duplicate-line disambiguation by position ===')
const dup = await buildDupFixture()
writeFileSync(join(tmp, 'dup-before.pdf'), dup)
{
  const before = lines(dup)
  const dups = before.filter(l => l.text === 'Repeated line here')
  ok(dups.length === 2, `fixture has two byte-identical visual lines (found ${dups.length})`)

  // Edit the SECOND (lower, y≈100) line by its page-space bbox.
  const lower = dups.reduce((a, b) => (b.y < a.y ? b : a))
  const upper = dups.reduce((a, b) => (b.y > a.y ? b : a))
  const bbox = { x1: lower.x1, y1: lower.y1, x2: lower.x2, y2: lower.y2 }
  // Replacement reuses only glyphs already in the subset ('hare' ← 'here') so the
  // edit stays a pure in-place-form stream splice (no font re-embed to muddy it).
  let out = null
  try { out = await nested.replaceNestedLineAtEx(dup, 0, 'Repeated line here', 'Repeated line hare', bbox) }
  catch (e) { errs.push('duplicate edit threw: ' + e.message) }
  if (out) {
    writeFileSync(join(tmp, 'dup-second.pdf'), out.bytes)
    ok(out.outcome === 'in-place-form', `edit stayed in place (outcome ${out.outcome})`)
    const after = lines(out.bytes)
    const editedLower = after.find(l => Math.abs(l.y - lower.y) < 6)
    const keptUpper = after.find(l => Math.abs(l.y - upper.y) < 6)
    ok(editedLower && editedLower.text === 'Repeated line hare', `SECOND line changed (got ${JSON.stringify(editedLower?.text)})`)
    ok(keptUpper && keptUpper.text === 'Repeated line here', `FIRST line unchanged (got ${JSON.stringify(keptUpper?.text)})`)
    // First line pixel-identical (it sits at y≈150; edit was at y≈100).
    const rb = render(dup), ra = render(out.bytes)
    ok(regionEqual(rb, ra, 18, 143, 340, 174, 200), 'FIRST line pixel-identical after editing the second')
    // First line's Tj bytes still present verbatim (byte-identical) in the form stream.
    const d2 = await PDFDocument.load(out.bytes)
    const xo = d2.getPage(0).node.lookupMaybe(PDFName.of('Resources'), PDFDict).lookupMaybe(PDFName.of('XObject'), PDFDict)
    let stream = ''
    for (const k of xo.keys()) { const st = xo.lookup(k); if (st instanceof PDFRawStream) stream = Buffer.from(zlib.inflateSync(Buffer.from(st.contents))).toString('latin1') }
    ok((stream.match(/1 0 0 1 20 150 Tm/g) || []).length === 1, 'first line block still positioned verbatim at y=150 (untouched)')
    ok(opensInMupdf(out.bytes) && opensInPdfjs(out.bytes) !== null, 'result opens in mupdf + pdfjs')
  }

  // Editing the OTHER twin by its bbox changes only IT (symmetry check).
  let outU = null
  try { outU = await nested.replaceNestedLineAtEx(dup, 0, 'Repeated line here', 'Repeated line reap', { x1: upper.x1, y1: upper.y1, x2: upper.x2, y2: upper.y2 }) }
  catch (e) { errs.push('upper-twin edit threw: ' + e.message) }
  if (outU) {
    const after = lines(outU.bytes)
    const editedUpper = after.find(l => Math.abs(l.y - upper.y) < 6)
    const keptLower = after.find(l => Math.abs(l.y - lower.y) < 6)
    ok(editedUpper?.text === 'Repeated line reap' && keptLower?.text === 'Repeated line here', 'bbox routes to the UPPER twin, lower untouched')
  }

  // Back-compat guard: NO bbox on a duplicated line must still throw.
  let threw = false
  try { await nested.replaceNestedLineAtEx(dup, 0, 'Repeated line here', 'Repeated line NOBBOX') }
  catch { threw = true }
  ok(threw, 'omitting the bbox on a duplicate line still throws (never silently edits a duplicate)')
}

// ── Real-file plumbing: a bbox passed for a UNIQUE line behaves as before ───────
const CV2 = 'C:/Users/emiso/Downloads/Emem Ndon CV (2).pdf'
console.log('\n=== Cap 1 (real): bbox passed for a unique line — back-compat ===')
if (!existsSync(CV2)) { console.log('  SKIP - not present:', CV2) }
else {
  const bytes = readFileSync(CV2)
  const nameLine = lines(bytes).find(l => l.text.includes('Emem NDON'))
  const bbox = { x1: nameLine.x1, y1: nameLine.y1, x2: nameLine.x2, y2: nameLine.y2 }
  let out = null
  try { out = await nested.replaceNestedLineAtEx(bytes, 0, 'Emem NDON,Msc.', 'Emem NDON, PhD.', bbox) }
  catch (e) { errs.push('[unique+bbox] threw: ' + e.message) }
  if (out) {
    ok(out.outcome === 'in-place-form', `unique line with bbox edits in place (outcome ${out.outcome})`)
    ok(lines(out.bytes).some(l => l.text === 'Emem NDON, PhD.'), 'name line reads back edited with bbox plumbed through')
  }
}

// ── Cap 2: explicit substitute-font tier (Inria Serif not installed) ───────────
console.log('\n=== Cap 2: substitute tier on the InriaSerif name line ===')
if (!existsSync(CV2)) { console.log('  SKIP - not present:', CV2) }
else {
  const bytes = readFileSync(CV2)
  ok(sysfonts.resolveSystemFont('Inria Serif', false, false) === null, 'precondition: Inria Serif is NOT installed')
  const nameLine = lines(bytes).find(l => l.text === 'Emem NDON,Msc.')
  const bbox = { x1: nameLine.x1, y1: nameLine.y1, x2: nameLine.x2, y2: nameLine.y2 }
  // Append 'z' (absent from the InriaSerif subset) → embedded family can't render it
  // and its family isn't installed → substitute tier.
  let out = null
  try { out = await nested.replaceNestedLineAtEx(bytes, 0, 'Emem NDON,Msc.', 'Emem NDON,Msc.z', bbox) }
  catch (e) { errs.push('[substitute] threw: ' + e.message) }
  if (out) {
    writeFileSync(join(tmp, 'cv2-substituted.pdf'), out.bytes)
    ok(out.outcome === 'in-place-substituted', `outcome is in-place-substituted (got ${out.outcome})`)
    ok(!!out.substituteFamily, `a substitute family was reported (${out.substituteFamily})`)
    const serif = isSerifFamily(out.substituteFamily)
    ok(serif === true, `substitute "${out.substituteFamily}" is a SERIF font (not a sans)`)
    ok(lines(out.bytes).some(l => l.text.startsWith('Emem NDON,Msc.') && l.text.endsWith('z')), 'edited line ends with the new glyph')
    // Original embedded font programs untouched; the substitute is additive.
    const fb = await fontHashes(bytes), fa = await fontHashes(out.bytes)
    ok([...fb].every(h => fa.has(h)), 'every original font program still byte-identical (additive)')
    ok(fa.size > fb.size, `a new font program was added (${fb.size} → ${fa.size})`)
    ok(inkCount(render(out.bytes, 2)) > 5000, 'page renders with ink (replacement is not a blank/.notdef)')
    // A line well below the name (the role line) is pixel-identical.
    const h = mupdf.Document.openDocument(bytes, 'application/pdf').loadPage(0).getBounds()[3]
    const rb = render(bytes, 2), ra = render(out.bytes, 2)
    ok(regionEqual(rb, ra, 24, 610, 558, 690, h, 2), 'summary paragraph pixel-identical after substitute edit')
    ok(opensInMupdf(out.bytes), 'opens in mupdf')
    ok((await opensInPdfjs(out.bytes)) !== null, 'opens in pdfjs')
  }
}

// ── Cap 2 ordering: installed family still uses the EXTENSION tier ─────────────
console.log('\n=== Cap 2 ordering: Calibri (installed) → extension, not substitute ===')
if (!existsSync(CV2)) { console.log('  SKIP - not present:', CV2) }
else {
  const bytes = readFileSync(CV2)
  const roleLine = lines(bytes).find(l => l.text.includes('System Administrator'))
  const bbox = { x1: roleLine.x1, y1: roleLine.y1, x2: roleLine.x2, y2: roleLine.y2 }
  let out = null
  try { out = await nested.replaceNestedLineAtEx(bytes, 0, 'System Administrator | IT Support Specialist', 'System Administrator | IT Support Specialistz', bbox) }
  catch (e) { errs.push('[ordering] threw: ' + e.message) }
  if (out) {
    ok(out.outcome === 'in-place-extended', `Calibri line uses the extension tier, not substitute (got ${out.outcome})`)
  }
}

// ── Cap 3: BBox clip growth on a lengthened line ───────────────────────────────
// A Form XObject's /BBox is a hard clip. When an in-place edit makes the line WIDER
// than the field's original bound, renderers that honour the clip (mupdf) truncate
// the overflow even though text-extraction engines that ignore it (PDFium, PDF.js)
// still read the codes — so the fix must grow the /BBox. Deterministic synthetic
// fixture (no font-install dependency): "Ab" nested in a TIGHT-BBox form drawn under
// an internal `cm` scale, edited to "AbAbAbAb" (reuses only subset glyphs → stays the
// in-place-form tier). Proves the grown BBox composes through the internal CTM and
// that mupdf now renders the FULL widened line (not just the pre-BBox prefix).
console.log('\n=== Cap 3: form BBox grows so a lengthened line is not clipped ===')
async function buildTightFixture(scale) {
  const doc = await PDFDocument.create(); doc.registerFontkit(fontkit)
  const f = await doc.embedFont(readFileSync('C:/Windows/Fonts/arial.ttf'), { subset: true })
  const hex = f.encodeText('Ab ').toString().replace(/[<>]/g, '')
  const A = hex.slice(0, 4), b = hex.slice(4, 8)
  const advA = f.widthOfTextAtSize('A', 20)
  const body = `q\n${scale} 0 0 ${scale} 0 0 cm\nBT\n/F1 20 Tf\n1 0 0 1 2 4 Tm\n<${A}> Tj\n${advA.toFixed(3)} 0 Td\n<${b}> Tj\nET\nQ\n`
  const def = zlib.deflateSync(Buffer.from(body, 'latin1'))
  const w = (2 + f.widthOfTextAtSize('Ab', 20)) * scale + 2
  const fd = doc.context.obj({ Type: 'XObject', Subtype: 'Form', FormType: 1, BBox: [0, 0, w, 30 * scale], Resources: { Font: { F1: f.ref }, ProcSet: [PDFName.of('PDF'), PDFName.of('Text')] }, Filter: 'FlateDecode', Length: def.length })
  const fref = doc.context.register(PDFRawStream.of(fd, def))
  const pc = zlib.deflateSync(Buffer.from('q\n1 0 0 1 20 40 cm\n/Fm0 Do\nQ\n', 'latin1'))
  const pcref = doc.context.register(PDFRawStream.of(doc.context.obj({ Filter: 'FlateDecode', Length: pc.length }), pc))
  const page = doc.addPage([400, 120]); page.node.set(PDFName.of('Contents'), pcref); page.node.set(PDFName.of('Resources'), doc.context.obj({ XObject: { Fm0: fref } }))
  return { bytes: Buffer.from(await doc.save()), bboxW: w }
}
async function fm0BBoxWidth(bytes) {
  const d = await PDFDocument.load(bytes, { updateMetadata: false })
  const xo = d.getPage(0).node.lookupMaybe(PDFName.of('Resources'), PDFDict).lookupMaybe(PDFName.of('XObject'), PDFDict)
  const bb = xo.lookup(PDFName.of('Fm0')).dict.lookup(PDFName.of('BBox'))
  return bb.get(2).asNumber() - bb.get(0).asNumber()
}
function mupdfLine(bytes, needle) {
  const d = mupdf.Document.openDocument(bytes, 'application/pdf')
  const st = JSON.parse(d.loadPage(0).toStructuredText().asJSON())
  for (const b of st.blocks ?? []) for (const l of b.lines ?? []) if (l.text && l.text.replace(/\s/g, '').includes(needle)) return { text: l.text, bbox: l.bbox }
  return null
}
for (const scale of [1, 2]) {
  const { bytes, bboxW } = await buildTightFixture(scale)
  let box = null, ht = null
  for (const ln of engine.getAllTextLines(bytes, 0)) {
    const h = engine.getLineAt(bytes, 0, (ln.x1 + ln.x2) / 2, (ln.y1 + ln.y2) / 2)
    if (h.found && h.text.replace(/\s/g, '').startsWith('Ab')) { box = ln; ht = h.text }
  }
  const before = mupdfLine(bytes, 'Ab')
  let out = null
  try { out = await nested.replaceNestedLineAtEx(bytes, 0, ht, 'AbAbAbAb', { x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2 }) }
  catch (e) { errs.push(`[bbox-grow scale ${scale}] threw: ${e.message}`) }
  if (out) {
    ok(out.outcome === 'in-place-form', `scale ${scale}: stays in-place-form (got ${out.outcome})`)
    const newW = await fm0BBoxWidth(out.bytes)
    ok(newW > bboxW + 0.5, `scale ${scale}: form BBox grew (${bboxW.toFixed(1)} → ${newW.toFixed(1)})`)
    const after = mupdfLine(out.bytes, 'AbAbAbAb')
    ok(!!after && after.text.replace(/\s/g, '') === 'AbAbAbAb', `scale ${scale}: mupdf renders the FULL widened line (got ${JSON.stringify(after?.text)})`)
    // mupdf's line bbox width must grow with the glyphs — proves the tail is NOT
    // clipped (a clipped line keeps the original narrow bbox).
    ok(!!after && after.bbox.w > before.bbox.w * 1.8, `scale ${scale}: mupdf line width widened ${before.bbox.w.toFixed(1)} → ${after?.bbox.w.toFixed(1)} (tail not clipped)`)
    ok(opensInMupdf(out.bytes) && (await opensInPdfjs(out.bytes)) !== null, `scale ${scale}: result opens in mupdf + pdfjs`)
  }
}

// ── Cap 3 (real): the reported CV(4) substitute bug, tri-engine + full-extent ink ──
// "Bucharest" → "Bucharest, Romania" on the nested InriaSerif info-bar line. Inria is
// NOT installed → substitute tier (Constantia). The field's Form XObject BBox tightly
// bounds "Bucharest"; the inserted ", Romania" used to be clipped so mupdf render +
// structured-text dropped it while PDFium/PDF.js still read the codes. DoD: all three
// engines read the full line AND mupdf ink covers the FULL widened extent.
const CV4 = 'C:/Users/emiso/Downloads/Emem Ndon CV (4).pdf'
console.log('\n=== Cap 3 (real): CV(4) Bucharest → Bucharest, Romania (substitute + BBox) ===')
if (!existsSync(CV4)) { console.log('  SKIP - not present:', CV4) }
else {
  const bytes = readFileSync(CV4)
  let box = null, out = null
  for (const ln of engine.getAllTextLines(bytes, 0)) {
    let h; try { h = engine.getLineAt(bytes, 0, (ln.x1 + ln.x2) / 2, (ln.y1 + ln.y2) / 2) } catch { continue }
    if (h.found && h.text === 'Bucharest') { box = ln; break }
  }
  ok(!!box, 'found the nested "Bucharest" line')
  if (box) {
    try { out = await nested.replaceNestedLineAtEx(bytes, 0, 'Bucharest', 'Bucharest, Romania', { x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2 }) }
    catch (e) { errs.push('[CV4] threw: ' + e.message) }
  }
  if (out) {
    ok(out.outcome === 'in-place-substituted', `outcome is in-place-substituted (got ${out.outcome})`)
    const FULL = 'Bucharest, Romania'
    // (a) mupdf structured text — splits the info bar into per-field lines, so the
    // edited field reads back as EXACTLY the full string.
    const mu = mupdfLine(out.bytes, 'Bucharest')
    ok(!!mu && mu.text.trim() === FULL, `(a) mupdf structured text reads the full line (got ${JSON.stringify(mu?.text)})`)
    // (b) PDF.js getTextContent and (c) PDFium getLineAt read the whole visual row
    // (all info-bar fields concatenated), so assert the full string is contained.
    const pj = await opensInPdfjs(out.bytes)
    ok(typeof pj === 'string' && pj.includes(FULL), '(b) PDF.js getTextContent contains the full edited line')
    const pdfium = engine.getLineAt(out.bytes, 0, (box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2)
    ok(pdfium.found && pdfium.text.includes(FULL), '(c) PDFium getLineAt contains the full edited line')
    // Full-extent INK: render the edited field's line band and confirm the substitute
    // run's WHITE glyphs reach the far end of the new mupdf line bbox — not just "some
    // ink somewhere" (the earlier weak proof passed while ' Romania' was blank).
    const d = mupdf.Document.openDocument(out.bytes, 'application/pdf')
    const pg = d.loadPage(0)
    const s = 6
    const pix = pg.toPixmap(mupdf.Matrix.scale(s, s), mupdf.ColorSpace.DeviceRGB, false)
    const W = pix.getWidth(), src = Buffer.from(pix.getPixels())
    const bx = mu.bbox
    const y1 = Math.floor(bx.y * s), y2 = Math.ceil((bx.y + bx.h) * s)
    const isWhite = (o) => src[o] > 230 && src[o + 1] > 230 && src[o + 2] > 230
    let rightmost = -1
    for (let x = Math.floor(bx.x * s); x < Math.ceil((bx.x + bx.w) * s) && x < W; x++) {
      for (let y = y1; y < y2; y++) { if (isWhite((y * W + x) * 3)) { rightmost = x / s; break } }
    }
    // mupdf line bbox already grew to include ", Romania"; ink must reach ≥90% of it.
    ok(rightmost >= bx.x + bx.w * 0.90, `white ink covers the FULL widened extent (rightmost ink x ${rightmost.toFixed(1)} of [${bx.x.toFixed(1)}..${(bx.x + bx.w).toFixed(1)}])`)
  }
}

console.log('\n=== RESULT ===')
if (errs.length === 0) console.log('  PASS — duplicate disambiguation + explicit substitute tier both hold.')
else { errs.forEach(e => console.log('  FAIL - ' + e)); process.exitCode = 1 }
console.log('  artifacts:', tmp)
