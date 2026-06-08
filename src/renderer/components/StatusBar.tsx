import { useState } from 'react'
import { Lock } from 'lucide-react'
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
  const scrollToPage      = usePdfStore(s => s.scrollToPage)

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
    if (!isNaN(n) && n >= 1 && n <= numPages) scrollToPage(n)
    setEditingPage(false)
  }

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
