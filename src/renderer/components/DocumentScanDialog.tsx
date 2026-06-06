import { useState, useRef } from 'react'
import { usePdfStore } from '../store/usePdfStore'
import { newId } from '../utils/annotationUtils'
import { scanDocument, type ScanMode } from '../utils/opencvScan'
import * as pdfEdits from '../utils/pdfEdits'
import type { PlacedImageAnn } from '../types/annotations'

function dataUrlToBytes(u: string): Uint8Array {
  const b = atob(u.split(',')[1])
  const a = new Uint8Array(b.length)
  for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i)
  return a
}

export default function DocumentScanDialog({ onClose }: { onClose: () => void }) {
  const [srcUrl, setSrcUrl] = useState<string | null>(null)
  const [outUrl, setOutUrl] = useState<string | null>(null)
  const [mode, setMode] = useState<ScanMode>('bw')
  const [dewarp, setDewarp] = useState(true)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const numPages = usePdfStore(s => s.numPages)
  const currentPage = usePdfStore(s => s.currentPage)
  const pageSizes = usePdfStore(s => s.pageSizes)
  const addAnnotation = usePdfStore(s => s.addAnnotation)

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return
    const r = new FileReader()
    r.onload = ev => { setSrcUrl(ev.target?.result as string); setOutUrl(null); setStatus('') }
    r.readAsDataURL(f)
    e.target.value = ''
  }

  const runScan = async () => {
    if (!srcUrl) return
    setBusy(true); setStatus('Loading OpenCV & processing…')
    try {
      const { dataUrl, dewarped } = await scanDocument(srcUrl, { dewarp, mode })
      setOutUrl(dataUrl)
      setStatus(dewarp ? (dewarped ? '✓ Document edges detected & corrected.' : 'No clear edges found — enhanced full image.') : '✓ Enhanced.')
    } catch (e: any) {
      setStatus(`Error: ${e?.message ?? 'scan failed'}`)
    }
    setBusy(false)
  }

  const insertAsPage = async () => {
    if (!outUrl) return
    setBusy(true); setStatus('Inserting page…')
    try {
      const store = usePdfStore.getState()
      const png = dataUrlToBytes(outUrl)
      const base = await store.getBakedBytes()
      const next = await pdfEdits.insertImagePage(base, png, 'image/png', currentPage)
      await store.applyEdit(next)
      setStatus('✓ Page inserted.'); onClose()
    } catch (e: any) {
      setStatus(`Error: ${e?.message ?? 'insert failed'}`)
    }
    setBusy(false)
  }

  const placeOnPage = () => {
    if (!outUrl) return
    const ps = pageSizes[currentPage - 1]; if (!ps) return
    const img = new Image()
    img.onload = () => {
      const ratio = img.naturalHeight / img.naturalWidth
      const w = ps.width * 0.9, h = w * ratio
      addAnnotation({
        id: newId(), type: 'placed-image', pageNum: currentPage,
        color: '#000000', opacity: 1, createdAt: Date.now(),
        x: (ps.width - w) / 2, y: (ps.height - h) / 2, width: w, height: h, dataUrl: outUrl,
      } as PlacedImageAnn)
      onClose()
    }
    img.src = outUrl
  }

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-box" style={{ width: 720, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-title">🪄 Scan / Enhance Document</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Turn a photo or scan into a clean page — auto-detects the document edges, corrects
          perspective, and enhances. Powered by OpenCV.
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <button className="modal-btn-secondary" onClick={() => fileRef.current?.click()}>📂 Choose image…</button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickFile} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={dewarp} onChange={e => setDewarp(e.target.checked)} />
            Auto-crop & perspective correct
          </label>
          <select className="annot-select" style={{ padding: '6px 8px', fontSize: 13 }} value={mode} onChange={e => setMode(e.target.value as ScanMode)}>
            <option value="bw">Black &amp; white (sharp)</option>
            <option value="grayscale">Grayscale</option>
            <option value="color">Colour (enhanced)</option>
          </select>
          <button className="modal-btn-primary" onClick={runScan} disabled={!srcUrl || busy}>
            {busy ? 'Working…' : 'Scan'}
          </button>
        </div>

        <div style={{ flex: 1, display: 'flex', gap: 10, overflow: 'auto', minHeight: 220 }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Original</div>
            <div style={{ background: '#f0f0f0', borderRadius: 6, minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {srcUrl ? <img src={srcUrl} style={{ maxWidth: '100%', maxHeight: 360 }} alt="" /> : <span style={{ color: '#999', fontSize: 12 }}>No image</span>}
            </div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Result</div>
            <div style={{ background: '#f0f0f0', borderRadius: 6, minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {outUrl ? <img src={outUrl} style={{ maxWidth: '100%', maxHeight: 360 }} alt="" /> : <span style={{ color: '#999', fontSize: 12 }}>Scan to preview</span>}
            </div>
          </div>
        </div>

        <div className="modal-actions" style={{ alignItems: 'center' }}>
          <span style={{ marginRight: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>{status}</span>
          <button className="modal-btn-secondary" onClick={onClose}>Close</button>
          {numPages > 0 && <button className="modal-btn-secondary" onClick={placeOnPage} disabled={!outUrl || busy}>Place on page</button>}
          <button className="modal-btn-primary" onClick={insertAsPage} disabled={!outUrl || busy}>
            {numPages > 0 ? 'Insert as new page' : 'Create PDF'}
          </button>
        </div>
      </div>
    </div>
  )
}
