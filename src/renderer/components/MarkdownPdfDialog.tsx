import { useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'

interface Props { onClose: () => void }

const EXAMPLE = `# My Document

## Introduction

This is a sample Markdown document.
You can use **bold**, *italic*, and \`code\`.

## Features

- Item one
- Item two
- Item three

## Conclusion

End of document.
`

export default function MarkdownPdfDialog({ onClose }: Props) {
  const loadPdf   = usePdfStore(s => s.loadPdf)
  const applyEdit = usePdfStore(s => s.applyEdit)

  const [text,      setText]      = useState(EXAMPLE)
  const [converting,setConverting]= useState(false)
  const [status,    setStatus]    = useState('')
  const [mode,      setMode]      = useState<'new' | 'append'>('new')

  const getBakedBytes = usePdfStore(s => s.getBakedBytes)
  const numPages      = usePdfStore(s => s.numPages)
  const pdfBytes      = usePdfStore(s => s.pdfBytes)

  const convert = async () => {
    if (!text.trim()) return
    setConverting(true); setStatus('Converting…')
    try {
      const bytes = await window.electronAPI.convertMarkdownToPdf(text)
      if (mode === 'new' || !pdfBytes) {
        await loadPdf(bytes, 'markdown-export.pdf', 'markdown-export.pdf')
        setStatus('✓ Created new PDF from Markdown.')
      } else {
        const { PDFDocument } = await import('pdf-lib')
        const existingDoc = await PDFDocument.load(await getBakedBytes())
        const newDoc      = await PDFDocument.load(new Uint8Array(bytes))
        const pages       = await existingDoc.copyPages(newDoc, newDoc.getPageIndices())
        pages.forEach(p => existingDoc.addPage(p))
        applyEdit(new Uint8Array(await existingDoc.save()))
        setStatus(`✓ Appended ${pages.length} page(s) from Markdown.`)
      }
    } catch (e: any) {
      setStatus(`Error: ${e?.message}`)
    } finally {
      setConverting(false)
    }
  }

  const openFile = async () => {
    const path = await window.electronAPI.openAnyFile([{ name: 'Markdown', extensions: ['md', 'txt', 'markdown'] }])
    if (!path) return
    const bytes = await window.electronAPI.readFileBytes(path)
    setText(new TextDecoder().decode(bytes))
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 680, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-title">📝 Markdown → PDF</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
          Type or paste Markdown text below, then convert to PDF. Supports headings, bold, italic, lists, and code.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <button className="modal-btn-secondary" style={{ fontSize: 12 }} onClick={openFile}>📂 Open .md File</button>
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
            flex: 1, minHeight: 300, width: '100%', padding: 12, resize: 'vertical',
            fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6,
            background: 'var(--bg-secondary)', color: 'var(--text-primary)',
            border: '1px solid var(--border)', borderRadius: 4, boxSizing: 'border-box',
          }}
          placeholder="# Your Markdown here..."
        />

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
