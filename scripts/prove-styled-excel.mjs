// Proof for STYLED Excel export (Adobe-parity output):
//
// Case 1 — grid + detail extraction still exact on a styled document.
// Case 2 — style capture: bold + colour from PDFium runs, yellow cell fill and
//   header borders sampled from the rendered pixels, number formats from the
//   original strings ("15,900" → #,##0 · "47.00" → 0.00).
// Case 3 — merged title: a heading spanning several columns becomes a merged,
//   centred range.
// Case 4 — exceljs round-trip: workbook re-opens with fonts, fills, formats,
//   merges, and both pages combined into one continuous "Table 1" sheet.
// Case 5 (informational) — the real casing tally: fonts/colours/fills found.

import { readFileSync, writeFileSync, rmSync, mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const ROOT = process.cwd()
const errs = []
const ok = (cond, label) => { console.log((cond ? '  PASS - ' : '  FAIL - ') + label); if (!cond) errs.push(label) }

const entryPath = join(ROOT, 'scripts/_styledEntry.gen.ts')
const bundlePath = join(ROOT, 'scripts/_styled.bundle.gen.mjs')
writeFileSync(entryPath, [
  "export * from '../src/renderer/utils/extractTables'",
  "export * from '../src/renderer/utils/styledExcel'",
].join('\n'))
const esbuild = await import('esbuild')
esbuild.buildSync({
  entryPoints: [entryPath], bundle: true, format: 'esm', platform: 'node',
  external: ['tesseract.js', 'pdfjs-dist', 'xlsx', 'exceljs'], outfile: bundlePath,
})
const ex = await import(pathToFileURL(bundlePath).href)
const engine = await import(pathToFileURL(join(ROOT, 'dist-electron/main/pdfiumEngine.js')).href)
const tmp = mkdtempSync(join(tmpdir(), 'monstera-styledxlsx-'))

// ── Build a styled two-page table PDF ─────────────────────────────────────────
const QTY = ['15,900', '8', '12', '5', '40', '7', '21', '64', '3', '18', '9', '33', '27', '11', '52', '6']
const TOTAL = ['47.00', '96.00', '12.25', '61.25', '15.75', '31.50', '24.50', '73.50', '8.00', '9.10', '4.75', '66.20', '5.05', '7.40', '88.00', '2.30']
async function makeStyledPdf() {
  const doc = await PDFDocument.create()
  const helv = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const page = doc.addPage([612, 400])
  page.drawText('CONOIL 9-5/8 CASING RUNNING LIST', { x: 140, y: 372, size: 18, font: bold, color: rgb(0, 0, 0.8) })
  // yellow highlight behind the first Qty value
  page.drawRectangle({ x: 240, y: 314, width: 66, height: 16, color: rgb(1, 1, 0) })
  // border box around the header row
  page.drawRectangle({ x: 55, y: 334, width: 400, height: 20, borderColor: rgb(0, 0, 0), borderWidth: 1 })
  const header = ['Item', 'Qty', 'Total']
  page.drawText(header[0], { x: 60, y: 340, size: 11, font: bold })
  page.drawText(header[1], { x: 300 - bold.widthOfTextAtSize('Qty', 11), y: 340, size: 11, font: bold })
  page.drawText(header[2], { x: 450 - bold.widthOfTextAtSize('Total', 11), y: 340, size: 11, font: bold })
  for (let i = 0; i < 16; i++) {
    const y = 318 - i * 13
    page.drawText(`Joint ${i + 1}`, { x: 60, y, size: 10, font: helv })
    page.drawText(QTY[i], { x: 300 - helv.widthOfTextAtSize(QTY[i], 10), y, size: 10, font: helv })
    page.drawText(TOTAL[i], { x: 450 - helv.widthOfTextAtSize(TOTAL[i], 10), y, size: 10, font: helv })
  }
  const p2 = doc.addPage([612, 400])
  for (let i = 0; i < 4; i++) {
    const y = 340 - i * 14
    p2.drawText(`Extra ${i + 1}`, { x: 60, y, size: 10, font: helv })
    p2.drawText(String(100 + i), { x: 300 - helv.widthOfTextAtSize(String(100 + i), 10), y, size: 10, font: helv })
    p2.drawText(`${i + 1}.50`, { x: 450 - helv.widthOfTextAtSize(`${i + 1}.50`, 10), y, size: 10, font: helv })
  }
  return Buffer.from(await doc.save())
}
const bytes = await makeStyledPdf()
writeFileSync(join(tmp, 'styled.pdf'), bytes)

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
const mupdf = await import('mupdf')
const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise

function renderPx(b, pageIdx, scale) {
  const d = mupdf.Document.openDocument(b, 'application/pdf')
  const pix = d.loadPage(pageIdx).toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true)
  return { data: Buffer.from(pix.getPixels()), width: pix.getWidth(), height: pix.getHeight(), channels: 3 }
}

