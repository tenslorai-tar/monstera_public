// Substring-accurate search highlighting via the CSS Custom Highlight API.
// Each visible page registers DOM Ranges covering exactly the matched
// characters (not whole text-layer spans); the styling lives in CSS under
// ::highlight(monstera-search) / ::highlight(monstera-search-active).

const NAME = 'monstera-search'
const NAME_ACTIVE = 'monstera-search-active'

const pageRanges = new Map<number | string, Range[]>()
const pageActiveRanges = new Map<number | string, Range[]>()

export const highlightApiAvailable =
  typeof Highlight !== 'undefined' && typeof CSS !== 'undefined' && 'highlights' in CSS

function rebuild(): void {
  if (!highlightApiAvailable) return
  const all = new Highlight()
  for (const ranges of pageRanges.values()) for (const r of ranges) all.add(r)
  const active = new Highlight()
  for (const ranges of pageActiveRanges.values()) for (const r of ranges) active.add(r)
  CSS.highlights.set(NAME, all)
  CSS.highlights.set(NAME_ACTIVE, active)
}

export function setPageSearchRanges(pageNum: number | string, ranges: Range[], active: Range[]): void {
  if (ranges.length === 0) pageRanges.delete(pageNum)
  else pageRanges.set(pageNum, ranges)
  if (active.length === 0) pageActiveRanges.delete(pageNum)
  else pageActiveRanges.set(pageNum, active)
  rebuild()
}

export function clearPageSearchRanges(pageNum: number | string): void {
  pageRanges.delete(pageNum)
  pageActiveRanges.delete(pageNum)
  rebuild()
}

export function clearAllSearchRanges(): void {
  pageRanges.clear()
  pageActiveRanges.clear()
  rebuild()
}

// Build exact Ranges for the given matches over a list of per-item elements.
// itemOffsets/itemLengths come from the text cache and use raw-text offsets;
// element i must contain item i's text as its first text node.
export function buildMatchRanges(
  elements: ArrayLike<HTMLElement>,
  itemOffsets: number[],
  itemLengths: number[],
  matches: Array<{ matchStart: number; matchLen: number }>,
  activeMatch: { matchStart: number; matchLen: number } | null
): { ranges: Range[]; active: Range[] } {
  const ranges: Range[] = []
  const active: Range[] = []
  for (const match of matches) {
    const isActive = match === activeMatch
    const matchEnd = match.matchStart + match.matchLen
    for (let i = 0; i < itemOffsets.length && i < elements.length; i++) {
      const iStart = itemOffsets[i]
      const iEnd = iStart + itemLengths[i]
      if (iStart >= matchEnd || iEnd <= match.matchStart) continue
      const node = elements[i]?.firstChild
      if (!node || node.nodeType !== Node.TEXT_NODE) continue
      const textLen = (node as Text).length
      const from = Math.min(Math.max(0, match.matchStart - iStart), textLen)
      const to = Math.min(Math.max(from, matchEnd - iStart), textLen)
      if (to <= from) continue
      const r = new Range()
      r.setStart(node, from)
      r.setEnd(node, to)
      ;(isActive ? active : ranges).push(r)
    }
  }
  return { ranges, active }
}
