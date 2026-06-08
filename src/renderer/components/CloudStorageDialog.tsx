import { useState } from 'react'
import { Cloud } from 'lucide-react'
import { useSettingsStore } from '../store/useSettingsStore'
import { usePdfStore } from '../store/usePdfStore'
import { useRecentFiles } from '../hooks/useRecentFiles'

interface CloudFile { id: string; name: string; size?: number; modifiedTime?: string }
type Provider = 'googledrive' | 'dropbox' | 'onedrive' | 'box' | 'sharepoint'
type Tab = 'browse' | 'settings'

interface Props { onClose: () => void }

export default function CloudStorageDialog({ onClose }: Props) {
  const { settings, updateSettings } = useSettingsStore()
  const pdfBytes   = usePdfStore(s => s.pdfBytes)
  const fileName   = usePdfStore(s => s.fileName)
  const loadPdf    = usePdfStore(s => s.loadPdf)
  const { addRecentFile } = useRecentFiles()

  const [provider,  setProvider]  = useState<Provider>('googledrive')
  const [tab,       setTab]       = useState<Tab>('browse')
  const [files,     setFiles]     = useState<CloudFile[]>([])
  const [status,    setStatus]    = useState('')
  const [busy,      setBusy]      = useState(false)
  const [gdToken,   setGdToken]   = useState(settings.gdToken)
  const [dbToken,   setDbToken]   = useState(settings.dropboxToken)
  const [odToken,   setOdToken]   = useState(settings.onedriveToken ?? '')
  const [bxToken,   setBxToken]   = useState(settings.boxToken ?? '')
  const [spToken,   setSpToken]   = useState(settings.sharepointToken ?? '')
  const [spSite,    setSpSite]    = useState(settings.sharepointSite ?? '')

  const token = provider === 'googledrive' ? settings.gdToken
    : provider === 'dropbox' ? settings.dropboxToken
    : provider === 'onedrive' ? settings.onedriveToken ?? ''
    : provider === 'box' ? settings.boxToken ?? ''
    : settings.sharepointToken ?? ''

  const listOneDrive = async (tok: string): Promise<CloudFile[]> => {
    const resp = await fetch(
      "https://graph.microsoft.com/v1.0/me/drive/search(q='.pdf')?$select=id,name,size,lastModifiedDateTime&$top=50",
      { headers: { Authorization: `Bearer ${tok}` } }
    )
    if (!resp.ok) throw new Error(`OneDrive error: ${resp.status} ${resp.statusText}`)
    const data = await resp.json()
    return (data.value ?? []).map((f: any) => ({ id: f.id, name: f.name, size: f.size, modifiedTime: f.lastModifiedDateTime }))
  }

  const downloadOneDrive = async (file: CloudFile, tok: string): Promise<ArrayBuffer> => {
    const resp = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${file.id}/content`, { headers: { Authorization: `Bearer ${tok}` } })
    if (!resp.ok) throw new Error(`OneDrive download error: ${resp.status}`)
    return resp.arrayBuffer()
  }

  const listBox = async (tok: string): Promise<CloudFile[]> => {
    const resp = await fetch('https://api.box.com/2.0/folders/0/items?limit=100&fields=id,name,size,modified_at', { headers: { Authorization: `Bearer ${tok}` } })
    if (!resp.ok) throw new Error(`Box error: ${resp.status} ${resp.statusText}`)
    const data = await resp.json()
    return (data.entries ?? [])
      .filter((e: any) => e.type === 'file' && e.name.toLowerCase().endsWith('.pdf'))
      .map((e: any) => ({ id: e.id, name: e.name, size: e.size, modifiedTime: e.modified_at }))
  }

  const downloadBox = async (file: CloudFile, tok: string): Promise<ArrayBuffer> => {
    const resp = await fetch(`https://api.box.com/2.0/files/${file.id}/content`, { headers: { Authorization: `Bearer ${tok}` } })
    if (!resp.ok) throw new Error(`Box download error: ${resp.status}`)
    return resp.arrayBuffer()
  }

  const listSharePoint = async (tok: string, site: string): Promise<CloudFile[]> => {
    const siteUrl = site.trim() || 'root'
    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteUrl)}/drive/root/search(q='.pdf')?$select=id,name,size,lastModifiedDateTime&$top=50`,
      { headers: { Authorization: `Bearer ${tok}` } }
    )
    if (!resp.ok) throw new Error(`SharePoint error: ${resp.status} ${resp.statusText}`)
    const data = await resp.json()
    return (data.value ?? []).map((f: any) => ({ id: f.id, name: f.name, size: f.size, modifiedTime: f.lastModifiedDateTime }))
  }

  const listGoogleDrive = async (tok: string): Promise<CloudFile[]> => {
    const resp = await fetch(
      "https://www.googleapis.com/drive/v3/files?q=mimeType%3D'application%2Fpdf'&fields=files(id%2Cname%2Csize%2CmodifiedTime)&pageSize=50",
      { headers: { Authorization: `Bearer ${tok}` } }
    )
    if (!resp.ok) throw new Error(`Google Drive error: ${resp.status} ${resp.statusText}`)
    const data = await resp.json()
    return (data.files ?? []).map((f: any) => ({ id: f.id, name: f.name, size: parseInt(f.size ?? '0'), modifiedTime: f.modifiedTime }))
  }

  const listDropbox = async (tok: string): Promise<CloudFile[]> => {
    const resp = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '', recursive: false }),
    })
    if (!resp.ok) throw new Error(`Dropbox error: ${resp.status} ${resp.statusText}`)
    const data = await resp.json()
    return (data.entries ?? [])
      .filter((e: any) => e['.tag'] === 'file' && e.name.toLowerCase().endsWith('.pdf'))
      .map((e: any) => ({ id: e.id, name: e.name, size: e.size, modifiedTime: e.client_modified }))
  }

  const listFiles = async () => {
    if (!token) { setStatus('Please configure your access token in the Settings tab.'); return }
    setBusy(true); setStatus('Fetching file list…'); setFiles([])
    try {
      let result: CloudFile[]
      if (provider === 'googledrive') result = await listGoogleDrive(token)
      else if (provider === 'dropbox') result = await listDropbox(token)
      else if (provider === 'onedrive') result = await listOneDrive(token)
      else if (provider === 'box') result = await listBox(token)
      else result = await listSharePoint(token, spSite)
      setFiles(result)
      setStatus(result.length === 0 ? 'No PDF files found.' : '')
    } catch (e: unknown) {
      setStatus(`Error: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const downloadFile = async (file: CloudFile) => {
    if (!token) return
    setBusy(true); setStatus(`Downloading ${file.name}…`)
    try {
      let buf: ArrayBuffer
      if (provider === 'googledrive') {
        const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, { headers: { Authorization: `Bearer ${token}` } })
        if (!resp.ok) throw new Error(`Download error: ${resp.status}`)
        buf = await resp.arrayBuffer()
      } else if (provider === 'dropbox') {
        const resp = await fetch('https://content.dropboxapi.com/2/files/download', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Dropbox-API-Arg': JSON.stringify({ path: file.id }) } })
        if (!resp.ok) throw new Error(`Dropbox download error: ${resp.status}`)
        buf = await resp.arrayBuffer()
      } else if (provider === 'onedrive') {
        buf = await downloadOneDrive(file, token)
      } else if (provider === 'box') {
        buf = await downloadBox(file, token)
      } else {
        const resp = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${file.id}/content`, { headers: { Authorization: `Bearer ${token}` } })
        if (!resp.ok) throw new Error(`SharePoint download error: ${resp.status}`)
        buf = await resp.arrayBuffer()
      }
      await loadPdf(buf, file.name, file.name)
      addRecentFile(file.name, file.name)
      setStatus(`✓ Opened: ${file.name}`)
      setTimeout(onClose, 1000)
    } catch (e: unknown) {
      setStatus(`Download error: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const uploadFile = async () => {
    if (!pdfBytes || !token) { setStatus(!token ? 'No access token configured.' : 'No PDF open.'); return }
    setBusy(true); setStatus(`Uploading ${fileName}…`)
    try {
      if (provider === 'googledrive') {
        const meta = { name: fileName, mimeType: 'application/pdf' }
        const form = new FormData()
        form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }))
        const pdfArr = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes as ArrayBuffer)
        form.append('file', new Blob([pdfArr.buffer as ArrayBuffer], { type: 'application/pdf' }))
        const resp = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
          { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
        )
        if (!resp.ok) throw new Error(`Upload error: ${resp.status}`)
      } else {
        const resp = await fetch('https://content.dropboxapi.com/2/files/upload', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Dropbox-API-Arg': JSON.stringify({ path: `/${fileName}`, mode: 'overwrite' }),
            'Content-Type': 'application/octet-stream',
          },
          body: (pdfBytes as Uint8Array).buffer as ArrayBuffer,
        })
        if (!resp.ok) throw new Error(`Dropbox upload error: ${resp.status}`)
      }
      setStatus(`✓ Uploaded: ${fileName}`)
      await listFiles()
    } catch (e: unknown) {
      setStatus(`Upload error: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const saveSettings = () => {
    updateSettings({ gdToken: gdToken.trim(), dropboxToken: dbToken.trim(), onedriveToken: odToken.trim(), boxToken: bxToken.trim(), sharepointToken: spToken.trim(), sharepointSite: spSite.trim() })
    setStatus('✓ Tokens saved.')
  }

  const fmtSize = (b?: number) => {
    if (!b) return ''
    if (b > 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`
    if (b > 1024) return `${(b / 1024).toFixed(0)} KB`
    return `${b} B`
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 540, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-title"><Cloud size={18} /> Cloud Storage</div>

        {/* Provider + tab */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {([
            { id: 'googledrive', label: '🔵 Google Drive' },
            { id: 'dropbox',     label: '📦 Dropbox' },
            { id: 'onedrive',    label: '☁ OneDrive' },
            { id: 'box',         label: '📂 Box' },
            { id: 'sharepoint',  label: '🏢 SharePoint' },
          ] as { id: Provider; label: string }[]).map(p => (
            <button key={p.id}
              onClick={() => { setProvider(p.id); setFiles([]); setStatus('') }}
              style={{
                padding: '6px 14px', border: '1px solid', fontSize: 12, borderRadius: 5, cursor: 'pointer',
                borderColor: provider === p.id ? 'var(--accent)' : 'var(--border)',
                background: provider === p.id ? 'rgba(74,158,255,0.12)' : 'var(--bg-secondary)',
                color: provider === p.id ? 'var(--accent)' : 'var(--text-primary)', fontWeight: provider === p.id ? 600 : 400,
              }}>
              {p.label}
            </button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {(['browse', 'settings'] as Tab[]).map(t => (
              <button key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '5px 12px', border: 'none', fontSize: 12, borderRadius: 4, cursor: 'pointer',
                  background: tab === t ? 'var(--accent)' : 'transparent',
                  color: tab === t ? '#fff' : 'var(--text-muted)',
                }}>
                {t === 'browse' ? '📂 Browse' : '⚙ Settings'}
              </button>
            ))}
          </div>
        </div>

        {tab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="modal-field">
              <label className="modal-label">Google Drive OAuth Access Token</label>
              <input type="password" className="modal-input" value={gdToken}
                onChange={e => setGdToken(e.target.value)} placeholder="ya29.a0…" />
              <span className="modal-hint">Get from Google OAuth 2.0 Playground (developers.google.com/oauthplayground)</span>
            </div>
            <div className="modal-field">
              <label className="modal-label">Dropbox Access Token</label>
              <input type="password" className="modal-input" value={dbToken}
                onChange={e => setDbToken(e.target.value)} placeholder="sl.…" />
              <span className="modal-hint">Create an app at dropbox.com/developers and generate a token</span>
            </div>
            <div className="modal-field">
              <label className="modal-label">OneDrive / SharePoint Access Token</label>
              <input type="password" className="modal-input" value={odToken} onChange={e => setOdToken(e.target.value)} placeholder="EwB..." />
              <span className="modal-hint">Microsoft Graph OAuth token. Scope: Files.Read</span>
            </div>
            <div className="modal-field">
              <label className="modal-label">Box Access Token</label>
              <input type="password" className="modal-input" value={bxToken} onChange={e => setBxToken(e.target.value)} placeholder="box_token…" />
              <span className="modal-hint">Generate from developer.box.com</span>
            </div>
            <div className="modal-field">
              <label className="modal-label">SharePoint Access Token (if different from OneDrive)</label>
              <input type="password" className="modal-input" value={spToken} onChange={e => setSpToken(e.target.value)} placeholder="EwB..." />
            </div>
            <div className="modal-field">
              <label className="modal-label">SharePoint Site ID</label>
              <input className="modal-input" value={spSite} onChange={e => setSpSite(e.target.value)} placeholder="tenant.sharepoint.com,guid,guid" />
              <span className="modal-hint">Leave blank to use personal OneDrive</span>
            </div>
            {status && <div style={{ fontSize: 12, color: status.startsWith('✓') ? '#4caf50' : '#ff4444' }}>{status}</div>}
          </div>
        )}

        {tab === 'browse' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button className="modal-btn-secondary" onClick={listFiles} disabled={busy}>
                {busy ? '…' : '🔄 Refresh'}
              </button>
              {pdfBytes && (
                <button className="modal-btn-secondary" onClick={uploadFile} disabled={busy}>
                  ⬆ Upload Current PDF
                </button>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 5, minHeight: 160 }}>
              {files.length === 0 && !busy && (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  {token ? 'Click Refresh to list PDF files.' : 'Configure your access token in the Settings tab first.'}
                </div>
              )}
              {files.map(f => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border)', gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>
                    📄 {f.name}
                  </span>
                  {f.size && <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{fmtSize(f.size)}</span>}
                  <button className="modal-btn-secondary" style={{ fontSize: 11, flexShrink: 0 }}
                    onClick={() => downloadFile(f)} disabled={busy}>
                    ⬇ Open
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {status && tab !== 'settings' && (
          <div style={{ fontSize: 12, marginTop: 8,
            color: status.startsWith('✓') ? '#4caf50' : status.startsWith('Error') ? '#ff4444' : 'var(--text-muted)' }}>
            {status}
          </div>
        )}

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Close</button>
          {tab === 'settings' && (
            <button className="modal-btn-primary" onClick={saveSettings}>Save Tokens</button>
          )}
        </div>
      </div>
    </div>
  )
}
