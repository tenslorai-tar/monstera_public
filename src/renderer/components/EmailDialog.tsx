import { useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'

interface Props { onClose: () => void }

export default function EmailDialog({ onClose }: Props) {
  const fileName    = usePdfStore(s => s.fileName)
  const numPages    = usePdfStore(s => s.numPages)
  const pdfBytes    = usePdfStore(s => s.pdfBytes)

  const [recipient, setRecipient] = useState('')
  const [subject,   setSubject]   = useState(`${fileName || 'Document'} — shared via Monstera PDF Editor`)
  const [body,      setBody]      = useState(`Please find the attached PDF document: ${fileName || 'document.pdf'}\n\n(${numPages} page${numPages !== 1 ? 's' : ''})\n\nSent from Monstera PDF Editor.`)
  const [status,    setStatus]    = useState('')

  const send = async () => {
    setStatus('Opening email client…')
    try {
      await window.electronAPI.openEmail(recipient, subject, body)
      setStatus('✓ Email client opened. Attach the PDF file manually if needed.')
    } catch (e: any) {
      setStatus(`Error: ${e?.message}`)
    }
  }

  const saveAndOpen = async () => {
    if (!pdfBytes) return
    const savePath = await window.electronAPI.saveFileDialog(fileName || 'document.pdf')
    if (!savePath) return
    await window.electronAPI.writeFile(savePath, (pdfBytes as Uint8Array).buffer.slice(
      (pdfBytes as Uint8Array).byteOffset, (pdfBytes as Uint8Array).byteOffset + (pdfBytes as Uint8Array).byteLength
    ) as ArrayBuffer)
    await send()
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 500 }}>
        <div className="modal-title">📧 Email Document</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Opens your default email client with a pre-filled message. You'll need to manually attach the saved PDF file.
        </p>

        <div className="modal-field">
          <label className="modal-label">To (optional)</label>
          <input className="modal-input" type="email" value={recipient}
            onChange={e => setRecipient(e.target.value)} placeholder="recipient@example.com" />
        </div>
        <div className="modal-field">
          <label className="modal-label">Subject</label>
          <input className="modal-input" value={subject} onChange={e => setSubject(e.target.value)} />
        </div>
        <div className="modal-field">
          <label className="modal-label">Message body</label>
          <textarea className="modal-input" rows={5} value={body} onChange={e => setBody(e.target.value)}
            style={{ resize: 'vertical', fontFamily: 'inherit', padding: 8 }} />
        </div>

        {status && (
          <div style={{ fontSize: 12, marginBottom: 8, color: status.startsWith('✓') ? '#4caf50' : status.startsWith('Error') ? '#f44336' : 'var(--text-muted)' }}>
            {status}
          </div>
        )}

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn-secondary" onClick={send}>Open Email Client</button>
          {pdfBytes && (
            <button className="modal-btn-primary" onClick={saveAndOpen}>
              💾 Save PDF & Open Email
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
