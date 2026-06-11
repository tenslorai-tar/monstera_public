/**
 * Styled XLSX assembly: combines the extracted grid with per-run font info
 * (PDFium) and colours sampled from a page render to reproduce the original
 * document's look — fonts, bold, text colour, cell fills, borders, merged
 * title rows, number formats and column widths — the way Acrobat's Excel
 * export does. Pure functions over pixel buffers so the pipeline is provable
 * headlessly; the writer uses exceljs (SheetJS cannot write styles).
 */
import type { GridDetail, CellStyle, PageStyling, PageGrid } from './extractTables'
import { toCellValue } from './extractTables'

export interface StyledRunLike {
  text: string; x1: number; y1: number; x2: number; y2: number
  family: string; bold: boolean; italic: boolean
  fontSize: number; color: string
}

interface Pix { data: Uint8ClampedArray | Uint8Array; width: number; height: number; channels?: number }

function numFmtFor(text: string): string | undefined {
  const t = text.trim()
  const grouped = /^-?\d{1,3}(,\d{3})+(\.(\d+))?$/.exec(t)
  if (grouped) return grouped[3] ? `#,##0.${'0'.repeat(grouped[3].length)}` : '#,##0'
  const dec = /^-?\d+\.(\d+)$/.exec(t)
  if (dec) return `0.${'0'.repeat(dec[1].length)}`
  return undefined
}

