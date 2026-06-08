import { AlertTriangle } from 'lucide-react'

interface Props {
  count: number
  onConfirm: () => void
  onCancel: () => void
}

export default function RedactConfirmDialog({ count, onConfirm, onCancel }: Props) {
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 460, borderColor: '#f48771' }}>
        <div className="modal-title" style={{ color: '#f48771', display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={20} /> Permanent Redaction Warning
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7, marginBottom: 16 }}>
          You are about to <strong>permanently remove</strong> the content under{' '}
          <strong>{count} redaction mark{count !== 1 ? 's' : ''}</strong>.
        </div>

        <ul style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.8, paddingLeft: 20, marginBottom: 16 }}>
          <li>Text and images under the marked areas will be <strong>permanently deleted</strong> from the file.</li>
          <li>This is <strong>irreversible</strong> — the removed content cannot be recovered after saving.</li>
          <li>Redacted areas are replaced with solid black fills.</li>
          <li>You should verify the result before sharing the file.</li>
        </ul>

        <div style={{
          padding: '10px 14px',
          background: 'rgba(244,135,113,0.1)',
          border: '1px solid rgba(244,135,113,0.3)',
          borderRadius: 4, fontSize: 12, color: '#f48771', marginBottom: 18,
        }}>
          The content cannot be recovered by copy-paste, text extraction, or any other means after the redaction is applied.
        </div>

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onCancel}>Cancel</button>
          <button
            style={{
              padding: '6px 16px', background: '#c0392b', border: 'none',
              borderRadius: 4, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
            onClick={onConfirm}
          >
            Apply Redactions Permanently
          </button>
        </div>
      </div>
    </div>
  )
}
