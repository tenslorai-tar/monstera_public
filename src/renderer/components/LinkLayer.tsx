import { usePdfStore } from '../store/usePdfStore'
import { pdfToCanvas } from '../utils/annotationUtils'
import type { LinkAnn } from '../types/annotations'

interface Props {
  pageNum: number
  scale: number
  pageH: number
}

// Clickable, navigable hyperlinks rendered above the text layer. The container
// is pointer-events:none so ordinary text selection still works everywhere; only
// the individual link rectangles capture the pointer. Internal (GoTo) links
// scroll within the document and record navigation history so the Back button
// returns the reader to where they came from (e.g. a table of contents).
export default function LinkLayer({ pageNum, scale, pageH }: Props) {
  const annotations = usePdfStore(s => s.annotations)
  const activeTool = usePdfStore(s => s.activeTool)
  const jumpToPage = usePdfStore(s => s.jumpToPage)

  // Only intercept clicks for navigation in plain reading mode. When an editing
  // tool (link, select, eraser, draw…) is active, pass through so the annotation
  // overlay handles selecting / erasing / drawing links instead.
  const navMode = activeTool === null
  if (!navMode) return null

  const links = annotations.filter(a => a.pageNum === pageNum && a.type === 'link') as LinkAnn[]
  if (links.length === 0) return null

  const open = (l: LinkAnn) => {
    if (l.href) {
      if (/^(https?|mailto|ftp):/i.test(l.href)) window.electronAPI.binsOpenUrl(l.href).catch(() => {})
    } else if (l.destPage != null) {
      jumpToPage(l.destPage)
    }
  }

  return (
    // z-index must sit above the annotation overlay (z 10) and OCR layer (z 2),
    // otherwise those layers swallow the click before it reaches a link. The
    // container itself is pointer-events:none, so only the link rectangles below
    // capture clicks — ordinary text selection everywhere else is unaffected.
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 20 }}>
      {links.map(l => {
        const x1 = Math.min(l.x1, l.x2), x2 = Math.max(l.x1, l.x2)
        const y1 = Math.min(l.y1, l.y2), y2 = Math.max(l.y1, l.y2)
        const [left, top] = pdfToCanvas(x1, y2, scale, pageH) // top-left corner
        const w = (x2 - x1) * scale, h = (y2 - y1) * scale
        if (w < 1 || h < 1) return null
        const title = l.href ?? (l.destPage != null ? `Go to page ${l.destPage}` : undefined)
        return (
          <div
            key={l.id}
            className="pdf-link-hit"
            title={title}
            onClick={() => open(l)}
            style={{ position: 'absolute', left, top, width: w, height: h,
              pointerEvents: 'auto', cursor: 'pointer' }}
          />
        )
      })}
    </div>
  )
}
