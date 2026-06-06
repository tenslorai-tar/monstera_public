import { useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'

interface Props { onClose: () => void }

interface SigInfo {
  signerName: string; signerOrg: string; reason: string; location: string
  contactInfo: string; certValidFrom: string; certValidTo: string; certCurrentlyValid: boolean
}

type Tab = 'sign' | 'certify' | 'verify'

const TSA_PRESETS = [
  { label: 'FreeTSA (free)', url: 'https://freetsa.org/tsr' },
  { label: 'DigiCert TSA', url: 'http://timestamp.digicert.com' },
  { label: 'GlobalSign TSA', url: 'http://timestamp.globalsign.com/tsa/r6advanced1' },
  { label: 'Custom…', url: '' },
]

export default function DigitalSignDialog({ onClose }: Props) {
  const pdfBytes  = usePdfStore(s => s.pdfBytes)
  const fileName  = usePdfStore(s => s.fileName)
  const applyEdit = usePdfStore(s => s.applyEdit)

  const [tab,          setTab]          = useState<Tab>('sign')
  const [pfxPath,      setPfxPath]      = useState('')
  const [pfxPassword,  setPfxPassword]  = useState('')
  const [signerName,   setSignerName]   = useState('')
  const [reason,       setReason]       = useState('I approve this document')
  const [location,     setLocation]     = useState('')
  const [contactInfo,  setContactInfo]  = useState('')
  const [tsaPreset,    setTsaPreset]    = useState(TSA_PRESETS[0].url)
  const [tsaCustom,    setTsaCustom]    = useState('')
  const [useTsa,       setUseTsa]       = useState(false)
  const [signing,      setSigning]      = useState(false)
  const [signError,    setSignError]    = useState('')
  const [signDone,     setSignDone]     = useState(false)
  const [applyToDoc,   setApplyToDoc]   = useState(false)

  // Certify tab
  const [certPfxPath,     setCertPfxPath]     = useState('')
  const [certPfxPassword, setCertPfxPassword] = useState('')
  const [certReason,      setCertReason]      = useState('Certifying this document')
  const [certPermission,  setCertPermission]  = useState<1 | 2 | 3>(2)
  const [certifying,      setCertifying]      = useState(false)
  const [certError,       setCertError]       = useState('')
  const [certDone,        setCertDone]        = useState(false)

  const [verifying, setVerifying]    = useState(false)
  const [sigInfos,  setSigInfos]     = useState<SigInfo[] | null>(null)

  const browsePfx = async (setter: (v: string) => void) => {
    const path = await window.electronAPI.openFileDialog()
    if (path) setter(path)
  }

  const tsaUrl = tsaPreset === '' ? tsaCustom : tsaPreset

  const handleSign = async () => {
    if (!pdfBytes || !pfxPath) return
    setSigning(true); setSignError('')
    try {
      let bytes = pdfBytes.buffer as ArrayBuffer
      if (useTsa && tsaUrl) {
        bytes = await (window.electronAPI as any).pdfSignWithTsa(bytes, pfxPath, pfxPassword,
          { name: signerName, reason, location, contactInfo }, tsaUrl)
      } else {
        bytes = await window.electronAPI.pdfSign(bytes, pfxPath, pfxPassword,
          { name: signerName, reason, location, contactInfo })
      }
      const defaultOut = fileName.replace(/\.pdf$/i, '_signed.pdf')
      const savePath = await window.electronAPI.saveFileDialog(defaultOut)
      if (savePath) {
        await window.electronAPI.writeFile(savePath, bytes)
        if (applyToDoc) await applyEdit(new Uint8Array(bytes))
        setSignDone(true)
      }
    } catch (e: unknown) {
      setSignError(e instanceof Error ? e.message : 'Signing failed')
    } finally {
      setSigning(false)
    }
  }

  const handleCertify = async () => {
    if (!pdfBytes || !certPfxPath) return
    setCertifying(true); setCertError('')
    try {
      const signed = await (window.electronAPI as any).pdfCertify(
        pdfBytes.buffer as ArrayBuffer,
        certPfxPath,
        certPfxPassword,
        { reason: certReason, permission: certPermission }
      )
      const defaultOut = fileName.replace(/\.pdf$/i, '_certified.pdf')
      const savePath = await window.electronAPI.saveFileDialog(defaultOut)
      if (savePath) { await window.electronAPI.writeFile(savePath, signed); setCertDone(true) }
    } catch (e: unknown) {
      setCertError(e instanceof Error ? e.message : 'Certification failed')
    } finally {
      setCertifying(false)
    }
  }

  const handleVerify = async () => {
    if (!pdfBytes) return
    setVerifying(true); setSigInfos(null)
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
      <div className="modal-box" style={{ width: 540, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-title">🔏 Digital Signature</div>

        <div style={{ display: 'flex', gap: 0, marginTop: 12, borderBottom: '1px solid var(--border)' }}>
          {(['sign', 'certify', 'verify'] as Tab[]).map(t => (
            <button key={t}
              style={{
                padding: '6px 16px', fontSize: 13, border: 'none', cursor: 'pointer',
                background: tab === t ? 'var(--bg-page)' : 'transparent',
                borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
                color: tab === t ? 'var(--text)' : 'var(--text-muted)',
              }}
              onClick={() => setTab(t)}>
              {t === 'sign' ? '✒ Sign' : t === 'certify' ? '🛡 Certify' : '✅ Verify'}
            </button>
          ))}
        </div>

        {/* ── Sign tab ──────────────────────────────────────────────────── */}
        {tab === 'sign' && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="modal-field">
              <label className="modal-label">Certificate / PFX file</label>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <input className="modal-input" style={{ flex: 1, fontSize: 12 }} readOnly value={pfxPath}
                  placeholder="Select a .pfx or .p12 file…" />
                <button className="modal-btn-secondary" style={{ fontSize: 12 }} onClick={() => browsePfx(setPfxPath)}>Browse…</button>
              </div>
            </div>
            <div className="modal-field">
              <label className="modal-label">Certificate password</label>
              <input className="modal-input" type="password" style={{ marginTop: 4 }} value={pfxPassword}
                onChange={e => setPfxPassword(e.target.value)} placeholder="Leave blank if not password-protected" />
            </div>
            <div className="modal-field">
              <label className="modal-label">Signer name (optional)</label>
              <input className="modal-input" style={{ marginTop: 4 }} value={signerName}
                onChange={e => setSignerName(e.target.value)} placeholder="Will use name from certificate if blank" />
            </div>
            <div className="modal-field">
              <label className="modal-label">Reason</label>
              <input className="modal-input" style={{ marginTop: 4 }} value={reason} onChange={e => setReason(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="modal-field" style={{ flex: 1 }}>
                <label className="modal-label">Location</label>
                <input className="modal-input" style={{ marginTop: 4 }} value={location}
                  onChange={e => setLocation(e.target.value)} placeholder="City, Country" />
              </div>
              <div className="modal-field" style={{ flex: 1 }}>
                <label className="modal-label">Contact info</label>
                <input className="modal-input" style={{ marginTop: 4 }} value={contactInfo}
                  onChange={e => setContactInfo(e.target.value)} placeholder="email@example.com" />
              </div>
            </div>

            {/* TSA / LTV Timestamp */}
            <div className="modal-field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 6 }}>
                <input type="checkbox" checked={useTsa} onChange={e => setUseTsa(e.target.checked)} />
                <span style={{ fontSize: 13 }}>Add RFC 3161 trusted timestamp (LTV)</span>
              </label>
              {useTsa && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <select className="annot-select" style={{ width: '100%', padding: '6px 10px', fontSize: 13 }}
                    value={tsaPreset} onChange={e => setTsaPreset(e.target.value)}>
                    {TSA_PRESETS.map(p => <option key={p.label} value={p.url}>{p.label}</option>)}
                  </select>
                  {tsaPreset === '' && (
                    <input className="modal-input" value={tsaCustom} onChange={e => setTsaCustom(e.target.value)}
                      placeholder="https://your-tsa-server/tsr" />
                  )}
                  <span className="modal-hint">Timestamp proves the signing time even after certificate expiry.</span>
                </div>
              )}
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={applyToDoc} onChange={e => setApplyToDoc(e.target.checked)} />
              Also update current document with signed version
            </label>
            {signError && <div className="modal-error">{signError}</div>}
            {signDone  && <div style={{ fontSize: 13, color: '#4caf50', padding: '6px 0' }}>✅ PDF signed and saved successfully.</div>}
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Saved as a separate copy. Standard PKCS#7/CAdES signature — verifiable in Acrobat and Foxit.
            </div>
          </div>
        )}

        {/* ── Certify tab ───────────────────────────────────────────────── */}
        {tab === 'certify' && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ background: 'rgba(74,158,255,0.08)', border: '1px solid rgba(74,158,255,0.3)', borderRadius: 5, padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
              <strong style={{ color: 'var(--accent)' }}>Document Certification (DocMDP)</strong> creates an author signature that
              restricts future modifications to what you allow. Recipients can see whether allowed changes were made.
            </div>

            <div className="modal-field">
              <label className="modal-label">Certificate / PFX file</label>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <input className="modal-input" style={{ flex: 1, fontSize: 12 }} readOnly value={certPfxPath}
                  placeholder="Select a .pfx or .p12 file…" />
                <button className="modal-btn-secondary" style={{ fontSize: 12 }} onClick={() => browsePfx(setCertPfxPath)}>Browse…</button>
              </div>
            </div>
            <div className="modal-field">
              <label className="modal-label">Certificate password</label>
              <input className="modal-input" type="password" style={{ marginTop: 4 }} value={certPfxPassword}
                onChange={e => setCertPfxPassword(e.target.value)} placeholder="Leave blank if not password-protected" />
            </div>
            <div className="modal-field">
              <label className="modal-label">Certification reason</label>
              <input className="modal-input" style={{ marginTop: 4 }} value={certReason} onChange={e => setCertReason(e.target.value)} />
            </div>

            <div className="modal-field">
              <label className="modal-label">Allowed changes after certification</label>
              <select className="annot-select" style={{ width: '100%', padding: '7px 10px', fontSize: 13, marginTop: 4 }}
                value={certPermission} onChange={e => setCertPermission(Number(e.target.value) as 1 | 2 | 3)}>
                <option value={1}>No changes allowed (P=1)</option>
                <option value={2}>Filling forms and digital signatures only (P=2)</option>
                <option value={3}>Filling forms, signing, and adding annotations (P=3)</option>
              </select>
            </div>

            {certError && <div className="modal-error">{certError}</div>}
            {certDone  && <div style={{ fontSize: 13, color: '#4caf50', padding: '6px 0' }}>✅ Certified PDF saved successfully.</div>}
          </div>
        )}

        {/* ── Verify tab ────────────────────────────────────────────────── */}
        {tab === 'verify' && (
          <div style={{ marginTop: 14 }}>
            {sigInfos === null && !verifying && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                Click below to inspect any digital signatures embedded in the current document.
              </p>
            )}
            {verifying && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Checking signatures…</p>}
            {sigInfos !== null && sigInfos.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No digital signatures found in this document.</p>
            )}
            {sigInfos !== null && sigInfos.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {sigInfos.map((s, i) => (
                  <div key={i} style={{ border: `1px solid ${s.certCurrentlyValid ? '#4caf50' : '#ff9800'}`, borderRadius: 6, padding: '10px 12px', fontSize: 13 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>{s.certCurrentlyValid ? '✅' : '⚠️'} Signature {i + 1}</div>
                    <div><strong>Signer:</strong> {s.signerName}{s.signerOrg ? ` (${s.signerOrg})` : ''}</div>
                    <div><strong>Certificate valid:</strong> {fmtDate(s.certValidFrom)} – {fmtDate(s.certValidTo)}</div>
                    {!s.certCurrentlyValid && <div style={{ color: '#ff9800', marginTop: 4 }}>Certificate is expired or not yet valid</div>}
                  </div>
                ))}
              </div>
            )}
            <button className="modal-btn-primary" style={{ marginTop: 14 }} onClick={handleVerify} disabled={verifying}>
              {verifying ? 'Checking…' : 'Check Signatures'}
            </button>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button className="modal-btn-secondary" onClick={onClose}>{signDone || certDone ? 'Done' : 'Close'}</button>
          {tab === 'sign' && (
            <button className="modal-btn-primary" onClick={handleSign} disabled={!pfxPath || signing || signDone}>
              {signing ? 'Signing…' : '🔏 Sign & Save Copy'}
            </button>
          )}
          {tab === 'certify' && (
            <button className="modal-btn-primary" onClick={handleCertify} disabled={!certPfxPath || certifying || certDone}>
              {certifying ? 'Certifying…' : '🛡 Certify & Save Copy'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
