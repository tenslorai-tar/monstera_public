import { useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'

type TabId = 'pdfa' | 'pdfx' | 'color' | 'repair'

interface Props { onClose: () => void }

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`
  return `${(b/1048576).toFixed(2)} MB`
}

export default function PdfConvertDialog({ onClose }: Props) {
  const getBakedBytes = usePdfStore(s => s.getBakedBytes)
  const applyEdit     = usePdfStore(s => s.applyEdit)
  const save          = usePdfStore(s => s.save)

  const [tab,    setTab]    = useState<TabId>('pdfa')
  const [busy,   setBusy]   = useState(false)
  const [status, setStatus] = useState('')
  const [sizes,  setSizes]  = useState<{ before: number; after: number } | null>(null)

  // PDF/A options
  const [pdfaLevel, setPdfaLevel] = useState<1|2|3>(2)

  // Color options
  const [colorMode,  setColorMode]  = useState<'gray'|'cmyk'>('gray')

  // Repair options
  const [doRepair,    setDoRepair]    = useState(true)
  const [doGarbage,   setDoGarbage]   = useState(true)
  const [doCompress,  setDoCompress]  = useState(true)
  const [doLinearize, setDoLinearize] = useState(false)
  const [doSanitize,  setDoSanitize]  = useState(false)

  const api = window.electronAPI as unknown as {
    gsToPdfa:      (b: ArrayBuffer, level: 1|2|3) => Promise<ArrayBuffer>
    gsToPdfx:      (b: ArrayBuffer)                => Promise<ArrayBuffer>
    gsToGrayscale: (b: ArrayBuffer)                => Promise<ArrayBuffer>
    gsToCmyk:      (b: ArrayBuffer)                => Promise<ArrayBuffer>
    mutoolClean:   (b: ArrayBuffer, opts: object)  => Promise<ArrayBuffer>
    gsLinearize:   (b: ArrayBuffer)                => Promise<ArrayBuffer>
    gsSanitize:    (b: ArrayBuffer)                => Promise<ArrayBuffer>
  }

  const run = async (label: string, fn: (bytes: ArrayBuffer) => Promise<ArrayBuffer>) => {
    setBusy(true); setStatus(`${label}…`); setSizes(null)
    try {
      const bytes  = await getBakedBytes()
      const before = bytes.byteLength
      const result = await fn(bytes.buffer as ArrayBuffer)
      applyEdit(new Uint8Array(result))
      setSizes({ before, after: result.byteLength })
      setStatus(`✓ ${label} complete`)
    } catch (e: unknown) {
      setStatus(`Error: ${(e as Error).message}`)
    }
    setBusy(false)
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'pdfa',   label: '📦 PDF/A' },
    { id: 'pdfx',   label: '🖨 PDF/X' },
    { id: 'color',  label: '🎨 Color' },
    { id: 'repair', label: '🔧 Repair' },
  ]

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 500 }}>
        <div className="modal-title">🔄 Document Conversion & Repair</div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setStatus(''); setSizes(null) }} style={{
              padding: '6px 14px', border: 'none', cursor: 'pointer', fontSize: 12,
              background: tab === t.id ? 'var(--bg-page)' : 'transparent',
              borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t.id ? 'var(--text)' : 'var(--text-muted)',
            }}>{t.label}</button>
          ))}
        </div>

        {/* PDF/A */}
        {tab === 'pdfa' && (
          <div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              PDF/A is the ISO standard for long-term archival. It embeds all fonts and color profiles,
              removes JavaScript and encryption, ensuring the document renders identically decades from now.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {([1,2,3] as const).map(l => (
                <label key={l} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '8px 12px', borderRadius: 6, border: `1px solid ${pdfaLevel === l ? 'var(--accent)' : 'var(--border)'}`, background: pdfaLevel === l ? 'rgba(74,158,255,0.08)' : 'transparent' }}>
                  <input type="radio" name="pdfa" checked={pdfaLevel === l} onChange={() => setPdfaLevel(l)} style={{ marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>PDF/A-{l}b</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {l === 1 ? 'Strictest archival format — PDF 1.4 base, no transparency, no layers' :
                       l === 2 ? 'Recommended — PDF 1.7 base, allows transparency and layers (ISO 32000-1)' :
                                 'Latest standard — allows attachments, JavaScript-free metadata'}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <button className="modal-btn-primary" disabled={busy}
              onClick={() => run(`Convert to PDF/A-${pdfaLevel}b`, b => api.gsToPdfa(b, pdfaLevel))}>
              {busy ? 'Converting…' : `Convert to PDF/A-${pdfaLevel}b`}
            </button>
          </div>
        )}

        {/* PDF/X */}
        {tab === 'pdfx' && (
          <div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              PDF/X is the ISO standard for print production. It converts colors to CMYK, embeds all fonts,
              and strips elements that could cause printing errors (JavaScript, transparency issues, non-CMYK colors).
            </p>
            <div style={{ padding: '10px 14px', background: 'rgba(255,180,0,0.08)', borderRadius: 6, border: '1px solid rgba(255,180,0,0.3)', fontSize: 11, marginBottom: 16, color: 'var(--text)' }}>
              ⚠ PDF/X-4 requires all images be CMYK or Grayscale and all fonts embedded.
              Documents with RGB images or missing fonts will be converted automatically.
            </div>
            <button className="modal-btn-primary" disabled={busy}
              onClick={() => run('Convert to PDF/X-4', b => api.gsToPdfx(b))}>
              {busy ? 'Converting…' : 'Convert to PDF/X-4'}
            </button>
          </div>
        )}

        {/* Color */}
        {tab === 'color' && (
          <div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Convert the document's color space. Grayscale reduces file size and is suitable for
              black-and-white printing. CMYK is required for professional offset printing.
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {(['gray', 'cmyk'] as const).map(m => (
                <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1, padding: '10px 14px', borderRadius: 6, border: `1px solid ${colorMode === m ? 'var(--accent)' : 'var(--border)'}`, background: colorMode === m ? 'rgba(74,158,255,0.08)' : 'transparent' }}>
                  <input type="radio" name="color" checked={colorMode === m} onChange={() => setColorMode(m)} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{m === 'gray' ? 'Grayscale' : 'CMYK'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {m === 'gray' ? 'Remove all color, convert to black & white' : 'Convert RGB → CMYK for print production'}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <button className="modal-btn-primary" disabled={busy}
              onClick={() => run(`Convert to ${colorMode === 'gray' ? 'Grayscale' : 'CMYK'}`, b => colorMode === 'gray' ? api.gsToGrayscale(b) : api.gsToCmyk(b))}>
              {busy ? 'Converting…' : `Convert to ${colorMode === 'gray' ? 'Grayscale' : 'CMYK'}`}
            </button>
          </div>
        )}

        {/* Repair */}
        {tab === 'repair' && (
          <div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Clean and repair the PDF structure. Use these operations to fix corrupt documents,
              reduce file size, or prepare for web delivery.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {([
                [doRepair,    setDoRepair,    'Repair structure',     'Fix cross-reference table, object streams, and syntax errors'],
                [doGarbage,   setDoGarbage,   'Remove unreachable objects', 'Garbage collect — removes deleted annotations, old revisions, dead references'],
                [doCompress,  setDoCompress,  'Compress streams',     'Deflate all content streams for smaller file size'],
                [doLinearize, setDoLinearize, 'Linearize (fast web view)', 'Reorganize file so the first page loads before the rest downloads'],
                [doSanitize,  setDoSanitize,  'Sanitize syntax',      'Clean up object syntax and normalize the file structure'],
              ] as [boolean, (v: boolean) => void, string, string][]).map(([val, set, label, desc]) => (
                <label key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '6px 10px', borderRadius: 5, background: val ? 'rgba(74,158,255,0.05)' : 'transparent' }}>
                  <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} style={{ marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{desc}</div>
                  </div>
                </label>
              ))}
            </div>
            <button className="modal-btn-primary" disabled={busy || (!doRepair && !doGarbage && !doCompress && !doLinearize && !doSanitize)}
              onClick={() => run('Clean & Repair', b => api.mutoolClean(b, {
                repair: doRepair, garbage: doGarbage ? 4 : 0,
                compress: doCompress, linearize: doLinearize, sanitize: doSanitize,
              }))}>
              {busy ? 'Processing…' : 'Apply'}
            </button>
          </div>
        )}

        {/* Result */}
        {sizes && (
          <div style={{ display: 'flex', gap: 16, fontSize: 12, marginTop: 12, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
            <span>Before: <strong>{fmtSize(sizes.before)}</strong></span>
            <span>→</span>
            <span>After: <strong style={{ color: sizes.after < sizes.before ? '#4caf50' : 'inherit' }}>{fmtSize(sizes.after)}</strong></span>
            {sizes.after < sizes.before && <span style={{ color: '#4caf50' }}>({Math.round((1 - sizes.after/sizes.before)*100)}% smaller)</span>}
          </div>
        )}
        {status && (
          <div style={{ fontSize: 12, marginTop: 8, color: status.startsWith('✓') ? '#4caf50' : status.startsWith('Error') ? '#f55' : 'var(--text-muted)' }}>
            {status}
          </div>
        )}

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Close</button>
          {sizes && (
            <button className="modal-btn-primary" onClick={() => save()}>💾 Save Now</button>
          )}
        </div>
      </div>
    </div>
  )
}
