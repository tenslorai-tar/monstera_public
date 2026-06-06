import { useState, useRef, useEffect } from 'react'
import bwipjs from 'bwip-js/browser'
import { usePdfStore } from '../store/usePdfStore'
import { newId } from '../utils/annotationUtils'
import type { PlacedImageAnn } from '../types/annotations'

const TYPES = [
  { id: 'qrcode', label: 'QR Code' },
  { id: 'code128', label: 'Code 128' },
  { id: 'code39', label: 'Code 39' },
  { id: 'ean13', label: 'EAN-13' },
  { id: 'upca', label: 'UPC-A' },
  { id: 'datamatrix', label: 'Data Matrix' },
  { id: 'pdf417', label: 'PDF417' },
]
const TWO_D = ['qrcode', 'datamatrix', 'pdf417']

export default function BarcodeDialog({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState('qrcode')
  const [text, setText] = useState('https://')
  const [err, setErr] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const addAnnotation = usePdfStore(s => s.addAnnotation)
  const currentPage = usePdfStore(s => s.currentPage)
  const pageSizes = usePdfStore(s => s.pageSizes)

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    setErr('')
    try {
      bwipjs.toCanvas(c, {
        bcid: type, text: text || ' ', scale: 3,
        includetext: !TWO_D.includes(type), textxalign: 'center',
        paddingwidth: 2, paddingheight: 2,
      })
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Invalid value for this barcode type')
      const ctx = c.getContext('2d'); if (ctx) ctx.clearRect(0, 0, c.width, c.height)
    }
  }, [type, text])

  const place = () => {
    const c = canvasRef.current
    if (!c || err) return
    const dataUrl = c.toDataURL('image/png')
    const ps = pageSizes[currentPage - 1]
    if (!ps) return
    const ratio = c.height / c.width
    const w = Math.min(ps.width * 0.32, 170), h = w * ratio
    addAnnotation({
      id: newId(), type: 'placed-image', pageNum: currentPage,
      color: '#000000', opacity: 1, createdAt: Date.now(),
      x: (ps.width - w) / 2, y: (ps.height - h) / 2, width: w, height: h, dataUrl,
    } as PlacedImageAnn)
    onClose()
  }

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-box" style={{ width: 440 }}>
        <div className="modal-title">▦ Barcode / QR Code</div>

        <div className="modal-field">
          <label className="modal-label">Type</label>
          <select className="annot-select" style={{ width: '100%', padding: '7px 10px', fontSize: 13 }}
            value={type} onChange={e => setType(e.target.value)}>
            {TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>

        <div className="modal-field">
          <label className="modal-label">Content</label>
          <input className="modal-input" value={text} onChange={e => setText(e.target.value)}
            placeholder="Text, URL or number…" autoFocus />
          {err && <span className="modal-error">{err}</span>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', background: '#fff', borderRadius: 8,
          padding: 12, marginBottom: 12, minHeight: 120, alignItems: 'center' }}>
          <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: 180 }} />
        </div>

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={place} disabled={!!err}>Place on page</button>
        </div>
      </div>
    </div>
  )
}
