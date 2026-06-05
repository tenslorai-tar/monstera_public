import { useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'

interface CommentStyle {
  id: string
  name: string
  color: string
  opacity: number
  lineWidth: number
  fontSize: number
}

const STORAGE_KEY = 'monstera-comment-styles'

function loadStyles(): CommentStyle[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveStyles(styles: CommentStyle[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(styles))
}

interface Props {
  onClose: () => void
}

export default function CommentStylesPanel({ onClose }: Props) {
  const toolColor    = usePdfStore(s => s.toolColor)
  const toolOpacity  = usePdfStore(s => s.toolOpacity)
  const toolLineWidth = usePdfStore(s => s.toolLineWidth)
  const toolFontSize = usePdfStore(s => s.toolFontSize)

  const setToolColor     = usePdfStore(s => s.setToolColor)
  const setToolOpacity   = usePdfStore(s => s.setToolOpacity)
  const setToolLineWidth = usePdfStore(s => s.setToolLineWidth)
  const setToolFontSize  = usePdfStore(s => s.setToolFontSize)

  const [styles, setStyles] = useState<CommentStyle[]>(loadStyles)
  const [newName, setNewName] = useState('')

  const saveNew = () => {
    const name = newName.trim() || `Style ${styles.length + 1}`
    const s: CommentStyle = {
      id: Math.random().toString(36).slice(2),
      name,
      color: toolColor,
      opacity: toolOpacity,
      lineWidth: toolLineWidth,
      fontSize: toolFontSize,
    }
    const updated = [...styles, s]
    setStyles(updated)
    saveStyles(updated)
    setNewName('')
  }

  const applyStyle = (s: CommentStyle) => {
    setToolColor(s.color)
    setToolOpacity(s.opacity)
    setToolLineWidth(s.lineWidth)
    setToolFontSize(s.fontSize)
  }

  const deleteStyle = (id: string) => {
    const updated = styles.filter(s => s.id !== id)
    setStyles(updated)
    saveStyles(updated)
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 340 }}>
        <div className="modal-title">🎨 Comment Styles</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          Save and reuse annotation style presets.
        </p>

        {/* Save current style */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, alignItems: 'center' }}>
          <input
            className="modal-input"
            style={{ flex: 1, marginBottom: 0 }}
            placeholder="Preset name…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveNew() }}
          />
          <div style={{ width: 22, height: 22, borderRadius: 3, background: toolColor,
            border: '1px solid var(--border)', flexShrink: 0 }} />
          <button className="modal-btn-primary" onClick={saveNew} style={{ padding: '4px 10px', whiteSpace: 'nowrap' }}>
            Save Current
          </button>
        </div>

        {/* Presets list */}
        <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {styles.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 16 }}>
              No saved styles yet. Adjust tool settings and save.
            </div>
          )}
          {styles.map(s => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
              background: 'var(--bg-secondary)', borderRadius: 4, border: '1px solid var(--border)',
            }}>
              <div style={{ width: 18, height: 18, borderRadius: 3, background: s.color,
                opacity: s.opacity, border: '1px solid var(--border)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {s.color} · {Math.round(s.opacity * 100)}% · {s.lineWidth}px · {s.fontSize}pt
                </div>
              </div>
              <button
                onClick={() => applyStyle(s)}
                style={{ padding: '2px 8px', fontSize: 11, background: 'var(--accent-dim)',
                  border: '1px solid var(--accent)', borderRadius: 3, color: 'var(--accent)', cursor: 'pointer' }}>
                Apply
              </button>
              <button
                onClick={() => deleteStyle(s.id)}
                style={{ padding: '2px 6px', fontSize: 11, background: 'var(--danger-dim)',
                  border: '1px solid var(--danger)', borderRadius: 3, color: 'var(--danger)', cursor: 'pointer' }}>
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="modal-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
