import { useState, useEffect } from 'react'
import { Settings as SettingsIcon, X as XIcon, Moon, Sun, Upload, Download } from 'lucide-react'
import { useSettingsStore } from '../store/useSettingsStore'
import type { Theme, DefaultZoom } from '../store/useSettingsStore'

const ACCENTS: { name: string; hex: string }[] = [
  { name: 'Monstera Green', hex: '' },
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Teal',    hex: '#14b8a6' },
  { name: 'Blue',    hex: '#3b82f6' },
  { name: 'Indigo',  hex: '#6366f1' },
  { name: 'Violet',  hex: '#8b5cf6' },
  { name: 'Rose',    hex: '#f43f5e' },
  { name: 'Amber',   hex: '#f59e0b' },
]

const OCR_LANGUAGES = [
  { code: 'eng', label: 'English' }, { code: 'fra', label: 'French' },
  { code: 'deu', label: 'German' }, { code: 'spa', label: 'Spanish' },
  { code: 'ita', label: 'Italian' }, { code: 'por', label: 'Portuguese' },
  { code: 'rus', label: 'Russian' }, { code: 'chi_sim', label: 'Chinese (Simplified)' },
  { code: 'chi_tra', label: 'Chinese (Traditional)' }, { code: 'jpn', label: 'Japanese' },
  { code: 'kor', label: 'Korean' }, { code: 'ara', label: 'Arabic' },
  { code: 'nld', label: 'Dutch' },
]

interface Props { onClose: () => void }

