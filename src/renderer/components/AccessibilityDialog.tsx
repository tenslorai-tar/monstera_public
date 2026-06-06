import { useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'

interface Issue { issue: string; severity: 'error' | 'warning' | 'info'; page?: number }

const SEVERITY_ICON: Record<Issue['severity'], string> = {
  error:   '✗',
  warning: '⚠',
  info:    'ℹ',
}
const SEVERITY_COLOR: Record<Issue['severity'], string> = {
  error:   '#f44336',
  warning: '#ff9800',
  info:    '#4a9eff',
}

export default function AccessibilityDialog({ onClose }: { onClose: () => void }) {
  const pdfBytes = usePdfStore(s => s.pdfBytes)
  const [issues, setIssues]   = useState<Issue[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const runCheck = async () => {
    if (!pdfBytes) return
    setLoading(true)
    setError('')
    setIssues(null)
    try {
      const result = await window.electronAPI.mupdfCheckAccessibility(pdfBytes.buffer as ArrayBuffer)
      setIssues(result)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const counts = issues ? {
    errors:   issues.filter(i => i.severity === 'error').length,
    warnings: issues.filter(i => i.severity === 'warning').length,
    info:     issues.filter(i => i.severity === 'info').length,
  } : null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 560, maxHeight: '75vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>Accessibility Checker</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <p style={{ fontSize: 12, opacity: 0.7, margin: '0 0 8px 0' }}>
            Checks for common PDF accessibility issues such as missing title, no language,
            image-only pages, and missing bookmarks.
          </p>
          <button className="modal-btn" onClick={runCheck} disabled={loading || !pdfBytes}>
            {loading ? 'Checking…' : 'Run Accessibility Check'}
          </button>
          {counts && (
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12 }}>
              <span style={{ color: SEVERITY_COLOR.error }}>{counts.errors} error{counts.errors !== 1 ? 's' : ''}</span>
              <span style={{ color: SEVERITY_COLOR.warning }}>{counts.warnings} warning{counts.warnings !== 1 ? 's' : ''}</span>
              <span style={{ color: SEVERITY_COLOR.info }}>{counts.info} info</span>
            </div>
          )}
          {error && <div style={{ color: '#f44336', fontSize: 12, marginTop: 6 }}>{error}</div>}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
          {issues === null && !loading && (
            <div style={{ opacity: 0.5, fontSize: 13, padding: 12 }}>
              Click "Run Accessibility Check" to analyze the document.
            </div>
          )}
          {issues?.map((issue, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 0',
              borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
              <span style={{ color: SEVERITY_COLOR[issue.severity], fontWeight: 700, flexShrink: 0, fontSize: 16 }}>
                {SEVERITY_ICON[issue.severity]}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13 }}>{issue.issue}</div>
                {issue.page && (
                  <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>Page {issue.page}</div>
                )}
              </div>
              <span style={{ fontSize: 11, opacity: 0.4, flexShrink: 0, textTransform: 'capitalize' }}>
                {issue.severity}
              </span>
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button className="modal-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
