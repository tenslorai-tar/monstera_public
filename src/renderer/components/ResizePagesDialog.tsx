import { useState } from 'react'
import { Scaling } from 'lucide-react'

const PRESETS: { label: string; w: number; h: number }[] = [
  { label: 'Letter (8.5×11 in)',  w: 612,  h: 792  },
  { label: 'Legal (8.5×14 in)',   w: 612,  h: 1008 },
  { label: 'Tabloid (11×17 in)',  w: 792,  h: 1224 },
  { label: 'A3 (297×420 mm)',     w: 842,  h: 1191 },
  { label: 'A4 (210×297 mm)',     w: 595,  h: 842  },
  { label: 'A5 (148×210 mm)',     w: 420,  h: 595  },
  { label: 'A6 (105×148 mm)',     w: 298,  h: 420  },
  { label: 'Custom',              w: 0,    h: 0    },
]

interface Props {
  numPages: number
  onClose: () => void
  onApply: (pageNums: number[] | 'all', width: number, height: number) => void
}

export default function ResizePagesDialog({ numPages, onClose, onApply }: Props) {
  const [presetIdx, setPresetIdx] = useState(4) // A4
  const [customW,   setCustomW]   = useState('595')
  const [customH,   setCustomH]   = useState('842')
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait')
  const [scope, setScope]         = useState<'all' | 'range'>('all')
  const [rangeInput, setRangeInput] = useState('1')

  const preset = PRESETS[presetIdx]
  const isCustom = preset.label === 'Custom'

  const baseW = isCustom ? parseFloat(customW) || 595 : preset.w
  const baseH = isCustom ? parseFloat(customH) || 842 : preset.h
  const [finalW, finalH] = orientation === 'portrait'
    ? [Math.min(baseW, baseH), Math.max(baseW, baseH)]
    : [Math.max(baseW, baseH), Math.min(baseW, baseH)]

  const parsePages = (): number[] | null => {
    const parts = rangeInput.split(',').map(s => s.trim())
    const result: number[] = []
    for (const p of parts) {
      if (p.includes('-')) {
        const [a, b] = p.split('-').map(Number)
        if (isNaN(a) || isNaN(b) || a < 1 || b > numPages || a > b) return null
        for (let i = a; i <= b; i++) result.push(i)
      } else {
        const n = parseInt(p, 10)
        if (isNaN(n) || n < 1 || n > numPages) return null
        result.push(n)
      }
    }
    return result.length > 0 ? [...new Set(result)] : null
  }

  const handleApply = () => {
    if (scope === 'all') {
      onApply('all', finalW, finalH)
    } else {
      const pages = parsePages()
      if (!pages) return
      onApply(pages, finalW, finalH)
    }
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 420 }}>
        <div className="modal-title"><Scaling size={18} /> Resize Pages</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>
          Changes the page dimensions (MediaBox). Content is not scaled or repositioned.
        </p>

        <div className="modal-field">
          <label className="modal-label">Page size</label>
          <select className="modal-input"
            value={presetIdx}
            onChange={e => setPresetIdx(parseInt(e.target.value))}>
            {PRESETS.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
          </select>
        </div>

        {isCustom && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div className="modal-field" style={{ flex: 1, marginBottom: 0 }}>
              <label className="modal-label">Width (pt)</label>
              <input className="modal-input" type="number" min={36} max={5000}
                value={customW} onChange={e => setCustomW(e.target.value)} />
            </div>
            <div className="modal-field" style={{ flex: 1, marginBottom: 0 }}>
              <label className="modal-label">Height (pt)</label>
              <input className="modal-input" type="number" min={36} max={5000}
                value={customH} onChange={e => setCustomH(e.target.value)} />
            </div>
          </div>
        )}

        <div className="modal-field">
          <label className="modal-label">Orientation</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['portrait', 'landscape'] as const).map(o => (
              <button key={o} onClick={() => setOrientation(o)}
                style={{
                  flex: 1, padding: '7px 0', border: '1px solid',
                  borderColor: orientation === o ? 'var(--accent)' : 'var(--border)',
                  borderRadius: 4, cursor: 'pointer', fontSize: 12,
                  background: orientation === o ? 'rgba(74,158,255,0.12)' : 'var(--bg-secondary)',
                  color: orientation === o ? 'var(--accent)' : 'var(--text-primary)',
                }}>
                {o === 'portrait' ? '▯ Portrait' : '▭ Landscape'}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-field">
          <label className="modal-label">Apply to</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} />
              All pages
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="radio" checked={scope === 'range'} onChange={() => setScope('range')} />
              Page range:
              <input className="modal-input" type="text" placeholder="e.g. 1-3, 5"
                value={rangeInput} onChange={e => setRangeInput(e.target.value)}
                style={{ width: 120, marginLeft: 4, padding: '3px 6px' }}
                disabled={scope !== 'range'} />
            </label>
          </div>
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>
          Final size: {finalW} × {finalH} pt ({(finalW / 72).toFixed(2)} × {(finalH / 72).toFixed(2)} in)
        </div>

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleApply}>Resize</button>
        </div>
      </div>
    </div>
  )
}
