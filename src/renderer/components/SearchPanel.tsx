import { useEffect, useRef, useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'

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
            placeholder="Replace in annotations…"
            value={replaceText}
            onChange={e => { setReplaceText(e.target.value); setReplaceMsg('') }}
            onKeyDown={e => { if (e.key === 'Escape') setShowReplace(false) }}
          />
          <button className="search-nav-btn" onClick={() => replaceInAnnotations(false)}
            disabled={!searchQuery || !replaceText} title="Replace current">1</button>
          <button className="search-nav-btn" onClick={() => replaceInAnnotations(true)}
            disabled={!searchQuery || !replaceText} title="Replace all">All</button>
          {replaceMsg && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {replaceMsg}
            </span>
          )}
        </div>
      )}

      {showReplace && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingLeft: 22 }}>
          Replace works on text annotations only — not on original PDF content.
        </div>
      )}
    </div>
  )
}
