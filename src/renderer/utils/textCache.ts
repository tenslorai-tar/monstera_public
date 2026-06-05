import type { PDFDocumentProxy } from 'pdfjs-dist'

export interface TextPageCache {
  text: string
  itemOffsets: number[]
  itemLengths: number[]
}

// Module-level map — not reactive, not in store.
// Populated in background after PDF loads; read during search.
export const textCache = new Map<number, TextPageCache>()

export function clearTextCache(): void {
  textCache.clear()
}

export async function loadPageText(
  pdfDoc: PDFDocumentProxy,
  pageNum: number
): Promise<void> {
  if (textCache.has(pageNum)) return
  const page = await pdfDoc.getPage(pageNum)
  const tc = await page.getTextContent()
  const items = tc.items.filter(
    (item): item is { str: string } & typeof item => 'str' in item
  )
  let offset = 0
  const itemOffsets: number[] = []
  const itemLengths: number[] = []
  for (const item of items) {
    itemOffsets.push(offset)
    itemLengths.push(item.str.length)
    offset += item.str.length
  }
  textCache.set(pageNum, {
    text: items.map(i => i.str).join(''),
    itemOffsets,
    itemLengths,
  })
}

export async function loadAllPageText(pdfDoc: PDFDocumentProxy): Promise<void> {
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    await loadPageText(pdfDoc, i)
  }
}
