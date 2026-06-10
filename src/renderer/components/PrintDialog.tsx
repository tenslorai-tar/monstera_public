import { useState } from 'react'
import { Printer } from 'lucide-react'
import { usePdfStore } from '../store/usePdfStore'

interface Props {
  onClose: () => void
}

// Parse "1-5, 8, 11-12" into a sorted, de-duplicated 1-based page list.
function parseRange(input: string, max: number): number[] {
  const out = new Set<number>()
  for (const part of input.split(',')) {
    const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/)
    if (!m) continue
    const a = parseInt(m[1], 10)
    const b = m[2] ? parseInt(m[2], 10) : a
    for (let p = Math.min(a, b); p <= Math.max(a, b); p++) {
      if (p >= 1 && p <= max) out.add(p)
    }
  }
  return [...out].sort((x, y) => x - y)
}

export default function PrintDialog({ onClose }: Props) {
  const numPages      = usePdfStore(s => s.numPages)
  const currentPage   = usePdfStore(s => s.currentPage)
  const getBakedBytes = usePdfStore(s => s.getBakedBytes)

  const [scope, setScope]       = useState<'all' | 'current' | 'custom'>('all')
  const [rangeText, setRange]   = useState('')
  const [dpi, setDpi]           = useState(300)
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState('')

  const doPrint = async () => {
    let pages: number[] = []
    if (scope === 'current') pages = [currentPage]
    else if (scope === 'custom') {
      pages = parseRange(rangeText, numPages)
      if (pages.length === 0) { setError('Enter a valid page range, e.g. 1-5, 8'); return }
    }
    setBusy(true)
    setError('')
    try {
      // Print what the user sees: annotations and form values baked in.
      const baked = await getBakedBytes()
      await window.electronAPI.printPdf(baked.slice().buffer as ArrayBuffer, { pages, dpi })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={busy ? undefined : onClose}>
      <div className="modal-box" style={{ width: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Printer size={18} /> Print
        </div>

        <div style={{ marginBottom: 14 }}>
          <label className="modal-label">Pages</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} />
              All pages ({numPages})
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="radio" checked={scope === 'current'} onChange={() => setScope('current')} />
              Current page ({currentPage})
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="radio" checked={scope === 'custom'} onChange={() => setScope('custom')} />
              Pages:
              <input
                className="modal-input"
                style={{ flex: 1, margin: 0, padding: '4px 8px', fontSize: 12.5 }}
                placeholder="e.g. 1-5, 8, 11-12"
                value={rangeText}
                onFocus={() => setScope('custom')}
                onChange={e => setRange(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="modal-label">Print quality</label>
          <select className="modal-input" value={dpi} onChange={e => setDpi(Number(e.target.value))}>
            <option value={150}>Draft — 150 DPI</option>
            <option value={300}>Standard — 300 DPI</option>
            <option value={600}>High — 600 DPI (slow on long documents)</option>
          </select>
          <span className="modal-hint">
            Pages are rendered from the PDF itself with annotations included.
            Printer, copies and duplex are chosen in the system dialog.
          </span>
        </div>

        {error && (
          <div style={{ color: '#f48771', fontSize: 12.5, marginBottom: 12 }}>{error}</div>
        )}

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="modal-btn-primary" onClick={doPrint} disabled={busy}>
            {busy ? 'Preparing…' : 'Print…'}
          </button>
        </div>
      </div>
    </div>
  )
}
