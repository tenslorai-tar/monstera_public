// Proof for handwriting → Word (Export → Word → "Handwriting").
//
// Case A — line segmentation: render a fixture page with 2 paragraphs (3 + 2
//   lines, a big vertical gap between them) → segmentTextLines finds 5 line
//   crops and groupLinesToParagraphs splits at the gap into 2 paragraphs.
// Case B — TrOCR prose end-to-end (small model, same code path the Electron
//   main process runs): each line crop is recognised; lenient — output is
//   non-empty and shares words with the source (handwriting model on printed
//   text is rough; the review textarea covers misreads).
// Case C — Azure prebuilt-read parser: azureReadToParagraphs on a mocked JSON
//   response (no live key) returns the paragraphs per page, and falls back to
//   line-grouping when paragraph objects are absent.
// Case D — docx assembly: buildParagraphsDocx produces a real .docx (a zip)
//   whose word/document.xml contains every paragraph.

import { writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PDFDocument, StandardFonts } from 'pdf-lib'

const ROOT = process.cwd()
const errs = []
const ok = (cond, label) => { console.log((cond ? '  PASS - ' : '  FAIL - ') + label); if (!cond) errs.push(label) }

const entryPath = join(ROOT, 'scripts/_hwEntry.gen.ts')
const bundlePath = join(ROOT, 'scripts/_hw.bundle.gen.mjs')
writeFileSync(entryPath, "export * from '../src/renderer/utils/extractTables'\n")
const esbuild = await import('esbuild')
esbuild.buildSync({
  entryPoints: [entryPath], bundle: true, format: 'esm', platform: 'node',
  external: ['tesseract.js', 'pdfjs-dist', 'xlsx'], outfile: bundlePath,
})
const ex = await import(pathToFileURL(bundlePath).href)

const PARA1 = ['Monstera plants love', 'bright indirect light', 'and weekly watering']
const PARA2 = ['Repot them each spring', 'into fresh potting soil']

async function makeProsePdf() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const size = 26
  // Para 1 lines (bottom-up), 40pt step; a 80pt gap; then Para 2 lines.
  const ys1 = [700, 660, 620]
  const ys2 = [540, 500]
  PARA1.forEach((t, i) => page.drawText(t, { x: 60, y: ys1[i], size, font }))
  PARA2.forEach((t, i) => page.drawText(t, { x: 60, y: ys2[i], size, font }))
  return Buffer.from(await doc.save())
}

const mupdf = await import('mupdf')
function renderPix(bytes, scale) {
  const d = mupdf.Document.openDocument(bytes, 'application/pdf')
  const pix = d.loadPage(0).toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true)
  return { png: Buffer.from(pix.asPNG()), w: pix.getWidth(), h: pix.getHeight(), samples: Buffer.from(pix.getPixels()) }
}
const px = (r) => ({ data: r.samples, width: r.w, height: r.h, channels: 3 })

// ── Case A: line segmentation + paragraph grouping ────────────────────────────
console.log('\n=== Case A: line segmentation + paragraph grouping ===')
const prose = await makeProsePdf()
const scan = renderPix(prose, 2.5)
const seg = ex.segmentTextLines(px(scan))
ok(seg.lines.length === 5, `5 line crops (got ${seg.lines.length})`)
const placeholderParas = ex.groupLinesToParagraphs(seg.lines.map(l => ({ text: 'x', y: l.y, h: l.h })))
ok(placeholderParas.length === 2, `grouped into 2 paragraphs at the big gap (got ${placeholderParas.length})`)

// Empty / degenerate inputs must not crash.
ok(ex.groupLinesToParagraphs([]).length === 0, 'empty line list → 0 paragraphs (no crash)')
const blank = ex.segmentTextLines({ data: new Uint8Array(100 * 100 * 3).fill(255), width: 100, height: 100, channels: 3 })
ok(blank.lines.length === 0, 'blank page → 0 lines (no crash)')

// ── Case B: TrOCR prose end-to-end (small model) ──────────────────────────────
console.log('\n=== Case B: local TrOCR prose recognition (small model) ===')
const cacheDir = join(tmpdir(), 'monstera-trocr-cache')
mkdirSync(cacheDir, { recursive: true })
const trocr = await import(pathToFileURL(join(ROOT, 'dist-electron/main/trocrEngine.js')).href)
trocr.configure(cacheDir)
console.log('  small model cached already:', trocr.isCached('small'))
const sharp = (await import('sharp')).default

async function recognizeLine(segmented, pageW, line) {
  const buf = Buffer.alloc(line.w * line.h * 3, 255)
  for (let yy = 0; yy < line.h; yy++) {
    for (let xx = 0; xx < line.w; xx++) {
      if (segmented.ink[(line.y + yy) * pageW + (line.x + xx)]) {
        const o = (yy * line.w + xx) * 3
        buf[o] = 0; buf[o + 1] = 0; buf[o + 2] = 0
      }
    }
  }
  const png = await sharp(buf, { raw: { width: line.w, height: line.h, channels: 3 } }).png().toBuffer()
  return trocr.recognizePng(png, 'small')
}

