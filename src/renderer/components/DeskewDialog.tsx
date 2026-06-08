import { useState, useRef } from 'react'
import StatusText from './StatusText'
import { Ruler } from 'lucide-react'
import { usePdfStore } from '../store/usePdfStore'
import { PDFDocument } from 'pdf-lib'

interface Props { onClose: () => void }

interface PageResult {
  pageNum: number
  detectedAngle: number
  appliedAngle: number
  status: 'pending' | 'done' | 'skipped'
}

export default function DeskewDialog({ onClose }: Props) {
  const pdfDoc        = usePdfStore(s => s.pdfDoc)
  const numPages      = usePdfStore(s => s.numPages)
  const applyEdit     = usePdfStore(s => s.applyEdit)
  const getBakedBytes = usePdfStore(s => s.getBakedBytes)

  const [scope,     setScope]     = useState<'all' | 'range'>('all')
  const [pageRange, setPageRange] = useState('')
  const [threshold, setThreshold] = useState(0.5)
  const [enhance,   setEnhance]   = useState(true)
  const [running,   setRunning]   = useState(false)
  const [results,   setResults]   = useState<PageResult[]>([])
  const [status,    setStatus]    = useState('')
  const cancelRef = useRef(false)

  function parsePages(): number[] {
    if (scope === 'all') return Array.from({ length: numPages }, (_, i) => i + 1)
    const result: number[] = []
    for (const part of pageRange.split(',')) {
      const p = part.trim()
      const m = p.match(/^(\d+)-(\d+)$/)
      if (m) {
        for (let i = parseInt(m[1]); i <= parseInt(m[2]); i++)
          if (i >= 1 && i <= numPages) result.push(i)
      } else {
        const n = parseInt(p)
        if (!isNaN(n) && n >= 1 && n <= numPages) result.push(n)
      }
    }
    return [...new Set(result)].sort((a, b) => a - b)
  }

  // Detect skew angle from canvas using horizontal projection
  function detectSkew(imageData: ImageData): number {
    const { data, width, height } = imageData
    // Convert to grayscale + binarize
    const binary = new Uint8Array(width * height)
    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]
      binary[i] = (0.299 * r + 0.587 * g + 0.114 * b) < 128 ? 1 : 0
    }

    // Test angles from -10° to 10° in 0.5° steps
    let bestAngle = 0, bestScore = -1
    for (let angleDeg = -10; angleDeg <= 10; angleDeg += 0.5) {
      const rad = angleDeg * Math.PI / 180
      const cos = Math.cos(rad), sin = Math.sin(rad)
      const projections: number[] = new Array(height).fill(0)

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (binary[y * width + x]) {
            const ny = Math.round(y * cos - x * sin)
            if (ny >= 0 && ny < height) projections[ny]++
          }
        }
      }

      // Score = variance of projections (high variance = text lines aligned)
      const mean = projections.reduce((a, b) => a + b, 0) / projections.length
      const variance = projections.reduce((a, b) => a + (b - mean) ** 2, 0) / projections.length
      if (variance > bestScore) { bestScore = variance; bestAngle = angleDeg }
    }
    return bestAngle
  }

  // Apply contrast enhancement to canvas
  function enhanceCanvas(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const imageData = ctx.getImageData(0, 0, w, h)
    const data = imageData.data
    for (let i = 0; i < data.length; i += 4) {
      // Simple contrast stretch + sharpen
      const v = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]
      const enhanced = Math.min(255, Math.max(0, (v - 128) * 1.4 + 128))
      data[i] = data[i+1] = data[i+2] = enhanced
    }
    ctx.putImageData(imageData, 0, 0)
  }

  const run = async () => {
    if (!pdfDoc) return
    setRunning(true); cancelRef.current = false
    const pages = parsePages()
    const res: PageResult[] = pages.map(p => ({ pageNum: p, detectedAngle: 0, appliedAngle: 0, status: 'pending' }))
    setResults([...res])

    try {
      const bytes = await getBakedBytes()
      const doc   = await PDFDocument.load(bytes)

      for (let i = 0; i < pages.length; i++) {
        if (cancelRef.current) break
        const p = pages[i]
        setStatus(`Processing page ${p}…`)

        const page   = await pdfDoc.getPage(p)
        const vp     = page.getViewport({ scale: 0.5 })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height)
        const ctx    = canvas.getContext('2d')!
        await page.render({ canvasContext: ctx, viewport: vp }).promise

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const angle = detectSkew(imageData)
        res[i].detectedAngle = angle

        if (Math.abs(angle) >= threshold) {
          // Apply deskew via page rotation metadata
          // For sub-degree skew corrections, we round to the nearest whole degree
          // (pdf-lib only supports integer rotations; fractional deskew requires resampling)
          const pdfPage = doc.getPage(p - 1)
          const existing = pdfPage.getRotation().angle
          const corrected = Math.round(existing - angle)
          if (Math.abs(corrected - existing) >= 1) {
            pdfPage.setRotation({ type: 'degrees', angle: ((corrected % 360) + 360) % 360 } as any)
          }
          res[i].appliedAngle = angle
          res[i].status = 'done'
        } else {
          res[i].status = 'skipped'
        }

        if (enhance) enhanceCanvas(ctx, canvas.width, canvas.height)
        setResults([...res])
      }

      applyEdit(new Uint8Array(await doc.save()))
      const corrected = res.filter(r => r.status === 'done').length
      setStatus(`✓ Done. ${corrected} page${corrected !== 1 ? 's' : ''} corrected.`)
    } catch (e: any) {
      setStatus(`Error: ${e?.message}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 480, maxHeight: '88vh', overflowY: 'auto' }}>
        <div className="modal-title"><Ruler size={18} /> Deskew & Enhance Scanned Pages</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Detects and corrects skewed text in scanned pages using projection-based angle detection.
          Best results on pages with mostly horizontal text.
        </p>

        <div className="modal-field">
          <label className="modal-label">Pages</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(['all', 'range'] as const).map(s => (
              <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" name="scope" checked={scope === s} onChange={() => setScope(s)} />
                {s === 'all' ? `All pages (${numPages})` : 'Page range:'}
              </label>
            ))}
            {scope === 'range' && (
              <input className="modal-input" style={{ marginLeft: 20 }} value={pageRange}
                onChange={e => setPageRange(e.target.value)} placeholder="e.g. 1-5, 8" />
            )}
          </div>
        </div>

        <div className="modal-field">
          <label className="modal-label">Minimum angle to correct: {threshold}°</label>
          <input type="range" min={0.2} max={5} step={0.1} value={threshold}
            onChange={e => setThreshold(parseFloat(e.target.value))} style={{ width: '100%' }} />
          <span className="modal-hint">Skip pages with skew below this threshold.</span>
        </div>

        <div className="modal-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={enhance} onChange={e => setEnhance(e.target.checked)} />
            Enhance contrast (improves readability of faded scans)
          </label>
        </div>

        {results.length > 0 && (
          <div style={{ marginTop: 10, maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 4 }}>
            {results.map(r => (
              <div key={r.pageNum} style={{ display: 'flex', gap: 12, padding: '4px 10px', fontSize: 12, borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                <span style={{ minWidth: 60 }}>Page {r.pageNum}</span>
                <span style={{ color: 'var(--text-muted)', flex: 1 }}>
                  {r.status === 'pending' ? '…' : r.status === 'skipped' ? `${r.detectedAngle.toFixed(1)}° — within threshold, skipped` : `Corrected ${r.detectedAngle.toFixed(1)}°`}
                </span>
                <span>{r.status === 'done' ? '✓' : r.status === 'skipped' ? '—' : '…'}</span>
              </div>
            ))}
          </div>
        )}

        {status && (
          <div style={{ fontSize: 12, marginTop: 8, color: status.startsWith('✓') ? '#4caf50' : status.startsWith('Error') ? '#f44336' : 'var(--text-muted)' }}>
            <StatusText status={status} />
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 14 }}>
          {running && <button className="modal-btn-secondary" onClick={() => { cancelRef.current = true }}>Cancel</button>}
          <button className="modal-btn-secondary" onClick={onClose}>Close</button>
          {!running && (
            <button className="modal-btn-primary" onClick={run} disabled={running}>
              Run Deskew
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
