import type { RecentFile } from '../hooks/useRecentFiles'

interface Props {
  recentFiles: RecentFile[]
  onOpen: () => void
  onOpenRecent: (filePath: string) => void
  onRemoveRecent: (filePath: string) => void
}

export default function StartScreen({ recentFiles, onOpen, onOpenRecent, onRemoveRecent }: Props) {
  return (
    <div className="start-screen">
      <div className="start-logo">🌿</div>
      <h1 className="start-title">Monstera PDF Editor</h1>
      <button className="btn-primary start-open-btn" onClick={onOpen}>
        Open PDF…
        <span className="shortcut-hint">Ctrl+O</span>
      </button>

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
                  title="Remove from recent"
                >✕</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