async function stylePage(pageNum, pageH) {
  const items = await ex.nativeItems(doc, pageNum)
  const detail = ex.itemsToGridDetailed(items)
  const runs = engine.getStyledTextRuns(bytes, pageNum - 1)
  const scale = 2
  const px = renderPx(bytes, pageNum - 1, scale)
  const nR = detail.grid.length
  const nC = nR > 0 ? Math.max(...detail.grid.map(r => r.length)) : 0
  const styling = ex.computeStyling(detail, runs, px, scale, pageH, nR, nC)
  return { detail, styling }
}

// ── Case 1: grid extraction ───────────────────────────────────────────────────
console.log('\n=== Case 1: grid extraction on the styled document ===')
const { detail: d1, styling: s1 } = await stylePage(1, 400)
ok(d1.grid.length === 18, `18 rows (title + header + 16 data; got ${d1.grid.length})`)
const headerRow = d1.grid.findIndex(r => r.includes('Item'))
const dataRow = d1.grid.findIndex(r => r.includes('15,900'))
ok(headerRow >= 0 && dataRow === headerRow + 1, `header and first data row adjacent (got ${headerRow}, ${dataRow})`)
ok(d1.grid[dataRow].includes('Joint 1') && d1.grid[dataRow].includes('47.00'), 'first data row intact')

// ── Case 2: style capture ─────────────────────────────────────────────────────
console.log('\n=== Case 2: fonts, colours, fills, borders, number formats ===')
const titleRow = d1.grid.findIndex(r => r.some(c => c.includes('CONOIL')))
const titleCol = d1.grid[titleRow].findIndex(c => c.includes('CONOIL'))
const titleStyle = s1.styles[titleRow]?.[titleCol]
ok(!!titleStyle?.bold, 'title is bold')
ok(titleStyle?.color === '#0000cc', `title colour navy (got ${titleStyle?.color})`)
ok((titleStyle?.size ?? 0) >= 17, `title size ≈18 (got ${titleStyle?.size})`)
const qtyCol = d1.grid[dataRow].indexOf('15,900')
const qtyStyle = s1.styles[dataRow]?.[qtyCol]
ok(qtyStyle?.numFmt === '#,##0', `"15,900" → numFmt #,##0 (got ${qtyStyle?.numFmt})`)
const f = qtyStyle?.fill ? [parseInt(qtyStyle.fill.slice(1, 3), 16), parseInt(qtyStyle.fill.slice(3, 5), 16), parseInt(qtyStyle.fill.slice(5, 7), 16)] : null
ok(!!f && f[0] > 200 && f[1] > 200 && f[2] < 100, `yellow fill sampled (got ${qtyStyle?.fill})`)
const totCol = d1.grid[dataRow].indexOf('47.00')
ok(s1.styles[dataRow]?.[totCol]?.numFmt === '0.00', `"47.00" → numFmt 0.00 (got ${s1.styles[dataRow]?.[totCol]?.numFmt})`)
const hdrStyle = s1.styles[headerRow]?.[d1.grid[headerRow].indexOf('Item')]
ok(!!hdrStyle?.bold, 'header is bold')
ok(!!hdrStyle?.border?.t && !!hdrStyle?.border?.b, `header border top+bottom detected (got ${JSON.stringify(hdrStyle?.border)})`)
const plainStyle = s1.styles[dataRow + 1]?.[0]
ok(!plainStyle?.fill && !plainStyle?.bold, 'plain data cell has no fill and is not bold')

// ── Case 3: merged title ──────────────────────────────────────────────────────
console.log('\n=== Case 3: merged spanning title ===')
const m = s1.merges.find(mm => mm.row === titleRow)
ok(!!m && m.c2 > m.c1, `title merged across columns (got ${JSON.stringify(m)})`)

