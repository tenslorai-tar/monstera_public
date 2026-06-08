import { useRef, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import { usePdfStore } from '../store/usePdfStore'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

interface Props {
  onClose: () => void
}

export default function SplitViewPanel({ onClose }: Props) {
  const pdfBytes  = usePdfStore(s => s.pdfBytes)
  const numPages  = usePdfStore(s => s.numPages)
  const scale     = usePdfStore(s => s.scale)

  const [leftPage,  setLeftPage]  = useState(1)
  const [rightPage, setRightPage] = useState(Math.min(2, numPages))

  const leftRef  = useRef<HTMLCanvasElement>(null)
  const rightRef = useRef<HTMLCanvasElement>(null)

  const renderPage = async (canvas: HTMLCanvasElement | null, pageNum: number) => {
    if (!canvas || !pdfBytes) return
    const doc  = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise
    const page = await doc.getPage(pageNum)
    const vp   = page.getViewport({ scale })
    canvas.width  = vp.width
    canvas.height = vp.height
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
  }

  useEffect(() => { renderPage(leftRef.current, leftPage) }, [leftPage, pdfBytes, scale])
  useEffect(() => { renderPage(rightRef.current, rightPage) }, [rightPage, pdfBytes, scale])

  const clamp = (v: number) => Math.max(1, Math.min(numPages, v))

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 900,
      background: 'var(--bg-secondary)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '6px 12px', background: 'var(--toolbar-bg)',
        borderBottom: '1px solid var(--border-color)',
      }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Split View</span>

        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          Left page:
          <input type="number" min={1} max={numPages} value={leftPage}
            onChange={e => setLeftPage(clamp(parseInt(e.target.value) || 1))}
            style={{ width: 52, padding: '2px 4px', background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 3 }} />
        </label>

        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          Right page:
          <input type="number" min={1} max={numPages} value={rightPage}
            onChange={e => setRightPage(clamp(parseInt(e.target.value) || 1))}
            style={{ width: 52, padding: '2px 4px', background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 3 }} />
        </label>

        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>of {numPages}</span>

        <div style={{ flex: 1 }} />

        <button
          onClick={() => { setLeftPage(clamp(leftPage - 1)); setRightPage(clamp(rightPage - 1)) }}
          disabled={leftPage <= 1 && rightPage <= 1}
          style={{ fontSize: 13, padding: '3px 10px', background: 'var(--btn-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 3, cursor: 'pointer' }}
          title="Previous page (both panels)"
        ><ChevronLeft size={14} /> Both</button>
        <button
          onClick={() => { setLeftPage(clamp(leftPage + 1)); setRightPage(clamp(rightPage + 1)) }}
          disabled={leftPage >= numPages && rightPage >= numPages}
          style={{ fontSize: 13, padding: '3px 10px', background: 'var(--btn-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 3, cursor: 'pointer' }}
          title="Next page (both panels)"
        >Both <ChevronRight size={14} /></button>

        <button onClick={onClose}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, padding: '3px 10px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer' }}>
          <X size={14} /> Close
        </button>
      </div>

      {/* Split panels */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', gap: 1 }}>
        {/* Left */}
        <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Page {leftPage}</div>
          <canvas ref={leftRef} style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.3)', maxWidth: '100%' }} />
        </div>

        <div style={{ width: 1, background: 'var(--border-color)' }} />

        {/* Right */}
        <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Page {rightPage}</div>
          <canvas ref={rightRef} style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.3)', maxWidth: '100%' }} />
        </div>
      </div>
    </div>
  )
}