export function computeStyling(
  detail: GridDetail,
  runs: StyledRunLike[],
  px: Pix | null,
  scale: number,
  pageH: number,
  nRows: number,
  nCols: number,
): PageStyling {
  const styles: Array<Array<CellStyle | null>> = Array.from({ length: nRows }, () => new Array(nCols).fill(null))
  const merges: Array<{ row: number; c1: number; c2: number }> = []
  const n = px?.channels ?? 4

  // Text band per row (PDF pts, y-up): border lines live between bands, so the
  // edge scan may reach halfway to the neighbouring row/column.
  const rowBand: Array<{ y1: number; y2: number }> = []
  for (const c of detail.cells) {
    const b = rowBand[c.row] ?? { y1: Infinity, y2: -Infinity }
    b.y1 = Math.min(b.y1, c.y1)
    b.y2 = Math.max(b.y2, c.y2)
    rowBand[c.row] = b
  }

  const lumaAt = (x: number, y: number): number => {
    const o = (y * px!.width + x) * n
    return px!.data[o] * 0.299 + px!.data[o + 1] * 0.587 + px!.data[o + 2] * 0.114
  }

  for (const cell of detail.cells) {
    const st: CellStyle = {}

    // Dominant font among the runs whose centre falls inside the cell.
    const mine = runs.filter(r => {
      const cx = (r.x1 + r.x2) / 2, cy = (r.y1 + r.y2) / 2
      return cx >= cell.x1 - 1 && cx <= cell.x2 + 1 && cy >= cell.y1 - 1 && cy <= cell.y2 + 1
    })
    if (mine.length > 0) {
      const weight = new Map<string, number>()
      for (const r of mine) {
        const k = JSON.stringify([r.family, Math.round(r.fontSize * 2) / 2, r.bold, r.italic, r.color])
        weight.set(k, (weight.get(k) ?? 0) + r.text.length)
      }
      const [best] = [...weight.entries()].sort((a, b) => b[1] - a[1])
      const [family, size, bold, italic, color] = JSON.parse(best[0]) as [string, number, boolean, boolean, string]
      if (family) st.family = family
      if (size > 0) st.size = size
      if (bold) st.bold = true
      if (italic) st.italic = true
      if (color && color !== '#000000') st.color = color
    }

    if (px) {
      const W = px.width, H = px.height
      const rx1 = Math.max(0, Math.round(cell.x1 * scale))
      const rx2 = Math.min(W - 1, Math.round(cell.x2 * scale))
      const ry1 = Math.max(0, Math.round((pageH - cell.y2) * scale))   // top in pixel space
      const ry2 = Math.min(H - 1, Math.round((pageH - cell.y1) * scale))
      if (rx2 - rx1 > 4 && ry2 - ry1 > 4) {
        // Fill: dominant light colour of the cell interior (text pixels skipped).
        const hist = new Map<number, number>()
        let light = 0
        for (let y = ry1 + 2; y <= ry2 - 2; y += 1) {
          for (let x = rx1 + 2; x <= rx2 - 2; x += 1) {
            const o = (y * W + x) * n
            const r = px.data[o], g = px.data[o + 1], b = px.data[o + 2]
            if (r * 0.299 + g * 0.587 + b * 0.114 < 140) continue
            light++
            const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
            hist.set(key, (hist.get(key) ?? 0) + 1)
          }
        }
        if (light > 30) {
          const [bestKey, bestCount] = [...hist.entries()].sort((a, b) => b[1] - a[1])[0]
          if (bestCount >= light * 0.4) {
            const r = ((bestKey >> 10) & 31) << 3, g = ((bestKey >> 5) & 31) << 3, b = (bestKey & 31) << 3
            if (Math.min(r, g, b) <= 0xd0) {
              const hex = (v: number) => Math.min(255, v + 4).toString(16).padStart(2, '0')
              st.fill = `#${hex(r)}${hex(g)}${hex(b)}`
            }
          }
        }
        // Borders: scan outward from each text edge — up to halfway toward the
        // neighbouring row/column — for a dark line covering most of the edge.
        const lineAcross = (y: number): boolean => {
          if (y < 1 || y >= H - 1) return false
          let hit = 0
          for (let x = rx1; x <= rx2; x++) {
            if (lumaAt(x, y) < 110 || lumaAt(x, y - 1) < 110 || lumaAt(x, y + 1) < 110) hit++
          }
          return hit >= (rx2 - rx1 + 1) * 0.6
        }
        const lineDown = (x: number): boolean => {
          if (x < 1 || x >= W - 1) return false
          let hit = 0
          for (let y = ry1; y <= ry2; y++) {
            if (lumaAt(x, y) < 110 || lumaAt(x - 1, y) < 110 || lumaAt(x + 1, y) < 110) hit++
          }
          return hit >= (ry2 - ry1 + 1) * 0.6
        }
        const reachPx = (pt: number): number => Math.max(2, Math.round(pt * scale))
        const above = rowBand[cell.row - 1]
        const below = rowBand[cell.row + 1]
        const reachT = reachPx(above ? Math.max(2, (above.y1 - rowBand[cell.row].y2) / 2 + 2) : 8)
        const reachB = reachPx(below ? Math.max(2, (rowBand[cell.row].y1 - below.y2) / 2 + 2) : 8)
        const left = detail.colBounds[cell.col - 1]
        const right = detail.colBounds[cell.col + 1]
        const reachL = reachPx(left ? Math.max(2, (detail.colBounds[cell.col][0] - left[1]) / 2 + 2) : 8)
        const reachR = reachPx(right ? Math.max(2, (right[0] - detail.colBounds[cell.col][1]) / 2 + 2) : 8)
        const border: NonNullable<CellStyle['border']> = {}
        for (let off = 0; off <= reachT; off++) if (lineAcross(ry1 - off)) { border.t = true; break }
        for (let off = 0; off <= reachB; off++) if (lineAcross(ry2 + off)) { border.b = true; break }
        for (let off = 0; off <= reachL; off++) if (lineDown(rx1 - off)) { border.l = true; break }
        for (let off = 0; off <= reachR; off++) if (lineDown(rx2 + off)) { border.r = true; break }
        if (border.t || border.b || border.l || border.r) st.border = border
      }
    }

    const fmt = numFmtFor(cell.text)
    if (fmt) st.numFmt = fmt
    if (Object.keys(st).length > 0) styles[cell.row][cell.col] = st
  }

  // A cell whose text extends across later columns (and those cells are empty)
  // becomes a merged range — titles and section headings.
  const byRow = new Map<number, typeof detail.cells>()
  for (const c of detail.cells) {
    if (!byRow.has(c.row)) byRow.set(c.row, [])
    byRow.get(c.row)!.push(c)
  }
  for (const [row, cs] of byRow) {
    for (const cell of cs) {
      let c2 = cell.col
      for (let k = cell.col + 1; k < nCols; k++) {
        if (detail.colBounds[k] && detail.colBounds[k][0] < cell.x2 - 2) c2 = k
        else break
      }
      if (c2 > cell.col && cs.every(o => o === cell || o.col > c2 || o.col < cell.col)) {
        merges.push({ row, c1: cell.col, c2 })
      }
    }
  }

  // Column widths from the midpoints between adjacent column extents.
  let colWidths: number[] | null = null
  if (detail.colBounds.length === nCols && nCols > 0) {
    const edges: number[] = [detail.minX]
    for (let k = 1; k < nCols; k++) edges.push((detail.colBounds[k - 1][1] + detail.colBounds[k][0]) / 2)
    edges.push(detail.maxX)
    colWidths = []
    for (let k = 0; k < nCols; k++) colWidths.push(Math.min(60, Math.max(3, (edges[k + 1] - edges[k]) / 5.2)))
  }

  return { styles, merges, colWidths }
}

