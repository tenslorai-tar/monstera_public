import { useState } from 'react'
import StatusText from './StatusText'
import { Signature, SendHorizontal, Settings } from 'lucide-react'
import { useSettingsStore } from '../store/useSettingsStore'
import { usePdfStore } from '../store/usePdfStore'

interface Recipient { name: string; email: string }

interface Props { onClose: () => void }

export default function DocuSignDialog({ onClose }: Props) {
  const { settings, updateSettings } = useSettingsStore()
  const pdfBytes  = usePdfStore(s => s.pdfBytes)
  const fileName  = usePdfStore(s => s.fileName)

  const [tab,           setTab]           = useState<'send' | 'settings'>('send')
  const [subject,       setSubject]       = useState(`Please sign: ${fileName}`)
  const [message,       setMessage]       = useState('Please review and sign this document.')
  const [recipients,    setRecipients]    = useState<Recipient[]>([{ name: '', email: '' }])
  const [status,        setStatus]        = useState('')
  const [busy,          setBusy]          = useState(false)
  const [envelopeId,    setEnvelopeId]    = useState('')

  const [apiKey,        setApiKey]        = useState(settings.docusignKey)
  const [accountId,     setAccountId]     = useState(settings.docusignAccountId)
  const [basePath,      setBasePath]      = useState(settings.docusignBasePath)

  const addRecipient = () => setRecipients(r => [...r, { name: '', email: '' }])
  const removeRecipient = (i: number) => setRecipients(r => r.filter((_, idx) => idx !== i))
  const updateRecipient = (i: number, field: keyof Recipient, value: string) => {
    setRecipients(r => r.map((rec, idx) => idx === i ? { ...rec, [field]: value } : rec))
  }

  const saveSettings = () => {
    updateSettings({ docusignKey: apiKey.trim(), docusignAccountId: accountId.trim(), docusignBasePath: basePath.trim() })
    setStatus('✓ Settings saved.')
    setTab('send')
  }

  const sendEnvelope = async () => {
    const key = settings.docusignKey
    const acct = settings.docusignAccountId
    const base = settings.docusignBasePath || 'https://demo.docusign.net/restapi'

    if (!key || !acct) { setStatus('Configure your DocuSign API key and account ID in Settings first.'); return }
    if (!pdfBytes) { setStatus('No PDF document is open.'); return }
    const valid = recipients.filter(r => r.name && r.email && r.email.includes('@'))
    if (valid.length === 0) { setStatus('Add at least one recipient with a valid name and email.'); return }

    setBusy(true); setStatus('Sending envelope to DocuSign…')
    try {
      const arr = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes as ArrayBuffer)
      const base64Doc = btoa(arr.reduce((s, b) => s + String.fromCharCode(b), ''))

      const envelope = {
        emailSubject: subject,
        emailBlurb: message,
        documents: [{ documentBase64: base64Doc, name: fileName, fileExtension: 'pdf', documentId: '1' }],
        recipients: {
          signers: valid.map((r, i) => ({
            email: r.email, name: r.name, recipientId: String(i + 1), routingOrder: String(i + 1),
            tabs: {
              signHereTabs: [{ documentId: '1', pageNumber: '1', xPosition: '100', yPosition: '700' }],
            },
          })),
        },
        status: 'sent',
      }

      const resp = await fetch(`${base}/v2.1/accounts/${acct}/envelopes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope),
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err.message ?? `HTTP ${resp.status}`)
      }

      const data = await resp.json()
      setEnvelopeId(data.envelopeId ?? '')
      setStatus(`✓ Envelope sent! ID: ${data.envelopeId}. Recipients will receive an email from DocuSign.`)
    } catch (e: unknown) {
      setStatus(`Error: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 520 }}>
        <div className="modal-title"><Signature size={18} /> DocuSign — Send for Signature</div>

        <div style={{ display: 'flex', gap: 0, marginBottom: 14, borderBottom: '1px solid var(--border)' }}>
          {(['send', 'settings'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 16px', border: 'none', cursor: 'pointer',
              background: tab === t ? 'var(--bg-page)' : 'transparent',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t ? 'var(--text)' : 'var(--text-muted)', fontSize: 13,
            }}>
              {t === 'send' ? <><SendHorizontal size={14} /> Send</> : <><Settings size={14} /> Settings</>}
            </button>
          ))}
        </div>

        {tab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="modal-field">
              <label className="modal-label">DocuSign OAuth Access Token / JWT Token</label>
              <input type="password" className="modal-input" value={apiKey}
                onChange={e => setApiKey(e.target.value)} placeholder="eyJ0…" />
              <span className="modal-hint">Get from your DocuSign developer account → Apps & Keys</span>
            </div>
            <div className="modal-field">
              <label className="modal-label">Account ID</label>
              <input className="modal-input" value={accountId}
                onChange={e => setAccountId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
            </div>
            <div className="modal-field">
              <label className="modal-label">Base URL</label>
              <select className="annot-select" style={{ width: '100%', padding: '7px 10px', fontSize: 13 }}
                value={basePath} onChange={e => setBasePath(e.target.value)}>
                <option value="https://demo.docusign.net/restapi">Demo (sandbox)</option>
                <option value="https://www.docusign.net/restapi">Production</option>
                <option value="https://eu.docusign.net/restapi">EU Production</option>
              </select>
            </div>
            {status && <div style={{ fontSize: 12, color: status.startsWith('✓') ? '#4caf50' : '#ff4444' }}><StatusText status={status} /></div>}
          </div>
        )}

        {tab === 'send' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(!settings.docusignKey || !settings.docusignAccountId) && (
              <div style={{ background: 'rgba(255,180,0,0.1)', border: '1px solid rgba(255,180,0,0.4)', borderRadius: 5, padding: '8px 12px', fontSize: 12, color: '#ffa500' }}>
                ⚠ DocuSign API key and account ID not configured. Go to the Settings tab.
              </div>
            )}

            <div className="modal-field">
              <label className="modal-label">Document: {fileName || 'No document open'}</label>
            </div>

            <div className="modal-field">
              <label className="modal-label">Email subject</label>
              <input className="modal-input" value={subject} onChange={e => setSubject(e.target.value)} />
            </div>

            <div className="modal-field">
              <label className="modal-label">Message to recipients</label>
              <textarea className="modal-input" value={message} onChange={e => setMessage(e.target.value)}
                style={{ resize: 'none', height: 56 }} />
            </div>

            <div className="modal-field">
              <label className="modal-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                Recipients
                <button className="modal-btn-secondary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={addRecipient}>+ Add</button>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                {recipients.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input className="modal-input" style={{ flex: 1, fontSize: 12 }} placeholder="Full name"
                      value={r.name} onChange={e => updateRecipient(i, 'name', e.target.value)} />
                    <input className="modal-input" style={{ flex: 1.5, fontSize: 12 }} placeholder="email@example.com"
                      value={r.email} onChange={e => updateRecipient(i, 'email', e.target.value)} />
                    {recipients.length > 1 && (
                      <button style={{ background: 'none', border: 'none', color: '#ff5555', cursor: 'pointer', fontSize: 16 }}
                        onClick={() => removeRecipient(i)}>×</button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {envelopeId && (
              <div style={{ background: 'rgba(76,175,80,0.1)', border: '1px solid #4caf50', borderRadius: 5, padding: '8px 12px', fontSize: 12 }}>
                ✅ Envelope ID: <strong>{envelopeId}</strong>
              </div>
            )}

            {status && (
              <div style={{ fontSize: 12, color: status.startsWith('✓') ? '#4caf50' : '#ff4444' }}><StatusText status={status} /></div>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Close</button>
          {tab === 'settings' && <button className="modal-btn-primary" onClick={saveSettings}>Save Settings</button>}
          {tab === 'send' && (
            <button className="modal-btn-primary" onClick={sendEnvelope} disabled={busy || !pdfBytes}>
              {busy ? 'Sending…' : <><SendHorizontal size={15} /> Send for Signature</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
