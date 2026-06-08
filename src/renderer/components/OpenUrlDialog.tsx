import { useState } from 'react'
import StatusText from './StatusText'
import { Globe } from 'lucide-react'

interface Props {
  onClose: () => void
  onOpen: (bytes: Uint8Array, name: string) => void
}

export default function OpenUrlDialog({ onClose, onOpen }: Props) {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const handleDownload = async () => {
    const trimmed = url.trim()
    if (!trimmed) return
    setBusy(true)
    setStatus('Downloading…')
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const buf = await (window.electronAPI as any).openFromUrl(trimmed)
      const rawName = trimmed.split('/').pop()?.split('?')[0] ?? 'downloaded.pdf'
      const name = rawName.endsWith('.pdf') ? rawName : rawName + '.pdf'
      onOpen(new Uint8Array(buf), name)
      onClose()
    } catch (e: unknown) {
      setStatus(`Error: ${(e as Error).message}`)
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 460 }}>
        <div className="modal-title"><Globe size={18} /> Open PDF from URL</div>
        <div className="modal-field">
          <label className="modal-label">PDF URL</label>
          <input className="modal-input" type="url" value={url} autoFocus
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleDownload()}
            placeholder="https://example.com/document.pdf" />
        </div>
        {status && (
          <div style={{ fontSize: 12, color: status.startsWith('Error') ? 'var(--error, #f55)' : 'var(--text-muted)', marginBottom: 8 }}>
            <StatusText status={status} />
          </div>
        )}
        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleDownload} disabled={busy || !url.trim()}>
            {busy ? 'Downloading…' : 'Download & Open'}
          </button>
        </div>
      </div>
    </div>
  )
}
