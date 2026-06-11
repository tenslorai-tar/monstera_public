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
export type GridSource = 'text' | 'ocr' | 'azure' | 'trocr'

export interface CellStyle {
  family?: string; size?: number; bold?: boolean; italic?: boolean
  color?: string; fill?: string
  border?: { t?: boolean; b?: boolean; l?: boolean; r?: boolean }
  numFmt?: string
}
export interface PageStyling {
  styles: Array<Array<CellStyle | null>>
  // src = the column whose cell holds the text; the writer moves it to c1
  // because merging clears every cell but the top-left master.
  merges: Array<{ row: number; c1: number; c2: number; src: number }>
  colWidths: number[] | null
}
export interface PageGrid { page: number; grid: string[][]; source: GridSource; styling?: PageStyling }

export interface CellDetail { row: number; col: number; text: string; x1: number; y1: number; x2: number; y2: number }
export interface GridDetail {
  grid: string[][]
  cells: CellDetail[]
  colBounds: Array<[number, number]>   // PDF-pt extent of each kept column
  minX: number
  maxX: number
}

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
  // Handwritten columns wobble: a few rows always stray into the corridor
  // between columns, so tolerate ~12% encroachment instead of demanding an
  // empty gap (floor() keeps small clean tables at exactly zero tolerance).
  const R = rows.length
  const gapThr = Math.max(0, Math.floor(R * 0.12))
  const sideThr = Math.max(2, Math.ceil(R * 0.15))
  let minX = -1, maxCov = -1
  for (let x = 0; x < W; x++) if (cover[x] > gapThr) { if (minX < 0) minX = x; maxCov = x }
  if (minX < 0) return []
  // Windows scale with content width so the same logic works in PDF points
  // (text items) and rendered pixels (ink runs); right-aligned columns need a
  // side window deeper than the few px next to the gap.
  const sideWin = Math.max(40, Math.round((maxCov - minX) * 0.08))
  const minGap = Math.max(5, Math.round((maxCov - minX) * 0.005))
  const seps: number[] = []
  let gapStart = -1
  for (let x = minX; x <= maxCov + 1; x++) {
    const inGap = x <= maxCov && cover[x] <= gapThr
    if (inGap && gapStart < 0) gapStart = x
    else if (!inGap && gapStart >= 0) {
      const gapEnd = x - 1
      if (gapEnd - gapStart + 1 >= minGap) {
        let lOk = false, rOk = false
        for (let l = gapStart - 1; l >= Math.max(minX, gapStart - sideWin); l--) if (cover[l] >= sideThr) { lOk = true; break }
        for (let r = gapEnd + 1; r <= Math.min(maxCov, gapEnd + sideWin); r++) if (cover[r] >= sideThr) { rOk = true; break }
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

export function trimGrid(grid: string[][]): string[][] {
  const rows = grid.filter(r => r.some(c => c !== ''))
  if (rows.length === 0) return []
  const nCols = Math.max(...rows.map(r => r.length))
  const keep: number[] = []
  for (let c = 0; c < nCols; c++) if (rows.some(r => (r[c] ?? '') !== '')) keep.push(c)
  return rows.map(r => keep.map(c => r[c] ?? ''))
}

export function itemsToGrid(items: TableItem[], separators?: number[] | null): string[][] {
  return itemsToGridDetailed(items, separators).grid
}

export function itemsToGridDetailed(items: TableItem[], separators?: number[] | null): GridDetail {
  const empty: GridDetail = { grid: [], cells: [], colBounds: [], minX: 0, maxX: 0 }
  const rows = clusterRows(items)
  if (rows.length === 0) return empty
  const seps = separators && separators.length >= 1
    ? [...separators].sort((a, b) => a - b)
    : whitespaceSeparators(rows)

  let nCols: number
  let binOf: (it: TableItem) => number
  if (seps.length >= 1) {
    nCols = seps.length + 1
    binOf = it => {
      const xc = it.x + it.w / 2
      let ci = 0
      while (ci < seps.length && xc > seps[ci]) ci++
      return ci
    }
  } else {
    // Fallback: cluster x-starts into column anchors; bin items to the last
    // anchor at or left of their start (text flows rightward from a column edge).
    const xs = items.map(i => i.x).sort((a, b) => a - b)
    const colTol = 14
    const anchors: number[] = []
    for (const x of xs) { if (anchors.length === 0 || x - anchors[anchors.length - 1] > colTol) anchors.push(x) }
    nCols = anchors.length
    binOf = it => {
      let ci = 0
      for (let c = 0; c < anchors.length; c++) if (anchors[c] <= it.x + 2) ci = c
      return ci
    }
  }

  const rowCells: Array<Map<number, TableItem[]>> = rows.map(r => {
    const m = new Map<number, TableItem[]>()
    for (const it of [...r].sort((a, b) => a.x - b.x)) {
      const ci = binOf(it)
      if (!m.has(ci)) m.set(ci, [])
      m.get(ci)!.push(it)
    }
    return m
  })
  const rawGrid: string[][] = rowCells.map(m => {
    const cells = new Array(nCols).fill('')
    for (const [ci, its] of m) cells[ci] = its.map(i => i.str).join(' ')
    return cells
  })

  const keptRows: number[] = []
  rawGrid.forEach((r, i) => { if (r.some(c => c !== '')) keptRows.push(i) })
  if (keptRows.length === 0) return empty
  const keptCols: number[] = []
  for (let c = 0; c < nCols; c++) if (keptRows.some(ri => rawGrid[ri][c] !== '')) keptCols.push(c)

  const grid = keptRows.map(ri => keptCols.map(ci => rawGrid[ri][ci]))
  const cells: CellDetail[] = []
  keptRows.forEach((ri, r2) => {
    keptCols.forEach((ci, c2) => {
      const its = rowCells[ri].get(ci)
      if (!its || its.length === 0) return
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
      for (const it of its) {
        x1 = Math.min(x1, it.x); y1 = Math.min(y1, it.y)
        x2 = Math.max(x2, it.x + it.w); y2 = Math.max(y2, it.y + it.h)
      }
      cells.push({ row: r2, col: c2, text: grid[r2][c2], x1, y1, x2, y2 })
    })
  })

  const colBounds: Array<[number, number]> = keptCols.map((_, c2) => {
    let a = Infinity, b = -Infinity
    for (const cell of cells) if (cell.col === c2) { a = Math.min(a, cell.x1); b = Math.max(b, cell.x2) }
    return [a, b]
  })
  let minX = Infinity, maxX = 0
  for (const it of items) { minX = Math.min(minX, it.x); maxX = Math.max(maxX, it.x + it.w) }
  return { grid, cells, colBounds, minX, maxX }
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

// ── Cell segmentation from pixels (for per-cell handwriting recognition) ─────
// Splits a rendered page into table-cell crops: ruled lines define bands when
// present; otherwise ink projection (with rule pixels excluded) finds the row
// and column bands. Returns pixel-space crops tagged with row/col indices.

interface Pix { data: Uint8ClampedArray | Uint8Array; width: number; height: number; channels?: number }
export interface CellBox { row: number; col: number; x: number; y: number; w: number; h: number }
// `ink` is the cleaned binarized page (1 = writing, rules/noise removed) —
// recognising crops from it instead of the raw scan keeps ruled lines out of
// the model's view.
export interface SegmentedPage { cells: CellBox[]; rows: number; cols: number; ink: Uint8Array }

export function segmentTableCells(px: Pix): SegmentedPage {
  const { data, width: w, height: h } = px
  const n = px.channels ?? 4
  const mask = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * n
      if (data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114 < 160) mask[y * w + x] = 1
    }
  }

  // Ruled lines, borders and scan shadows are LONG straight dark runs; pen
  // strokes are short. Stripping long runs (in either direction) leaves only
  // the writing — robust against faint, broken or slightly skewed lines that
  // explicit line detection misses.
  const ink = new Uint8Array(mask)
  const Lh = Math.max(30, Math.round(w * 0.04))
  for (let y = 0; y < h; y++) {
    let start = -1
    for (let x = 0; x <= w; x++) {
      const on = x < w && mask[y * w + x] === 1
      if (on && start < 0) start = x
      else if (!on && start >= 0) {
        if (x - start >= Lh) for (let i = start; i < x; i++) ink[y * w + i] = 0
        start = -1
      }
    }
  }
  const Lv = Math.max(30, Math.round(h * 0.04))
  for (let x = 0; x < w; x++) {
    let start = -1
    for (let y = 0; y <= h; y++) {
      const on = y < h && mask[y * w + x] === 1
      if (on && start < 0) start = y
      else if (!on && start >= 0) {
        if (y - start >= Lv) for (let i = start; i < y; i++) ink[i * w + x] = 0
        start = -1
      }
    }
  }

  // Photographed pages warp: curved rules survive straight-run stripping as
  // chains of short fragments. Connected-component filtering drops specks,
  // elongated thin fragments and anything spanning a third of the page, while
  // glyph-sized components (even a handwritten "1") stay.
  const visited = new Uint8Array(w * h)
  const queue = new Int32Array(w * h)
  for (let start = 0; start < w * h; start++) {
    if (!ink[start] || visited[start]) continue
    let head = 0, tail = 0
    queue[tail++] = start
    visited[start] = 1
    let minX = w, maxX = 0, minY = h, maxY = 0
    while (head < tail) {
      const idx = queue[head++]
      const y = (idx / w) | 0, x = idx - y * w
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= w) continue
          const n = ny * w + nx
          if (ink[n] && !visited[n]) { visited[n] = 1; queue[tail++] = n }
        }
      }
    }
    const bw = maxX - minX + 1, bh = maxY - minY + 1
    if (tail <= 2 || (bh <= 4 && bw >= 10 && bw >= 3 * bh) || (bw <= 5 && bh >= 45) || bw >= w * 0.35 || bh >= h * 0.35) {
      for (let i = 0; i < tail; i++) ink[queue[i]] = 0
    }
  }

  const inkRow = new Uint32Array(h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (ink[y * w + x]) inkRow[y]++
    }
  }
  // Noise floor keeps speckle and leftover line fragments from bridging gaps.
  const rowFloor = Math.max(2, Math.round(w * 0.004))

  const bandsFromInk = (proj: Uint32Array, size: number, floor: number, mergeGap: number, minLen: number): Array<[number, number]> => {
    const runs: Array<[number, number]> = []
    let start = -1
    for (let i = 0; i <= size; i++) {
      const on = i < size && proj[i] > floor
      if (on && start < 0) start = i
      else if (!on && start >= 0) { runs.push([start, i - 1]); start = -1 }
    }
    const merged: Array<[number, number]> = []
    for (const r of runs) {
      const last = merged[merged.length - 1]
      if (last && r[0] - last[1] <= mergeGap) last[1] = r[1]
      else merged.push([...r] as [number, number])
    }
    return merged.filter(b => b[1] - b[0] + 1 >= minLen)
  }

  const rowBands = bandsFromInk(inkRow, h, rowFloor, 3, 5)
  if (rowBands.length === 0) return { cells: [], rows: 0, cols: 0, ink }

  // Columns come from per-row ink runs (pseudo-words) fed through the same
  // whitespace-gap voting used for text items — a header scrawled across the
  // whole width can't weld the body columns together that way.
  interface InkRun { x1: number; x2: number; y1: number; y2: number; count: number }
  const bandHeights = rowBands.map(([y1, y2]) => y2 - y1 + 1).sort((a, b) => a - b)
  // Runs much flatter than the text height are leftover fragments of dashed or
  // curved ruling — they would otherwise vote down every column corridor.
  const minRunH = Math.max(4, Math.round(bandHeights[Math.floor(bandHeights.length / 2)] * 0.2))
  const rowRuns: InkRun[][] = rowBands.map(([y1, y2]) => {
    const proj = new Uint32Array(w)
    for (let y = y1; y <= y2; y++) for (let x = 0; x < w; x++) if (ink[y * w + x]) proj[x]++
    return bandsFromInk(proj, w, 0, Math.max(6, Math.round(w * 0.008)), 3).map(([x1, x2]) => {
      let a = y2, b = y1, count = 0
      for (let y = y1; y <= y2; y++) {
        for (let x = x1; x <= x2; x++) {
          if (ink[y * w + x]) { count++; if (y < a) a = y; if (y > b) b = y }
        }
      }
      return { x1, x2, y1: a, y2: b, count }
    }).filter(r => r.y2 - r.y1 + 1 >= minRunH && r.count >= 8)
  })

  const itemRows: TableItem[][] = rowRuns.map(rs =>
    rs.map(r => ({ str: 'x', x: r.x1, y: 0, w: r.x2 - r.x1 + 1, h: r.y2 - r.y1 + 1 })))
  const seps = whitespaceSeparators(itemRows)
  const nCols = seps.length + 1

  const cells: CellBox[] = []
  const pushCell = (ri: number, ci: number, m: InkRun) => {
    if (m.count < 15) return
    const pad = 4
    const cx = Math.max(0, m.x1 - pad)
    const cy = Math.max(0, m.y1 - pad)
    cells.push({
      row: ri, col: ci,
      x: cx, y: cy,
      w: Math.min(w - 1, m.x2 + pad) - cx + 1,
      h: Math.min(h - 1, m.y2 + pad) - cy + 1,
    })
  }

  if (seps.length >= 1) {
    for (let ri = 0; ri < rowBands.length; ri++) {
      const merged = new Map<number, InkRun>()
      for (const run of rowRuns[ri]) {
        const center = (run.x1 + run.x2) / 2
        let ci = 0
        while (ci < seps.length && center > seps[ci]) ci++
        const m = merged.get(ci)
        if (!m) merged.set(ci, { ...run })
        else {
          m.x1 = Math.min(m.x1, run.x1); m.x2 = Math.max(m.x2, run.x2)
          m.y1 = Math.min(m.y1, run.y1); m.y2 = Math.max(m.y2, run.y2)
          m.count += run.count
        }
      }
      for (const [ci, m] of merged) pushCell(ri, ci, m)
    }
    return { cells, rows: rowBands.length, cols: nCols, ink }
  }

  // No global column grid exists (columns drift or change layout mid-page,
  // as on handwritten ledgers). Split each row on its own large gaps instead;
  // the column index is the cell's position within its row.
  const joinGap = Math.max(10, Math.round(bandHeights[Math.floor(bandHeights.length / 2)] * 0.6))
  let maxCols = 1
  for (let ri = 0; ri < rowBands.length; ri++) {
    const runs = [...rowRuns[ri]].sort((a, b) => a.x1 - b.x1)
    let ci = 0
    let cur: InkRun | null = null
    for (const run of runs) {
      if (cur && run.x1 - cur.x2 > joinGap) { pushCell(ri, ci, cur); ci++; cur = null }
      if (!cur) cur = { ...run }
      else {
        cur.x2 = Math.max(cur.x2, run.x2)
        cur.y1 = Math.min(cur.y1, run.y1); cur.y2 = Math.max(cur.y2, run.y2)
        cur.count += run.count
      }
    }
    if (cur) { pushCell(ri, ci, cur); ci++ }
    if (ci > maxCols) maxCols = ci
  }
  return { cells, rows: rowBands.length, cols: maxCols, ink }
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

export function toCellValue(s: string): string | number {
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
