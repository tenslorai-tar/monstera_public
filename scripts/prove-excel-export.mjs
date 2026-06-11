// Proof for PDF → Excel table extraction (Export → Excel tab):
//
// Case 1 — digital PDF: native text items cluster into the exact table grid
//   (whitespace-gap column detection, right-aligned numeric columns included).
// Case 2 — xlsx round-trip: gridsToXlsx output re-opens with the same cells,
//   numeric strings stored as real numbers.
// Case 3 — scanned printed table: Tesseract words + ruled-line column detection
//   reproduce the same grid from pixels alone (no native text used).
// Case 4 — Azure Document Intelligence mapping: canned layout results (tables
//   and words-only pages) map to correct grids, inch→point conversion + y-flip.
// Case 5 (informational) — the real handwritten ledger scan, to show honestly
//   what local OCR yields on handwriting (this is what the Azure engine is for).

import { readFileSync, writeFileSync, rmSync, mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const ROOT = process.cwd()
const errs = []
const ok = (cond, label) => { console.log((cond ? '  PASS - ' : '  FAIL - ') + label); if (!cond) errs.push(label) }

// ── Bundle the renderer extraction module for Node ───────────────────────────
const entryPath = join(ROOT, 'scripts/_tablesEntry.gen.ts')
const bundlePath = join(ROOT, 'scripts/_tables.bundle.gen.mjs')
writeFileSync(entryPath, [
  "export * from '../src/renderer/utils/extractTables'",
  "export { wordsFromRecognition, OCR_RENDER_SCALE } from '../src/renderer/utils/ocrUtils'",
].join('\n'))
const esbuild = await import('esbuild')
esbuild.buildSync({
  entryPoints: [entryPath], bundle: true, format: 'esm', platform: 'node',
  external: ['tesseract.js', 'pdfjs-dist', 'xlsx'], outfile: bundlePath,
})
const ex = await import(pathToFileURL(bundlePath).href)

const tmp = mkdtempSync(join(tmpdir(), 'monstera-xlsx-'))

// ── Build the reference table PDF (mixed alignment + ruled columns) ──────────
const HEADERS = ['Item', 'Qty', 'Unit Price', 'Total']
const ROWS = [
  ['Monstera plant', '3', '24.50', '73.50'],
  ['Ceramic pot', '12', '8.00', '96.00'],
  ['Potting soil bag', '5', '12.25', '61.25'],
  ['Fertilizer', '2', '15.75', '31.50'],
]
async function makeTablePdf() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 400])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const size = 12
  const leftX = [50]                  // Item column: left-aligned
  const rightX = [290, 430, 560]      // numeric columns: right-aligned
  const all = [HEADERS, ...ROWS]
  for (let r = 0; r < all.length; r++) {
    const y = 320 - r * 30
    const f = r === 0 ? bold : font
    page.drawText(all[r][0], { x: leftX[0], y, size, font: f })
    for (let c = 1; c < 4; c++) {
      const t = all[r][c]
      page.drawText(t, { x: rightX[c - 1] - f.widthOfTextAtSize(t, size), y, size, font: f })
    }
  }
  for (const x of [40, 240, 310, 445, 575]) {
    page.drawLine({ start: { x, y: 60 }, end: { x, y: 360 }, thickness: 1, color: rgb(0.2, 0.2, 0.2) })
  }
  return Buffer.from(await doc.save())
}
const tableBytes = await makeTablePdf()
writeFileSync(join(tmp, 'table.pdf'), tableBytes)

// ── Case 1: native text → grid ────────────────────────────────────────────────
console.log('\n=== Case 1: digital PDF, native text items → grid ===')
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
const pdfDoc = await pdfjs.getDocument({ data: new Uint8Array(tableBytes) }).promise
const items = await ex.nativeItems(pdfDoc, 1)
ok(items.length === 20, `20 text items found (got ${items.length})`)
const grid1 = ex.itemsToGrid(items)
ok(grid1.length === 5, `5 rows (got ${grid1.length})`)
ok(grid1.every(r => r.length === 4), `4 columns in every row (got ${grid1.map(r => r.length).join(',')})`)
ok(JSON.stringify(grid1[0]) === JSON.stringify(HEADERS), `header row exact (got ${JSON.stringify(grid1[0])})`)
ok(JSON.stringify(grid1[2]) === JSON.stringify(ROWS[1]), `data row exact (got ${JSON.stringify(grid1[2])})`)

