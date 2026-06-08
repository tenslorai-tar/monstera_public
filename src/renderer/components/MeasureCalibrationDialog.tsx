import { useState } from 'react'
import { PencilRuler } from 'lucide-react'
import { useSettingsStore } from '../store/useSettingsStore'

interface Props { onClose: () => void }

const PRESETS = [
  { label: 'Points (pt)', unit: 'pt', scale: 1 },
  { label: 'Inches (in)', unit: 'in', scale: 72 },
  { label: 'Millimeters (mm)', unit: 'mm', scale: 2.8346 },
  { label: 'Centimeters (cm)', unit: 'cm', scale: 28.346 },
  { label: 'Feet (ft)', unit: 'ft', scale: 864 },
  { label: 'Meters (m)', unit: 'm', scale: 2834.6 },
]

export default function MeasureCalibrationDialog({ onClose }: Props) {
  const { settings, updateSettings } = useSettingsStore()
  const [unit, setUnit] = useState(settings.measureUnit ?? 'pt')
  const [scale, setScale] = useState(String(settings.measureScale ?? 1))

  const apply = () => {
    const s = parseFloat(scale)
    if (!isNaN(s) && s > 0) {
      updateSettings({ measureUnit: unit, measureScale: s })
    }
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 400 }}>
        <div className="modal-title"><PencilRuler size={18} /> Measurement Calibration</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Set the unit for distance, area, and perimeter measurements.
          Scale = PDF points per unit (1 inch = 72pt).
        </p>

        <div className="modal-field">
          <label className="modal-label">Quick preset</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {PRESETS.map(p => (
              <button key={p.unit}
                onClick={() => { setUnit(p.unit); setScale(String(p.scale)) }}
                style={{
                  padding: '4px 10px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
                  border: `1px solid ${unit === p.unit ? 'var(--accent)' : 'var(--border)'}`,
                  background: unit === p.unit ? 'rgba(74,158,255,0.12)' : 'var(--bg-secondary)',
                  color: unit === p.unit ? 'var(--accent)' : 'var(--text-primary)',
                }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-field">
          <label className="modal-label">Unit name</label>
          <input className="modal-input" type="text" value={unit}
            onChange={e => setUnit(e.target.value)} placeholder="pt, mm, in…" />
        </div>

        <div className="modal-field">
          <label className="modal-label">PDF points per unit</label>
          <input className="modal-input" type="number" min="0.001" step="any"
            value={scale} onChange={e => setScale(e.target.value)} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            e.g. 72 = 1 unit equals 1 inch (72pt per inch)
          </span>
        </div>

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={apply}>Apply</button>
        </div>
      </div>
    </div>
  )
}