export default function SettingsDialog({ onClose }: Props) {
  const { settings, updateSettings, resetSettings } = useSettingsStore()
  const [local, setLocal] = useState({ ...settings })

  const apply = () => {
    updateSettings(local)
    onClose()
  }

  const reset = () => {
    resetSettings()
    onClose()
  }

  const zoomLabel = (z: DefaultZoom) => {
    if (z === 'fit-width') return 'Fit Width'
    if (z === 'fit-page') return 'Fit Page'
    return `${Math.round((z as number) * 100)}%`
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-box settings-modal">
        <div className="settings-header">
          <span className="settings-header-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><SettingsIcon size={17} /> Settings</span>
          <button className="settings-close-btn" onClick={onClose} title="Close (Esc)" aria-label="Close" style={{ display: 'inline-flex', alignItems: 'center' }}><XIcon size={16} /></button>
        </div>

        <div className="settings-body">
        {/* Theme */}
        <div className="modal-field">
          <label className="modal-label">Theme</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['dark', 'light'] as Theme[]).map(t => (
              <button key={t}
                onClick={() => setLocal(l => ({ ...l, theme: t }))}
                style={{
                  flex: 1, padding: '8px 0', border: '1px solid',
                  borderColor: local.theme === t ? 'var(--accent)' : 'var(--border)',
                  borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 13,
                  background: local.theme === t ? 'var(--accent-dim)' : 'var(--bg-secondary)',
                  color: local.theme === t ? 'var(--accent)' : 'var(--text-primary)',
                  fontWeight: local.theme === t ? 600 : 400,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                }}>
                {t === 'dark' ? <><Moon size={15} /> Dark</> : <><Sun size={15} /> Light</>}
              </button>
            ))}
          </div>
        </div>

        {/* Accent colour */}
        <div className="modal-field settings-span-2">
          <label className="modal-label">Accent colour</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            {ACCENTS.map(a => {
              const selected = (local.accentColor || '') === a.hex
              const swatch = a.hex || '#16a34a'
              return (
                <button key={a.name} title={a.name}
                  onClick={() => setLocal(l => ({ ...l, accentColor: a.hex }))}
                  style={{
                    width: 26, height: 26, borderRadius: '50%', cursor: 'pointer', padding: 0,
                    background: swatch,
                    border: '2px solid ' + (selected ? 'var(--text-primary)' : 'transparent'),
                    outline: selected ? '0' : '1px solid var(--border)',
                  }} />
              )
            })}
            <label title="Custom colour" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 2, cursor: 'pointer' }}>
              <input type="color" value={local.accentColor || '#16a34a'}
                onChange={e => setLocal(l => ({ ...l, accentColor: e.target.value }))}
                style={{ width: 28, height: 28, padding: 0, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'none' }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Custom</span>
            </label>
          </div>
          <span className="modal-hint">Repaints highlights, buttons and active states across the whole app.</span>
        </div>

        {/* Default annotation colour */}
        <div className="modal-field">
          <label className="modal-label">Default annotation colour</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="color" value={local.defaultToolColor || '#16a34a'}
              onChange={e => setLocal(l => ({ ...l, defaultToolColor: e.target.value }))}
              style={{ width: 34, height: 28, padding: 0, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'none' }} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{local.defaultToolColor}</span>
          </div>
          <span className="modal-hint">Colour new highlights, shapes and ink start with.</span>
        </div>

        {/* Zoom step */}
        <div className="modal-field">
          <label className="modal-label">Zoom step (+ / − buttons)</label>
          <select className="annot-select" style={{ width: '100%', padding: '7px 10px', fontSize: 13 }}
            value={local.zoomStep ?? 0.25}
            onChange={e => setLocal(l => ({ ...l, zoomStep: parseFloat(e.target.value) }))}>
            <option value={0.1}>10% — fine</option>
            <option value={0.25}>25% — default</option>
            <option value={0.5}>50% — coarse</option>
          </select>
        </div>

        {/* Default zoom */}
        <div className="modal-field">
          <label className="modal-label">Default zoom when opening a file</label>
          <select className="annot-select" style={{ width: '100%', padding: '7px 10px', fontSize: 13 }}
            value={typeof local.defaultZoom === 'number' ? String(local.defaultZoom) : local.defaultZoom}
            onChange={e => {
              const v = e.target.value
              const zoom: DefaultZoom = v === 'fit-width' || v === 'fit-page'
                ? v : parseFloat(v)
              setLocal(l => ({ ...l, defaultZoom: zoom }))
            }}>
            <option value="fit-page">Fit Page</option>
            <option value="fit-width">Fit Width</option>
            <option value="0.5">50%</option>
            <option value="0.75">75%</option>
            <option value="1">100%</option>
            <option value="1.25">125%</option>
            <option value="1.5">150%</option>
            <option value="2">200%</option>
          </select>
          <span className="modal-hint">Currently: {zoomLabel(local.defaultZoom)}</span>
        </div>

        {/* Page render quality (supersampling) */}
        <div className="modal-field">
          <label className="modal-label">Page sharpness</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="range" min={1} max={5} step={1}
              value={local.renderQuality ?? 3}
              onChange={e => setLocal(l => ({ ...l, renderQuality: parseInt(e.target.value) }))}
              style={{ flex: 1 }} />
            <span style={{ fontSize: 12, minWidth: 64 }}>
              {(['Standard', 'Standard+', 'High', 'Very High', 'Ultra'] as const)[(local.renderQuality ?? 3) - 1]}
            </span>
          </div>
          <span className="modal-hint">
            Renders pages above screen resolution then downscales for crisper text. Higher = sharper
            but uses more memory — drop it if scrolling feels heavy.
          </span>
        </div>

        {/* OCR language */}
        <div className="modal-field">
          <label className="modal-label">Default OCR language</label>
          <select className="annot-select" style={{ width: '100%', padding: '7px 10px', fontSize: 13 }}
            value={local.ocrLanguage}
            onChange={e => setLocal(l => ({ ...l, ocrLanguage: e.target.value }))}>
            {OCR_LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>

        {/* Autosave */}
        <div className="modal-field">
          <label className="modal-label">Autosave interval</label>
          <select className="annot-select" style={{ width: '100%', padding: '7px 10px', fontSize: 13 }}
            value={local.autosaveIntervalMinutes}
            onChange={e => setLocal(l => ({ ...l, autosaveIntervalMinutes: parseInt(e.target.value) }))}>
            <option value={0}>Disabled</option>
            <option value={1}>Every 1 minute</option>
            <option value={2}>Every 2 minutes</option>
            <option value={5}>Every 5 minutes</option>
            <option value={10}>Every 10 minutes</option>
            <option value={30}>Every 30 minutes</option>
          </select>
          <span className="modal-hint">Autosave overwrites the current file when there are unsaved changes.</span>
        </div>

        {/* Page number badges */}
        <div className="modal-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={local.showPageNumbers}
              onChange={e => setLocal(l => ({ ...l, showPageNumbers: e.target.checked }))} />
            <span style={{ fontSize: 13 }}>Show page number badges on each page</span>
          </label>
        </div>

        {/* Rulers */}
        <div className="modal-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!local.showRulers}
              onChange={e => setLocal(l => ({ ...l, showRulers: e.target.checked }))} />
            <span style={{ fontSize: 13 }}>Show rulers on each page</span>
          </label>
        </div>

        {/* Grid */}
        <div className="modal-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!local.showGrid}
              onChange={e => setLocal(l => ({ ...l, showGrid: e.target.checked }))} />
            <span style={{ fontSize: 13 }}>Show grid on each page (1-inch grid)</span>
          </label>
        </div>

        {/* Restore last session */}
        <div className="modal-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!local.restoreLastSession}
              onChange={e => setLocal(l => ({ ...l, restoreLastSession: e.target.checked }))} />
            <span style={{ fontSize: 13 }}>Reopen the last file on launch</span>
          </label>
        </div>

        {/* Confirm redaction */}
        <div className="modal-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!local.confirmRedaction}
              onChange={e => setLocal(l => ({ ...l, confirmRedaction: e.target.checked }))} />
            <span style={{ fontSize: 13 }}>Warn before applying redactions</span>
          </label>
        </div>

        {/* Reduce motion */}
        <div className="modal-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!local.reduceMotion}
              onChange={e => setLocal(l => ({ ...l, reduceMotion: e.target.checked }))} />
            <span style={{ fontSize: 13 }}>Reduce motion (minimize animations)</span>
          </label>
        </div>

        {/* High contrast */}
        <div className="modal-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!local.highContrast}
              onChange={e => setLocal(l => ({ ...l, highContrast: e.target.checked }))} />
            <span style={{ fontSize: 13 }}>High contrast (stronger borders &amp; text)</span>
          </label>
        </div>

        {/* Autoscroll speed */}
        <div className="modal-field">
          <label className="modal-label">Autoscroll speed (0 = disabled)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="range" min={0} max={10} step={1}
              value={local.autoscrollSpeed ?? 0}
              onChange={e => setLocal(l => ({ ...l, autoscrollSpeed: parseInt(e.target.value) }))}
              style={{ flex: 1 }} />
            <span style={{ fontSize: 12, minWidth: 24 }}>{local.autoscrollSpeed ?? 0}</span>
          </div>
          <span className="modal-hint">Enable with the ▶▶ button in the status bar while a PDF is open.</span>
        </div>

        {/* Dark page mode */}
        <div className="modal-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!local.darkPageMode}
              onChange={e => setLocal(l => ({ ...l, darkPageMode: e.target.checked }))} />
            <span style={{ fontSize: 13 }}>Dark page mode (invert page colors for night reading)</span>
          </label>
        </div>

        {/* Loupe */}
        <div className="modal-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!local.loupeEnabled}
              onChange={e => setLocal(l => ({ ...l, loupeEnabled: e.target.checked }))} />
            <span style={{ fontSize: 13 }}>Enable loupe / magnifier (follows cursor over PDF pages)</span>
          </label>
        </div>

        {/* Measure unit */}
        <div className="modal-field">
          <label className="modal-label">Measurement unit</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select className="annot-select" style={{ flex: 1, padding: '7px 10px', fontSize: 13 }}
              value={local.measureUnit ?? 'pt'}
              onChange={e => setLocal(l => ({ ...l, measureUnit: e.target.value }))}>
              <option value="pt">Points (pt) — default PDF unit</option>
              <option value="mm">Millimetres (mm)</option>
              <option value="cm">Centimetres (cm)</option>
              <option value="in">Inches (in)</option>
              <option value="px">Pixels (px) — at 72 dpi</option>
            </select>
          </div>
          <span className="modal-hint">Unit shown on new distance / area / perimeter measurements.</span>
        </div>

        {/* Measure scale */}
        <div className="modal-field">
          <label className="modal-label">Measurement scale factor</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="number" min={0.001} max={1000} step={0.001}
              value={local.measureScale ?? 1}
              onChange={e => setLocal(l => ({ ...l, measureScale: parseFloat(e.target.value) || 1 }))}
              style={{ width: 100, padding: '5px 8px', fontSize: 13,
                background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', borderRadius: 4 }} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              × (e.g. 0.3528 to convert pt → mm)
            </span>
          </div>
          <span className="modal-hint">Multiply raw PDF point values by this factor before displaying measurements.</span>
        </div>

        {/* Anthropic API key */}
        <div className="modal-field settings-span-2">
          <label className="modal-label">Anthropic API key (for AI Assistant)</label>
          <input type="password" className="modal-input" style={{ fontSize: 12 }}
            value={(local as any).anthropicApiKey ?? ''}
            onChange={e => setLocal(l => ({ ...l, anthropicApiKey: e.target.value } as any))}
            placeholder="sk-ant-…  (stored locally, only sent to Anthropic)" />
          <span className="modal-hint">Get yours at console.anthropic.com</span>
        </div>

        {/* RTL text direction */}
        <div className="modal-field settings-span-2">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!(local as any).rtlText}
              onChange={e => setLocal(l => ({ ...l, rtlText: e.target.checked } as any))} />
            <span style={{ fontSize: 13 }}>Right-to-left (RTL) text for typewriter and text-box tools</span>
          </label>
          <span className="modal-hint">Enable for Arabic, Hebrew, Persian, Urdu, etc.</span>
        </div>
        </div>{/* /settings-body */}

        <div className="settings-footer">
          <button className="modal-btn-secondary" onClick={reset} style={{ marginRight: 'auto' }}>
            Reset to defaults
          </button>
          <button className="modal-btn-secondary" title="Export settings to a JSON file"
            onClick={() => {
              const json = JSON.stringify(local, null, 2)
              const blob = new Blob([json], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url; a.download = 'monstera-settings.json'; a.click()
              URL.revokeObjectURL(url)
            }}>
            <Upload size={14} /> Export
          </button>
          <label className="modal-btn-secondary" style={{ cursor: 'pointer' }} title="Import settings from a JSON file">
            <Download size={14} /> Import
            <input type="file" accept=".json" style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0]; if (!file) return
                const reader = new FileReader()
                reader.onload = ev => {
                  try {
                    const parsed = JSON.parse(ev.target?.result as string)
                    setLocal(l => ({ ...l, ...parsed }))
                  } catch { /* ignore bad JSON */ }
                }
                reader.readAsText(file)
                e.target.value = ''
              }} />
          </label>
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={apply}>Apply</button>
        </div>
      </div>
    </div>
  )
}