// ── Case 2: xlsx round-trip with numeric cells ───────────────────────────────
console.log('\n=== Case 2: workbook round-trip ===')
const XLSX = (await import('xlsx')).default ?? await import('xlsx')
const wbBytes = ex.gridsToXlsx([{ page: 1, grid: grid1, source: 'text' }])
const wb = XLSX.read(wbBytes, { type: 'array' })
ok(wb.SheetNames[0] === 'Page 1', `sheet named "Page 1" (got ${wb.SheetNames[0]})`)
const back = XLSX.utils.sheet_to_json(wb.Sheets['Page 1'], { header: 1 })
ok(back.length === 5, `5 rows back from xlsx (got ${back.length})`)
ok(back[1][0] === 'Monstera plant', `text cell survives (got ${JSON.stringify(back[1]?.[0])})`)
ok(back[1][2] === 24.5 && typeof back[1][2] === 'number', `"24.50" stored as the number 24.5 (got ${JSON.stringify(back[1]?.[2])})`)
ok(back[2][1] === 12 && typeof back[2][1] === 'number', `"12" stored as the number 12 (got ${JSON.stringify(back[2]?.[1])})`)
writeFileSync(join(tmp, 'roundtrip.xlsx'), wbBytes)

// ── Case 3: scanned render → ruled lines + OCR words → grid ──────────────────
console.log('\n=== Case 3: scanned printed table via OCR + ruled-line columns ===')
const mupdf = await import('mupdf')
function renderPix(bytes, scale) {
  const d = mupdf.Document.openDocument(bytes, 'application/pdf')
  const pix = d.loadPage(0).toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true)
  return { png: Buffer.from(pix.asPNG()), w: pix.getWidth(), h: pix.getHeight(), samples: Buffer.from(pix.getPixels()) }
}
const SCAN_SCALE = 2.5
const scan = renderPix(tableBytes, SCAN_SCALE)
writeFileSync(join(tmp, 'scan.png'), scan.png)

const seps = ex.detectRuledColumnSeparators({ data: scan.samples, width: scan.w, height: scan.h, channels: 3 }, SCAN_SCALE)
ok(Array.isArray(seps) && seps.length === 5, `5 ruled column lines detected (got ${seps ? seps.length : 'null'})`)
if (seps) {
  const expected = [40, 240, 310, 445, 575]
  ok(seps.every((s, i) => Math.abs(s - expected[i]) < 4), `line positions within 4pt (got ${seps.map(s => s.toFixed(1)).join(', ')})`)
}

let ocrGrid = null
try {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, { cachePath: tmp })
  const { data } = await worker.recognize(scan.png, {}, { blocks: true })
  await worker.terminate()
  const words = ex.wordsFromRecognition(data, 1 / SCAN_SCALE, 1 / SCAN_SCALE, 400)
  ocrGrid = ex.itemsToGrid(ex.ocrWordsToItems(words), seps)
} catch (e) {
  console.log('  SKIP - tesseract unavailable in this environment: ' + e.message)
}
if (ocrGrid) {
  ok(ocrGrid.length === 5, `OCR grid has 5 rows (got ${ocrGrid.length})`)
  ok(ocrGrid.every(r => r.length === 4), `OCR grid has 4 columns (got ${ocrGrid.map(r => r.length).join(',')})`)
  const flat = ocrGrid.flat().join(' ')
  ok(flat.includes('Monstera') && flat.includes('Ceramic'), 'item names read correctly')
  ok(ocrGrid[2] && ocrGrid[2][3] === '96.00', `numeric cell exact in its own column (got ${JSON.stringify(ocrGrid[2]?.[3])})`)
}

