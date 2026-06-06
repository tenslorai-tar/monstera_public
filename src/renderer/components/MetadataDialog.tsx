import { useState, useEffect } from 'react'
import { usePdfStore } from '../store/usePdfStore'

interface Props { onClose: () => void }

interface CustomProp { key: string; value: string }

const TEMPLATES: Record<string, { title?: string; author?: string; subject?: string; keywords?: string; custom?: CustomProp[] }> = {
  'Technical Document': { subject: 'Technical Documentation', keywords: 'technical, documentation, specification', custom: [{ key: 'Version', value: '1.0' }, { key: 'Status', value: 'Draft' }] },
  'Legal Document':     { subject: 'Legal Document', keywords: 'legal, contract, agreement', custom: [{ key: 'Jurisdiction', value: '' }, { key: 'Reference', value: '' }] },
  'Academic Paper':     { subject: 'Research Paper', keywords: 'research, academic, peer-reviewed', custom: [{ key: 'Journal', value: '' }, { key: 'DOI', value: '' }] },
  'Business Report':    { subject: 'Business Report', keywords: 'business, report, analysis', custom: [{ key: 'Department', value: '' }, { key: 'Confidentiality', value: 'Internal' }] },
  'Invoice':            { subject: 'Invoice', keywords: 'invoice, billing, payment', custom: [{ key: 'Invoice No.', value: '' }, { key: 'Due Date', value: '' }] },
}

export default function MetadataDialog({ onClose }: Props) {
  const pdfBytes  = usePdfStore(s => s.pdfBytes)
  const applyEdit = usePdfStore(s => s.applyEdit)

  const [title,    setTitle]    = useState('')
  const [author,   setAuthor]   = useState('')
  const [subject,  setSubject]  = useState('')
  const [keywords, setKeywords] = useState('')
  const [creator,  setCreator]  = useState('')
  const [producer, setProducer] = useState('')
  const [custom,   setCustom]   = useState<CustomProp[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [template, setTemplate] = useState('')

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

  const applyTemplate = (name: string) => {
    setTemplate(name)
    const t = TEMPLATES[name]
    if (!t) return
    if (t.subject)   setSubject(t.subject)
    if (t.keywords)  setKeywords(t.keywords)
    if (t.custom)    setCustom(t.custom.map(c => ({ ...c })))
  }

  const addCustomProp = () => setCustom(c => [...c, { key: '', value: '' }])
  const removeCustomProp = (i: number) => setCustom(c => c.filter((_, j) => j !== i))
  const updateCustomProp = (i: number, field: 'key' | 'value', val: string) =>
    setCustom(c => c.map((p, j) => j === i ? { ...p, [field]: val } : p))

  const save = async () => {
    if (!pdfBytes) return
    setSaving(true); setError('')
    try {
      const meta: Record<string, string> = { title, author, subject, keywords }
      for (const { key, value } of custom) {
        if (key.trim()) meta[key.trim()] = value
      }
      const newBuf = await window.electronAPI.mupdfSetMetadata(pdfBytes.buffer as ArrayBuffer, meta)
      await applyEdit(new Uint8Array(newBuf))
      onClose()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save metadata.')
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ width: 500, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-title">Document Information</div>

        {loading ? <div style={{ padding: '20px 0', color: 'var(--text-muted)' }}>Loading…</div> : (
          <>
            {/* Template */}
            <div className="modal-field">
              <label className="modal-label">Apply template</label>
              <select className="annot-select" style={{ width: '100%', padding: '6px 10px', fontSize: 13 }}
                value={template} onChange={e => applyTemplate(e.target.value)}>
                <option value="">— No template —</option>
                {Object.keys(TEMPLATES).map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>

            {/* Standard fields */}
            {[
              { label: 'Title',    value: title,    set: setTitle },
              { label: 'Author',   value: author,   set: setAuthor },
              { label: 'Subject',  value: subject,  set: setSubject },
              { label: 'Keywords', value: keywords, set: setKeywords },
            ].map(({ label, value, set }) => (
              <div key={label} className="modal-field">
                <label className="modal-label">{label}</label>
                <input className="modal-input" value={value}
                  onChange={e => set(e.target.value)} placeholder={`Enter ${label.toLowerCase()}…`} />
              </div>
            ))}

            {/* Read-only */}
            {(creator || producer) && (
              <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                {creator  && <div style={{ flex: 1 }}><div className="modal-label">Creator</div><div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0' }}>{creator}</div></div>}
                {producer && <div style={{ flex: 1 }}><div className="modal-label">Producer</div><div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0' }}>{producer}</div></div>}
              </div>
            )}

            {/* Custom properties */}
            <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Custom Properties</span>
                <button className="modal-btn-secondary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={addCustomProp}>+ Add</button>
              </div>
              {custom.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>No custom properties. Click Add to create one.</p>
              )}
              {custom.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                  <input className="modal-input" style={{ flex: '0 0 140px', fontSize: 12 }}
                    placeholder="Property name" value={p.key}
                    onChange={e => updateCustomProp(i, 'key', e.target.value)} />
                  <input className="modal-input" style={{ flex: 1, fontSize: 12 }}
                    placeholder="Value" value={p.value}
                    onChange={e => updateCustomProp(i, 'value', e.target.value)} />
                  <button onClick={() => removeCustomProp(i)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: '0 4px' }}>×</button>
                </div>
              ))}
            </div>
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
