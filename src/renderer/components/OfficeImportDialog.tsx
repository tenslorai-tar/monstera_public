import { useState, useEffect } from 'react'
import { Import } from 'lucide-react'
import { usePdfStore } from '../store/usePdfStore'

interface Props { onClose: () => void }

type ImportType = 'word' | 'excel' | 'pptx' | 'other'

const TYPE_META: Record<ImportType, { label: string; icon: string; ext: string[] }> = {
  word:  { label: 'Word',       icon: '📝', ext: ['docx','doc','odt','rtf'] },
  excel: { label: 'Excel',      icon: '📊', ext: ['xlsx','xls','ods','csv'] },
  pptx:  { label: 'PowerPoint', icon: '📽', ext: ['pptx','ppt','odp'] },
  other: { label: 'Other',      icon: '📄', ext: ['*'] },
}

export default function OfficeImportDialog({ onClose }: Props) {
  const applyEdit = usePdfStore(s => s.applyEdit)
  const loadPdf   = usePdfStore(s => s.loadPdf)

  const [type,     setType]     = useState<ImportType>('word')
  const [filePath, setFilePath] = useState('')
  const [status,   setStatus]   = useState('')
  const [busy,     setBusy]     = useState(false)
  const [mode,     setMode]     = useState<'new'|'append'>('new')
  const [loAvail,  setLoAvail]  = useState<boolean | null>(null)

  const api = window.electronAPI as unknown as {
    libreofficeIsAvailable: () => Promise<boolean>
    libreofficeImportFile:  (p: string) => Promise<ArrayBuffer>
    openOfficeFileDialog:   () => Promise<string | null>
    openAnyFile:            (f: unknown[]) => Promise<string | null>
    readFileBytes:          (p: string) => Promise<ArrayBuffer>
    importDocx:             (b: ArrayBuffer) => Promise<ArrayBuffer>
    importXlsx:             (b: ArrayBuffer) => Promise<ArrayBuffer>
    importDocxSmart:        (p: string) => Promise<ArrayBuffer>
    binsOpenUrl:            (url: string) => Promise<void>
  }

  useEffect(() => {
    api.libreofficeIsAvailable().then(setLoAvail).catch(() => setLoAvail(false))
  }, [])

  const browse = async () => {
    const meta = TYPE_META[type]
    const filters = type === 'other'
      ? [{ name: 'Office Documents', extensions: ['docx','doc','xlsx','xls','pptx','ppt','odt','ods','odp','rtf','csv'] }]
      : [{ name: `${meta.label} Files`, extensions: meta.ext }]
    const p = await api.openAnyFile(filters)
    if (p) { setFilePath(p); setStatus('') }
  }

  const doImport = async () => {
    if (!filePath) { setStatus('Please select a file first.'); return }
    setBusy(true)
    const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
    setStatus(loAvail ? 'Converting with LibreOffice (full layout fidelity)…' : 'Converting…')
    try {
      let pdfBytes: ArrayBuffer

      if (loAvail) {
        // LibreOffice: best quality for all Office formats
        pdfBytes = await api.libreofficeImportFile(filePath)
      } else if (['docx','doc','odt','rtf'].includes(ext)) {
        pdfBytes = await api.importDocxSmart(filePath)
      } else if (['xlsx','xls','csv'].includes(ext)) {
        const srcBytes = await api.readFileBytes(filePath)
        pdfBytes = await api.importXlsx(srcBytes)
      } else {
        throw new Error('LibreOffice is required to import this file type. Install it via Tools → Native Tools Setup.')
      }

      const name = filePath.split(/[\\/]/).pop()?.replace(/\.\w+$/, '.pdf') ?? 'imported.pdf'

      if (mode === 'new') {
        await loadPdf(pdfBytes, name, name)
      } else {
        applyEdit(new Uint8Array(pdfBytes))
      }
      setStatus('✓ Imported successfully.')
      setTimeout(onClose, 1200)
    } catch (e: unknown) {
      setStatus(`Error: ${(e as Error).message}`)
    }
    setBusy(false)
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 480 }}>
        <div className="modal-title"><Import size={18} /> Import Office Document</div>

        {/* LibreOffice status badge */}
        {loAvail !== null && (
          <div style={{
            marginBottom: 14, padding: '8px 12px', borderRadius: 6, fontSize: 11,
            background: loAvail ? 'rgba(76,175,80,0.08)' : 'rgba(255,112,67,0.08)',
            border: `1px solid ${loAvail ? 'rgba(76,175,80,0.3)' : 'rgba(255,112,67,0.3)'}`,
            color: 'var(--text)',
          }}>
            {loAvail
              ? '✓ LibreOffice detected — full layout fidelity for Word, Excel, PowerPoint, and more.'
              : '⚠ LibreOffice not found. Word and Excel use a simplified converter. For full layout fidelity, '}
            {!loAvail && (
              <button style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11, padding: 0, textDecoration: 'underline' }}
                onClick={() => api.binsOpenUrl('https://www.libreoffice.org/download/download/')}>
                install LibreOffice
              </button>
            )}
            {!loAvail && '.'}
          </div>
        )}

        {/* Format tabs */}
        <div className="modal-field">
          <label className="modal-label">Document type</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {(Object.entries(TYPE_META) as [ImportType, typeof TYPE_META[ImportType]][]).map(([k, v]) => (
              <button key={k}
                onClick={() => { setType(k); setFilePath(''); setStatus('') }}
                disabled={!loAvail && k === 'pptx'}
                style={{
                  flex: 1, padding: '7px 4px', border: '1px solid', borderRadius: 5, cursor: loAvail || k !== 'pptx' ? 'pointer' : 'not-allowed', fontSize: 12,
                  borderColor: type === k ? 'var(--accent)' : 'var(--border)',
                  background: type === k ? 'rgba(74,158,255,0.12)' : 'var(--bg-secondary)',
                  color: (!loAvail && k === 'pptx') ? 'var(--text-muted)' : type === k ? 'var(--accent)' : 'var(--text-primary)',
                  fontWeight: type === k ? 600 : 400,
                  opacity: (!loAvail && k === 'pptx') ? 0.5 : 1,
                }}>
                {v.icon} {v.label}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-field">
          <label className="modal-label">File</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              color: filePath ? 'var(--text-primary)' : 'var(--text-muted)', alignSelf: 'center' }}>
              {filePath ? filePath.split(/[\\/]/).pop() : 'No file selected'}
            </span>
            <button className="modal-btn-secondary" onClick={browse}>Browse…</button>
          </div>
        </div>

        <div className="modal-field">
          <label className="modal-label">Import as</label>
          <div style={{ display: 'flex', gap: 16 }}>
            {(['new', 'append'] as const).map(m => (
              <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" name="importMode" value={m} checked={mode === m} onChange={() => setMode(m)} />
                {m === 'new' ? 'Open as new document' : 'Append to current PDF'}
              </label>
            ))}
          </div>
        </div>

        {status && (
          <div style={{ fontSize: 12, marginBottom: 8,
            color: status.startsWith('✓') ? '#4caf50' : status.startsWith('Error') ? '#ff4444' : 'var(--text-muted)' }}>
            {status}
          </div>
        )}

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={doImport} disabled={busy || !filePath}>
            {busy ? 'Converting…' : '📥 Import'}
          </button>
        </div>
      </div>
    </div>
  )
}
