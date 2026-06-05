import { useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'

interface Props { onClose: () => void }

interface SigInfo {
  signerName: string; signerOrg: string; reason: string; location: string
  contactInfo: string; certValidFrom: string; certValidTo: string; certCurrentlyValid: boolean
}

type Tab = 'sign' | 'verify'

export default function DigitalSignDialog({ onClose }: Props) {
  const pdfBytes  = usePdfStore(s => s.pdfBytes)
  const fileName  = usePdfStore(s => s.fileName)

  const [tab,          setTab]          = useState<Tab>('sign')
  const [pfxPath,      setPfxPath]      = useState('')
  const [pfxPassword,  setPfxPassword]  = useState('')
  const [signerName,   setSignerName]   = useState('')
  const [reason,       setReason]       = useState('I approve this document')
  const [location,     setLocation]     = useState('')
  const [contactInfo,  setContactInfo]  = useState('')
  const [signing,      setSigning]      = useState(false)
  const [signError,    setSignError]    = useState('')
  const [signDone,     setSignDone]     = useState(false)
  const [verifying,    setVerifying]    = useState(false)
  const [sigInfos,     setSigInfos]     = useState<SigInfo[] | null>(null)

  const browsePfx = async () => {
    const path = await window.electronAPI.openFileDialog()  // reuse; filter not ideal but functional
    if (path) setPfxPath(path)
  }

  const handleSign = async () => {
    if (!pdfBytes || !pfxPath) return
    setSigning(true)
    setSignError('')
    try {
      const signed = await window.electronAPI.pdfSign(
        pdfBytes.buffer as ArrayBuffer,
        pfxPath,
        pfxPassword,
        { name: signerName, reason, location, contactInfo }
      )
      const defaultOut = fileName.replace(/\.pdf$/i, '_signed.pdf')
      const savePath = await window.electronAPI.saveFileDialog(defaultOut)
      if (savePath) {
        await window.electronAPI.writeFile(savePath, signed)
        setSignDone(true)
      }
    } catch (e: unknown) {
      setSignError(e instanceof Error ? e.message : 'Signing failed')
    } finally {
      setSigning(false)
    }
  }

  const handleVerify = async () => {
    if (!pdfBytes) return
    setVerifying(true)
    setSigInfos(null)
    try {
      const infos = await window.electronAPI.pdfVerifySignatures(pdfBytes.buffer as ArrayBuffer)
      setSigInfos(infos)
    } finally {
      setVerifying(false)
    }
  }

  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) }
    catch { return iso }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 520 }}>
        <div className="modal-title">🔏 Digital Signature</div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginTop: 12, borderBottom: '1px solid var(--border)' }}>
          {(['sign', 'verify'] as Tab[]).map(t => (
            <button
              key={t}
              style={{
                padding: '6px 18px', fontSize: 13, border: 'none', cursor: 'pointer',
                background: tab === t ? 'var(--bg-page)' : 'transparent',
                borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
                color: tab === t ? 'var(--text)' : 'var(--text-muted)',
              }}
              onClick={() => setTab(t)}
            >
              {t === 'sign' ? '✒ Sign' : '✅ Verify'}
            </button>
          ))}
        </div>

        {/* ── Sign tab ─────────────────────────────────────────────────────── */}
        {tab === 'sign' && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="modal-field">
              <label className="modal-label">Certificate / PFX file</label>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <input
                  className="modal-input"
                  style={{ flex: 1, fontSize: 12 }}
                  readOnly
                  value={pfxPath}
                  placeholder="Select a .pfx or .p12 file…"
                />
                <button className="modal-btn-secondary" style={{ fontSize: 12 }} onClick={browsePfx}>
                  Browse…
                </button>
              </div>
            </div>

            <div className="modal-field">
              <label className="modal-label">Certificate password</label>
              <input
                className="modal-input"
                type="password"
                style={{ marginTop: 4 }}
                value={pfxPassword}
                onChange={e => setPfxPassword(e.target.value)}
                placeholder="Leave blank if not password-protected"
              />
            </div>

            <div className="modal-field">
              <label className="modal-label">Signer name (optional)</label>
              <input
                className="modal-input"
                style={{ marginTop: 4 }}
                value={signerName}
                onChange={e => setSignerName(e.target.value)}
                placeholder="Will use name from certificate if blank"
              />
            </div>

            <div className="modal-field">
              <label className="modal-label">Reason</label>
              <input
                className="modal-input"
                style={{ marginTop: 4 }}
                value={reason}
                onChange={e => setReason(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <div className="modal-field" style={{ flex: 1 }}>
                <label className="modal-label">Location</label>
                <input
                  className="modal-input"
                  style={{ marginTop: 4 }}
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="City, Country"
                />
              </div>
              <div className="modal-field" style={{ flex: 1 }}>
                <label className="modal-label">Contact info</label>
                <input
                  className="modal-input"
                  style={{ marginTop: 4 }}
                  value={contactInfo}
                  onChange={e => setContactInfo(e.target.value)}
                  placeholder="email@example.com"
                />
              </div>
            </div>

            {signError && <div className="modal-error">{signError}</div>}
            {signDone  && (
              <div style={{ fontSize: 13, color: '#4caf50', padding: '6px 0' }}>
                ✅ PDF signed and saved successfully.
              </div>
            )}

            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              The signed PDF is saved as a separate copy. The signature is a standard PKCS#7/CAdES
              digital signature that can be verified by Adobe Acrobat, Foxit, and other PDF viewers.
            </div>
          </div>
        )}

        {/* ── Verify tab ───────────────────────────────────────────────────── */}
        {tab === 'verify' && (
          <div style={{ marginTop: 14 }}>
            {sigInfos === null && !verifying && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                Click below to inspect any digital signatures embedded in the current document.
              </p>
            )}
            {verifying && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Checking signatures…</p>
            )}
            {sigInfos !== null && sigInfos.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No digital signatures found in this document.</p>
            )}
            {sigInfos !== null && sigInfos.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {sigInfos.map((s, i) => (
                  <div
                    key={i}
                    style={{
                      border: `1px solid ${s.certCurrentlyValid ? '#4caf50' : '#ff9800'}`,
                      borderRadius: 6,
                      padding: '10px 12px',
                      fontSize: 13,
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>
                      {s.certCurrentlyValid ? '✅' : '⚠️'} Signature {i + 1}
                    </div>
                    <div><strong>Signer:</strong> {s.signerName}{s.signerOrg ? ` (${s.signerOrg})` : ''}</div>
                    <div><strong>Certificate valid:</strong> {fmtDate(s.certValidFrom)} – {fmtDate(s.certValidTo)}</div>
                    {!s.certCurrentlyValid && (
                      <div style={{ color: '#ff9800', marginTop: 4 }}>Certificate is expired or not yet valid</div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <button
              className="modal-btn-primary"
              style={{ marginTop: 14 }}
              onClick={handleVerify}
              disabled={verifying}
            >
              {verifying ? 'Checking…' : 'Check Signatures'}
            </button>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button className="modal-btn-secondary" onClick={onClose}>
            {signDone ? 'Done' : 'Close'}
          </button>
          {tab === 'sign' && (
            <button
              className="modal-btn-primary"
              onClick={handleSign}
              disabled={!pfxPath || signing || signDone}
            >
              {signing ? 'Signing…' : '🔏 Sign & Save Copy'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