const argb = (hex: string): string => 'FF' + hex.replace('#', '').toUpperCase()

export async function gridsToXlsxStyled(grids: PageGrid[], combine: boolean): Promise<Uint8Array> {
  const mod = await import('exceljs')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ExcelJS: any = (mod as any).default ?? mod
  const wb = new ExcelJS.Workbook()

  const nonEmpty = grids.filter(g => g.grid.length > 0)
  const targets: Array<{ name: string; pages: PageGrid[] }> =
    combine && nonEmpty.length > 1
      ? [{ name: 'Table 1', pages: nonEmpty }]
      : nonEmpty.map(g => ({ name: `Page ${g.page}`.slice(0, 31), pages: [g] }))
  if (targets.length === 0) {
    const ws = wb.addWorksheet('Empty')
    ws.getCell(1, 1).value = '(no extractable text)'
    return new Uint8Array(await wb.xlsx.writeBuffer())
  }

  for (const t of targets) {
    const ws = wb.addWorksheet(t.name)
    const widths = new Map<number, number>()
    let rowBase = 0
    for (const g of t.pages) {
      const styling = g.styling
      for (let r = 0; r < g.grid.length; r++) {
        for (let c = 0; c < g.grid[r].length; c++) {
          const text = g.grid[r][c]
          if (text === '') continue
          const cell = ws.getCell(rowBase + r + 1, c + 1)
          cell.value = toCellValue(text)
          const st = styling?.styles?.[r]?.[c]
          if (st) {
            cell.font = {
              name: st.family || 'Calibri',
              size: st.size && st.size >= 4 ? Math.round(st.size * 2) / 2 : 11,
              bold: !!st.bold,
              italic: !!st.italic,
              color: { argb: argb(st.color ?? '#000000') },
            }
            if (st.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(st.fill) } }
            if (st.numFmt) cell.numFmt = st.numFmt
            if (st.border) {
              const thin = { style: 'thin' as const, color: { argb: 'FF000000' } }
              cell.border = {
                ...(st.border.t ? { top: thin } : {}),
                ...(st.border.b ? { bottom: thin } : {}),
                ...(st.border.l ? { left: thin } : {}),
                ...(st.border.r ? { right: thin } : {}),
              }
            }
          }
        }
      }
      for (const m of styling?.merges ?? []) {
        try {
          ws.mergeCells(rowBase + m.row + 1, m.c1 + 1, rowBase + m.row + 1, m.c2 + 1)
          ws.getCell(rowBase + m.row + 1, m.c1 + 1).alignment = { horizontal: 'center' }
        } catch { /* overlapping merge — keep the first */ }
      }
      styling?.colWidths?.forEach((w, i) => widths.set(i, Math.max(widths.get(i) ?? 0, w)))
      rowBase += g.grid.length
    }
    for (const [i, w] of widths) ws.getColumn(i + 1).width = w
  }
  return new Uint8Array(await wb.xlsx.writeBuffer())
}
