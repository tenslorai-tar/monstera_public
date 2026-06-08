import { useState } from 'react'
import StatusText from './StatusText'
import { RefreshCw } from 'lucide-react'
import { PDFDocument } from 'pdf-lib'

interface Props {
  numPages: number
  currentPage: number
  onReplace: (pageNum: number, srcBytes: Uint8Array, srcPageNum: number) => void
  onClose: () => void
}

export default function ReplacePageDialog({ numPages, currentPage, onReplace, onClose }: Props) {
  const [targetPage, setTargetPage] = useState(String(currentPage))
  const [srcPageNum, setSrcPageNum] = useState('1')
  const [srcFile, setSrcFile] = useState('')
  const [srcBytes, setSrcBytes] = useState<Uint8Array | null>(null)
  const [srcNumPages, setSrcNumPages] = useState(0)
  const [status, setStatus] = useState('')

  const browseFile = async () => {
    const path = await window.electronAPI.openFileDialog()
    if (!path) return
    try {
      const buf = await window.electronAPI.readFileBytes(path)
      const bytes = new Uint8Array(buf)
      const doc = await PDFDocument.load(bytes)
      setSrcBytes(bytes)
      setSrcFile(path.split(/[\\/]/).pop() ?? path)
      setSrcNumPages(doc.getPageCount())
      setStatus('')
    } catch (e: unknown) {
      setStatus(`Could not load file: ${(e as Error).message}`)
    }
  }

  const handleReplace = () => {
    const tp = parseInt(targetPage, 10)
    const sp = parseInt(srcPageNum, 10)
    if (!srcBytes) { setStatus('Please select a source PDF first.'); return }
    if (isNaN(tp) || tp < 1 || tp > numPages) { setStatus(`Target page must be 1–${numPages}.`); return }
    if (isNaN(sp) || sp < 1 || sp > srcNumPages) { setStatus(`Source page must be 1–${srcNumPages}.`); return }
    onReplace(tp, srcBytes, sp)
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 420 }}>
        <div className="modal-title"><RefreshCw size={18} /> Replace Page</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Replace a page in the current document with a page from another PDF file.
        </p>

        <div className="modal-field">
          <label className="modal-label">Page to replace (1–{numPages})</label>
          <input className="modal-input" type="number" min={1} max={numPages}
            value={targetPage} onChange={e => setTargetPage(e.target.value)} />
        </div>

        <div className="modal-field">
          <label className="modal-label">Source PDF file</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ flex: 1, fontSize: 12, color: srcFile ? 'var(--text-primary)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {srcFile || 'No file selected'}
            </span>
            <button className="modal-btn-secondary" onClick={browseFile} style={{ flexShrink: 0 }}>Browse…</button>
          </div>
        </div>

        {srcNumPages > 0 && (
          <div className="modal-field">
            <label className="modal-label">Source page number (1–{srcNumPages})</label>
            <input className="modal-input" type="number" min={1} max={srcNumPages}
              value={srcPageNum} onChange={e => setSrcPageNum(e.target.value)} />
          </div>
        )}

        {status && (
          <div style={{ fontSize: 12, color: 'var(--error, #f55)', marginBottom: 8 }}><StatusText status={status} /></div>
        )}

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleReplace} disabled={!srcBytes}>
            <RefreshCw size={15} /> Replace Page
          </button>
        </div>
      </div>
    </div>
  )
}
