import { useState } from 'react'
import { Lock, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Undo2, Redo2 } from 'lucide-react'
import { usePdfStore } from '../store/usePdfStore'
import { useSettingsStore } from '../store/useSettingsStore'
import type { ZoomMode } from '../store/usePdfStore'

const ZOOM_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0]

export default function StatusBar() {
  const numPages          = usePdfStore(s => s.numPages)
  const currentPage       = usePdfStore(s => s.currentPage)
  const scale             = usePdfStore(s => s.scale)
  const zoomMode          = usePdfStore(s => s.zoomMode)
  const isDirty           = usePdfStore(s => s.isDirty)
  const fileName          = usePdfStore(s => s.fileName)
  const encryptionSettings = usePdfStore(s => s.encryptionSettings)
  const activeTool        = usePdfStore(s => s.activeTool)
  const formMode          = usePdfStore(s => s.formMode)
  const annotations       = usePdfStore(s => s.annotations)
  const selectedPages     = usePdfStore(s => s.selectedPages)
  const setScale          = usePdfStore(s => s.setScale)
  const setZoomMode       = usePdfStore(s => s.setZoomMode)
  const jumpToPage        = usePdfStore(s => s.jumpToPage)
  const goBack            = usePdfStore(s => s.goBack)
  const goForward         = usePdfStore(s => s.goForward)
  const navBack           = usePdfStore(s => s.navBack)
  const navForward        = usePdfStore(s => s.navForward)

  const [pageInput,   setPageInput]   = useState('')
  const [editingPage, setEditingPage] = useState(false)

  const hasPdf = numPages > 0
  const zoomPct = Math.round(scale * 100)

  const modeLabel = formMode ? 'Forms Mode'
    : activeTool
      ? activeTool.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) + ' Tool'
      : hasPdf ? 'Ready' : ''

  const annCount = annotations.length

  const zoomStep = useSettingsStore(s => s.settings.zoomStep) || 0.25
  const zoomIn  = () => setScale(Math.min(5,   Math.round((scale + zoomStep) * 100) / 100))
  const zoomOut = () => setScale(Math.max(0.1, Math.round((scale - zoomStep) * 100) / 100))

  const handleZoomSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value as ZoomMode | string
    if (v === 'fit-width' || v === 'fit-page') setZoomMode(v)
    else setScale(parseFloat(v))
  }
  const zoomVal = zoomMode === 'fit-width' ? 'fit-width'
    : zoomMode === 'fit-page' ? 'fit-page'
    : ZOOM_PRESETS.includes(scale) ? String(scale) : 'custom'

  const commitPage = () => {
    const n = parseInt(pageInput, 10)
    if (!isNaN(n) && n >= 1 && n <= numPages) jumpToPage(n)
    setEditingPage(false)
  }

  const atFirst = currentPage <= 1
  const atLast  = currentPage >= numPages

  return (
    <div className="status-bar">
      <div className="status-left">
        {hasPdf && (
          <>
            <span className="status-item">
              Page <strong>{currentPage}</strong> of <strong>{numPages}</strong>
            </span>
            {selectedPages.size > 0 && (
              <span className="status-badge status-sel">{selectedPages.size} page{selectedPages.size !== 1 ? 's' : ''} selected</span>
            )}
            {annCount > 0 && (
              <span className="status-item status-dim">{annCount} annotation{annCount !== 1 ? 's' : ''}</span>
            )}
          </>
        )}
      </div>

      <div className="status-center">
        {hasPdf && (
          <span className="status-item status-dim" title={fileName}>{fileName}</span>
        )}
      </div>

      <div className="status-right">
        {hasPdf && modeLabel && (
          <span className={`status-badge${formMode ? ' status-forms' : activeTool ? ' status-tool' : ' status-ready'}`}>
            {modeLabel}
          </span>
        )}
        {hasPdf && encryptionSettings && (
          <span className="status-badge status-lock" title="This document is encrypted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Lock size={11} /> Encrypted</span>
        )}
        {hasPdf && isDirty && (
          <span className="status-badge status-dirty" title="You have unsaved changes">● Unsaved</span>
        )}

        {hasPdf && (
          <div className="status-zoom">
            <div className="status-nav-group">
              <button className="status-zoom-btn" onClick={() => jumpToPage(1)} disabled={atFirst}
                title="First page"><ChevronFirst size={14} /></button>
              <button className="status-zoom-btn" onClick={() => jumpToPage(currentPage - 1)} disabled={atFirst}
                title="Previous page"><ChevronLeft size={14} /></button>
            </div>
            {editingPage ? (
              <input className="status-page-input" type="number" min={1} max={numPages} autoFocus
                value={pageInput} onChange={e => setPageInput(e.target.value)} onBlur={commitPage}
                onKeyDown={e => { if (e.key === 'Enter') commitPage(); if (e.key === 'Escape') setEditingPage(false) }} />
            ) : (
              <span className="status-page-display" title="Click to jump to page"
                onClick={() => { setEditingPage(true); setPageInput(String(currentPage)) }}>
                {currentPage} / {numPages}
              </span>
            )}
            <div className="status-nav-group">
              <button className="status-zoom-btn" onClick={() => jumpToPage(currentPage + 1)} disabled={atLast}
                title="Next page"><ChevronRight size={14} /></button>
              <button className="status-zoom-btn" onClick={() => jumpToPage(numPages)} disabled={atLast}
                title="Last page"><ChevronLast size={14} /></button>
              <span className="status-zoom-sep" />
              <button className="status-zoom-btn" onClick={goBack} disabled={navBack.length === 0}
                title="Previous view (Alt+Left)"><Undo2 size={13} /></button>
              <button className="status-zoom-btn" onClick={goForward} disabled={navForward.length === 0}
                title="Next view (Alt+Right)"><Redo2 size={13} /></button>
            </div>
            <span className="status-zoom-sep" />
            <button className="status-zoom-btn" onClick={zoomOut} title="Zoom out (Ctrl+−)">−</button>
            <select className="status-zoom-select" value={zoomVal} onChange={handleZoomSelect} title="Zoom level">
              {zoomVal === 'custom' && <option value="custom" disabled>{zoomPct}%</option>}
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
            <button className="status-zoom-btn" onClick={zoomIn} title="Zoom in (Ctrl++)">+</button>
          </div>
        )}
      </div>
    </div>
  )
}
