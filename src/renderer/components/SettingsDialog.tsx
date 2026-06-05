import { useState } from 'react'
import { useSettingsStore } from '../store/useSettingsStore'
import type { Theme, DefaultZoom } from '../store/useSettingsStore'

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

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 440 }}>
        <div className="modal-title">⚙ Settings</div>

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
                  borderRadius: 5, cursor: 'pointer', fontSize: 13,
                  background: local.theme === t ? 'rgba(74,158,255,0.12)' : 'var(--bg-secondary)',
                  color: local.theme === t ? 'var(--accent)' : 'var(--text-primary)',
                  fontWeight: local.theme === t ? 600 : 400,
                }}>
                {t === 'dark' ? '🌙 Dark' : '☀ Light'}
              </button>
            ))}
          </div>
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

        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          <button className="modal-btn-secondary" onClick={reset} style={{ marginRight: 'auto' }}>
            Reset to defaults
          </button>
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={apply}>Apply</button>
        </div>
      </div>
    </div>
  )
}
