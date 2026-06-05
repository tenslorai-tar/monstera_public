import { useEffect, useRef } from 'react'
import { usePdfStore } from '../store/usePdfStore'
import type { SearchMatch } from '../store/usePdfStore'
import { textCache } from '../utils/textCache'

interface Props {
  pageNum: number
  pageW: number
  pageH: number
  scale: number
}

function applyOcrHighlights(
  container: HTMLDivElement,
  pageMatches: SearchMatch[],
  activeMatch: SearchMatch | null
) {
  const spans = container.querySelectorAll<HTMLSpanElement>('span[data-offset]')
  spans.forEach(s => s.classList.remove('search-match', 'search-match-active'))
  if (pageMatches.length === 0) return

  const cache = textCache.get(pageMatches[0]?.pageNum ?? -1)
  if (!cache) return
  const { itemOffsets, itemLengths } = cache

  for (const match of pageMatches) {
    const isActive = match === activeMatch
    const matchEnd = match.matchStart + match.matchLen
    for (let i = 0; i < itemOffsets.length; i++) {
      const iStart = itemOffsets[i]
      const iEnd = iStart + itemLengths[i]
      if (iStart < matchEnd && iEnd > match.matchStart && i < spans.length) {
        spans[i].classList.add(isActive ? 'search-match-active' : 'search-match')
      }
    }
  }
}

export default function OcrTextLayer({ pageNum, pageW, pageH, scale }: Props) {
  const ocrData = usePdfStore(s => s.ocrData)
  const searchMatches = usePdfStore(s => s.searchMatches)
  const activeMatchIndex = usePdfStore(s => s.activeMatchIndex)
  const activeTool = usePdfStore(s => s.activeTool)
  const containerRef = useRef<HTMLDivElement>(null)

  const words = ocrData.get(pageNum)

  useEffect(() => {
    const el = containerRef.current
    if (!el || !words?.length) return
    const pageMatches = searchMatches.filter(m => m.pageNum === pageNum)
    const activeMatch = activeMatchIndex >= 0 ? searchMatches[activeMatchIndex] : null
    const activeOnPage = activeMatch?.pageNum === pageNum ? activeMatch : null
    applyOcrHighlights(el, pageMatches, activeOnPage)
  }, [searchMatches, activeMatchIndex, pageNum, words])

  if (!words?.length) return null

  // Disable pointer events when an annotation tool is active (let the overlay handle events)
  const pointerEvents = activeTool ? 'none' : 'auto'

  return (
    <div
      ref={containerRef}
      className="ocr-text-layer"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: pageW * scale,
        height: pageH * scale,
        overflow: 'hidden',
        pointerEvents,
        userSelect: 'text',
        cursor: 'text',
      }}
    >
      {words.map((word, i) => {
        // word.y is PDF pts from bottom; convert to CSS top (from page top)
        const left = word.x * scale
        const top = (pageH - word.y - word.h) * scale
        const width = word.w * scale
        const height = word.h * scale
        const fontSize = Math.max(4, height * 0.85)

        return (
          <span
            key={i}
            data-offset={i}
            style={{
              position: 'absolute',
              left,
              top,
              width,
              height,
              fontSize,
              lineHeight: `${height}px`,
              whiteSpace: 'nowrap',
              color: 'transparent',
              transformOrigin: 'top left',
            }}
          >
            {word.text}
          </span>
        )
      })}
    </div>
  )
}
