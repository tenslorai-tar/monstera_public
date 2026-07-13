import { useState } from 'react'
import { Hash } from 'lucide-react'
import { toast } from '../store/useToastStore'
import type { BatesConfig, BatesPosition } from '../utils/documentEnhance'

interface Props {
  numPages: number
  onApply: (cfg: BatesConfig) => void
  onClose: () => void
}

const POSITIONS: { value: BatesPosition; label: string }[] = [
  { value: 'top-left',       label: 'Top Left'       },
  { value: 'top-center',     label: 'Top Center'     },
  { value: 'top-right',      label: 'Top Right'      },
  { value: 'bottom-left',    label: 'Bottom Left'    },
  { value: 'bottom-center',  label: 'Bottom Center'  },
  { value: 'bottom-right',   label: 'Bottom Right'   },
]

export default function BatesDialog({ numPages, onApply, onClose }: Props) {
  const [prefix,      setPrefix]      = useState('')
  const [suffix,      setSuffix]      = useState('')
  const [startNumber, setStartNumber] = useState(1)
  const [digits,      setDigits]      = useState(4)
  const [position,    setPosition]    = useState<BatesPosition>('bottom-right')
  const [fontSize,    setFontSize]    = useState(8)
  const [color,       setColor]       = useState('#000000')
  const [margin,      setMargin]      = useState(18)
  const [pagesInput,  setPagesInput]  = useState('all')

  const previewText = `${prefix}${String(startNumber).padStart(digits, '0')}${suffix}`

  const handleApply = () => {
    const pages = pagesInput.trim() === 'all' ? 'all' : parsePages(pagesInput, numPages)
    if (pages === null) { toast.error('Invalid page range'); return }
    onApply({ prefix, suffix, startNumber, digits, position, fontSize, color, margin, pages })
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 460 }}>
        <div className="modal-title"><Hash size={18} /> Bates Numbering</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          Adds sequential numbering to each page in a fixed position.
          Format: <code style={{ background: 'var(--bg-secondary)', padding: '1px 5px', borderRadius: 3 }}>{previewText}</code>
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label className="modal-label">Prefix</label>
            <input className="modal-input" value={prefix} onChange={e => setPrefix(e.target.value)}
              placeholder="e.g. DOC-" />
          </div>
          <div>
            <label className="modal-label">Suffix</label>
            <input className="modal-input" value={suffix} onChange={e => setSuffix(e.target.value)}
              placeholder="e.g. -ABC" />
          </div>
          <div>
            <label className="modal-label">Start Number</label>
            <input type="number" className="modal-input" value={startNumber} min={0}
              onChange={e => setStartNumber(parseInt(e.target.value) || 1)} />
          </div>
          <div>
            <label className="modal-label">Min Digits (zero-pad)</label>
            <input type="number" className="modal-input" value={digits} min={1} max={10}
              onChange={e => setDigits(parseInt(e.target.value) || 4)} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label className="modal-label">Position</label>
            <select className="modal-input" style={{ marginBottom: 0 }}
              value={position} onChange={e => setPosition(e.target.value as BatesPosition)}>
              {POSITIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="modal-label">Font Size</label>
            <input type="number" className="modal-input" value={fontSize} min={6} max={24}
              onChange={e => setFontSize(parseInt(e.target.value) || 8)} />
          </div>
          <div>
            <label className="modal-label">Margin (pt)</label>
            <input type="number" className="modal-input" value={margin} min={4} max={72}
              onChange={e => setMargin(parseInt(e.target.value) || 18)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 12 }}>
          <div>
            <label className="modal-label">Color</label>
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              style={{ width: 40, height: 32, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="modal-label">Pages (e.g. all, 1-5, 1,3,5)</label>
            <input className="modal-input" value={pagesInput} onChange={e => setPagesInput(e.target.value)} />
          </div>
        </div>

        {/* Page layout hint */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 4, padding: 10,
          background: 'var(--bg-secondary)', marginBottom: 14, position: 'relative', height: 70 }}>
          <div style={{ position: 'absolute', fontSize: 10,
            ...(position === 'top-left'      ? { top: 6, left: 10 }    : {}),
            ...(position === 'top-center'    ? { top: 6, left: '50%', transform: 'translateX(-50%)' } : {}),
            ...(position === 'top-right'     ? { top: 6, right: 10 }   : {}),
            ...(position === 'bottom-left'   ? { bottom: 6, left: 10 } : {}),
            ...(position === 'bottom-center' ? { bottom: 6, left: '50%', transform: 'translateX(-50%)' } : {}),
            ...(position === 'bottom-right'  ? { bottom: 6, right: 10 }: {}),
            fontWeight: 600, color: color, fontFamily: 'monospace',
          }}>{previewText}</div>
        </div>

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleApply}>Apply Bates Numbers</button>
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
