import { useEffect, useRef, useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'
import { textCache } from '../utils/textCache'
import type { TextEditAnn } from '../types/annotations'
import { newId } from '../utils/annotationUtils'

export default function SearchPanel() {
  const searchOpen      = usePdfStore(s => s.searchOpen)
  const searchQuery     = usePdfStore(s => s.searchQuery)
  const searchMatches   = usePdfStore(s => s.searchMatches)
  const activeMatchIndex = usePdfStore(s => s.activeMatchIndex)
  const runSearch       = usePdfStore(s => s.runSearch)
  const nextMatch       = usePdfStore(s => s.nextMatch)
  const prevMatch       = usePdfStore(s => s.prevMatch)
  const setSearchOpen   = usePdfStore(s => s.setSearchOpen)
  const annotations     = usePdfStore(s => s.annotations)
  const updateAnnotation = usePdfStore(s => s.updateAnnotation)

  const addAnnotation  = usePdfStore(s => s.addAnnotation)

  const inputRef = useRef<HTMLInputElement>(null)
  const [showReplace, setShowReplace] = useState(false)
  const [replaceText, setReplaceText] = useState('')
  const [replaceMsg, setReplaceMsg] = useState('')

  useEffect(() => {
    if (searchOpen) setTimeout(() => inputRef.current?.focus(), 50)
    else { setShowReplace(false); setReplaceMsg('') }
  }, [searchOpen])

  if (!searchOpen) return null

  const matchLabel = searchMatches.length === 0
    ? (searchQuery ? 'No results' : '')
    : `${activeMatchIndex + 1} / ${searchMatches.length}`

  // Replace in native PDF text via text-edit overlays (cover + replacement text on top)
  const replaceOnPage = async () => {
    if (!searchQuery || !replaceText) return
    const pdfDoc = usePdfStore.getState().pdfDoc
    if (!pdfDoc) return
    // Find all matches
    const targets = searchMatches.length > 0 ? searchMatches : []
    if (targets.length === 0) { setReplaceMsg('No matches found.'); return }
    let count = 0
    const lower = searchQuery.toLowerCase()
    const pagesToProcess = [...new Set(targets.map(m => m.pageNum))]
    for (const pageNum of pagesToProcess) {
      try {
        const page = await pdfDoc.getPage(pageNum)
        const tc = await page.getTextContent()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items: any[] = tc.items.filter((it: any) => 'str' in it)
        const cache = textCache.get(pageNum)
        if (!cache) continue
        const pageMatches = targets.filter(m => m.pageNum === pageNum)
        for (const match of pageMatches) {
          // Find which items are covered by this match
          let covered: typeof items = []
          for (let i = 0; i < items.length; i++) {
            const itemStart = cache.itemOffsets[i]
            const itemEnd = itemStart + (cache.itemLengths[i] ?? 0)
            if (itemEnd > match.matchStart && itemStart < match.matchStart + match.matchLen) {
              covered.push(items[i])
            }
          }
          if (covered.length === 0) continue
          // Compute bounding box from transform + width/height of covered items
          // PDF.js transform: [scaleX, skewY, skewX, scaleY, tx, ty]
          const xs: number[] = [], ys: number[] = []
          for (const item of covered) {
            const [, , , h, x, y] = item.transform as number[]
            const w = item.width as number
            xs.push(x, x + w)
            ys.push(y, y + Math.abs(h))
          }
          const x1 = Math.min(...xs), y1 = Math.min(...ys)
          const x2 = Math.max(...xs), y2 = Math.max(...ys)
          const ann: TextEditAnn = {
            id: newId(), type: 'text-edit', pageNum,
            color: '#000000', opacity: 1, createdAt: Date.now(),
            x: x1, y: y1,
            width: Math.max(x2 - x1, 40),
            height: Math.max(y2 - y1, 12),
            text: replaceText.replace(
              new RegExp(lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
              replaceText
            ),
            fontSize: Math.max(8, Math.abs((covered[0]?.transform as number[])?.[3] ?? 12)),
          }
          addAnnotation(ann)
          count++
        }
      } catch { /* skip page */ }
    }
    setReplaceMsg(count > 0 ? `Created ${count} replacement overlay${count !== 1 ? 's' : ''}.` : 'No matches placed.')
  }

  // Replace in text annotations (textbox, typewriter, text-edit, stickynote)
  // Note: replacing text in the original PDF content stream requires MuPDF native
  // text editing which is not available in WASM. This replaces text in annotations only.
  const replaceInAnnotations = (all: boolean) => {
    if (!searchQuery || !replaceText) return
    const q = searchQuery.toLowerCase()
    let count = 0
    const hasText = (a: unknown): a is { id: string; text: string } =>
      typeof (a as Record<string, unknown>).text === 'string'

    const targets = all ? annotations : [annotations.find(a => hasText(a) && a.text.toLowerCase().includes(q))].filter(Boolean)

    for (const ann of targets) {
      if (!ann || !hasText(ann)) continue
      if (ann.text.toLowerCase().includes(q)) {
        const newText = ann.text.replace(new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), replaceText)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        updateAnnotation(ann.id, { text: newText } as any)
        count++
      }
    }
    setReplaceMsg(count > 0 ? `Replaced ${count} annotation${count !== 1 ? 's' : ''}.` : 'No annotation text matched.')
  }

  return (
    <div className="search-panel" style={{ flexDirection: 'column', height: 'auto', padding: '8px 10px', gap: 6 }}>
      {/* Find row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          onClick={() => setShowReplace(r => !r)}
          title="Toggle find & replace"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: 11, padding: '2px 4px',
            transform: showReplace ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s',
          }}>▶</button>
        <input
          ref={inputRef}
          className="search-input"
          type="text"
          placeholder="Find in document…"
          value={searchQuery}
          onChange={e => runSearch(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') e.shiftKey ? prevMatch() : nextMatch()
            if (e.key === 'Escape') setSearchOpen(false)
          }}
        />
        <span className="search-count">{matchLabel}</span>
        <button className="search-nav-btn" onClick={prevMatch} disabled={searchMatches.length === 0} title="Previous (Shift+Enter)">▲</button>
        <button className="search-nav-btn" onClick={nextMatch} disabled={searchMatches.length === 0} title="Next (Enter)">▼</button>
        <button className="search-close-btn" onClick={() => setSearchOpen(false)} title="Close (Escape)">✕</button>
      </div>

      {/* Replace row */}
      {showReplace && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 22 }}>
          <input
            className="search-input"
            type="text"
            placeholder="Replace with…"
            value={replaceText}
            onChange={e => { setReplaceText(e.target.value); setReplaceMsg('') }}
            onKeyDown={e => { if (e.key === 'Escape') setShowReplace(false) }}
          />
          <button className="search-nav-btn" onClick={() => replaceInAnnotations(false)}
            disabled={!searchQuery || !replaceText} title="Replace in annotation text (current match)">Ann</button>
          <button className="search-nav-btn" onClick={() => replaceInAnnotations(true)}
            disabled={!searchQuery || !replaceText} title="Replace all annotation text">All</button>
          <button className="search-nav-btn" onClick={replaceOnPage}
            disabled={!searchQuery || !replaceText || searchMatches.length === 0}
            title="Replace in native PDF text using overlay (places white cover + new text on top)">PDF</button>
          {replaceMsg && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {replaceMsg}
            </span>
          )}
        </div>
      )}

      {showReplace && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingLeft: 22 }}>
          Ann: replace in text annotations. PDF: overlay-based replacement (white cover + text on PDF content).
        </div>
      )}
    </div>
  )
}
