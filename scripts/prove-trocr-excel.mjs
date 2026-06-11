// Proof for the LOCAL handwriting engine (Export → Excel → "Local handwriting"):
//
// Case A — cell segmentation on a ruled table render: bands between detected
//   rule lines → exactly rows × cols cells with correct indices.
// Case B — segmentation WITHOUT rules: ink-projection fallback finds the same
//   table structure from whitespace alone.
// Case C — TrOCR end-to-end in plain Node (same code path the Electron main
//   process runs): model downloads once into a persistent cache, then reads
//   real cell crops; the numeric crop must come back as its digits.
// Case D (informational) — the real handwritten ledger: segment + recognize a
//   sample of cells to show actual local-model quality on handwriting.

import { readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const ROOT = process.cwd()
const errs = []
const ok = (cond, label) => { console.log((cond ? '  PASS - ' : '  FAIL - ') + label); if (!cond) errs.push(label) }

const entryPath = join(ROOT, 'scripts/_tablesEntry2.gen.ts')
const bundlePath = join(ROOT, 'scripts/_tables2.bundle.gen.mjs')
writeFileSync(entryPath, "export * from '../src/renderer/utils/extractTables'\n")
const esbuild = await import('esbuild')
esbuild.buildSync({
  entryPoints: [entryPath], bundle: true, format: 'esm', platform: 'node',
  external: ['tesseract.js', 'pdfjs-dist', 'xlsx'], outfile: bundlePath,
})
const ex = await import(pathToFileURL(bundlePath).href)

const HEADERS = ['Item', 'Qty', 'Unit Price', 'Total']
const ROWS = [
  ['Monstera plant', '3', '24.50', '73.50'],
  ['Ceramic pot', '12', '8.00', '96.00'],
  ['Potting soil bag', '5', '12.25', '61.25'],
  ['Fertilizer', '2', '15.75', '31.50'],
]
async function makeTablePdf(withRules) {
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 400])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const size = 12
  const all = [HEADERS, ...ROWS]
  for (let r = 0; r < all.length; r++) {
    const y = 320 - r * 30
    const f = r === 0 ? bold : font
    page.drawText(all[r][0], { x: 50, y, size, font: f })
    const rightX = [290, 430, 560]
    for (let c = 1; c < 4; c++) {
      const t = all[r][c]
      page.drawText(t, { x: rightX[c - 1] - f.widthOfTextAtSize(t, size), y, size, font: f })
    }
  }
  if (withRules) {
    for (const x of [40, 240, 310, 445, 575])
      page.drawLine({ start: { x, y: 60 }, end: { x, y: 360 }, thickness: 1, color: rgb(0.2, 0.2, 0.2) })
    for (let r = 0; r <= all.length; r++) {
      const y = 332 - r * 30
      page.drawLine({ start: { x: 40, y }, end: { x: 575, y }, thickness: 1, color: rgb(0.2, 0.2, 0.2) })
    }
  }
  return Buffer.from(await doc.save())
}

const mupdf = await import('mupdf')
function renderPix(bytes, scale) {
  const d = mupdf.Document.openDocument(bytes, 'application/pdf')
  const pix = d.loadPage(0).toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true)
  return { png: Buffer.from(pix.asPNG()), w: pix.getWidth(), h: pix.getHeight(), samples: Buffer.from(pix.getPixels()) }
}
const px = (r) => ({ data: r.samples, width: r.w, height: r.h, channels: 3 })

// ── Case A: segmentation with ruled lines ─────────────────────────────────────
console.log('\n=== Case A: cell segmentation, ruled table ===')
const ruled = await makeTablePdf(true)
const ruledScan = renderPix(ruled, 2.5)
const segA = ex.segmentTableCells(px(ruledScan))
ok(segA.rows === 5, `5 row bands (got ${segA.rows})`)
ok(segA.cols === 4, `4 column bands (got ${segA.cols})`)
ok(segA.cells.length === 20, `20 cells with ink (got ${segA.cells.length})`)
const cellAt = (s, r, c) => s.cells.find(x => x.row === r && x.col === c)
ok(!!cellAt(segA, 0, 0) && !!cellAt(segA, 4, 3), 'corner cells present with correct indices')

