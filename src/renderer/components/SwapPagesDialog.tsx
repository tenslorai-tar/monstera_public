import { useState } from 'react'

interface Props {
  numPages: number
  onClose: () => void
  onSwap: (page1: number, page2: number) => void
}

export default function SwapPagesDialog({ numPages, onClose, onSwap }: Props) {
  const [page1, setPage1] = useState('1')
  const [page2, setPage2] = useState('2')

  const n1 = parseInt(page1, 10)
  const n2 = parseInt(page2, 10)
  const valid = !isNaN(n1) && !isNaN(n2) && n1 >= 1 && n2 >= 1
    && n1 <= numPages && n2 <= numPages && n1 !== n2

  const handleSwap = () => {
    if (!valid) return
    onSwap(n1, n2)
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 360 }}>
        <div className="modal-title">⇄ Swap Pages</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>
          Exchange the positions of two pages in the document.
        </p>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
          <div className="modal-field" style={{ flex: 1, marginBottom: 0 }}>
            <label className="modal-label">First page</label>
            <input className="modal-input" type="number" min={1} max={numPages}
              value={page1} onChange={e => setPage1(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSwap()} autoFocus />
          </div>
          <span style={{ fontSize: 20, marginTop: 18, color: 'var(--text-muted)' }}>⇄</span>
          <div className="modal-field" style={{ flex: 1, marginBottom: 0 }}>
            <label className="modal-label">Second page</label>
            <input className="modal-input" type="number" min={1} max={numPages}
              value={page2} onChange={e => setPage2(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSwap()} />
          </div>
        </div>

        {!valid && (n1 === n2) && (
          <div className="modal-error" style={{ marginBottom: 10 }}>Pages must be different.</div>
        )}

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" disabled={!valid} onClick={handleSwap}>Swap</button>
        </div>
      </div>
    </div>
  )
}
