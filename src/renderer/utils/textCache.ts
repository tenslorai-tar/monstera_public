import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { OcrWord } from './ocrUtils'

export interface TextPageCache {
  text: string          // raw page text; '\n' inserted after items that end a line
  norm: string          // search-normalized text (lowercase, diacritics stripped, ligatures decomposed)
  normToRaw: number[]   // norm index → raw index, for mapping matches back to raw offsets
  itemOffsets: number[] // raw offset of each PDF.js text item (aligns with text-layer spans)
  itemLengths: number[]
}

// Module-level map — not reactive, not in store.
// Populated in background after PDF loads; read during search.
export const textCache = new Map<number, TextPageCache>()

export function clearTextCache(): void {
  textCache.clear()
}

// Search normalization: case-fold, strip combining accents, decompose
// ligatures (ﬁ → fi via NFKD), drop soft hyphens. Returns the normalized
// string plus a per-character map back to raw indices so a match found in
// normalized space can be highlighted at its exact raw position.
export function normalizeForSearch(raw: string): { norm: string; map: number[] } {
  let norm = ''
  const map: number[] = []
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (ch === '\u00AD') continue // soft hyphen — invisible in rendering
    const expanded = ch.normalize('NFKD').replace(/[\u0300-\u036F]/g, '').toLowerCase()
    for (const c of expanded) {
      norm += c
      map.push(i)
    }
  }
  return { norm, map }
}

function finalizeCache(text: string, itemOffsets: number[], itemLengths: number[]): TextPageCache {
  const { norm, map } = normalizeForSearch(text)
  return { text, norm, normToRaw: map, itemOffsets, itemLengths }
}

export async function loadPageText(
  pdfDoc: PDFDocumentProxy,
  pageNum: number
): Promise<void> {
  if (textCache.has(pageNum)) return
  const page = await pdfDoc.getPage(pageNum)
  const tc = await page.getTextContent()
  const items = tc.items.filter(
    (item): item is { str: string; hasEOL?: boolean } & typeof item => 'str' in item
  )
  let text = ''
  const itemOffsets: number[] = []
  const itemLengths: number[] = []
  for (const item of items) {
    // Only non-empty items get offsets: pdf.js renders a text-layer span per
    // item with text and nothing for empty ones, so this keeps offset index i
    // aligned with span index i for highlighting.
    if (item.str) {
      itemOffsets.push(text.length)
      itemLengths.push(item.str.length)
      text += item.str
    }
    // Keep line structure: without a separator the last word of one line and
    // the first word of the next glue together, producing phantom matches and
    // hiding real ones across line breaks.
    if (item.hasEOL) text += '\n'
  }
  textCache.set(pageNum, finalizeCache(text, itemOffsets, itemLengths))
}

export async function loadAllPageText(
  pdfDoc: PDFDocumentProxy,
  isCancelled?: () => boolean
): Promise<void> {
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    if (isCancelled?.()) return
    await loadPageText(pdfDoc, i)
  }
}

// Inject OCR word data into the cache so the search system finds text on scanned pages.
// Each word becomes one "item" in the cache; items are separated by a space.
export function setOcrTextInCache(pageNum: number, words: OcrWord[]): void {
  if (words.length === 0) return
  let text = ''
  const itemOffsets: number[] = []
  const itemLengths: number[] = []
  for (const word of words) {
    itemOffsets.push(text.length)
    itemLengths.push(word.text.length)
    text += word.text + ' '
  }
  textCache.set(pageNum, finalizeCache(text, itemOffsets, itemLengths))
}