// ── Case 4: exceljs round-trip with combine ───────────────────────────────────
console.log('\n=== Case 4: workbook round-trip, two pages combined ===')
const { detail: d2, styling: s2 } = await stylePage(2, 400)
const grids = [
  { page: 1, grid: d1.grid, source: 'text', styling: s1 },
  { page: 2, grid: d2.grid, source: 'text', styling: s2 },
]
const out = await ex.gridsToXlsxStyled(grids, true)
writeFileSync(join(tmp, 'styled.xlsx'), out)
const ExcelJS = (await import('exceljs')).default ?? await import('exceljs')
const wb = new ExcelJS.Workbook()
await wb.xlsx.load(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength))
ok(wb.worksheets.length === 1 && wb.worksheets[0].name === 'Table 1', `single combined sheet "Table 1" (got ${wb.worksheets.map(w => w.name).join(',')})`)
const ws = wb.worksheets[0]
let titleCell = null, qtyCell = null, extraCell = null
ws.eachRow(row => row.eachCell(cell => {
  if (typeof cell.value === 'string' && cell.value.includes('CONOIL')) titleCell = cell
  if (cell.value === 15900) qtyCell = cell
  if (cell.value === 'Extra 4') extraCell = cell
}))
ok(!!titleCell && titleCell.font?.bold === true, 'title cell bold in workbook')
ok(titleCell?.font?.color?.argb === 'FF0000CC', `title font colour FF0000CC (got ${titleCell?.font?.color?.argb})`)
ok(titleCell?.isMerged === true, 'title cell is merged')
ok(!!qtyCell && qtyCell.numFmt === '#,##0', `15900 carries #,##0 (got ${qtyCell?.numFmt})`)
ok(qtyCell?.fill?.type === 'pattern' && /^FF[EF][0-9A-F][EF][0-9A-F][0-4][0-9A-F]$/.test(qtyCell?.fill?.fgColor?.argb ?? ''), `15900 cell filled yellow (got ${qtyCell?.fill?.fgColor?.argb})`)
ok(!!extraCell, 'page 2 rows present in the combined sheet')
ok((ws.getColumn(1).width ?? 0) > 3, `column widths set (col 1 = ${ws.getColumn(1).width?.toFixed(1)})`)

// ── Case 5 (informational): the real casing tally ────────────────────────────
const real = 'C:/Users/emiso/Downloads/9 5 8 in casing tally. Obodo 32.pdf'
if (existsSync(real) && errs.length === 0) {
  console.log('\n=== Case 5 (informational): real casing tally ===')
  const rb = readFileSync(real)
  const rdoc = await pdfjs.getDocument({ data: new Uint8Array(rb) }).promise
  const rGrids = []
  for (let p = 1; p <= rdoc.numPages; p++) {
    const items = await ex.nativeItems(rdoc, p)
    const det = ex.itemsToGridDetailed(items)
    const runs = engine.getStyledTextRuns(rb, p - 1)
    const page = await rdoc.getPage(p)
    const pageH = page.getViewport({ scale: 1 }).height
    const px = renderPx(rb, p - 1, 2)
    const nR = det.grid.length, nC = nR ? Math.max(...det.grid.map(r => r.length)) : 0
    const styling = ex.computeStyling(det, runs, px, 2, pageH, nR, nC)
    rGrids.push({ page: p, grid: det.grid, source: 'text', styling })
    if (p === 1) {
      const flat = styling.styles.flat().filter(Boolean)
      console.log(`  page 1: ${det.grid.length} rows, ${flat.length} styled cells,`,
        `${flat.filter(s => s.fill).length} fills, ${flat.filter(s => s.bold).length} bold,`,
        `${flat.filter(s => s.color).length} coloured, ${styling.merges.length} merges`)
      const fams = new Set(flat.map(s => s.family).filter(Boolean))
      console.log('  fonts:', [...fams].join(', '))
    }
  }
  const realOut = await ex.gridsToXlsxStyled(rGrids, true)
  writeFileSync(join(tmp, 'casing-tally.xlsx'), realOut)
  console.log('  combined workbook written:', join(tmp, 'casing-tally.xlsx'))
}

rmSync(entryPath, { force: true })
rmSync(bundlePath, { force: true })

console.log('\n=== RESULT ===')
if (errs.length === 0) console.log('  PASS — styled Excel export reproduces fonts, colours, fills, borders, merges and formats.')
else { errs.forEach(e => console.log('  FAIL - ' + e)); process.exitCode = 1 }
console.log('  artifacts:', tmp)
