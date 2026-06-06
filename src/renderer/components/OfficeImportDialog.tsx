import { useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'

interface Props { onClose: () => void }

type ImportType = 'docx' | 'xlsx'

export default function OfficeImportDialog({ onClose }: Props) {
  const applyEdit   = usePdfStore(s => s.applyEdit)
  const loadPdf     = usePdfStore(s => s.loadPdf)

  const [type,     setType]     = useState<ImportType>('docx')
  const [filePath, setFilePath] = useState('')
  const [status,   setStatus]   = useState('')
  const [busy,     setBusy]     = useState(false)
  const [mode,     setMode]     = useState<'new' | 'append'>('new')

  const browse = async () => {
    const filters = type === 'docx'
      ? [{ name: 'Word Documents', extensions: ['docx', 'doc'] }]
      : [{ name: 'Excel Spreadsheets', extensions: ['xlsx', 'xls', 'csv'] }]
    const path = await (window.electronAPI as any).openAnyFile(filters)
    if (path) { setFilePath(path); setStatus('') }
  }

  const doImport = async () => {
    if (!filePath) { setStatus('Please select a file first.'); return }
    setBusy(true)
    setStatus('Converting…')
    try {
      const srcBytes = await window.electronAPI.readFileBytes(filePath)
      const pdfBytes: ArrayBuffer = type === 'docx'
        ? await (window.electronAPI as any).importDocx(srcBytes)
        : await (window.electronAPI as any).importXlsx(srcBytes)

      const name = filePath.split(/[\\/]/).pop()?.replace(/\.(docx?|xlsx?|csv)$/i, '.pdf') ?? 'imported.pdf'

      if (mode === 'new') {
        await loadPdf(pdfBytes, name, name)
      } else {
        applyEdit(new Uint8Array(pdfBytes))
      }

      setStatus('✓ Imported successfully.')
      setTimeout(() => { onClose() }, 1200)
    } catch (e: unknown) {
      setStatus(`Error: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 460 }}>
        <div className="modal-title">📥 Import Office Document</div>

        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          Convert a Word or Excel file to PDF. Layout is best-effort — complex formatting may differ from the original.
        </p>

        {/* Type selector */}
        <div className="modal-field">
          <label className="modal-label">File type</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['docx', 'xlsx'] as ImportType[]).map(t => (
              <button key={t}
                onClick={() => { setType(t); setFilePath('') }}
                style={{
                  flex: 1, padding: '8px 0', border: '1px solid',
                  borderColor: type === t ? 'var(--accent)' : 'var(--border)',
                  borderRadius: 5, cursor: 'pointer', fontSize: 13,
                  background: type === t ? 'rgba(74,158,255,0.12)' : 'var(--bg-secondary)',
                  color: type === t ? 'var(--accent)' : 'var(--text-primary)',
                  fontWeight: type === t ? 600 : 400,
                }}>
                {t === 'docx' ? '📝 Word (.docx)' : '📊 Excel (.xlsx)'}
              </button>
            ))}
          </div>
        </div>

        {/* File picker */}
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

        {/* Import mode */}
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
