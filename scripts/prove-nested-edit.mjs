// Proof for nested (Form XObject) in-place Edit Text — the capability that lets
// Edit Text work on design-tool PDFs (Canva/InDesign/Office) whose text lives
// inside Form XObjects, which PDFium can read but never save in place.
//
// Case a — fixture: text authored INSIDE a Form XObject (per-glyph Tj+Td, an
//   Identity-H subset font, exactly the Canva layout). Editing one word rewrites
//   the form stream and the new word reads back.
// Case b — font fidelity: every embedded font program (edited line's font AND an
//   untouched second font on another line) is byte-identical before/after, and no
//   new font object is added — the edit reuses the original font resource.
// Case c — pixel identity: a line NOT touched by the edit renders pixel-identical.
// Case d — real world: C:/Users/emiso/Downloads/Emem Ndon CV (4).pdf — a word in
//   the summary paragraph is edited through the nested path; extraction reflects it
//   and the page still renders with ink (no exception, no blank page).

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
const mupdf = await import('mupdf')

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

// Collect { hash -> } of every embedded FontFile/FontFile2/FontFile3 program.
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

const tmp = mkdtempSync(join(tmpdir(), 'monstera-nested-'))

// ── Build the fixture: text inside a Form XObject ────────────────────────────
async function buildFixture() {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const f1 = await doc.embedFont(readFileSync('C:/Windows/Fonts/arial.ttf'), { subset: true })
  const f2 = await doc.embedFont(readFileSync('C:/Windows/Fonts/times.ttf'), { subset: true })
  const page = doc.addPage([400, 200])

  const line = (font, name, size, x0, y0, text) => {
    let ops = `/${name} ${size} Tf\n1 0 0 1 ${x0} ${y0} Tm\n`
    const chars = [...text]
    for (let i = 0; i < chars.length; i++) {
      if (i > 0) ops += `${font.widthOfTextAtSize(chars[i - 1], size).toFixed(4)} 0 Td\n`
      ops += `${font.encodeText(chars[i]).toString()} Tj\n`
    }
    return `BT\n${ops}ET\n`
  }
  // Line 1 mixes a middle-word edit target with a trailing word: shrinking "bravo"
  // must keep "charlie" correctly spaced (fold by width delta, no spurious gap).
  const content = line(f1, 'F1', 20, 20, 150, 'alpha bravo charlie')
    + line(f2, 'F2', 18, 20, 100, 'Second line stays')

  const deflated = zlib.deflateSync(Buffer.from(content, 'latin1'))
  const formDict = doc.context.obj({
    Type: 'XObject', Subtype: 'Form', FormType: 1, BBox: [0, 0, 400, 200],
    Resources: { Font: { F1: f1.ref, F2: f2.ref }, ProcSet: [PDFName.of('PDF'), PDFName.of('Text')] },
    Filter: 'FlateDecode', Length: deflated.length,
  })
  const formRef = doc.context.register(PDFRawStream.of(formDict, deflated))

  const pc = zlib.deflateSync(Buffer.from('q\n/Fm0 Do\nQ\n', 'latin1'))
  const pcRef = doc.context.register(PDFRawStream.of(doc.context.obj({ Filter: 'FlateDecode', Length: pc.length }), pc))
  page.node.set(PDFName.of('Contents'), pcRef)
  page.node.set(PDFName.of('Resources'), doc.context.obj({ XObject: { Fm0: formRef } }))
  return Buffer.from(await doc.save())
}

console.log('=== Case a: edit a word inside a Form XObject ===')
const fixture = await buildFixture()
writeFileSync(join(tmp, 'fixture-before.pdf'), fixture)
// sanity: PDFium sees the text as nested (not editable in place)
const fHit = engine.getLineAt(fixture, 0, 60, 158)
ok(fHit.found && fHit.text === 'alpha bravo charlie', `PDFium reads the nested line (got ${JSON.stringify(fHit.text)})`)
ok(fHit.editable === false, 'PDFium reports the nested line as not in-place editable (editable=false)')

