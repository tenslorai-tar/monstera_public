import { useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'
import { useSettingsStore } from '../store/useSettingsStore'
import type { ZoomMode } from '../store/usePdfStore'

interface Props {
  onOpen: () => void
  onMerge: () => void
  onSplit: () => void
  onMetadata: () => void
  onSecurity: () => void
  onOcr: () => void
  onDigitalSign: () => void
  onSettings: () => void
  onShortcuts: () => void
  onPrint: () => void
}

const ZOOM_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0]

export default function Toolbar({
  onOpen, onMerge, onSplit, onMetadata, onSecurity,
  onOcr, onDigitalSign, onSettings, onShortcuts, onPrint,
}: Props) {
  const fileName         = usePdfStore(s => s.fileName)
  const numPages         = usePdfStore(s => s.numPages)
  const currentPage      = usePdfStore(s => s.currentPage)
  const scale            = usePdfStore(s => s.scale)
  const zoomMode         = usePdfStore(s => s.zoomMode)
  const sidebarOpen      = usePdfStore(s => s.sidebarOpen)
  const bookmarksPanelOpen = usePdfStore(s => s.bookmarksPanelOpen)
  const searchOpen       = usePdfStore(s => s.searchOpen)
  const isDirty          = usePdfStore(s => s.isDirty)
  const undoStack        = usePdfStore(s => s.undoStack)
  const redoStack        = usePdfStore(s => s.redoStack)
  const encryptionSettings = usePdfStore(s => s.encryptionSettings)

  const setScale         = usePdfStore(s => s.setScale)
  const setZoomMode      = usePdfStore(s => s.setZoomMode)
  const toggleSidebar    = usePdfStore(s => s.toggleSidebar)
  const toggleBookmarksPanel = usePdfStore(s => s.toggleBookmarksPanel)
  const setSearchOpen    = usePdfStore(s => s.setSearchOpen)
  const scrollToPage     = usePdfStore(s => s.scrollToPage)
  const save             = usePdfStore(s => s.save)
  const saveAs           = usePdfStore(s => s.saveAs)
  const undo             = usePdfStore(s => s.undo)
  const redo             = usePdfStore(s => s.redo)

  const { settings, updateSettings } = useSettingsStore()
  const theme = settings.theme

  const [pageInput,    setPageInput]    = useState('')
  const [editingPage,  setEditingPage]  = useState(false)
  const [zoomInput,    setZoomInput]    = useState('')
  const [editingZoom,  setEditingZoom]  = useState(false)

  const zoomPct  = Math.round(scale * 100)
  const hasPdf   = numPages > 0

  const commitPage = () => {
    const n = parseInt(pageInput, 10)
    if (!isNaN(n) && n >= 1 && n <= numPages) scrollToPage(n)
    setEditingPage(false)
  }

  const commitZoom = () => {
    const pct = parseFloat(zoomInput)
    if (!isNaN(pct) && pct > 0) setScale(Math.min(500, Math.max(10, pct)) / 100)
    setEditingZoom(false)
  }

  const zoomIn  = () => setScale(Math.min(5,    Math.round((scale + 0.1) * 10) / 10))
  const zoomOut = () => setScale(Math.max(0.25, Math.round((scale - 0.1) * 10) / 10))

  const handleZoomSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as ZoomMode | string
    if (val === 'fit-width' || val === 'fit-page') setZoomMode(val)
    else setScale(parseFloat(val))
  }

  const zoomSelectValue = zoomMode === 'fit-width' ? 'fit-width'
    : zoomMode === 'fit-page' ? 'fit-page'
    : ZOOM_PRESETS.includes(scale) ? String(scale) : 'custom'

  return (
    <header className="toolbar">
      {/* ── Left ───────────────────────────────────────────────────── */}
      <div className="toolbar-section toolbar-left">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>🌿</span>
          <span className="app-name">Monstera</span>
        </div>
        <div className="toolbar-sep" />

        <div className="toolbar-group">
          <button className="toolbar-btn" onClick={onOpen} title="Open PDF (Ctrl+O)">
            📂 Open
          </button>
          {hasPdf && (
            <>
              <button className="toolbar-btn" onClick={() => save()} disabled={!isDirty}
                title="Save (Ctrl+S)" style={{ opacity: isDirty ? 1 : 0.45 }}>
                💾 Save
              </button>
              <button className="toolbar-btn" onClick={saveAs} title="Save As… (Ctrl+Shift+S)">
                Save As…
              </button>
            </>
          )}
        </div>

        {hasPdf && (
          <>
            <div className="toolbar-sep" />
            <div className="toolbar-group">
              <button className="toolbar-btn" onClick={() => undo()} disabled={undoStack.length === 0}
                title="Undo (Ctrl+Z)">↩ Undo</button>
              <button className="toolbar-btn" onClick={() => redo()} disabled={redoStack.length === 0}
                title="Redo (Ctrl+Y)">↪ Redo</button>
            </div>

            <div className="toolbar-sep" />
            <div className="toolbar-group">
              <button className="toolbar-btn" onClick={onMerge} title="Merge other PDFs into this document">⊕ Merge</button>
              <button className="toolbar-btn" onClick={onSplit} title="Split document by page ranges">✂ Split</button>
            </div>

            <div className="toolbar-sep" />
            <div className="toolbar-group">
              <button className="toolbar-btn" onClick={onMetadata} title="View / edit document metadata">ℹ Info</button>
              <button
                className={`toolbar-btn${encryptionSettings ? ' toolbar-btn-active' : ''}`}
                onClick={onSecurity} title="Password-protect PDF and set permissions">
                🔒 Security
              </button>
              <button className="toolbar-btn" onClick={onOcr} title="Run OCR on scanned pages">🔍 OCR</button>
              <button className="toolbar-btn" onClick={onDigitalSign} title="Digitally sign or verify signatures">🔏 Sign</button>
              <button className="toolbar-btn" onClick={onPrint} title="Print (Ctrl+P)">🖨 Print</button>
            </div>

            <div className="toolbar-sep" />
            <div className="toolbar-group">
              <button
                className={`toolbar-btn${bookmarksPanelOpen ? ' toolbar-btn-active' : ''}`}
                onClick={toggleBookmarksPanel} title="Bookmarks panel">
                🔖 Bookmarks
              </button>
              <button
                className={`toolbar-btn${sidebarOpen ? ' toolbar-btn-active' : ''}`}
                onClick={toggleSidebar} title="Toggle thumbnail sidebar">
                ▤ Pages
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Center: filename ────────────────────────────────────────── */}
      {hasPdf && (
        <div className="toolbar-section toolbar-center">
          <span className="toolbar-filename" title={fileName}>
            {isDirty ? <span style={{ color: 'var(--accent)', marginRight: 4 }}>●</span> : null}
            {fileName}
          </span>
        </div>
      )}

      {/* ── Right: page nav + zoom + search + settings ──────────────── */}
      <div className="toolbar-section toolbar-right">
        {hasPdf && (
          <>
            <div className="toolbar-group">
              {editingPage ? (
                <input className="page-input" type="number" min={1} max={numPages} autoFocus
                  value={pageInput} onChange={e => setPageInput(e.target.value)}
                  onBlur={commitPage}
                  onKeyDown={e => { if (e.key === 'Enter') commitPage(); if (e.key === 'Escape') setEditingPage(false) }} />
              ) : (
                <span className="page-display"
                  onClick={() => { setEditingPage(true); setPageInput(String(currentPage)) }}
                  title="Click to jump to page">
                  {currentPage}
                </span>
              )}
              <span className="page-total">/ {numPages}</span>
            </div>

            <div className="toolbar-sep" />

            <div className="toolbar-group">
              <button className="toolbar-btn" onClick={zoomOut} title="Zoom out (Ctrl+−)">−</button>
              {editingZoom ? (
                <input className="zoom-input" type="number" min={10} max={500} autoFocus
                  value={zoomInput} onChange={e => setZoomInput(e.target.value)}
                  onBlur={commitZoom}
                  onKeyDown={e => { if (e.key === 'Enter') commitZoom(); if (e.key === 'Escape') setEditingZoom(false) }} />
              ) : (
                <select className="zoom-select" value={zoomSelectValue} onChange={handleZoomSelect}
                  onDoubleClick={() => { setEditingZoom(true); setZoomInput(String(zoomPct)) }}>
                  {zoomSelectValue === 'custom' && <option value="custom" disabled>{zoomPct}%</option>}
                  <option value="fit-page">Fit Page</option>
                  <option value="fit-width">Fit Width</option>
                  <option value="0.5">50%</option>
                  <option value="0.75">75%</option>
                  <option value="1">100%</option>
                  <option value="1.25">125%</option>
                  <option value="1.5">150%</option>
                  <option value="2">200%</option>
                  <option value="3">300%</option>
                </select>
              )}
              <button className="toolbar-btn" onClick={zoomIn} title="Zoom in (Ctrl++)">+</button>
            </div>

            <div className="toolbar-sep" />

            <button
              className={`toolbar-btn${searchOpen ? ' toolbar-btn-active' : ''}`}
              onClick={() => setSearchOpen(!searchOpen)}
              title="Find in document (Ctrl+F)">
              🔍
            </button>
          </>
        )}

        <div className="toolbar-sep" />

        {/* Theme toggle */}
        <button className="toolbar-btn" title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          onClick={() => updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' })}>
          {theme === 'dark' ? '☀' : '🌙'}
        </button>

        <button className="toolbar-btn" onClick={onSettings} title="Settings (Ctrl+,)">⚙</button>
        <button className="toolbar-btn" onClick={onShortcuts} title="Keyboard shortcuts (F1)">?</button>
      </div>
    </header>
  )
}
