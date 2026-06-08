import { useState } from 'react'
import { Minimize2 } from 'lucide-react'
import { usePdfStore } from '../store/usePdfStore'

interface Props { onClose: () => void }

type Preset = 'screen' | 'ebook' | 'printer' | 'prepress'

const PRESETS: { id: Preset; label: string; dpi: string; desc: string }[] = [
  { id: 'screen',   label: 'Screen',   dpi: '72 dpi',  desc: 'Smallest file — for on-screen viewing only, not for printing' },
  { id: 'ebook',    label: 'eBook',    dpi: '150 dpi', desc: 'Good quality — balanced size for reading on tablets and phones' },
  { id: 'printer',  label: 'Printer',  dpi: '300 dpi', desc: 'High quality — suitable for desktop printing' },
  { id: 'prepress', label: 'Prepress', dpi: '300 dpi', desc: 'Maximum quality — for professional printing, preserves color profiles' },
]

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`
  return `${(b/1048576).toFixed(2)} MB`
}

export default function OptimizeDialog({ onClose }: Props) {
  const getBakedBytes = usePdfStore(s => s.getBakedBytes)
  const applyEdit     = usePdfStore(s => s.applyEdit)

  const [preset,  setPreset]  = useState<Preset>('ebook')
  const [busy,    setBusy]    = useState(false)
  const [status,  setStatus]  = useState('')
  const [result,  setResult]  = useState<{ origSize: number; newSize: number } | null>(null)
  const [gsAvail, setGsAvail] = useState<boolean | null>(null)

  // Check GS availability on mount
  useState(() => {
    const api = window.electronAPI as unknown as { binsGetStatus: () => Promise<{ ghostscript: { available: boolean } }> }
    api.binsGetStatus().then(s => setGsAvail(s.ghostscript.available)).catch(() => setGsAvail(false))
  })

  const runGsOptimize = async () => {
    setBusy(true); setStatus('Optimizing with Ghostscript…'); setResult(null)
    try {
      const bytes  = await getBakedBytes()
      const before = bytes.byteLength
      const api    = window.electronAPI as unknown as { gsOptimize: (b: ArrayBuffer, p: string) => Promise<ArrayBuffer> }
      const res    = await api.gsOptimize(bytes.buffer as ArrayBuffer, preset)
      applyEdit(new Uint8Array(res))
      const saved = before - res.byteLength
      setResult({ origSize: before, newSize: res.byteLength })
      setStatus(saved > 0
        ? `Saved ${fmtSize(saved)} (${Math.round(saved / before * 100)}% smaller)`
        : 'File is already well-compressed.')
    } catch (e: unknown) {
      setStatus(`Error: ${(e as Error).message}`)
    }
    setBusy(false)
  }

  const runMupdfOptimize = async () => {
    setBusy(true); setStatus('Optimizing…'); setResult(null)
    try {
      const bytes = await getBakedBytes()
      const api   = window.electronAPI as unknown as { mupdfOptimize: (b: ArrayBuffer) => Promise<{ bytes: ArrayBuffer; origSize: number; newSize: number }> }
      const res   = await api.mupdfOptimize(bytes.buffer as ArrayBuffer)
      applyEdit(new Uint8Array(res.bytes))
      const saved = res.origSize - res.newSize
      setResult({ origSize: res.origSize, newSize: res.newSize })
      setStatus(saved > 0
        ? `Saved ${fmtSize(saved)} (${Math.round(saved / res.origSize * 100)}% smaller)`
        : 'File is already well-compressed.')
    } catch (e: unknown) {
      setStatus(`Error: ${(e as Error).message}`)
    }
    setBusy(false)
  }

  const runQpdf = async (op: 'linearize' | 'repair') => {
    setBusy(true); setStatus(op === 'linearize' ? 'Linearizing (qpdf)…' : 'Repairing (qpdf)…'); setResult(null)
    try {
      const bytes = await getBakedBytes()
      const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      const res = op === 'linearize'
        ? await window.electronAPI.qpdfLinearize(ab)
        : await window.electronAPI.qpdfRepair(ab)
      applyEdit(new Uint8Array(res))
      setStatus(op === 'linearize' ? '✓ Linearized for fast web view.' : '✓ Repaired & losslessly rewritten.')
    } catch (e: unknown) {
      setStatus(`Error: ${(e as Error).message}`)
    }
    setBusy(false)
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 460 }}>
        <div className="modal-title"><Minimize2 size={18} /> Optimize PDF</div>

        {gsAvail === true ? (
          <>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
              Using Ghostscript for professional-grade optimization with industry-standard quality presets.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {PRESETS.map(p => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '8px 12px', borderRadius: 6, border: `1px solid ${preset === p.id ? 'var(--accent)' : 'var(--border)'}`, background: preset === p.id ? 'rgba(74,158,255,0.08)' : 'transparent' }}>
                  <input type="radio" name="preset" checked={preset === p.id} onChange={() => setPreset(p.id)} style={{ marginTop: 2 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{p.label}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '1px 6px', borderRadius: 3 }}>{p.dpi}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{p.desc}</div>
                  </div>
                </label>
              ))}
            </div>
            <button className="modal-btn-primary" onClick={runGsOptimize} disabled={busy || !!result}>
              {busy ? 'Optimizing…' : `Optimize (${PRESETS.find(p => p.id === preset)?.label})`}
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
              {gsAvail === false
                ? 'Ghostscript not found — using built-in optimization (removes unused objects and compresses streams). Install Ghostscript via Tools → Native Tools Setup for advanced quality presets.'
                : 'Checking availability…'}
            </p>
            {gsAvail === false && (
              <button className="modal-btn-primary" onClick={runMupdfOptimize} disabled={busy || !!result}>
                {busy ? 'Optimizing…' : '🗜 Optimize Now'}
              </button>
            )}
          </>
        )}

        {result && (
          <div style={{ display: 'flex', gap: 16, fontSize: 12, marginTop: 14, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
            <span>Before: <strong>{fmtSize(result.origSize)}</strong></span>
            <span>→</span>
            <span>After: <strong style={{ color: result.newSize < result.origSize ? '#4caf50' : 'inherit' }}>{fmtSize(result.newSize)}</strong></span>
          </div>
        )}
        {status && (
          <div style={{ fontSize: 12, color: status.startsWith('Error') ? '#f55' : status.startsWith('Saved') ? '#4caf50' : 'var(--text-muted)', marginTop: 8 }}>
            {status}
          </div>
        )}

        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Structure (qpdf — lossless)</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="modal-btn-secondary" onClick={() => runQpdf('linearize')} disabled={busy}
              title="Optimize for fast web view (linearize) without re-compressing content">⚡ Linearize</button>
            <button className="modal-btn-secondary" onClick={() => runQpdf('repair')} disabled={busy}
              title="Repair & losslessly rewrite a damaged PDF's structure">🔧 Repair</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            Lossless — keeps content/quality intact. Requires qpdf (install via Native Tools).
          </div>
        </div>

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
