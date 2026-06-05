import { useState, useEffect } from 'react'
import { usePdfStore } from '../store/usePdfStore'

interface Props { onClose: () => void }

export default function MetadataDialog({ onClose }: Props) {
  const pdfBytes = usePdfStore(s => s.pdfBytes)
  const applyEdit = usePdfStore(s => s.applyEdit)

  const [title,    setTitle]    = useState('')
  const [author,   setAuthor]   = useState('')
  const [subject,  setSubject]  = useState('')
  const [keywords, setKeywords] = useState('')
  const [creator,  setCreator]  = useState('')
  const [producer, setProducer] = useState('')
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => {
    if (!pdfBytes) return
    window.electronAPI.mupdfGetMetadata(pdfBytes.buffer as ArrayBuffer)
      .then(m => {
        setTitle(m.title); setAuthor(m.author); setSubject(m.subject)
        setKeywords(m.keywords); setCreator(m.creator); setProducer(m.producer)
        setLoading(false)
      })
      .catch(() => { setLoading(false); setError('Could not read metadata.') })
  }, [pdfBytes])

  const save = async () => {
    if (!pdfBytes) return
    setSaving(true); setError('')
    try {
      const newBuf = await window.electronAPI.mupdfSetMetadata(pdfBytes.buffer as ArrayBuffer, {
        title, author, subject, keywords,
      })
      await applyEdit(new Uint8Array(newBuf))
      onClose()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save metadata.')
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ width: 460 }}>
        <div className="modal-title">Document Information</div>

        {loading ? <div style={{ padding: '20px 0', color: 'var(--text-muted)' }}>Loading…</div> : (
          <>
            {[
              { label: 'Title',    value: title,    set: setTitle },
              { label: 'Author',   value: author,   set: setAuthor },
              { label: 'Subject',  value: subject,  set: setSubject },
              { label: 'Keywords', value: keywords, set: setKeywords },
            ].map(({ label, value, set }) => (
              <div key={label} className="modal-field">
                <label className="modal-label">{label}</label>
                <input
                  className="modal-input"
                  value={value}
                  onChange={e => set(e.target.value)}
                  placeholder={`Enter ${label.toLowerCase()}…`}
                />
              </div>
            ))}

            {/* Read-only fields */}
            {(creator || producer) && (
              <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                {creator && (
                  <div style={{ flex: 1 }}>
                    <div className="modal-label">Creator (read-only)</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0' }}>{creator}</div>
                  </div>
                )}
                {producer && (
                  <div style={{ flex: 1 }}>
                    <div className="modal-label">Producer (read-only)</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0' }}>{producer}</div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {error && <div className="modal-error" style={{ marginBottom: 8 }}>{error}</div>}

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={save} disabled={loading || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
