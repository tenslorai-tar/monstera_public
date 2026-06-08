import type { RecentFile } from '../hooks/useRecentFiles'
import logoUrl from '../assets/monstera-logo.png'
import {
  FolderOpen, PenLine, FormInput, ScanText, Scissors, Lock, Upload,
  FileText, TriangleAlert, X, ArrowRight,
} from 'lucide-react'

interface Props {
  recentFiles: RecentFile[]
  onOpen: () => void
  onOpenRecent: (filePath: string) => void
  onRemoveRecent: (filePath: string) => void
  openError?: string
  onClearError?: () => void
}

const FEATURES = [
  { icon: PenLine,   label: 'Annotate & mark up' },
  { icon: FormInput, label: 'Fill & create forms' },
  { icon: ScanText,  label: 'OCR scanned pages' },
  { icon: Scissors,  label: 'Split & merge' },
  { icon: Lock,      label: 'Encrypt & sign' },
  { icon: Upload,    label: 'Export anywhere' },
]

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
        <p className="start-tagline">A modern PDF editor — built for the way you work.</p>
      </div>

      <button className="btn-primary start-open-btn" onClick={onOpen}>
        <FolderOpen size={18} />
        Open PDF…
        <span className="shortcut-hint">Ctrl+O</span>
      </button>

      {openError && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--danger-dim)', border: '1px solid color-mix(in srgb, var(--danger) 40%, transparent)',
          borderRadius: 10, padding: '10px 14px', maxWidth: 520, width: '100%',
        }}>
          <TriangleAlert size={18} style={{ color: 'var(--danger)', flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>{openError}</span>
          <button onClick={onClearError} style={{
            background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex',
            color: 'var(--text-muted)', padding: '0 2px',
          }}><X size={15} /></button>
        </div>
      )}

      {/* Feature grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
        maxWidth: 560, width: '100%',
      }}>
        {FEATURES.map(({ icon: Icon, label }) => (
          <div key={label} className="start-feature-card">
            <Icon size={17} style={{ color: 'var(--accent)', flexShrink: 0 }} />
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
                  <span className="recent-icon"><FileText size={17} /></span>
                  <span className="recent-name">{f.fileName}</span>
                  <span className="recent-path">{f.filePath}</span>
                  <ArrowRight size={15} className="recent-go" />
                </button>
                <button
                  className="recent-remove-btn"
                  onClick={e => { e.stopPropagation(); onRemoveRecent(f.filePath) }}
                  title="Remove from recent list"
                ><X size={14} /></button>
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
      <div style={{ paddingTop: 6, paddingBottom: 4, fontSize: 11, color: 'var(--text-dim, var(--text-muted))' }}>
        Monstera PDF Editor · © 2026 <strong style={{ fontWeight: 600 }}>Tenslor Inc.</strong>
      </div>
    </div>
  )
}
