import { useState, useEffect } from 'react'
import { Settings, Download, Globe, RefreshCw } from 'lucide-react'

interface BinInfo { path: string; available: boolean }
interface BinStatus { mutool: BinInfo; ghostscript: BinInfo; libreoffice: BinInfo }

interface Props { onClose: () => void }

const TOOL_META = {
  mutool: {
    label: 'MuPDF mutool',
    desc: 'PDF repair, clean, linearize, extract embedded files',
    canDownload: true,
    installUrl: 'https://mupdf.com/releases/',
  },
  ghostscript: {
    label: 'Ghostscript',
    desc: 'PDF/A, PDF/X, color conversion (grayscale/CMYK), professional optimization',
    canDownload: false,
    installUrl: 'https://www.ghostscript.com/releases/gsdnld.html',
  },
  libreoffice: {
    label: 'LibreOffice',
    desc: 'Layout-faithful Office→PDF import & PDF→DOCX/PPTX export',
    canDownload: false,
    installUrl: 'https://www.libreoffice.org/download/download/',
  },
} as const

export default function NativeBinsDialog({ onClose }: Props) {
  const [status,   setStatus]   = useState<BinStatus | null>(null)
  const [dlPct,    setDlPct]    = useState<number | null>(null)
  const [dlStatus, setDlStatus] = useState('')
  const [error,    setError]    = useState('')
  const [busy,     setBusy]     = useState(false)

  const api = window.electronAPI as unknown as {
    binsGetStatus: () => Promise<BinStatus>
    binsOpenUrl:   (url: string) => Promise<void>
    binsDownloadMutool: () => Promise<string>
    onBinsDownloadProgress: (cb: (d: { pct: number; mb?: string; status?: string }) => void) => void
    removeBinsDownloadListener: () => void
  }

  const refresh = async () => {
    try { setStatus(await api.binsGetStatus()) } catch {}
  }

  useEffect(() => { refresh() }, [])

  const download = async () => {
    setBusy(true); setError(''); setDlPct(0); setDlStatus('Connecting…')
    api.onBinsDownloadProgress(d => {
      setDlPct(d.pct)
      setDlStatus(d.status ?? (d.mb ? `${d.pct}% — ${d.mb} MB` : `${d.pct}%`))
    })
    try {
      await api.binsDownloadMutool()
      setDlStatus('Download complete!')
      await refresh()
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
      api.removeBinsDownloadListener()
    }
  }

  const open = (url: string) => api.binsOpenUrl(url)

  const statusColor = (ok: boolean) => ok ? '#4caf50' : '#ff7043'
  const statusIcon  = (ok: boolean) => ok ? '✓' : '✗'

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 580 }}>
        <div className="modal-title"><Settings size={18} /> Native Tools Setup</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          These tools unlock advanced PDF operations not possible with JavaScript alone.
          Install them once — Monstera detects them automatically.
        </p>

        {status && (Object.keys(TOOL_META) as (keyof typeof TOOL_META)[]).map(key => {
          const meta = TOOL_META[key]
          const info = status[key]
          return (
            <div key={key} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px',
              marginBottom: 8, borderRadius: 6,
              background: info.available ? 'rgba(76,175,80,0.07)' : 'rgba(255,112,67,0.07)',
              border: `1px solid ${info.available ? 'rgba(76,175,80,0.3)' : 'rgba(255,112,67,0.3)'}`,
            }}>
              <span style={{ fontSize: 18, color: statusColor(info.available), minWidth: 22, marginTop: 1 }}>
                {statusIcon(info.available)}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <strong style={{ fontSize: 13 }}>{meta.label}</strong>
                  {info.available && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240 }}>{info.path}</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{meta.desc}</div>

                {!info.available && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    {meta.canDownload && (
                      <button className="modal-btn-primary" style={{ fontSize: 11, padding: '4px 12px' }}
                        onClick={download} disabled={busy}>
                        {busy && dlPct !== null ? <><Download size={13} /> {dlStatus}</> : <><Download size={13} /> Download & Install</>}
                      </button>
                    )}
                    <button className="modal-btn-secondary" style={{ fontSize: 11, padding: '4px 12px' }}
                      onClick={() => open(meta.installUrl)}>
                      <Globe size={13} /> {meta.canDownload ? 'Manual Download' : 'Download & Install'}
                    </button>
                  </div>
                )}

                {key === 'mutool' && dlPct !== null && busy && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${dlPct}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s' }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{dlStatus}</div>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {error && <div style={{ fontSize: 12, color: '#f55', marginTop: 8 }}>{error}</div>}

        <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 6, fontSize: 11, color: 'var(--text-muted)' }}>
          <strong>After installing Ghostscript or LibreOffice:</strong> restart Monstera — it will detect them automatically.
          No configuration needed.
        </div>

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={refresh} disabled={busy}><RefreshCw size={14} /> Refresh</button>
          <button className="modal-btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
