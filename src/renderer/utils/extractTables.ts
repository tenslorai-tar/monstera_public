/**
 * Heuristic table extraction: cluster a page's text items into rows (by baseline)
 * and columns (whitespace-gap projection, ruled-line detection, or x-start
 * clustering) to reconstruct a grid, then build an XLSX workbook (one sheet per
 * page). Items can come from native PDF text, Tesseract OCR words, or Azure
 * Document Intelligence layout results.
 */
import * as XLSX from 'xlsx'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { OcrWord } from './ocrUtils'

export interface TableItem { str: string; x: number; y: number; w: number; h: number }
export type GridSource = 'text' | 'ocr' | 'azure'
export interface PageGrid { page: number; grid: string[][]; source: GridSource }

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

export function clusterRows(items: TableItem[]): TableItem[][] {
  if (items.length === 0) return []
  const tol = Math.min(16, Math.max(4, median(items.map(i => i.h).filter(h => h > 0)) * 0.55))
  const sorted = [...items].sort((a, b) => (b.y + b.h / 2) - (a.y + a.h / 2) || a.x - b.x)
  const rows: TableItem[][] = []
  let cur: TableItem[] = []
  let sum = 0
  for (const it of sorted) {
    const yc = it.y + it.h / 2
    if (cur.length === 0 || Math.abs(yc - sum / cur.length) <= tol) { cur.push(it); sum += yc }
    else { rows.push(cur); cur = [it]; sum = yc }
  }
  if (cur.length) rows.push(cur)
  return rows
}

// Column boundaries via whitespace projection: x positions almost no row's text
// covers, flanked by well-covered regions on both sides. Handles left-, right-
// and centre-aligned columns alike; prose produces no separators (one column).
export function whitespaceSeparators(rows: TableItem[][]): number[] {
  if (rows.length < 2) return []
  let maxX = 0
  for (const r of rows) for (const it of r) maxX = Math.max(maxX, it.x + it.w)
  const W = Math.ceil(maxX) + 2
  if (W <= 0 || W > 20000) return []
  const cover = new Uint16Array(W)
  for (const r of rows) {
    const hit = new Uint8Array(W)
    for (const it of r) {
      const a = Math.max(0, Math.floor(it.x))
      const b = Math.min(W - 1, Math.ceil(it.x + it.w))
      for (let x = a; x <= b; x++) hit[x] = 1
    }
    for (let x = 0; x < W; x++) cover[x] += hit[x]
  }
  const R = rows.length
  const gapThr = Math.max(0, Math.floor(R * 0.06))
  const sideThr = Math.max(2, Math.ceil(R * 0.15))
  let minX = -1, maxCov = -1
  for (let x = 0; x < W; x++) if (cover[x] > gapThr) { if (minX < 0) minX = x; maxCov = x }
  if (minX < 0) return []
  const seps: number[] = []
  let gapStart = -1
  for (let x = minX; x <= maxCov + 1; x++) {
    const inGap = x <= maxCov && cover[x] <= gapThr
    if (inGap && gapStart < 0) gapStart = x
    else if (!inGap && gapStart >= 0) {
      const gapEnd = x - 1
      if (gapEnd - gapStart + 1 >= 5) {
        let lOk = false, rOk = false
        for (let l = gapStart - 1; l >= Math.max(minX, gapStart - 40); l--) if (cover[l] >= sideThr) { lOk = true; break }
        for (let r = gapEnd + 1; r <= Math.min(maxCov, gapEnd + 40); r++) if (cover[r] >= sideThr) { rOk = true; break }
        if (lOk && rOk) seps.push((gapStart + gapEnd) / 2)
      }
      gapStart = -1
    }
  }
  return seps
}

// Vertical ruled lines from rendered page pixels (RGBA or RGB), as column
// separators in PDF points. Returns null when fewer than two lines are found.
export function detectRuledColumnSeparators(
  px: { data: Uint8ClampedArray | Uint8Array; width: number; height: number; channels?: number },
  renderScale: number
): number[] | null {
  const { data, width, height } = px
  const n = px.channels ?? 4
  const minRun = Math.floor(height * 0.45)
  const lineXs: number[] = []
  let runStart = -1
  for (let x = 0; x < width; x++) {
    let dark = 0
    for (let y = 0; y < height; y++) {
      const o = (y * width + x) * n
      const luma = data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114
      if (luma < 140) dark++
    }
    const isLine = dark >= minRun
    if (isLine && runStart < 0) runStart = x
    else if (!isLine && runStart >= 0) {
      if (x - runStart <= 12) lineXs.push((runStart + x - 1) / 2)
      runStart = -1
    }
  }
  if (runStart >= 0 && width - runStart <= 12) lineXs.push((runStart + width - 1) / 2)
  if (lineXs.length < 2) return null
  return lineXs.map(x => x / renderScale)
}

function trimGrid(grid: string[][]): string[][] {
  const rows = grid.filter(r => r.some(c => c !== ''))
  if (rows.length === 0) return []
  const nCols = Math.max(...rows.map(r => r.length))
  const keep: number[] = []
  for (let c = 0; c < nCols; c++) if (rows.some(r => (r[c] ?? '') !== '')) keep.push(c)
  return rows.map(r => keep.map(c => r[c] ?? ''))
}

