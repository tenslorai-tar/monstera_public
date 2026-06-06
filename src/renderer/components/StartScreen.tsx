import type { RecentFile } from '../hooks/useRecentFiles'

interface Props {
  recentFiles: RecentFile[]
  onOpen: () => void
  onOpenRecent: (filePath: string) => void
  onRemoveRecent: (filePath: string) => void
  openError?: string
  onClearError?: () => void
}

const MonsteraLogoSvg = () => (
  <svg width="64" height="64" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="48" fill="url(#sLogoGrad)" stroke="rgba(74,222,128,0.35)" strokeWidth="2"/>
    <circle cx="36" cy="30" r="10" fill="rgba(255,255,255,0.12)"/>
    <path d="M30 74 Q40 52 50 40 Q57 30 64 25" stroke="#4a7a1e" strokeWidth="5.5" strokeLinecap="round" fill="none"/>
    <ellipse cx="66" cy="23" rx="15" ry="9" transform="rotate(-30 66 23)" fill="url(#sLeaf1)"/>
    <ellipse cx="57" cy="37" rx="14" ry="8.5" transform="rotate(20 57 37)" fill="url(#sLeaf2)"/>
    <ellipse cx="46" cy="51" rx="13" ry="7.5" transform="rotate(-15 46 51)" fill="url(#sLeaf1)"/>
    <ellipse cx="36" cy="63" rx="11" ry="6.5" transform="rotate(10 36 63)" fill="url(#sLeaf2)"/>
    <defs>
      <radialGradient id="sLogoGrad" cx="32%" cy="28%" r="68%">
        <stop offset="0%" stopColor="#1e5c3e"/>
        <stop offset="100%" stopColor="#091f14"/>
      </radialGradient>
      <linearGradient id="sLeaf1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#d4f448"/>
        <stop offset="100%" stopColor="#80bb1e"/>
      </linearGradient>
      <linearGradient id="sLeaf2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#b8e830"/>
        <stop offset="100%" stopColor="#5e8a16"/>
      </linearGradient>
    </defs>
  </svg>
)

export default function StartScreen({
  recentFiles, onOpen, onOpenRecent, onRemoveRecent, openError, onClearError,
}: Props) {
  return (
    <div className="start-screen">
      <div className="start-logo">
        <MonsteraLogoSvg />
      </div>

      <div style={{ textAlign: 'center' }}>
        <h1 className="start-title">Monstera PDF Editor</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 6, fontWeight: 500 }}>
          Professional PDF editing for everyone
        </p>
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
