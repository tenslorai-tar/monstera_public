import { useEffect, useRef } from 'react'
import { usePdfStore } from '../store/usePdfStore'

export default function SearchPanel() {
  const searchOpen = usePdfStore(s => s.searchOpen)
  const searchQuery = usePdfStore(s => s.searchQuery)
  const searchMatches = usePdfStore(s => s.searchMatches)
  const activeMatchIndex = usePdfStore(s => s.activeMatchIndex)
  const runSearch = usePdfStore(s => s.runSearch)
  const nextMatch = usePdfStore(s => s.nextMatch)
  const prevMatch = usePdfStore(s => s.prevMatch)
  const setSearchOpen = usePdfStore(s => s.setSearchOpen)

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [searchOpen])

  if (!searchOpen) return null

  const matchLabel = searchMatches.length === 0
    ? (searchQuery ? 'No results' : '')
    : `${activeMatchIndex + 1} / ${searchMatches.length}`

  return (
    <div className="search-panel">
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
      <button
        className="search-nav-btn"
        onClick={prevMatch}
        disabled={searchMatches.length === 0}
        title="Previous match (Shift+Enter)"
      >▲</button>
      <button
        className="search-nav-btn"
        onClick={nextMatch}
        disabled={searchMatches.length === 0}
        title="Next match (Enter)"
      >▼</button>
      <button
        className="search-close-btn"
        onClick={() => setSearchOpen(false)}
        title="Close (Escape)"
      >✕</button>
    </div>
  )
}
