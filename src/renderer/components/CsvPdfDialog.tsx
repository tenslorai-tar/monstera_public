import { useState } from 'react'
import { Table, FolderOpen } from 'lucide-react'
import { usePdfStore } from '../store/usePdfStore'

interface Props { onClose: () => void }

const EXAMPLE = `Name,Age,Department,Salary
Alice Johnson,32,Engineering,95000
Bob Smith,28,Marketing,72000
Carol White,45,Management,120000
David Brown,35,Engineering,88000
Eve Davis,29,Design,76000`

export default function CsvPdfDialog({ onClose }: Props) {
  const loadPdf       = usePdfStore(s => s.loadPdf)
  const applyEdit     = usePdfStore(s => s.applyEdit)
  const getBakedBytes = usePdfStore(s => s.getBakedBytes)
  const numPages      = usePdfStore(s => s.numPages)
  const pdfBytes      = usePdfStore(s => s.pdfBytes)

  const [text,       setText]       = useState(EXAMPLE)
  const [converting, setConverting] = useState(false)
  const [status,     setStatus]     = useState('')
  const [mode,       setMode]       = useState<'new' | 'append'>('new')

  const convert = async () => {
    if (!text.trim()) return
    setConverting(true); setStatus('Converting…')
    try {
      const bytes = await window.electronAPI.convertCsvToPdf(text)
      if (mode === 'new' || !pdfBytes) {
        await loadPdf(bytes, 'csv-export.pdf', 'csv-export.pdf')
        setStatus('✓ Created new PDF from CSV.')
      } else {
        const { PDFDocument } = await import('pdf-lib')
        const existingDoc = await PDFDocument.load(await getBakedBytes())
        const newDoc      = await PDFDocument.load(new Uint8Array(bytes))
        const pages       = await existingDoc.copyPages(newDoc, newDoc.getPageIndices())
        pages.forEach(p => existingDoc.addPage(p))
        applyEdit(new Uint8Array(await existingDoc.save()))
        setStatus(`✓ Appended ${pages.length} page(s) from CSV.`)
      }
    } catch (e: any) {
      setStatus(`Error: ${e?.message}`)
    } finally {
      setConverting(false)
    }
  }

  const openFile = async () => {
    const path = await window.electronAPI.openAnyFile([{ name: 'CSV / Text', extensions: ['csv', 'tsv', 'txt'] }])
    if (!path) return
    const bytes = await window.electronAPI.readFileBytes(path)
    setText(new TextDecoder().decode(bytes))
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 680, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-title"><Table size={18} /> CSV → PDF</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
          Paste CSV data or open a CSV file to convert it into a formatted PDF table.
          First row is treated as the header.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <button className="modal-btn-secondary" style={{ fontSize: 12 }} onClick={openFile}><FolderOpen size={14} /> Open CSV File</button>
          <button className="modal-btn-secondary" style={{ fontSize: 12 }} onClick={() => setText('')}>Clear</button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Output:</label>
            {(['new', 'append'] as const).map(m => (
              <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} />
                {m === 'new' ? 'New PDF' : `Append to open (${numPages}p)`}
              </label>
            ))}
          </div>
        </div>

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          style={{
            flex: 1, minHeight: 260, width: '100%', padding: 12, resize: 'vertical',
            fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5,
            background: 'var(--bg-secondary)', color: 'var(--text-primary)',
            border: '1px solid var(--border)', borderRadius: 4, boxSizing: 'border-box',
          }}
          placeholder="Column1,Column2,Column3&#10;val1,val2,val3"
        />

        {text && (() => {
          const lines = text.trim().split('\n')
          const cols  = lines[0]?.split(',').length ?? 0
          return (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {lines.length} rows × {cols} columns
            </div>
          )
        })()}

        {status && (
          <div style={{ fontSize: 12, marginTop: 8, color: status.startsWith('✓') ? '#4caf50' : status.startsWith('Error') ? '#f44336' : 'var(--text-muted)' }}>
            {status}
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 10 }}>
          <button className="modal-btn-secondary" onClick={onClose}>Close</button>
          <button className="modal-btn-primary" onClick={convert} disabled={converting || !text.trim()}>
            {converting ? 'Converting…' : 'Convert to PDF'}
          </button>
        </div>
      </div>
    </div>
  )
}
