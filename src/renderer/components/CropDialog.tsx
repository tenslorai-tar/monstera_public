import { useState } from 'react'
import { Crop } from 'lucide-react'
import { toast } from '../store/useToastStore'
import { usePdfStore } from '../store/usePdfStore'
import type { CropConfig } from '../utils/documentEnhance'

interface Props {
  onApply: (cfg: CropConfig) => void
  onClose: () => void
}

type Unit = 'pt' | 'mm' | 'in'

const PT_PER_MM = 2.8346
const PT_PER_IN = 72

function toPoints(value: number, unit: Unit): number {
  if (unit === 'mm') return value * PT_PER_MM
  if (unit === 'in') return value * PT_PER_IN
  return value
}

export default function CropDialog({ onApply, onClose }: Props) {
  const numPages   = usePdfStore(s => s.numPages)
  const currentPage = usePdfStore(s => s.currentPage)
  const pageSizes   = usePdfStore(s => s.pageSizes)
  const selectedPages = usePdfStore(s => s.selectedPages)

  const [top,    setTop]    = useState(0)
  const [right,  setRight]  = useState(0)
  const [bottom, setBottom] = useState(0)
  const [left,   setLeft]   = useState(0)
  const [unit,   setUnit]   = useState<Unit>('mm')
  const [scope,  setScope]  = useState<'current' | 'selected' | 'all'>('current')

  const pSize = pageSizes[currentPage - 1] ?? { width: 612, height: 792 }
  const ptTop   = toPoints(top, unit)
  const ptRight  = toPoints(right, unit)
  const ptBottom = toPoints(bottom, unit)
  const ptLeft   = toPoints(left, unit)

  const cropW = Math.max(0, pSize.width  - ptLeft  - ptRight)
  const cropH = Math.max(0, pSize.height - ptTop   - ptBottom)
  const valid = cropW > 10 && cropH > 10

  const handleApply = () => {
    if (!valid) { toast.error('Crop margins are too large — nothing would remain visible'); return }
    let pages: 'all' | number[]
    if (scope === 'all') pages = 'all'
    else if (scope === 'selected') pages = [...selectedPages].filter(p => p >= 1 && p <= numPages)
    else pages = [currentPage]
    onApply({ top: ptTop, right: ptRight, bottom: ptBottom, left: ptLeft, pages })
    onClose()
  }

  const pv = { scale: Math.min(100 / pSize.width, 120 / pSize.height) }
  const pvW = pSize.width * pv.scale, pvH = pSize.height * pv.scale
  const pvLeft   = ptLeft * pv.scale, pvBottom = ptBottom * pv.scale
  const pvRight  = ptRight * pv.scale, pvTop    = ptTop * pv.scale

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 480 }}>
        <div className="modal-title"><Crop size={18} /> Crop Pages</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          Sets the CropBox to hide content outside the margins. Content is not deleted —
          use Undo to restore. Original page size: {pSize.width.toFixed(0)} × {pSize.height.toFixed(0)} pt.
        </p>

        {/* Unit selector */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {(['mm', 'pt', 'in'] as Unit[]).map(u => (
            <button key={u} onClick={() => setUnit(u)}
              style={{ padding: '4px 12px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
                border: `1px solid ${unit === u ? 'var(--accent)' : 'var(--border)'}`,
                background: unit === u ? 'var(--accent-dim)' : 'var(--bg-secondary)',
                color: 'var(--text-primary)' }}>
              {u}
            </button>
          ))}
        </div>

        {/* Margin inputs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          {[
            { label: 'Top',    val: top,    set: setTop    },
            { label: 'Bottom', val: bottom, set: setBottom },
            { label: 'Left',   val: left,   set: setLeft   },
            { label: 'Right',  val: right,  set: setRight  },
          ].map(({ label, val, set }) => (
            <div key={label}>
              <label className="modal-label">{label} margin ({unit})</label>
              <input type="number" className="modal-input" value={val} min={0} step={0.5}
                onChange={e => set(parseFloat(e.target.value) || 0)} />
            </div>
          ))}
        </div>

        {/* Visual preview */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 14 }}>
          <div style={{ position: 'relative', width: pvW, height: pvH, flexShrink: 0,
            background: '#e0e0e0', border: '1px solid var(--border)', borderRadius: 2 }}>
            {/* Crop region in blue */}
            <div style={{
              position: 'absolute',
              left: pvLeft, bottom: pvBottom,
              width: Math.max(0, pvW - pvLeft - pvRight),
              height: Math.max(0, pvH - pvTop - pvBottom),
              background: valid ? 'rgba(74,158,255,0.25)' : 'rgba(255,85,85,0.25)',
              border: `2px solid ${valid ? '#4a9eff' : '#f55'}`,
              boxSizing: 'border-box',
            }} />
            {/* Cropped-out areas in dark */}
            {pvTop > 0 && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: pvTop, background: 'rgba(0,0,0,0.35)' }} />}
            {pvBottom > 0 && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: pvBottom, background: 'rgba(0,0,0,0.35)' }} />}
            {pvLeft > 0 && <div style={{ position: 'absolute', left: 0, bottom: pvBottom, width: pvLeft, height: pvH - pvTop - pvBottom, background: 'rgba(0,0,0,0.35)' }} />}
            {pvRight > 0 && <div style={{ position: 'absolute', right: 0, bottom: pvBottom, width: pvRight, height: pvH - pvTop - pvBottom, background: 'rgba(0,0,0,0.35)' }} />}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            <div>Result: {cropW.toFixed(0)} × {cropH.toFixed(0)} pt</div>
            <div style={{ marginTop: 4 }}>
              {(cropW / PT_PER_MM).toFixed(1)} × {(cropH / PT_PER_MM).toFixed(1)} mm
            </div>
            {!valid && <div style={{ color: 'var(--danger)', marginTop: 6 }}>⚠ Too small!</div>}
          </div>
        </div>

        {/* Scope */}
        <div className="modal-field">
          <label className="modal-label">Apply To</label>
          <select className="modal-input" value={scope} onChange={e => setScope(e.target.value as typeof scope)}>
            <option value="current">Current page (page {currentPage})</option>
            {selectedPages.size > 1 && <option value="selected">Selected pages ({selectedPages.size})</option>}
            <option value="all">All pages</option>
          </select>
        </div>

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleApply} disabled={!valid}>Apply Crop</button>
        </div>
      </div>
    </div>
  )
}
