/**
 * Heuristic table extraction: cluster a page's text items into rows (by baseline)
 * and columns (by x-position) to reconstruct a grid, then build an XLSX workbook
 * (one sheet per page). Works well on grid-like/tabular content; not magic on
 * free-flowing prose.
 */
import * as XLSX from 'xlsx'
import type { PDFDocumentProxy } from 'pdfjs-dist'

interface Item { str: string; x: number; y: number; w: number }

async function pageGrid(pdfDoc: PDFDocumentProxy, pageNum: number): Promise<string[][]> {
  const page = await pdfDoc.getPage(pageNum)
  const tc = await page.getTextContent()
  const items: Item[] = tc.items
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((it: any) => 'str' in it && it.str.trim())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((it: any) => ({ str: it.str.trim(), x: it.transform[4], y: it.transform[5], w: it.width }))
  if (items.length === 0) return []

  // Group into rows by baseline y (top→bottom). Tolerance scales with typical line gap.
  items.sort((a, b) => b.y - a.y || a.x - b.x)
  const yTol = 4
  const rows: Item[][] = []
  let cur: Item[] = []; let curY: number | null = null
  for (const it of items) {
    if (curY === null || Math.abs(it.y - curY) <= yTol) { cur.push(it); curY = curY ?? it.y }
    else { rows.push(cur); cur = [it]; curY = it.y }
  }
  if (cur.length) rows.push(cur)

  // Derive column anchors by clustering all x-starts across the page.
  const xs = items.map(i => i.x).sort((a, b) => a - b)
  const colTol = 14
  const cols: number[] = []
  for (const x of xs) { if (cols.length === 0 || x - cols[cols.length - 1] > colTol) cols.push(x) }

  // Place each row's items into the nearest column.
  return rows.map(r => {
    const cells = new Array(cols.length).fill('')
    for (const it of r.sort((a, b) => a.x - b.x)) {
      let ci = 0, best = Infinity
      for (let c = 0; c < cols.length; c++) { const d = Math.abs(it.x - cols[c]); if (d < best) { best = d; ci = c } }
      cells[ci] = cells[ci] ? `${cells[ci]} ${it.str}` : it.str
    }
    return cells
  })
}

/** Build an XLSX workbook (one sheet per page) from the document's tabular text. */
export async function extractTablesToXlsx(pdfDoc: PDFDocumentProxy, numPages: number): Promise<Uint8Array> {
  const wb = XLSX.utils.book_new()
  let any = false
  for (let p = 1; p <= numPages; p++) {
    const grid = await pageGrid(pdfDoc, p)
    if (grid.length === 0) continue
    const ws = XLSX.utils.aoa_to_sheet(grid)
    XLSX.utils.book_append_sheet(wb, ws, `Page ${p}`.slice(0, 31))
    any = true
  }
  if (!any) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['(no extractable text)']]), 'Empty')
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
}
