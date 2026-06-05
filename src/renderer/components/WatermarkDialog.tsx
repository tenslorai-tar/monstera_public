import { useState } from 'react'
import type { WatermarkConfig } from '../utils/documentEnhance'

interface Props {
  numPages: number
  onApply: (cfg: WatermarkConfig) => void
  onClose: () => void
}

export default function WatermarkDialog({ numPages, onApply, onClose }: Props) {
  const [text,       setText]       = useState('DRAFT')
  const [fontSize,   setFontSize]   = useState(80)
  const [color,      setColor]      = useState('#cccccc')
  const [opacity,    setOpacity]    = useState(0.30)
  const [rotation,   setRotation]   = useState(45)
  const [pagesInput, setPagesInput] = useState('all')

  const handleApply = () => {
    if (!text.trim()) { alert('Watermark text cannot be empty'); return }
    const pages = pagesInput.trim() === 'all' ? 'all' : parsePages(pagesInput, numPages)
    if (pages === null) { alert('Invalid page range'); return }
    onApply({ text, fontSize, color, opacity, rotation, pages })
    onClose()
  }

  const PRESETS = ['DRAFT', 'CONFIDENTIAL', 'SAMPLE', 'APPROVED', 'VOID', 'COPY']

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 440 }}>
        <div className="modal-title">💧 Add Watermark</div>

        <div className="modal-field">
          <label className="modal-label">Watermark Text</label>
          <input className="modal-input" value={text} onChange={e => setText(e.target.value)}
            placeholder="e.g. DRAFT, CONFIDENTIAL" />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {PRESETS.map(p => (
              <button key={p} onClick={() => setText(p)}
                style={{ padding: '2px 8px', fontSize: 11, background: text === p ? 'var(--accent-dim)' : 'var(--bg-secondary)',
                  border: `1px solid ${text === p ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 4, cursor: 'pointer', color: 'var(--text-primary)' }}>
                {p}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label className="modal-label">Font Size</label>
            <input type="number" className="modal-input" value={fontSize} min={12} max={400}
              onChange={e => setFontSize(parseInt(e.target.value) || 80)} />
          </div>
          <div>
            <label className="modal-label">Rotation (°)</label>
            <input type="number" className="modal-input" value={rotation} min={-180} max={180}
              onChange={e => setRotation(parseInt(e.target.value) || 45)} />
          </div>
          <div>
            <label className="modal-label">Color</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="color" value={color} onChange={e => setColor(e.target.value)}
                style={{ width: 40, height: 32, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{color}</span>
            </div>
          </div>
          <div>
            <label className="modal-label">Opacity: {Math.round(opacity * 100)}%</label>
            <input type="range" min={5} max={100} step={5}
              value={Math.round(opacity * 100)}
              onChange={e => setOpacity(parseInt(e.target.value) / 100)}
              style={{ width: '100%' }} />
          </div>
        </div>

        <div className="modal-field">
          <label className="modal-label">Pages (e.g. all, 1-5, 1,3,5)</label>
          <input className="modal-input" value={pagesInput} onChange={e => setPagesInput(e.target.value)} />
        </div>

        {/* Preview box */}
        <div style={{
          border: '1px solid var(--border)', borderRadius: 4,
          background: 'white', height: 80, marginBottom: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', position: 'relative',
        }}>
          <span style={{
            color, opacity, fontSize: Math.max(14, fontSize / 5),
            fontWeight: 700, transform: `rotate(${rotation}deg)`,
            letterSpacing: '0.05em', userSelect: 'none',
          }}>{text || 'PREVIEW'}</span>
        </div>

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleApply}>Apply Watermark</button>
        </div>
      </div>
    </div>
  )
}

function parsePages(input: string, total: number): number[] | null {
  const parts = input.split(',').map(s => s.trim()).filter(Boolean)
  const result: number[] = []
  for (const part of parts) {
    const dash = part.indexOf('-')
    if (dash === -1) {
      const n = parseInt(part, 10)
      if (isNaN(n) || n < 1 || n > total) return null
      result.push(n)
    } else {
      const s = parseInt(part.slice(0, dash), 10)
      const e = parseInt(part.slice(dash + 1), 10)
      if (isNaN(s) || isNaN(e) || s < 1 || e > total || s > e) return null
      for (let i = s; i <= e; i++) result.push(i)
    }
  }
  return result.length > 0 ? result : null
}
