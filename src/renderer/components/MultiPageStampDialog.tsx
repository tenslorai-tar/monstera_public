import { useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'
import type { Annotation } from '../types/annotations'
import { newId } from '../utils/annotationUtils'

interface Props {
  onClose: () => void
  sourceAnnotation: Annotation  // the stamp/signature annotation to duplicate
}

export default function MultiPageStampDialog({ onClose, sourceAnnotation }: Props) {
  const numPages   = usePdfStore(s => s.numPages)
  const addAnnotation = usePdfStore(s => s.addAnnotation)

  const [pageRange, setPageRange] = useState('all')
  const [status,    setStatus]    = useState('')

  function parsePages(): number[] {
    if (pageRange.trim() === 'all') return Array.from({ length: numPages }, (_, i) => i + 1)
    const result: number[] = []
    for (const part of pageRange.split(',')) {
      const p = part.trim()
      const m = p.match(/^(\d+)-(\d+)$/)
      if (m) {
        for (let i = parseInt(m[1]); i <= parseInt(m[2]); i++)
          if (i >= 1 && i <= numPages) result.push(i)
      } else {
        const n = parseInt(p)
        if (!isNaN(n) && n >= 1 && n <= numPages) result.push(n)
      }
    }
    return [...new Set(result)].sort((a, b) => a - b).filter(p => p !== sourceAnnotation.pageNum)
  }

  const apply = () => {
    const pages = parsePages()
    if (pages.length === 0) { setStatus('No additional pages selected.'); return }
    for (const p of pages) {
      addAnnotation({ ...sourceAnnotation, id: newId(), pageNum: p })
    }
    setStatus(`Stamped on ${pages.length} additional page${pages.length !== 1 ? 's' : ''}.`)
    setTimeout(onClose, 800)
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 400 }}>
        <div className="modal-title">🖋 Stamp on Multiple Pages</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
          Place the same stamp/signature on additional pages. The original page ({sourceAnnotation.pageNum}) is excluded.
        </p>

        <div className="modal-field">
          <label className="modal-label">Additional pages</label>
          <input className="modal-input" value={pageRange}
            onChange={e => setPageRange(e.target.value)}
            placeholder={`all  or  1-3, 5  (1–${numPages})`} />
          <span className="modal-hint">Current page ({sourceAnnotation.pageNum}) is skipped.</span>
        </div>

        {status && <div style={{ fontSize: 13, color: '#4caf50', marginBottom: 8 }}>{status}</div>}

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={apply}>Apply to Pages</button>
        </div>
      </div>
    </div>
  )
}
