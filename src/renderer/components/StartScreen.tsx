import type { RecentFile } from '../hooks/useRecentFiles'

interface Props {
  recentFiles: RecentFile[]
  onOpen: () => void
  onOpenRecent: (filePath: string) => void
  onRemoveRecent: (filePath: string) => void
  openError?: string
  onClearError?: () => void
}

export default function StartScreen({
  recentFiles, onOpen, onOpenRecent, onRemoveRecent, openError, onClearError,
}: Props) {
  return (
    <div className="start-screen">
      <div className="start-logo">🌿</div>
      <h1 className="start-title">Monstera PDF Editor</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '-4px 0 8px' }}>
        Full-featured personal PDF editor
      </p>

      <button className="btn-primary start-open-btn" onClick={onOpen}>
        📂 Open PDF…
        <span className="shortcut-hint">Ctrl+O</span>
      </button>

      {openError && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(244,135,113,0.12)', border: '1px solid rgba(244,135,113,0.4)',
          borderRadius: 6, padding: '10px 14px', maxWidth: 500, width: '100%',
        }}>
          <span style={{ color: '#f48771', fontSize: 18 }}>⚠</span>
          <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>{openError}</span>
          <button onClick={onClearError} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: 14, padding: '0 2px',
          }}>✕</button>
        </div>
      )}

      {/* Quick-start hints */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10,
        maxWidth: 600, width: '100%', marginTop: 8,
      }}>
        {[
          { icon: '✏', label: 'Annotate & mark up' },
          { icon: '📋', label: 'Fill & create forms' },
          { icon: '🔍', label: 'OCR scanned pages' },
          { icon: '✂', label: 'Split & merge pages' },
          { icon: '🔒', label: 'Encrypt & sign' },
          { icon: '↗', label: 'Export to images' },
        ].map(({ icon, label }) => (
          <div key={label} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', background: 'var(--bg-secondary)',
            border: '1px solid var(--border)', borderRadius: 6, fontSize: 12,
            color: 'var(--text-muted)',
          }}>
            <span style={{ fontSize: 15 }}>{icon}</span>
            {label}
          </div>
        ))}
      </div>

      {recentFiles.length > 0 && (
        <div className="recent-files">
          <h2 className="recent-header">Recent Files</h2>
          <ul className="recent-list">
            {recentFiles.map(f => (
              <li key={f.filePath} className="recent-item">
                <button
                  className="recent-file-btn"
                  onClick={() => onOpenRecent(f.filePath)}
                  title={f.filePath}
                >
                  <span className="recent-icon">📄</span>
                  <span className="recent-name">{f.fileName}</span>
                  <span className="recent-path">{f.filePath}</span>
                </button>
                <button
                  className="recent-remove-btn"
                  onClick={e => { e.stopPropagation(); onRemoveRecent(f.filePath) }}
                  title="Remove from recent list"
                >✕</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 'auto', paddingTop: 24, fontSize: 11, color: 'var(--text-muted)' }}>
        Press <kbd style={{
          padding: '1px 5px', borderRadius: 3, fontSize: 10,
          background: 'var(--bg-toolbar)', border: '1px solid var(--border)',
        }}>F1</kbd> for keyboard shortcuts
      </div>
    </div>
  )
}
