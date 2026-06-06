import { useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'

interface Props { onClose: () => void }

// All permissions allowed → 0xFFFFFFFC = -4
const ALL_PERMS = -4

function pwdStrength(pwd: string): { score: 0|1|2|3|4; label: string; color: string } {
  if (!pwd) return { score: 0, label: '', color: '' }
  let s = 0
  if (pwd.length >= 8)  s++
  if (pwd.length >= 12) s++
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) s++
  if (/\d/.test(pwd))   s++
  if (/[^A-Za-z0-9]/.test(pwd)) s++
  const score = Math.min(4, s) as 0|1|2|3|4
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong']
  const colors = ['', '#f44336', '#ff9800', '#ffeb3b', '#4caf50']
  return { score, label: labels[score], color: colors[score] }
}

function StrengthBar({ pwd }: { pwd: string }) {
  const { score, label, color } = pwdStrength(pwd)
  if (!pwd) return null
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', gap: 3 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2,
            background: i <= score ? color : 'var(--border)',
            transition: 'background 0.2s' }} />
        ))}
      </div>
      <span style={{ fontSize: 11, color, marginTop: 2, display: 'block' }}>{label}</span>
    </div>
  )
}

function buildPermissions(print: boolean, copy: boolean, edit: boolean, annotate: boolean): number {
  let p = ALL_PERMS
  if (!print)    p = (p & ~4)  | 0   // bit 2
  if (!edit)     p = (p & ~8)  | 0   // bit 3
  if (!copy)     p = (p & ~16) | 0   // bit 4
  if (!annotate) p = (p & ~32) | 0   // bit 5
  return p | 0  // ensure signed 32-bit
}

export default function PasswordDialog({ onClose }: Props) {
  const pdfBytes          = usePdfStore(s => s.pdfBytes)
  const encryptionSettings = usePdfStore(s => s.encryptionSettings)
  const setEncryptionSettings = usePdfStore(s => s.setEncryptionSettings)
  const applyEdit         = usePdfStore(s => s.applyEdit)

  const isProtected = encryptionSettings !== null

  const [tab, setTab] = useState<'protect' | 'remove'>(isProtected ? 'remove' : 'protect')
  const [userPwd,  setUserPwd]  = useState(encryptionSettings?.userPassword  ?? '')
  const [ownerPwd, setOwnerPwd] = useState(encryptionSettings?.ownerPassword ?? '')
  const [curPwd,   setCurPwd]   = useState('')
  const [allowPrint,    setAllowPrint]    = useState(true)
  const [allowCopy,     setAllowCopy]     = useState(true)
  const [allowEdit,     setAllowEdit]     = useState(true)
  const [allowAnnotate, setAllowAnnotate] = useState(true)
  const [busy,  setBusy]  = useState(false)
  const [error, setError] = useState('')

  const protect = () => {
    if (!ownerPwd.trim()) { setError('Owner password is required.'); return }
    const perms = buildPermissions(allowPrint, allowCopy, allowEdit, allowAnnotate)
    setEncryptionSettings({ userPassword: userPwd, ownerPassword: ownerPwd, permissions: perms })
    onClose()
  }

  const removePassword = async () => {
    if (!pdfBytes) return
    setBusy(true); setError('')
    try {
      // Strip encryption so pdfBytes becomes plain
      const decrypted = await window.electronAPI.mupdfRemovePassword(pdfBytes.buffer as ArrayBuffer, curPwd)
      await applyEdit(new Uint8Array(decrypted))
      setEncryptionSettings(null)
      onClose()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to remove password.')
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ width: 440 }}>
        <div className="modal-title">🔒 Security</div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 18 }}>
          {(['protect', 'remove'] as const).map(t => (
            <button key={t}
              className={`toolbar-btn${tab === t ? ' toolbar-btn-active' : ''}`}
              onClick={() => { setTab(t); setError('') }}
            >
              {t === 'protect' ? 'Protect with Password' : 'Remove Password'}
            </button>
          ))}
        </div>

        {tab === 'protect' && (
          <>
            {isProtected && (
              <div style={{
                padding: '8px 12px', background: 'rgba(74,158,255,0.1)',
                border: '1px solid rgba(74,158,255,0.3)', borderRadius: 4,
                fontSize: 12, color: 'var(--accent)', marginBottom: 14,
              }}>
                This document will be encrypted when saved.
              </div>
            )}

            <div className="modal-field">
              <label className="modal-label">User password <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(required to open — leave blank for none)</span></label>
              <input className="modal-input" type="password" value={userPwd}
                onChange={e => setUserPwd(e.target.value)} placeholder="Leave blank for view-only lock" />
              <StrengthBar pwd={userPwd} />
            </div>
            <div className="modal-field">
              <label className="modal-label">Owner password <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(required to change permissions)</span></label>
              <input className="modal-input" type="password" value={ownerPwd}
                onChange={e => setOwnerPwd(e.target.value)} placeholder="Required" />
              <StrengthBar pwd={ownerPwd} />
            </div>

            <div className="modal-field">
              <label className="modal-label">Permissions</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                {[
                  { label: 'Allow Printing',             v: allowPrint,    s: setAllowPrint },
                  { label: 'Allow Copying Text/Images',  v: allowCopy,     s: setAllowCopy },
                  { label: 'Allow Editing Content',      v: allowEdit,     s: setAllowEdit },
                  { label: 'Allow Annotations & Forms',  v: allowAnnotate, s: setAllowAnnotate },
                ].map(({ label, v, s }) => (
                  <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={v} onChange={e => s(e.target.checked)}
                      style={{ accentColor: 'var(--accent)' }} />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {error && <div className="modal-error" style={{ marginBottom: 8 }}>{error}</div>}

            <div className="modal-actions">
              <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
              <button className="modal-btn-primary" onClick={protect}>Apply</button>
            </div>
          </>
        )}

        {tab === 'remove' && (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
              Enter the current password to decrypt this document. The file will be saved without encryption.
            </p>
            <div className="modal-field">
              <label className="modal-label">Current password</label>
              <input className="modal-input" type="password" value={curPwd}
                onChange={e => setCurPwd(e.target.value)} placeholder="Enter current password" autoFocus />
            </div>

            {error && <div className="modal-error" style={{ marginBottom: 8 }}>{error}</div>}

            <div className="modal-actions">
              <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
              <button className="modal-btn-primary" onClick={removePassword} disabled={busy}>
                {busy ? 'Removing…' : 'Remove Password'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
