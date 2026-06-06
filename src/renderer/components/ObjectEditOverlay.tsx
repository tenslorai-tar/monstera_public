import { useState, useRef, useEffect } from 'react'
import { usePdfStore } from '../store/usePdfStore'
import { canvasToPdf, pdfToCanvas } from '../utils/annotationUtils'

interface Props { pageNum: number; scale: number; pageW: number; pageH: number }

// Selection bounds are kept in PDF points (y-up), matching the engine.
type Sel = { index: number; type: number; x1: number; y1: number; x2: number; y2: number; color: string }

type Drag =
  | { k: 'idle' }
  | { k: 'pending'; sx: number; sy: number }
  | { k: 'move'; sx: number; sy: number; dx: number; dy: number }
  | { k: 'resize'; sx: number; sy: number; dx: number; dy: number }

const HANDLE = 9

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 0, b: 0 }
}

export default function ObjectEditOverlay({ pageNum, scale, pageW, pageH }: Props) {
  const activeTool = usePdfStore(s => s.activeTool)
  const W = pageW * scale, H = pageH * scale
  const svgRef = useRef<SVGSVGElement>(null)
  const [sel, setSel] = useState<Sel | null>(null)
  const [drag, setDrag] = useState<Drag>({ k: 'idle' })
  const [busy, setBusy] = useState(false)

  const active = activeTool === 'object-edit'
  useEffect(() => { if (!active) { setSel(null); setDrag({ k: 'idle' }) } }, [active])

  // Delete key removes the selected object
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel && !busy
        && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault(); void doDelete()
      }
      if (e.key === 'Escape') setSel(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  if (!active) return null

  const toPdf = (sx: number, sy: number) => canvasToPdf(sx, sy, scale, pageH)
  const toSvg = (px: number, py: number) => pdfToCanvas(px, py, scale, pageH)
  const getXY = (e: React.MouseEvent): [number, number] => {
    const r = svgRef.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  const bytesAb = (): ArrayBuffer | null => {
    const b = usePdfStore.getState().pdfBytes
    return b ? (b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer) : null
  }

  const box = sel ? (() => {
    const [x, yTop] = toSvg(sel.x1, sel.y2)
    const [x2, yBot] = toSvg(sel.x2, sel.y1)
    return { x, y: yTop, w: x2 - x, h: yBot - yTop }
  })() : null

  const onHandle = (sx: number, sy: number) =>
    !!box && Math.abs(sx - (box.x + box.w)) <= HANDLE && Math.abs(sy - (box.y + box.h)) <= HANDLE
  const inBox = (sx: number, sy: number) =>
    !!box && sx >= box.x - 2 && sx <= box.x + box.w + 2 && sy >= box.y - 2 && sy <= box.y + box.h + 2

  // preview transform of the selection box while dragging
  const preview = (() => {
    if (!box) return null
    if (drag.k === 'move') return { x: box.x + drag.dx, y: box.y + drag.dy, w: box.w, h: box.h }
    if (drag.k === 'resize') return { x: box.x, y: box.y, w: Math.max(6, box.w + drag.dx), h: Math.max(6, box.h + drag.dy) }
    return box
  })()

  async function applyOut(out: ArrayBuffer, nextSel: (s: Sel) => Sel | null) {
    if (out && out.byteLength > 0) {
      await usePdfStore.getState().applyContentEdit(new Uint8Array(out), pageNum)
      setSel(s => (s ? nextSel(s) : s))
    }
  }

  async function doDelete() {
    const ab = bytesAb(); if (!ab || !sel) return
    setBusy(true)
    try {
      const out = await window.electronAPI.pdfiumDeleteObject(ab, pageNum - 1, sel.index)
      if (out && out.byteLength > 0) { await usePdfStore.getState().applyContentEdit(new Uint8Array(out), pageNum); setSel(null) }
    } catch { /* ignore */ } finally { setBusy(false) }
  }

  async function doRecolor(hex: string) {
    const ab = bytesAb(); if (!ab || !sel) return
    setBusy(true)
    try {
      const { r, g, b } = hexToRgb(hex)
      const out = await window.electronAPI.pdfiumSetObjectFill(ab, pageNum - 1, sel.index, { r, g, b, a: 255 })
      await applyOut(out, s => ({ ...s, color: hex }))
    } catch { /* ignore */ } finally { setBusy(false) }
  }

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || busy) return
    e.stopPropagation()
    const [sx, sy] = getXY(e)
    if (sel && onHandle(sx, sy)) { setDrag({ k: 'resize', sx, sy, dx: 0, dy: 0 }); return }
    if (sel && inBox(sx, sy)) { setDrag({ k: 'move', sx, sy, dx: 0, dy: 0 }); return }
    setDrag({ k: 'pending', sx, sy })
  }
  const onMouseMove = (e: React.MouseEvent) => {
    if (drag.k !== 'move' && drag.k !== 'resize') return
    const [cx, cy] = getXY(e)
    setDrag(d => ({ ...(d as { sx: number; sy: number }), dx: cx - (d as { sx: number }).sx, dy: cy - (d as { sy: number }).sy } as Drag))
  }
  const onMouseUp = async (e: React.MouseEvent) => {
    const [cx, cy] = getXY(e)
    const d = drag
    if (d.k === 'pending') {
      setDrag({ k: 'idle' })
      const ab = bytesAb(); if (!ab) return
      const [px, py] = toPdf(d.sx, d.sy)
      try {
        const hit = await window.electronAPI.pdfiumObjectAt(ab, pageNum - 1, px, py)
        setSel(hit.found ? { index: hit.index, type: hit.type, x1: hit.x1, y1: hit.y1, x2: hit.x2, y2: hit.y2, color: hit.color || '#000000' } : null)
      } catch { setSel(null) }
      return
    }
    if (d.k === 'move' && sel && box) {
      setDrag({ k: 'idle' })
      const dx = cx - d.sx, dy = cy - d.sy
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return
      const dxPdf = dx / scale, dyPdf = -dy / scale
      const ab = bytesAb(); if (!ab) return
      setBusy(true)
      try {
        const out = await window.electronAPI.pdfiumTransformObject(ab, pageNum - 1, sel.index, { a: 1, b: 0, c: 0, d: 1, e: dxPdf, f: dyPdf })
        await applyOut(out, s => ({ ...s, x1: s.x1 + dxPdf, x2: s.x2 + dxPdf, y1: s.y1 + dyPdf, y2: s.y2 + dyPdf }))
      } catch { /* ignore */ } finally { setBusy(false) }
      return
    }
    if (d.k === 'resize' && sel && box) {
      setDrag({ k: 'idle' })
      const dx = cx - d.sx, dy = cy - d.sy
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return
      const sxFac = Math.max(0.1, (box.w + dx) / box.w)
      const syFac = Math.max(0.1, (box.h + dy) / box.h)
      const px = sel.x1, py = sel.y2 // pivot = object top-left in PDF
      const ab = bytesAb(); if (!ab) return
      setBusy(true)
      try {
        const out = await window.electronAPI.pdfiumTransformObject(ab, pageNum - 1, sel.index, { a: sxFac, b: 0, c: 0, d: syFac, e: px * (1 - sxFac), f: py * (1 - syFac) })
        await applyOut(out, s => ({ ...s, x2: s.x1 + (s.x2 - s.x1) * sxFac, y1: s.y2 - (s.y2 - s.y1) * syFac }))
      } catch { /* ignore */ } finally { setBusy(false) }
      return
    }
    setDrag({ k: 'idle' })
  }

  const cursorFor = (() => {
    return 'default'
  })()

  const canColor = sel && (sel.type === 1 || sel.type === 2)

  return (
    <svg
      ref={svgRef}
      width={W} height={H}
      style={{ position: 'absolute', top: 0, left: 0, zIndex: 11, overflow: 'visible',
        pointerEvents: 'all', cursor: busy ? 'progress' : cursorFor }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      {preview && (
        <>
          <rect x={preview.x} y={preview.y} width={preview.w} height={preview.h}
            fill="rgba(74,158,255,0.08)" stroke="#4a9eff" strokeWidth={1.5} strokeDasharray={drag.k === 'idle' ? undefined : '4,3'} />
          {/* bottom-right resize handle */}
          <rect x={preview.x + preview.w - HANDLE / 2} y={preview.y + preview.h - HANDLE / 2}
            width={HANDLE} height={HANDLE} fill="#fff" stroke="#4a9eff" strokeWidth={1.5} style={{ cursor: 'nwse-resize' }} />
        </>
      )}

      {sel && box && drag.k === 'idle' && (
        <foreignObject x={Math.max(0, box.x)} y={Math.max(0, box.y - 30)} width={200} height={28} style={{ pointerEvents: 'all' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-ribbon, #1d1e26)',
            border: '1px solid var(--border-light, #3c3f52)', borderRadius: 6, padding: '3px 6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)', width: 'fit-content', fontSize: 11, color: 'var(--text-primary,#eee)' }}>
            <span style={{ opacity: 0.7 }}>{sel.type === 1 ? 'Text' : sel.type === 3 ? 'Image' : sel.type === 2 ? 'Vector' : 'Object'}</span>
            {canColor && (
              <input type="color" value={sel.color} title="Recolour"
                onChange={e => doRecolor(e.target.value)}
                style={{ width: 22, height: 18, padding: 0, border: '1px solid var(--border,#444)', borderRadius: 3, cursor: 'pointer', background: 'none' }} />
            )}
            <button title="Delete object (Del)" onClick={() => void doDelete()}
              style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 13, padding: '0 2px' }}>🗑</button>
          </div>
        </foreignObject>
      )}
    </svg>
  )
}