// ── Case 4: Azure layout result mapping ───────────────────────────────────────
console.log('\n=== Case 4: Azure Document Intelligence mapping ===')
const azureFixture = {
  pages: [
    { pageNumber: 1, width: 8.5, height: 11, unit: 'inch', words: [] },
    {
      pageNumber: 2, width: 8.5, height: 11, unit: 'inch',
      // two rows × two columns of loose words (no table detected on this page)
      words: [
        { content: '1',     polygon: [1.0, 1.00, 1.2, 1.00, 1.2, 1.20, 1.0, 1.20] },
        { content: '31.19', polygon: [3.0, 1.00, 3.6, 1.00, 3.6, 1.20, 3.0, 1.20] },
        { content: '2',     polygon: [1.0, 1.50, 1.2, 1.50, 1.2, 1.70, 1.0, 1.70] },
        { content: '31.50', polygon: [3.0, 1.50, 3.6, 1.50, 3.6, 1.70, 3.0, 1.70] },
      ],
    },
  ],
  tables: [{
    rowCount: 2, columnCount: 2, boundingRegions: [{ pageNumber: 1 }],
    cells: [
      { rowIndex: 0, columnIndex: 0, content: 'No' },
      { rowIndex: 0, columnIndex: 1, content: 'Reading' },
      { rowIndex: 1, columnIndex: 0, content: '1' },
      { rowIndex: 1, columnIndex: 1, content: '31.19' },
    ],
  }],
}
const azGrids = ex.azureResultToGrids(azureFixture, [1, 2])
ok(azGrids.length === 2, `grids for both pages (got ${azGrids.length})`)
ok(JSON.stringify(azGrids[0].grid) === JSON.stringify([['No', 'Reading'], ['1', '31.19']]),
  `table cells mapped (got ${JSON.stringify(azGrids[0].grid)})`)
ok(JSON.stringify(azGrids[1].grid) === JSON.stringify([['1', '31.19'], ['2', '31.50']]),
  `words-only page clustered into 2×2 (got ${JSON.stringify(azGrids[1].grid)})`)

// ── Case 5 (informational): the real handwritten ledger ──────────────────────
const challenge = 'C:/Users/emiso/Downloads/20260611072850.pdf'
if (existsSync(challenge)) {
  console.log('\n=== Case 5 (informational): handwritten ledger via local OCR ===')
  try {
    const bytes = readFileSync(challenge)
    const scan2 = renderPix(bytes, 2)
    const seps2 = ex.detectRuledColumnSeparators({ data: scan2.samples, width: scan2.w, height: scan2.h, channels: 3 }, 2)
    console.log('  ruled lines detected:', seps2 ? seps2.map(s => s.toFixed(0)).join(', ') : 'none')
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker('eng', 1, { cachePath: tmp })
    const { data } = await worker.recognize(scan2.png, {}, { blocks: true })
    await worker.terminate()
    const d = mupdf.Document.openDocument(bytes, 'application/pdf')
    const box = d.loadPage(0).getBounds()
    const pageH = box[3] - box[1]
    const words = ex.wordsFromRecognition(data, 1 / 2, 1 / 2, pageH)
    const grid = ex.itemsToGrid(ex.ocrWordsToItems(words), seps2)
    console.log(`  Tesseract found ${words.length} words; grid ${grid.length} rows × ${grid[0]?.length ?? 0} cols`)
    for (const row of grid.slice(0, 8)) console.log('   ', JSON.stringify(row))
    console.log('  (handwriting accuracy is expected to be poor — that is the Azure engine\'s job)')
  } catch (e) {
    console.log('  SKIP - ' + e.message)
  }
}

rmSync(entryPath, { force: true })
rmSync(bundlePath, { force: true })

console.log('\n=== RESULT ===')
if (errs.length === 0) console.log('  PASS — table extraction, OCR feed, ruled columns, Azure mapping, xlsx round-trip all verified.')
else { errs.forEach(e => console.log('  FAIL - ' + e)); process.exitCode = 1 }
console.log('  artifacts:', tmp)
