import { useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'

interface Props { onClose: () => void }

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export default function OptimizeDialog({ onClose }: Props) {
  const getBakedBytes = usePdfStore(s => s.getBakedBytes)
  const applyEdit = usePdfStore(s => s.applyEdit)
  const [status, setStatus] = useState('')
  const [result, setResult] = useState<{ origSize: number; newSize: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const handleOptimize = async () => {
    setBusy(true)
    setStatus('Optimizing…')
    try {
      const bytes = await getBakedBytes()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (window.electronAPI as any).mupdfOptimize(bytes.buffer as ArrayBuffer)
      applyEdit(new Uint8Array(res.bytes))
      setResult({ origSize: res.origSize, newSize: res.newSize })
      const saved = res.origSize - res.newSize
      setStatus(saved > 0
        ? `Saved ${fmtSize(saved)} (${Math.round(saved / res.origSize * 100)}% smaller)`
        : 'File is already well-compressed — minimal reduction achieved.')
    } catch (e: unknown) {
      setStatus(`Error: ${(e as Error).message}`)
    }
    setBusy(false)
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 400 }}>
        <div className="modal-title">🗜 Optimize PDF</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Removes unused objects, deduplicates resources, and compresses streams.
          Document content and appearance are unchanged.
        </p>
        {result && (
          <div style={{ display: 'flex', gap: 20, fontSize: 13, marginBottom: 10, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
            <span>Before: <strong>{fmtSize(result.origSize)}</strong></span>
            <span>→</span>
            <span>After: <strong style={{ color: result.newSize < result.origSize ? 'var(--accent)' : 'var(--text-primary)' }}>{fmtSize(result.newSize)}</strong></span>
          </div>
        )}
        {status && (
          <div style={{ fontSize: 12, color: status.startsWith('Error') ? 'var(--error, #f55)' : status.startsWith('Saved') ? 'var(--accent)' : 'var(--text-muted)', marginBottom: 8 }}>
            {status}
          </div>
        )}
        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Close</button>
          {!result && (
            <button className="modal-btn-primary" onClick={handleOptimize} disabled={busy}>
              {busy ? 'Optimizing…' : '🗜 Optimize Now'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