let after = null
try { after = await nested.replaceNestedLineAt(fixture, 0, 'alpha bravo charlie', 'alpha bra charlie') }
catch (e) { errs.push('replaceNestedLineAt threw: ' + e.message) }
if (after) {
  writeFileSync(join(tmp, 'fixture-after.pdf'), after)
  const h = engine.getLineAt(after, 0, 60, 158)
  // Exact text (single spaces) proves the width-delta fold spaced "charlie"
  // correctly — a wrong fold shows up as "bra  charlie" or "bracharlie".
  ok(h.found && h.text === 'alpha bra charlie', `middle word shrunk, spacing correct (got ${JSON.stringify(h.text)})`)
  const other = engine.getLineAt(after, 0, 60, 108)
  ok(other.found && other.text === 'Second line stays', 'untouched second line intact')

  console.log('\n=== Case b: every embedded font program unchanged, no font added ===')
  const before = await fontHashes(fixture)
  const afterH = await fontHashes(after)
  ok(before.size === 2, `fixture embeds 2 font programs (got ${before.size})`)
  ok(afterH.size === before.size, `same font-program count after edit (got ${afterH.size})`)
  ok([...before].every(h => afterH.has(h)), 'both font programs byte-identical before/after')

  console.log('\n=== Case c: untouched line renders pixel-identical ===')
  const rb = render(fixture), ra = render(after)
  ok(regionEqual(rb, ra, 15, 88, 220, 120, 200), '"Second line stays" pixel-identical after the edit')
  ok(!regionEqual(rb, ra, 40, 138, 130, 170, 200), 'edited word region did change (sanity)')
}

// ── Case d: the real design-tool CV ──────────────────────────────────────────
console.log('\n=== Case d: real Canva CV — edit a word in the summary ===')
const REAL = 'C:/Users/emiso/Downloads/Emem Ndon CV (4).pdf'
if (!existsSync(REAL)) {
  console.log('  SKIP - real file not present:', REAL)
} else {
  const bytes = readFileSync(REAL)
  // Find the summary line via PDFium
  const lines = engine.getAllTextLines(bytes, 0)
  let target = null
  for (const ln of lines) {
    const h = engine.getLineAt(bytes, 0, (ln.x1 + ln.x2) / 2, (ln.y1 + ln.y2) / 2)
    if (h.found && h.text.includes('20 years of experience')) { target = { h, cx: (ln.x1 + ln.x2) / 2, cy: (ln.y1 + ln.y2) / 2 }; break }
  }
  ok(!!target, 'located the summary line in the real file')
  if (target) {
    ok(target.h.editable === false, 'summary line is not in-place editable (the failing class)')
    const oldText = target.h.text
    const newText = oldText.replace('experience', 'expertise')
    let out = null
    try { out = await nested.replaceNestedLineAt(bytes, 0, oldText, newText) }
    catch (e) { errs.push('[real] replaceNestedLineAt threw: ' + e.message) }
    if (out) {
      writeFileSync(join(tmp, 'real-after.pdf'), out)
      const h = engine.getLineAt(out, 0, target.cx, target.cy)
      // "expertise delivering" with a single space proves the width-delta fold —
      // the earlier pin-in-place bug produced "expertis e delivering".
      ok(h.found && h.text.includes('expertise delivering') && !h.text.includes('experience'),
        `summary now reads "expertise delivering" with correct spacing (got ${JSON.stringify(h.text)})`)
      // other lines untouched
      const name = engine.getLineAt(out, 0, 366, 800)
      ok(name.found && name.text.includes('Emem'), 'the name line is untouched')
      // page still renders with ink
      const r = render(out, 2)
      ok(inkCount(r) > 5000, `page still renders with ink (dark px ${inkCount(r)})`)
      // font programs all unchanged
      const fb = await fontHashes(bytes), fa = await fontHashes(out)
      ok([...fb].every(x => fa.has(x)) && fa.size === fb.size, `all ${fb.size} font programs byte-identical after the real edit`)
      // untouched line pixel-identical (the name at the top)
      const rb = render(bytes, 2), ra = render(out, 2)
      const pageH = mupdf.Document.openDocument(bytes, 'application/pdf').loadPage(0).getBounds()[3]
      ok(regionEqual(rb, ra, 250, 790, 480, 812, pageH, 2), 'name line pixel-identical after the real edit')
    }
  }
}

console.log('\n=== RESULT ===')
if (errs.length === 0) console.log('  PASS — nested Form XObject text edits in place, fonts preserved.')
else { errs.forEach(e => console.log('  FAIL - ' + e)); process.exitCode = 1 }
console.log('  artifacts:', tmp)