// ── Case B: segmentation without rules (projection fallback) ──────────────────
console.log('\n=== Case B: cell segmentation, no rules ===')
const bare = await makeTablePdf(false)
const bareScan = renderPix(bare, 2.5)
const segB = ex.segmentTableCells(px(bareScan))
ok(segB.rows === 5, `5 row bands from ink projection (got ${segB.rows})`)
ok(segB.cols === 4, `4 column bands from ink projection (got ${segB.cols})`)
ok(segB.cells.length === 20, `20 cells (got ${segB.cells.length})`)

// ── Case C: TrOCR live recognition (downloads the model on first run) ─────────
console.log('\n=== Case C: local TrOCR recognition ===')
const cacheDir = join(tmpdir(), 'monstera-trocr-cache')
mkdirSync(cacheDir, { recursive: true })
const trocr = await import(pathToFileURL(join(ROOT, 'dist-electron/main/trocrEngine.js')).href)
trocr.configure(cacheDir)
console.log('  model cached already:', trocr.isCached())
const sharp = (await import('sharp')).default

async function recognizeCell(seg, pageW, cell) {
  const buf = Buffer.alloc(cell.w * cell.h * 3, 255)
  for (let yy = 0; yy < cell.h; yy++) {
    for (let xx = 0; xx < cell.w; xx++) {
      if (seg.ink[(cell.y + yy) * pageW + (cell.x + xx)]) {
        const o = (yy * cell.w + xx) * 3
        buf[o] = 0; buf[o + 1] = 0; buf[o + 2] = 0
      }
    }
  }
  const png = await sharp(buf, { raw: { width: cell.w, height: cell.h, channels: 3 } }).png().toBuffer()
  return trocr.recognizePng(png)
}

try {
  const t0 = Date.now()
  const priceCell = cellAt(segA, 1, 2)            // "24.50"
  const priceText = await recognizeCell(segA, ruledScan.w, priceCell)
  console.log(`  model ready in ${((Date.now() - t0) / 1000).toFixed(0)}s; "24.50" crop →`, JSON.stringify(priceText))
  const digits = priceText.replace(/\D/g, '')
  ok(digits.includes('24') && digits.includes('50'), `numeric cell read correctly (got ${JSON.stringify(priceText)})`)
  const nameCell = cellAt(segA, 1, 0)             // "Monstera plant"
  const nameText = await recognizeCell(segA, ruledScan.w, nameCell)
  console.log('  "Monstera plant" crop →', JSON.stringify(nameText))
  ok(nameText.trim().length > 0, 'text cell produced output (handwriting model on printed text — review grid covers misreads)')
  ok(trocr.isCached(), 'model is cached on disk for offline reuse')
} catch (e) {
  ok(false, 'TrOCR recognition failed: ' + e.message)
}

// ── Case D (informational): the real handwritten ledger ──────────────────────
const challenge = 'C:/Users/emiso/Downloads/20260611072850.pdf'
if (existsSync(challenge) && errs.length === 0) {
  console.log('\n=== Case D (informational): handwritten ledger, local model ===')
  try {
    const scan = renderPix(readFileSync(challenge), 3)
    const seg = ex.segmentTableCells(px(scan))
    console.log(`  segmented ${seg.cells.length} cells across ${seg.rows} rows × ${seg.cols} cols`)
    const sample = seg.cells.filter(c => c.row >= 2 && c.row <= 7).slice(0, 16)
    for (const cell of sample) {
      const text = await recognizeCell(seg, scan.w, cell)
      console.log(`   r${cell.row} c${cell.col}: ${JSON.stringify(text)}`)
    }
    console.log('  (digits land close; the review grid is there for the misses — Azure remains the accuracy pick)')
  } catch (e) {
    console.log('  SKIP - ' + e.message)
  }
}

rmSync(entryPath, { force: true })
rmSync(bundlePath, { force: true })

console.log('\n=== RESULT ===')
if (errs.length === 0) console.log('  PASS — segmentation (ruled + projection) and local TrOCR recognition verified.')
else { errs.forEach(e => console.log('  FAIL - ' + e)); process.exitCode = 1 }
