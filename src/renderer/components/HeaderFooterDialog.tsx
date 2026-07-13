import { useState } from 'react'
import { PanelTop } from 'lucide-react'
import { toast } from '../store/useToastStore'
import type { HeaderFooterConfig } from '../utils/documentEnhance'

interface Props {
  numPages: number
  fileName: string
  onApply: (cfg: HeaderFooterConfig) => void
  onClose: () => void
}

const MACROS = '{page}  {pages}  {date}  {filename}'

export default function HeaderFooterDialog({ numPages, fileName, onApply, onClose }: Props) {
  const [topLeft,      setTopLeft]      = useState('')
  const [topCenter,    setTopCenter]    = useState('')
  const [topRight,     setTopRight]     = useState('{page} / {pages}')
  const [bottomLeft,   setBottomLeft]   = useState('{filename}')
  const [bottomCenter, setBottomCenter] = useState('')
  const [bottomRight,  setBottomRight]  = useState('{date}')
  const [fontSize,     setFontSize]     = useState(10)
  const [color,        setColor]        = useState('#000000')
  const [margin,       setMargin]       = useState(36)
  const [pagesInput,   setPagesInput]   = useState('all')

  const handleApply = () => {
    const pages = pagesInput.trim() === 'all' ? 'all' : parsePages(pagesInput, numPages)
    if (pages === null) { toast.error('Invalid page range'); return }
    onApply({
      topLeft, topCenter, topRight,
      bottomLeft, bottomCenter, bottomRight,
      fontSize, color, margin, pages, filename: fileName,
    })
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 560 }}>
        <div className="modal-title"><PanelTop size={18} /> Add Headers & Footers</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          Available macros: <code style={{ background: 'var(--bg-secondary)', padding: '1px 5px', borderRadius: 3 }}>{MACROS}</code>
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
          {/* Top row */}
          <div>
            <div style={lbl}>Top Left</div>
            <input className="modal-input" style={inp} value={topLeft} onChange={e => setTopLeft(e.target.value)} placeholder="{page}" />
          </div>
          <div>
            <div style={lbl}>Top Center</div>
            <input className="modal-input" style={inp} value={topCenter} onChange={e => setTopCenter(e.target.value)} placeholder="Title" />
          </div>
          <div>
            <div style={lbl}>Top Right</div>
            <input className="modal-input" style={inp} value={topRight} onChange={e => setTopRight(e.target.value)} placeholder="{page} / {pages}" />
          </div>
          {/* Bottom row */}
          <div>
            <div style={lbl}>Bottom Left</div>
            <input className="modal-input" style={inp} value={bottomLeft} onChange={e => setBottomLeft(e.target.value)} placeholder="{filename}" />
          </div>
          <div>
            <div style={lbl}>Bottom Center</div>
            <input className="modal-input" style={inp} value={bottomCenter} onChange={e => setBottomCenter(e.target.value)} />
          </div>
          <div>
            <div style={lbl}>Bottom Right</div>
            <input className="modal-input" style={inp} value={bottomRight} onChange={e => setBottomRight(e.target.value)} placeholder="{date}" />
          </div>
        </div>

        {/* Style controls */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={lbl}>Font Size</div>
            <input type="number" className="modal-input" style={{ ...inp, width: 70 }}
              value={fontSize} min={6} max={36} onChange={e => setFontSize(parseInt(e.target.value) || 10)} />
          </div>
          <div>
            <div style={lbl}>Color</div>
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              style={{ width: 40, height: 32, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }} />
          </div>
          <div>
            <div style={lbl}>Margin (pt)</div>
            <input type="number" className="modal-input" style={{ ...inp, width: 70 }}
              value={margin} min={4} max={144} onChange={e => setMargin(parseInt(e.target.value) || 36)} />
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={lbl}>Pages (e.g. all, 1-5, 1,3,5)</div>
            <input className="modal-input" style={inp} value={pagesInput} onChange={e => setPagesInput(e.target.value)} />
          </div>
        </div>

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleApply}>Apply to Document</button>
        </div>
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }
const inp: React.CSSProperties = { marginBottom: 0, width: '100%' }

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
