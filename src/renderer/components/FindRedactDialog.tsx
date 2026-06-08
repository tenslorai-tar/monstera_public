import { useState } from 'react'
import { SearchX } from 'lucide-react'
import { usePdfStore } from '../store/usePdfStore'
import { newId } from '../utils/annotationUtils'
import type { RedactAnn } from '../types/annotations'

interface Props { onClose: () => void }

export default function FindRedactDialog({ onClose }: Props) {
  const getBakedBytes = usePdfStore(s => s.getBakedBytes)
  const addAnnotation = usePdfStore(s => s.addAnnotation)
  const [term, setTerm] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const handleFind = async () => {
    const trimmed = term.trim()
    if (!trimmed) return
    setBusy(true)
    setStatus('Searching…')
    try {
      const bytes = await getBakedBytes()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rects = await (window.electronAPI as any).mupdfFindTextRects(bytes.buffer as ArrayBuffer, trimmed)
      if (rects.length === 0) {
        setStatus('No matches found.')
      } else {
        for (const r of rects) {
          const ann: RedactAnn = {
            id: newId(), type: 'redact', pageNum: r.pageNum,
            color: '#000000', opacity: 1, createdAt: Date.now(),
            x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2,
          }
          addAnnotation(ann)
        }
        setStatus(`Marked ${rects.length} match(es) for redaction. Click "Apply Redactions" in the Edit tab to finalize.`)
      }
    } catch (e: unknown) {
      setStatus(`Error: ${(e as Error).message}`)
    }
    setBusy(false)
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 440 }}>
        <div className="modal-title"><SearchX size={18} /> Find & Redact</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Search for text across all pages and mark every match for redaction.
          After finding, use "Apply Redactions" in the Edit tab to permanently remove the content.
        </p>
        <div className="modal-field">
          <label className="modal-label">Search term</label>
          <input className="modal-input" type="text" value={term} autoFocus
            onChange={e => setTerm(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleFind()}
            placeholder="Text to find and redact…" />
        </div>
        {status && (
          <div style={{ fontSize: 12, color: status.startsWith('Error') ? 'var(--error, #f55)' : 'var(--text-muted)', marginBottom: 8 }}>
            {status}
          </div>
        )}
        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Close</button>
          <button className="modal-btn-primary" onClick={handleFind} disabled={busy || !term.trim()}>
            {busy ? 'Searching…' : 'Find & Mark All'}
          </button>
        </div>
      </div>
    </div>
  )
}
