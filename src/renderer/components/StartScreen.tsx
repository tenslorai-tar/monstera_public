import type { RecentFile } from '../hooks/useRecentFiles'
import logoUrl from '../assets/monstera-logo.png'

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
      <div className="start-brand">
        <div className="start-logo">
          <img src={logoUrl} alt="Monstera" className="start-logo-img" draggable={false} />
        </div>
        <h1 className="start-title">Monstera</h1>
        <div className="start-subtitle">PDF EDITOR</div>
        <p className="start-tagline">Professional PDF editing for everyone</p>
      </div>

      <button className="btn-primary start-open-btn" onClick={onOpen}>
        📂 Open PDF…
        <span className="shortcut-hint">Ctrl+O</span>
      </button>

      {openError && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.35)',
          borderRadius: 8, padding: '10px 14px', maxWidth: 520, width: '100%',
        }}>
          <span style={{ color: '#f87171', fontSize: 18 }}>⚠</span>
          <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>{openError}</span>
          <button onClick={onClearError} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: 14, padding: '0 2px',
          }}>✕</button>
        </div>
      )}

      {/* Feature grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
        maxWidth: 560, width: '100%',
      }}>
        {[
          { icon: '✏', label: 'Annotate & mark up' },
          { icon: '📋', label: 'Fill & create forms' },
          { icon: '🔍', label: 'OCR scanned pages' },
          { icon: '✂', label: 'Split & merge' },
          { icon: '🔒', label: 'Encrypt & sign' },
          { icon: '↗', label: 'Export to images' },
        ].map(({ icon, label }) => (
          <div key={label} style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '10px 13px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 12.5, fontWeight: 500,
            color: 'var(--text-secondary)',
            transition: 'border-color 0.15s',
          }}>
            <span style={{ fontSize: 16 }}>{icon}</span>
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

      <div style={{ marginTop: 'auto', paddingTop: 20, fontSize: 12, color: 'var(--text-muted)' }}>
        Press <kbd style={{
          padding: '2px 6px', borderRadius: 4, fontSize: 11,
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          fontFamily: 'inherit',
        }}>F1</kbd> for keyboard shortcuts
      </div>
    </div>
  )
}
