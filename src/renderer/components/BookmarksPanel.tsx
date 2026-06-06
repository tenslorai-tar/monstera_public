import { useState, useRef } from 'react'
import { usePdfStore } from '../store/usePdfStore'
import type { BookmarkItem } from '../types/bookmarks'

export default function BookmarksPanel() {
  const bookmarks       = usePdfStore(s => s.bookmarks)
  const currentPage     = usePdfStore(s => s.currentPage)
  const numPages        = usePdfStore(s => s.numPages)
  const scrollToPage    = usePdfStore(s => s.scrollToPage)
  const addBookmark     = usePdfStore(s => s.addBookmark)
  const deleteBookmark  = usePdfStore(s => s.deleteBookmark)
  const renameBookmark  = usePdfStore(s => s.renameBookmark)
  const setBookmarks    = usePdfStore(s => s.setBookmarks)
  const pdfBytes        = usePdfStore(s => s.pdfBytes)

  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [editTitle,    setEditTitle]    = useState('')
  const [addingTitle,  setAddingTitle]  = useState('')
  const [showAdd,      setShowAdd]      = useState(false)
  const [generating,   setGenerating]   = useState(false)
  const [showFindReplace, setShowFindReplace] = useState(false)
  const [findText,     setFindText]     = useState('')
  const [replaceText,  setReplaceText]  = useState('')
  const dragRef = useRef<string | null>(null)

  const handleSortByPage = () => {
    setBookmarks([...bookmarks].sort((a, b) => a.pageNum - b.pageNum))
  }

  const handleSortAlpha = () => {
    setBookmarks([...bookmarks].sort((a, b) => a.title.localeCompare(b.title)))
  }

  const handleEveryN = () => {
    const ans = window.prompt(`Create a bookmark every N pages (1–${numPages}):`, '5')
    const n = ans ? parseInt(ans, 10) : NaN
    if (isNaN(n) || n < 1 || n > numPages) return
    const generated: BookmarkItem[] = []
    for (let p = 1; p <= numPages; p += n) {
      generated.push({ id: Math.random().toString(36).slice(2), title: `Page ${p}`, pageNum: p })
    }
    setBookmarks([...bookmarks, ...generated])
  }

  const titleCase = (s: string) => s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
  const handleCase = (kind: 'upper' | 'lower' | 'title') => {
    setBookmarks(bookmarks.map(b => ({
      ...b,
      title: kind === 'upper' ? b.title.toUpperCase() : kind === 'lower' ? b.title.toLowerCase() : titleCase(b.title),
    })))
  }

  const handleValidate = () => {
    const valid = bookmarks.filter(b => b.pageNum >= 1 && b.pageNum <= numPages)
    const removed = bookmarks.length - valid.length
    if (removed > 0) setBookmarks(valid)
    window.alert(removed > 0 ? `Removed ${removed} bookmark(s) pointing outside the document.` : 'All bookmarks point to valid pages.')
  }

  const handleMergeDuplicates = () => {
    const seen = new Set<number>()
    const merged: BookmarkItem[] = []
    for (const bm of bookmarks) {
      if (!seen.has(bm.pageNum)) { seen.add(bm.pageNum); merged.push(bm) }
    }
    setBookmarks(merged)
  }

  const handleExportText = () => {
    const lines = bookmarks.map(b => `${b.pageNum}\t${b.title}`)
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'bookmarks.txt'; a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportHtml = () => {
    const items = bookmarks.map(b =>
      `  <li><a href="#page=${b.pageNum}">${b.title.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</a> <small>(p.${b.pageNum})</small></li>`
    ).join('\n')
    const html = `<!DOCTYPE html>\n<html>\n<head><meta charset="utf-8"><title>Bookmarks</title></head>\n<body>\n<ul>\n${items}\n</ul>\n</body>\n</html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'bookmarks.html'; a.click()
    URL.revokeObjectURL(url)
  }

  const handleFindReplace = () => {
    if (!findText) return
    const updated = bookmarks.map(b => ({
      ...b,
      title: b.title.split(findText).join(replaceText),
    }))
    setBookmarks(updated)
  }

  const handleGenerateFromHeadings = async () => {
    if (!pdfBytes) return
    setGenerating(true)
    try {
      const suggestions = await window.electronAPI.mupdfGenerateBookmarks(pdfBytes.buffer as ArrayBuffer)
      const newBms: BookmarkItem[] = suggestions.map(s => ({
        id: Math.random().toString(36).slice(2),
        title: s.title,
        pageNum: s.pageNum,
      }))
      setBookmarks([...bookmarks, ...newBms])
    } catch { /* ignore */ }
    setGenerating(false)
  }

  const startEdit = (id: string, title: string) => {
    setEditingId(id)
    setEditTitle(title)
  }

  const commitEdit = () => {
    if (editingId && editTitle.trim()) renameBookmark(editingId, editTitle.trim())
    setEditingId(null)
  }

  const commitAdd = () => {
    const t = addingTitle.trim() || `Page ${currentPage}`
    addBookmark(currentPage, t)
    setAddingTitle('')
    setShowAdd(false)
  }

  // Simple drag-to-reorder
  const handleDragStart = (id: string) => { dragRef.current = id }
  const handleDrop = (targetId: string) => {
    const fromId = dragRef.current
    if (!fromId || fromId === targetId) return
    const from = bookmarks.findIndex(b => b.id === fromId)
    const to   = bookmarks.findIndex(b => b.id === targetId)
    if (from === -1 || to === -1) return
    const next = [...bookmarks]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    setBookmarks(next)
    dragRef.current = null
  }

  return (
    <div className="side-panel" style={{ width: 240, borderRight: 'none', borderLeft: '1px solid var(--border)' }}>
      <div className="side-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Bookmarks ({bookmarks.length})</span>
        <button
          className="annot-tool-btn"
          style={{ fontSize: 16, lineHeight: 1, padding: '2px 6px' }}
          title={`Add bookmark for page ${currentPage}`}
          onClick={() => setShowAdd(v => !v)}
        >+</button>
      </div>

      {bookmarks.length > 0 && (
        <div style={{ padding: '3px 8px', borderBottom: '1px solid var(--border)',
          display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          <button className="annot-tool-btn" style={{ fontSize: 10, padding: '2px 5px' }}
            title="Sort by page number" onClick={handleSortByPage}>↕ Page</button>
          <button className="annot-tool-btn" style={{ fontSize: 10, padding: '2px 5px' }}
            title="Sort alphabetically" onClick={handleSortAlpha}>A–Z</button>
          <button className="annot-tool-btn" style={{ fontSize: 10, padding: '2px 5px' }}
            title="Remove duplicate page bookmarks" onClick={handleMergeDuplicates}>⊕ Merge</button>
          <button className="annot-tool-btn" style={{ fontSize: 10, padding: '2px 5px' }}
            title="Generate bookmarks from text headings" onClick={handleGenerateFromHeadings}
            disabled={generating}>{generating ? '…' : '✨ Headings'}</button>
          <button className="annot-tool-btn" style={{ fontSize: 10, padding: '2px 5px' }}
            title="Find and replace text in bookmark titles"
            onClick={() => setShowFindReplace(v => !v)}>↔ F&R</button>
          <button className="annot-tool-btn" style={{ fontSize: 10, padding: '2px 5px' }}
            title="Export bookmarks as plain text" onClick={handleExportText}>↗ .txt</button>
          <button className="annot-tool-btn" style={{ fontSize: 10, padding: '2px 5px' }}
            title="Export bookmarks as HTML" onClick={handleExportHtml}>↗ .html</button>
          <button className="annot-tool-btn" style={{ fontSize: 10, padding: '2px 5px' }}
            title="Create a bookmark every N pages" onClick={handleEveryN}>⊞ Every N</button>
          <button className="annot-tool-btn" style={{ fontSize: 10, padding: '2px 5px' }}
            title="Title-case all bookmark titles" onClick={() => handleCase('title')}>Aa Title</button>
          <button className="annot-tool-btn" style={{ fontSize: 10, padding: '2px 5px' }}
            title="UPPERCASE all titles" onClick={() => handleCase('upper')}>AA</button>
          <button className="annot-tool-btn" style={{ fontSize: 10, padding: '2px 5px' }}
            title="lowercase all titles" onClick={() => handleCase('lower')}>aa</button>
          <button className="annot-tool-btn" style={{ fontSize: 10, padding: '2px 5px' }}
            title="Remove bookmarks pointing outside the document" onClick={handleValidate}>✓ Validate</button>
        </div>
      )}

      {showFindReplace && (
        <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: 4 }}>
          <input className="modal-input" style={{ fontSize: 11, padding: '3px 6px' }}
            placeholder="Find in titles…" value={findText}
            onChange={e => setFindText(e.target.value)} autoFocus />
          <input className="modal-input" style={{ fontSize: 11, padding: '3px 6px' }}
            placeholder="Replace with…" value={replaceText}
            onChange={e => setReplaceText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleFindReplace()} />
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
            <button className="modal-btn-secondary" style={{ fontSize: 10, padding: '2px 8px' }}
              onClick={() => setShowFindReplace(false)}>Cancel</button>
            <button className="modal-btn-primary" style={{ fontSize: 10, padding: '2px 8px' }}
              disabled={!findText} onClick={handleFindReplace}>Replace All</button>
          </div>
        </div>
      )}

      {bookmarks.length === 0 && (
        <div style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>
          <button className="annot-tool-btn" style={{ fontSize: 10, padding: '2px 5px', width: '100%' }}
            title="Auto-generate bookmarks from text headings" onClick={handleGenerateFromHeadings}
            disabled={generating}>{generating ? 'Generating…' : '✨ Generate from Headings'}</button>
        </div>
      )}

      {showAdd && (
        <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 4 }}>
          <input
            className="modal-input"
            style={{ flex: 1, fontSize: 12, padding: '3px 6px' }}
            autoFocus
            placeholder={`Page ${currentPage}`}
            value={addingTitle}
            onChange={e => setAddingTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitAdd(); if (e.key === 'Escape') setShowAdd(false) }}
          />
          <button className="modal-btn-primary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={commitAdd}>Add</button>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {bookmarks.length === 0 ? (
          <div style={{ padding: '16px 12px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
            No bookmarks yet.<br />Click + to add one for the current page.
          </div>
        ) : (
          bookmarks.map(bm => (
            <div
              key={bm.id}
              className={`bookmark-item${bm.pageNum === currentPage ? ' bookmark-active' : ''}`}
              draggable
              onDragStart={() => handleDragStart(bm.id)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => handleDrop(bm.id)}
            >
              {editingId === bm.id ? (
                <input
                  className="bookmark-edit-input"
                  autoFocus
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null) }}
                />
              ) : (
                <>
                  <span
                    className="bookmark-title"
                    onClick={() => { if (bm.pageNum >= 1 && bm.pageNum <= numPages) scrollToPage(bm.pageNum) }}
                    onDoubleClick={() => startEdit(bm.id, bm.title)}
                    title={`Page ${bm.pageNum} — double-click to rename`}
                  >
                    {bm.title}
                  </span>
                  <span className="bookmark-page">{bm.pageNum}</span>
                  <button
                    className="bookmark-delete"
                    title="Delete bookmark"
                    onClick={() => deleteBookmark(bm.id)}
                  >×</button>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
