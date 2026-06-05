import { useState } from 'react'
import type { BackgroundConfig } from '../utils/documentEnhance'

interface Props {
  numPages: number
  onApply: (cfg: BackgroundConfig) => void
  onClose: () => void
}

const PRESETS = [
  { label: 'White',      color: '#ffffff' },
  { label: 'Light Gray', color: '#f0f0f0' },
  { label: 'Cream',      color: '#fefce8' },
  { label: 'Light Blue', color: '#eff6ff' },
  { label: 'Light Green',color: '#f0fdf4' },
  { label: 'Custom',     color: null },
]

export default function BackgroundDialog({ numPages, onApply, onClose }: Props) {
  const [color,      setColor]      = useState('#ffffff')
  const [opacity,    setOpacity]    = useState(1.0)
  const [pagesInput, setPagesInput] = useState('all')

  const handleApply = () => {
    const pages = pagesInput.trim() === 'all' ? 'all' : parsePages(pagesInput, numPages)
    if (pages === null) { alert('Invalid page range'); return }
    onApply({ color, opacity, pages })
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 380 }}>
        <div className="modal-title">🎨 Page Background</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          Adds a colored rectangle over the page. At 100% opacity it covers existing content.
          Reduce opacity to use as a translucent tint.
        </p>

        {/* Color presets */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {PRESETS.map(p => (
            <button key={p.label}
              onClick={() => { if (p.color) setColor(p.color) }}
              style={{
                padding: '4px 10px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
                border: `1px solid ${p.color === color ? 'var(--accent)' : 'var(--border)'}`,
                background: p.color ?? 'var(--bg-secondary)',
                color: (p.label === 'White' || p.label === 'Cream') ? '#333' : 'var(--text-primary)',
              }}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="modal-field">
          <label className="modal-label">Custom Color</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              style={{ width: 40, height: 32, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }} />
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{color}</span>
          </div>
        </div>

        <div className="modal-field">
          <label className="modal-label">Opacity: {Math.round(opacity * 100)}%</label>
          <input type="range" min={5} max={100} step={5}
            value={Math.round(opacity * 100)}
            onChange={e => setOpacity(parseInt(e.target.value) / 100)}
            style={{ width: '100%' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
            <span>5% (light tint)</span>
            <span>100% (solid cover)</span>
          </div>
        </div>

        <div className="modal-field">
          <label className="modal-label">Pages (e.g. all, 1-5, 1,3,5)</label>
          <input className="modal-input" value={pagesInput} onChange={e => setPagesInput(e.target.value)} />
        </div>

        {/* Preview swatch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 4,
            background: color, opacity: opacity,
            border: '1px solid var(--border)',
          }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Preview: {color} at {Math.round(opacity * 100)}% opacity
          </span>
        </div>

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleApply}>Apply Background</button>
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