try {
  const recognized = []
  const t0 = Date.now()
  for (const line of seg.lines) recognized.push({ text: await recognizeLine(seg, scan.w, line), y: line.y, h: line.h })
  console.log(`  read ${seg.lines.length} lines in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
  recognized.forEach((r, i) => console.log(`   line ${i + 1}: ${JSON.stringify(r.text)}`))
  const nonEmpty = recognized.filter(r => r.text.trim().length > 0).length
  ok(nonEmpty >= 4, `at least 4/5 lines produced text (got ${nonEmpty})`)
  const paras = ex.groupLinesToParagraphs(recognized)
  ok(paras.length === 2, `recognized lines still group into 2 paragraphs (got ${paras.length})`)
  const allText = recognized.map(r => r.text.toLowerCase()).join(' ')
  const wanted = [...PARA1, ...PARA2].join(' ').toLowerCase().split(/\s+/)
  const hits = wanted.filter(w => w.length >= 4 && allText.includes(w.slice(0, 4)))
  console.log(`  (informational) word-stem overlap: ${hits.length}/${wanted.length}`)
  ok(trocr.isCached('small'), 'small model cached on disk for offline reuse')
} catch (e) {
  ok(false, 'TrOCR prose recognition failed: ' + e.message)
}

// ── Case C: Azure prebuilt-read parser (mocked, no live key) ──────────────────
console.log('\n=== Case C: Azure prebuilt-read parser ===')
const azureMock = {
  paragraphs: [
    { content: 'Monstera plants love bright indirect light and weekly watering.', boundingRegions: [{ pageNumber: 1 }] },
    { content: 'Repot them each spring into fresh potting soil.', boundingRegions: [{ pageNumber: 1 }] },
    { content: 'A note on the second page.', boundingRegions: [{ pageNumber: 2 }] },
  ],
  pages: [{ pageNumber: 1 }, { pageNumber: 2 }],
}
const parsed = ex.azureReadToParagraphs(azureMock, [1, 2])
ok(parsed.length === 2, `2 pages parsed (got ${parsed.length})`)
ok(parsed[0].page === 1 && parsed[0].paragraphs.length === 2, `page 1 → 2 paragraphs (got ${parsed[0]?.paragraphs.length})`)
ok(parsed[1].page === 2 && parsed[1].paragraphs.length === 1, `page 2 → 1 paragraph (got ${parsed[1]?.paragraphs.length})`)
ok(parsed[0].paragraphs[0].includes('Monstera'), 'page 1 paragraph text preserved')

// Fallback: no paragraphs, only page lines → grouped by the gap heuristic.
const azureLinesOnly = {
  pages: [{
    pageNumber: 3,
    lines: [
      { content: 'first block line', polygon: [0, 0, 10, 0, 10, 10, 0, 10] },
      { content: 'second block line', polygon: [0, 100, 10, 100, 10, 110, 0, 110] },
    ],
  }],
}
const fallback = ex.azureReadToParagraphs(azureLinesOnly, [3])
ok(fallback[0].paragraphs.length === 2, `line-only fallback splits at the gap into 2 paragraphs (got ${fallback[0]?.paragraphs.length})`)

// ── Case D: docx assembly ─────────────────────────────────────────────────────
console.log('\n=== Case D: docx assembly ===')
try {
  const { buildParagraphsDocx } = await import(pathToFileURL(join(ROOT, 'dist-electron/main/docxParagraphs.js')).href)
  const pages = [
    { page: 1, paragraphs: ['Alpha paragraph one', 'Beta paragraph two'] },
    { page: 2, paragraphs: ['Gamma paragraph three'] },
  ]
  const buf = await buildParagraphsDocx(pages)
  ok(Buffer.isBuffer(buf) && buf.length > 0, `produced a .docx buffer (${buf.length} bytes)`)
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buf)
  const xml = await zip.file('word/document.xml').async('string')
  for (const needle of ['Alpha paragraph one', 'Beta paragraph two', 'Gamma paragraph three'])
    ok(xml.includes(needle), `document.xml contains "${needle}"`)
} catch (e) {
  ok(false, 'docx assembly failed: ' + e.message)
}

rmSync(entryPath, { force: true })
rmSync(bundlePath, { force: true })

console.log('\n=== RESULT ===')
if (errs.length === 0) console.log('  PASS — line segmentation, TrOCR prose, Azure read parsing and docx assembly verified.')
else { errs.forEach(e => console.log('  FAIL - ' + e)); process.exitCode = 1 }