export function itemsToGrid(items: TableItem[], separators?: number[] | null): string[][] {
  const rows = clusterRows(items)
  if (rows.length === 0) return []
  const seps = separators && separators.length >= 1 ? separators : whitespaceSeparators(rows)

  if (seps.length >= 1) {
    const sorted = [...seps].sort((a, b) => a - b)
    return trimGrid(rows.map(r => {
      const cells = new Array(sorted.length + 1).fill('')
      for (const it of [...r].sort((a, b) => a.x - b.x)) {
        const xc = it.x + it.w / 2
        let ci = 0
        while (ci < sorted.length && xc > sorted[ci]) ci++
        cells[ci] = cells[ci] ? `${cells[ci]} ${it.str}` : it.str
      }
      return cells
    }))
  }

  // Fallback: cluster x-starts into column anchors; bin items to the last
  // anchor at or left of their start (text flows rightward from a column edge).
  const xs = items.map(i => i.x).sort((a, b) => a - b)
  const colTol = 14
  const cols: number[] = []
  for (const x of xs) { if (cols.length === 0 || x - cols[cols.length - 1] > colTol) cols.push(x) }
  return trimGrid(rows.map(r => {
    const cells = new Array(cols.length).fill('')
    for (const it of [...r].sort((a, b) => a.x - b.x)) {
      let ci = 0
      for (let c = 0; c < cols.length; c++) if (cols[c] <= it.x + 2) ci = c
      cells[ci] = cells[ci] ? `${cells[ci]} ${it.str}` : it.str
    }
    return cells
  }))
}

export async function nativeItems(pdfDoc: PDFDocumentProxy, pageNum: number): Promise<TableItem[]> {
  const page = await pdfDoc.getPage(pageNum)
  const tc = await page.getTextContent()
  return tc.items
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((it: any) => 'str' in it && it.str.trim())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((it: any) => ({ str: it.str.trim(), x: it.transform[4], y: it.transform[5], w: it.width, h: it.height || 0 }))
}

export function ocrWordsToItems(words: OcrWord[]): TableItem[] {
  return words.filter(w => w.text.trim()).map(w => ({ str: w.text.trim(), x: w.x, y: w.y, w: w.w, h: w.h }))
}

// ── Azure Document Intelligence (prebuilt-layout) result mapping ─────────────

interface AzureCell { rowIndex: number; columnIndex: number; content?: string; boundingRegions?: Array<{ pageNumber: number }> }
interface AzureTable { rowCount: number; columnCount: number; cells?: AzureCell[]; boundingRegions?: Array<{ pageNumber: number }> }
interface AzureWord { content: string; polygon?: number[] }
interface AzurePage { pageNumber: number; width?: number; height?: number; unit?: string; words?: AzureWord[] }
interface AzureResult { tables?: AzureTable[]; pages?: AzurePage[] }

export function azureResultToGrids(result: unknown, wantedPages: number[]): PageGrid[] {
  const r = (result ?? {}) as AzureResult
  const tablesByPage = new Map<number, AzureTable[]>()
  for (const t of r.tables ?? []) {
    const pn = t.boundingRegions?.[0]?.pageNumber ?? t.cells?.[0]?.boundingRegions?.[0]?.pageNumber
    if (!pn) continue
    if (!tablesByPage.has(pn)) tablesByPage.set(pn, [])
    tablesByPage.get(pn)!.push(t)
  }
  const pagesByNum = new Map<number, AzurePage>()
  for (const p of r.pages ?? []) pagesByNum.set(p.pageNumber, p)

  const grids: PageGrid[] = []
  for (const pn of wantedPages) {
    const tables = tablesByPage.get(pn) ?? []
    if (tables.length > 0) {
      const grid: string[][] = []
      for (const t of tables) {
        if (grid.length > 0) grid.push([])
        const base = grid.length
        for (let ri = 0; ri < t.rowCount; ri++) grid.push(new Array(t.columnCount).fill(''))
        for (const c of t.cells ?? []) {
          if (c.rowIndex < t.rowCount && c.columnIndex < t.columnCount)
            grid[base + c.rowIndex][c.columnIndex] = (c.content ?? '').replace(/\n/g, ' ').trim()
        }
      }
      grids.push({ page: pn, grid: trimGrid(grid), source: 'azure' })
      continue
    }
    const page = pagesByNum.get(pn)
    if (!page?.words?.length) { grids.push({ page: pn, grid: [], source: 'azure' }); continue }
    const mult = page.unit === 'inch' ? 72 : 1
    const pageH = (page.height ?? 11) * mult
    const items: TableItem[] = []
    for (const w of page.words) {
      const poly = w.polygon ?? []
      if (poly.length < 8 || !w.content.trim()) continue
      const xsP = [poly[0], poly[2], poly[4], poly[6]].map(v => v * mult)
      const ysP = [poly[1], poly[3], poly[5], poly[7]].map(v => v * mult)
      const x0 = Math.min(...xsP), x1 = Math.max(...xsP)
      const y0 = Math.min(...ysP), y1 = Math.max(...ysP)
      items.push({ str: w.content.trim(), x: x0, y: pageH - y1, w: x1 - x0, h: y1 - y0 })
    }
    grids.push({ page: pn, grid: itemsToGrid(items), source: 'azure' })
  }
  return grids
}

// ── Workbook assembly ─────────────────────────────────────────────────────────

const NUM_RE = /^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/

function toCellValue(s: string): string | number {
  const t = s.trim()
  if (NUM_RE.test(t) && !/^0\d/.test(t)) {
    const n = Number(t.replace(/,/g, ''))
    if (Number.isFinite(n)) return n
  }
  return s
}

export function gridsToXlsx(grids: PageGrid[]): Uint8Array {
  const wb = XLSX.utils.book_new()
  let any = false
  for (const g of grids) {
    if (g.grid.length === 0) continue
    const aoa = g.grid.map(row => row.map(toCellValue))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), `Page ${g.page}`.slice(0, 31))
    any = true
  }
  if (!any) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['(no extractable text)']]), 'Empty')
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
}
