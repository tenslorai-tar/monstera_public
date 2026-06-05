import { useState, useRef } from 'react'
import { usePdfStore } from '../store/usePdfStore'

export default function BookmarksPanel() {
  const bookmarks       = usePdfStore(s => s.bookmarks)
  const currentPage     = usePdfStore(s => s.currentPage)
  const numPages        = usePdfStore(s => s.numPages)
  const scrollToPage    = usePdfStore(s => s.scrollToPage)
  const addBookmark     = usePdfStore(s => s.addBookmark)
  const deleteBookmark  = usePdfStore(s => s.deleteBookmark)
  const renameBookmark  = usePdfStore(s => s.renameBookmark)
  const setBookmarks    = usePdfStore(s => s.setBookmarks)

  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [editTitle,   setEditTitle]   = useState('')
  const [addingTitle, setAddingTitle] = useState('')
  const [showAdd,     setShowAdd]     = useState(false)
  const dragRef = useRef<string | null>(null)

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
        <span>Bookmarks</span>
        <button
          className="annot-tool-btn"
          style={{ fontSize: 16, lineHeight: 1, padding: '2px 6px' }}
          title={`Add bookmark for page ${currentPage}`}
          onClick={() => setShowAdd(v => !v)}
        >+</button>
      </div>

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
