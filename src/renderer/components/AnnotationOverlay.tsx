import { useEffect, useRef, useState, useCallback } from 'react'
import { usePdfStore } from '../store/usePdfStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { canvasToPdf, pdfToCanvas, newId } from '../utils/annotationUtils'
import { loadPdfFont } from '../utils/pdfFonts'
import type {
  Annotation, HighlightAnn, InkAnn,
  ShapeAnn, TextBoxAnn, StickyNoteAnn, StampAnn, RedactAnn,
  TypewriterAnn, TextEditAnn, PlacedImageAnn,
  CalloutAnn, CloudAnn, PolyAnn, CaretAnn, MeasureAnn, LinkAnn,
} from '../types/annotations'

interface Props {
  pageNum: number
  scale: number
  pageW: number
  pageH: number
}

type DrawPhase =
  | { k: 'idle' }
  | { k: 'shape'; sx: number; sy: number; cx: number; cy: number }
  | { k: 'ink'; cur: Array<[number, number]>; done: Array<Array<[number, number]>> }
  | { k: 'textbox-size'; sx: number; sy: number; cx: number; cy: number }
  | { k: 'textbox-edit'; x: number; y: number; w: number; h: number; text: string }
  | { k: 'typewriter-edit'; x: number; y: number; text: string }
  | { k: 'text-edit-size'; sx: number; sy: number; cx: number; cy: number }
  | { k: 'text-edit-edit'; x: number; y: number; w: number; h: number; text: string; fontSize?: number; color?: string; bg?: string; fontFamily?: string }
  | { k: 'callout-size'; sx: number; sy: number; cx: number; cy: number }
  | { k: 'callout-edit'; x: number; y: number; w: number; h: number; text: string; tipSvgX: number; tipSvgY: number }
  | { k: 'poly'; pts: Array<[number, number]>; curX: number; curY: number }
  | { k: 'link-pending'; x1: number; y1: number; x2: number; y2: number; href: string; destPage: string }
  | { k: 'snapshot'; sx: number; sy: number; cx: number; cy: number }

type ImageDrag =
  | { k: 'idle' }
  | { k: 'move'; id: string; startSvgX: number; startSvgY: number; origAnnX: number; origAnnY: number }
  | { k: 'resize'; id: string; corner: 'br'; startSvgX: number; startSvgY: number; origW: number; origH: number }

// PDFium engine availability (true in-place text editing), cached per session.
let _pdfiumAvail: boolean | null = null
async function pdfiumReady(): Promise<boolean> {
  if (_pdfiumAvail !== null) return _pdfiumAvail
  try { _pdfiumAvail = (await window.electronAPI.pdfiumStatus()).available }
  catch { _pdfiumAvail = false }
  return _pdfiumAvail
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function StampShape({ color, stampName, w, h }: { color: string; stampName: string; w: number; h: number }) {
  return (
    <>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="none" stroke={color} strokeWidth={2} rx={4} />
      <text textAnchor="middle" dominantBaseline="middle" fill={color}
        fontSize={Math.min(h * 0.6, 18)} fontWeight="bold" fontFamily="sans-serif" letterSpacing={1}>
        {stampName.toUpperCase()}
      </text>
    </>
  )
}

function makeCloudPath(svgPts: Array<[number, number]>, close = true): string {
  if (svgPts.length < 2) return ''
  const pts = close ? [...svgPts, svgPts[0]] : svgPts
  let d = `M${svgPts[0][0].toFixed(1)},${svgPts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i], p1 = pts[i + 1]
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1]
    const len = Math.sqrt(dx * dx + dy * dy)
    const bumps = Math.max(1, Math.round(len / 14))
    for (let b = 0; b < bumps; b++) {
      const t1 = (b + 1) / bumps
      const ex = p0[0] + dx * t1, ey = p0[1] + dy * t1
      const r = (len / bumps / 2).toFixed(1)
      d += ` A${r},${r} 0 0,0 ${ex.toFixed(1)},${ey.toFixed(1)}`
    }
  }
  if (close) d += ' Z'
  return d
}

function measureLabel(
  type: 'measure-distance' | 'measure-area' | 'measure-perimeter',
  pts: Array<[number, number]>,
  unit: string,
  scale = 1
): string {
  if (type === 'measure-distance' && pts.length >= 2) {
    const dx = pts[1][0] - pts[0][0], dy = pts[1][1] - pts[0][1]
    const d = Math.sqrt(dx * dx + dy * dy) * scale
    return `${d.toFixed(2)} ${unit}`
  }
  if (type === 'measure-perimeter' && pts.length >= 2) {
    let total = 0
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[i], p1 = pts[(i + 1) % pts.length]
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1]
      total += Math.sqrt(dx * dx + dy * dy)
    }
    return `P: ${(total * scale).toFixed(2)} ${unit}`
  }
  if (type === 'measure-area' && pts.length >= 3) {
    let area = 0
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[i], p1 = pts[(i + 1) % pts.length]
      area += p0[0] * p1[1] - p1[0] * p0[1]
    }
    return `A: ${(Math.abs(area) / 2 * scale * scale).toFixed(2)} ${unit}²`
  }
  return ''
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AnnotationOverlay({ pageNum, scale, pageW, pageH }: Props) {
  const { settings } = useSettingsStore()
  const measureUnit = settings.measureUnit ?? 'pt'
  const measureScale = settings.measureScale ?? 1

  const activeTool = usePdfStore(s => s.activeTool)
  const panMode = usePdfStore(s => s.panMode)
  const annotations = usePdfStore(s => s.annotations)
  const selectedAnnotationId = usePdfStore(s => s.selectedAnnotationId)
  const toolColor = usePdfStore(s => s.toolColor)
  const toolOpacity = usePdfStore(s => s.toolOpacity)
  const toolLineWidth = usePdfStore(s => s.toolLineWidth)
  const toolFontSize = usePdfStore(s => s.toolFontSize)
  const stampName = usePdfStore(s => s.stampName)
  const customStampDataUrl = usePdfStore(s => s.customStampDataUrl)
  const openStickyNoteId = usePdfStore(s => s.openStickyNoteId)
  const redactBlurred = usePdfStore(s => s.redactBlurred)

  const addAnnotation = usePdfStore(s => s.addAnnotation)
  const updateAnnotation = usePdfStore(s => s.updateAnnotation)
  const deleteAnnotation = usePdfStore(s => s.deleteAnnotation)
  const setSelectedAnnotation = usePdfStore(s => s.setSelectedAnnotation)
  const setOpenStickyNote = usePdfStore(s => s.setOpenStickyNote)

  const svgRef = useRef<SVGSVGElement>(null)
  const cancelEditRef = useRef(false)
  const [draw, setDraw] = useState<DrawPhase>({ k: 'idle' })
  const [imgDrag, setImgDrag] = useState<ImageDrag>({ k: 'idle' })

  const W = pageW * scale
  const H = pageH * scale

  const pageAnnotations = annotations.filter(a => a.pageNum === pageNum)

  // Tool categories
  const POLY_TOOLS = ['polygon', 'polyline', 'cloud', 'measure-distance', 'measure-area', 'measure-perimeter']
  const isPolyTool = POLY_TOOLS.includes(activeTool ?? '')
  const isMarkupTool = activeTool === 'highlight' || activeTool === 'underline' || activeTool === 'strikethrough'
  const isTypewriterTool = activeTool === 'typewriter'
  const isTextEditTool = activeTool === 'text-edit'
  const isCalloutTool = activeTool === 'callout'
  const isCaretTool = activeTool === 'caret'

  // Drag-based drawing tools (all except select, eraser, markup, typewriter, caret, poly)
  const isDragDrawTool = activeTool !== null &&
    !['select', 'eraser', 'highlight', 'underline', 'strikethrough',
      'typewriter', 'place-image', 'caret', 'object-edit', ...POLY_TOOLS].includes(activeTool)

  // ── Coordinate helpers ──────────────────────────────────────────────────

  const toPdf = useCallback((svgX: number, svgY: number) =>
    canvasToPdf(svgX, svgY, scale, pageH), [scale, pageH])

  const toSvg = useCallback((pdfX: number, pdfY: number) =>
    pdfToCanvas(pdfX, pdfY, scale, pageH), [scale, pageH])

  const getSvgXY = (e: React.MouseEvent): [number, number] => {
    const rect = svgRef.current!.getBoundingClientRect()
    return [e.clientX - rect.left, e.clientY - rect.top]
  }

  // Edit Text: read the original text + its font size/colour that lie under a
  // dragged region (from the PDF.js text layer) so the edit box is pre-filled
  // with the existing words instead of forcing the user to retype from scratch.
  const readRegionText = (sx: number, sy: number, ex: number, ey: number):
    { text: string; fontSize?: number; color?: string; bg?: string } => {
    const svg = svgRef.current
    const wrapper = svg?.closest('.pdf-page-wrapper')
    const layer = wrapper?.querySelector<HTMLElement>('.text-layer')
    const svgRect = svg?.getBoundingClientRect()
    if (!layer || !svgRect) return { text: '' }
    const selL = svgRect.left + Math.min(sx, ex)
    const selR = svgRect.left + Math.max(sx, ex)
    const selT = svgRect.top + Math.min(sy, ey)
    const selB = svgRect.top + Math.max(sy, ey)
    const spans = Array.from(layer.querySelectorAll<HTMLElement>('span'))
    const hits: { el: HTMLElement; r: DOMRect }[] = []
    for (const el of spans) {
      if (!el.textContent) continue
      const r = el.getBoundingClientRect()
      // intersection test (require meaningful vertical + horizontal overlap)
      const ox = Math.min(selR, r.right) - Math.max(selL, r.left)
      const oy = Math.min(selB, r.bottom) - Math.max(selT, r.top)
      if (ox > 1 && oy > r.height * 0.3) hits.push({ el, r })
    }
    if (hits.length === 0) return { text: '' }
    // Group into lines by vertical position, then order left→right
    hits.sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left)
    const lines: { y: number; items: typeof hits }[] = []
    for (const h of hits) {
      const line = lines.find(l => Math.abs(l.y - h.r.top) < h.r.height * 0.6)
      if (line) line.items.push(h)
      else lines.push({ y: h.r.top, items: [h] })
    }
    const text = lines
      .map(l => l.items.sort((a, b) => a.r.left - b.r.left).map(i => i.el.textContent).join(''))
      .join('\n')
      .replace(/\s+\n/g, '\n').trim()
    const cs = getComputedStyle(hits[0].el)
    const pxToHex = (c: string): string | undefined => {
      const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
      if (!m) return undefined
      const h = (n: string) => parseInt(n, 10).toString(16).padStart(2, '0')
      return `#${h(m[1])}${h(m[2])}${h(m[3])}`
    }
    const fontPx = parseFloat(cs.fontSize)
    return {
      text,
      fontSize: fontPx > 0 ? Math.round((fontPx / scale) * 10) / 10 : undefined,
      color: pxToHex(cs.color),
    }
  }

  // ── Poly tool: click to add points, dblclick to finish ──────────────────

  const handlePolyClick = (e: React.MouseEvent) => {
    if (!isPolyTool) return
    if (e.button !== 0) return
    e.stopPropagation()
    const [cx, cy] = getSvgXY(e)
    // measure-distance auto-finishes on second click
    if (activeTool === 'measure-distance') {
      if (draw.k === 'poly' && draw.pts.length === 1) {
        commitPoly([...draw.pts, [cx, cy] as [number, number]])
        return
      }
      setDraw({ k: 'poly', pts: [[cx, cy] as [number, number]], curX: cx, curY: cy })
      return
    }
    setDraw(d => {
      if (d.k === 'poly') return { ...d, pts: [...d.pts, [cx, cy] as [number, number]], curX: cx, curY: cy }
      return { k: 'poly', pts: [[cx, cy] as [number, number]], curX: cx, curY: cy }
    })
  }

  const handlePolyDblClick = (e: React.MouseEvent) => {
    if (!isPolyTool || draw.k !== 'poly') return
    e.stopPropagation()
    // Remove the last point (added by the second click of the double-click)
    const pts = draw.pts.slice(0, -1)
    commitPoly(pts)
  }

  const commitPoly = (svgPts: Array<[number, number]>) => {
    const tool = activeTool
    if (!tool || svgPts.length < 2) { setDraw({ k: 'idle' }); return }

    const pdfPts = svgPts.map(([x, y]) => toPdf(x, y) as [number, number])

    if (tool === 'measure-distance') {
      const label = measureLabel('measure-distance', pdfPts, measureUnit, measureScale)
      const ann: MeasureAnn = {
        id: newId(), type: 'measure-distance', pageNum,
        color: toolColor, opacity: toolOpacity, lineWidth: toolLineWidth,
        points: pdfPts, label, unit: measureUnit, createdAt: Date.now(),
      }
      addAnnotation(ann)
    } else if (tool === 'measure-area') {
      if (pdfPts.length < 3) { setDraw({ k: 'idle' }); return }
      const label = measureLabel('measure-area', pdfPts, measureUnit, measureScale)
      const ann: MeasureAnn = {
        id: newId(), type: 'measure-area', pageNum,
        color: toolColor, opacity: toolOpacity, lineWidth: toolLineWidth,
        points: pdfPts, label, unit: measureUnit, createdAt: Date.now(),
      }
      addAnnotation(ann)
    } else if (tool === 'measure-perimeter') {
      const label = measureLabel('measure-perimeter', pdfPts, measureUnit, measureScale)
      const ann: MeasureAnn = {
        id: newId(), type: 'measure-perimeter', pageNum,
        color: toolColor, opacity: toolOpacity, lineWidth: toolLineWidth,
        points: pdfPts, label, unit: measureUnit, createdAt: Date.now(),
      }
      addAnnotation(ann)
    } else if (tool === 'cloud') {
      const ann: CloudAnn = {
        id: newId(), type: 'cloud', pageNum,
        color: toolColor, opacity: toolOpacity, lineWidth: toolLineWidth,
        points: pdfPts, createdAt: Date.now(),
      }
      addAnnotation(ann)
    } else if (tool === 'polygon' || tool === 'polyline') {
      const ann: PolyAnn = {
        id: newId(), type: tool, pageNum,
        color: toolColor, opacity: toolOpacity, lineWidth: toolLineWidth,
        points: pdfPts, createdAt: Date.now(),
      }
      addAnnotation(ann)
    }
    setDraw({ k: 'idle' })
  }

  // ── Mouse handlers ──────────────────────────────────────────────────────

  const handleTypewriterClick = (e: React.MouseEvent) => {
    if (!isTypewriterTool) return
    if (e.button !== 0) return
    e.stopPropagation()
    const [sx, sy] = getSvgXY(e)
    if (draw.k === 'typewriter-edit') commitTypewriter(draw.text)
    setDraw({ k: 'typewriter-edit', x: sx, y: sy, text: '' })
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()

    // An editor is open: clicking the page should let its blur commit the edit,
    // not start a brand-new selection that throws the edit away.
    if (draw.k === 'text-edit-edit' || draw.k === 'textbox-edit'
        || draw.k === 'callout-edit' || draw.k === 'typewriter-edit') {
      return
    }

    if (isTextEditTool) {
      const [sx, sy] = getSvgXY(e)
      setDraw({ k: 'text-edit-size', sx, sy, cx: sx, cy: sy })
      return
    }
    if (isCalloutTool) {
      const [sx, sy] = getSvgXY(e)
      setDraw({ k: 'callout-size', sx, sy, cx: sx, cy: sy })
      return
    }
    if (!activeTool || !isDragDrawTool) return

    const [sx, sy] = getSvgXY(e)

    if (activeTool === 'ink') {
      setDraw({ k: 'ink', cur: [[sx, sy]], done: [] })
    } else if (activeTool === 'textbox') {
      setDraw({ k: 'textbox-size', sx, sy, cx: sx, cy: sy })
    } else if (activeTool === 'stickynote') {
      const [px, py] = toPdf(sx, sy)
      const ann: StickyNoteAnn = {
        id: newId(), type: 'stickynote', pageNum,
        color: toolColor, opacity: toolOpacity, createdAt: Date.now(),
        x: px, y: py, text: '',
      }
      addAnnotation(ann)
      setOpenStickyNote(ann.id)
    } else if (activeTool === 'stamp') {
      const [px, py] = toPdf(sx, sy)
      const ann: StampAnn = {
        id: newId(), type: 'stamp', pageNum,
        color: toolColor, opacity: toolOpacity, createdAt: Date.now(),
        x: px, y: py, width: 120, height: 40,
        stampName,
        imageDataUrl: stampName === 'Custom' ? (customStampDataUrl ?? undefined) : undefined,
      }
      addAnnotation(ann)
    } else if (activeTool === 'snapshot') {
      setDraw({ k: 'snapshot', sx, sy, cx: sx, cy: sy })
    } else {
      setDraw({ k: 'shape', sx, sy, cx: sx, cy: sy })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (imgDrag.k === 'move') {
      const [cx, cy] = getSvgXY(e)
      const dPdfX = (cx - imgDrag.startSvgX) / scale
      const dPdfY = -(cy - imgDrag.startSvgY) / scale
      updateAnnotation(imgDrag.id, {
        x: imgDrag.origAnnX + dPdfX,
        y: imgDrag.origAnnY + dPdfY,
      } as Partial<PlacedImageAnn>)
      return
    }
    if (imgDrag.k === 'resize') {
      const [cx, cy] = getSvgXY(e)
      updateAnnotation(imgDrag.id, {
        width: Math.max(20, imgDrag.origW + (cx - imgDrag.startSvgX) / scale),
        height: Math.max(20, imgDrag.origH + (cy - imgDrag.startSvgY) / scale),
      } as Partial<PlacedImageAnn>)
      return
    }

    if (draw.k === 'idle') return
    const [cx, cy] = getSvgXY(e)
    if (draw.k === 'shape' || draw.k === 'snapshot' || draw.k === 'textbox-size' || draw.k === 'text-edit-size' || draw.k === 'callout-size') {
      setDraw(d => ({ ...d, cx, cy } as DrawPhase))
    } else if (draw.k === 'ink') {
      setDraw(d => ({ ...(d as { k: 'ink'; cur: Array<[number,number]>; done: Array<Array<[number,number]>> }),
        cur: [...(d as any).cur, [cx, cy] as [number, number]] }))
    } else if (draw.k === 'poly') {
      setDraw(d => ({ ...(d as any), curX: cx, curY: cy }))
    }
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    if (imgDrag.k !== 'idle') { setImgDrag({ k: 'idle' }); return }
    if (isMarkupTool) { commitTextSelection(); return }
    if (draw.k === 'idle') return
    const [ex, ey] = getSvgXY(e)

    if (draw.k === 'callout-size') {
      if (Math.abs(ex - draw.sx) < 20 || Math.abs(ey - draw.sy) < 20) { setDraw({ k: 'idle' }); return }
      const x = Math.min(draw.sx, ex), y = Math.min(draw.sy, ey)
      const w = Math.abs(ex - draw.sx), h = Math.abs(ey - draw.sy)
      const tipSvgX = x - 40, tipSvgY = y + h + 40
      setDraw({ k: 'callout-edit', x, y, w, h, text: '', tipSvgX, tipSvgY })
      return
    }

    if (draw.k === 'snapshot') {
      if (Math.abs(ex - draw.sx) >= 8 && Math.abs(ey - draw.sy) >= 8) {
        const svg = svgRef.current
        const wrapper = svg?.closest('.pdf-page-wrapper')
        const canvas = wrapper?.querySelector<HTMLCanvasElement>('canvas.pdf-page-canvas')
        if (canvas) {
          // canvas intrinsic pixels may differ from CSS pixels (HiDPI render scale)
          const ratioX = canvas.width / canvas.clientWidth
          const ratioY = canvas.height / canvas.clientHeight
          const rx = Math.round(Math.min(draw.sx, ex) * ratioX)
          const ry = Math.round(Math.min(draw.sy, ey) * ratioY)
          const rw = Math.round(Math.abs(ex - draw.sx) * ratioX)
          const rh = Math.round(Math.abs(ey - draw.sy) * ratioY)
          const temp = document.createElement('canvas')
          temp.width = rw; temp.height = rh
          const ctx2 = temp.getContext('2d')!
          ctx2.drawImage(canvas, rx, ry, rw, rh, 0, 0, rw, rh)
          temp.toBlob(async blob => {
            if (!blob) return
            try {
              const buf = await blob.arrayBuffer()
              const path = await window.electronAPI.saveFileDialog(`snapshot-page${pageNum}.png`)
              if (path) await window.electronAPI.writeFile(path, buf)
            } catch { /* user cancelled or save failed */ }
          }, 'image/png')
        }
      }
      setDraw({ k: 'idle' })
      usePdfStore.getState().setActiveTool(null)
      return
    }

    if (draw.k === 'shape') {
      const [x1, y1] = toPdf(draw.sx, draw.sy)
      const [x2, y2] = toPdf(ex, ey)
      if (Math.abs(ex - draw.sx) < 4 && Math.abs(ey - draw.sy) < 4) { setDraw({ k: 'idle' }); return }
      if (activeTool === 'redact') {
        addAnnotation({ id: newId(), pageNum, type: 'redact', color: '#000000', opacity: 1,
          x1, y1, x2, y2, blurred: redactBlurred, createdAt: Date.now() } as RedactAnn)
        setDraw({ k: 'idle' }); return
      }
      if (activeTool === 'link') {
        setDraw({ k: 'link-pending', x1, y1, x2, y2, href: '', destPage: '' })
        return
      }
      addAnnotation({
        id: newId(), pageNum, type: activeTool as ShapeAnn['type'],
        color: toolColor, opacity: toolOpacity, lineWidth: toolLineWidth,
        x1, y1, x2, y2, createdAt: Date.now(),
      } as ShapeAnn)
      setDraw({ k: 'idle' })
    } else if (draw.k === 'ink') {
      const allPaths = draw.cur.length > 1
        ? [...draw.done, draw.cur.map(([x, y]) => toPdf(x, y) as [number, number])]
        : draw.done
      if (allPaths.length > 0) {
        addAnnotation({ id: newId(), type: 'ink', pageNum,
          color: toolColor, opacity: toolOpacity, lineWidth: toolLineWidth,
          paths: allPaths, createdAt: Date.now() } as InkAnn)
      }
      setDraw({ k: 'idle' })
    } else if (draw.k === 'textbox-size') {
      if (Math.abs(ex - draw.sx) < 20 || Math.abs(ey - draw.sy) < 20) { setDraw({ k: 'idle' }); return }
      setDraw({ k: 'textbox-edit', x: Math.min(draw.sx, ex), y: Math.min(draw.sy, ey),
        w: Math.abs(ex - draw.sx), h: Math.abs(ey - draw.sy), text: '' })
    } else if (draw.k === 'text-edit-size') {
      const sx = draw.sx, sy = draw.sy
      // Click (not drag): edit the single text object under the cursor in place,
      // sized exactly to it — the PDF-XChange-style "click into text" workflow.
      if (Math.abs(ex - sx) < 6 && Math.abs(ey - sy) < 6) {
        const [px, py] = toPdf(sx, sy)
        ;(async () => {
          try {
            if (await pdfiumReady()) {
              const bytes = usePdfStore.getState().pdfBytes
              if (bytes) {
                const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
                const obj = await window.electronAPI.pdfiumTextObjectAt(ab, pageNum - 1, px, py)
                if (obj.found) {
                  // Render the caret editor in the real page font when available.
                  let fontFamily: string | undefined
                  if (obj.fontLoadable && obj.fontData.byteLength > 0) {
                    fontFamily = (await loadPdfFont(obj.fontData)) ?? undefined
                  }
                  const [ox1, oy2] = toSvg(obj.x1, obj.y2) // top-left
                  const [ox2, oy1] = toSvg(obj.x2, obj.y1) // bottom-right
                  setDraw({ k: 'text-edit-edit', x: ox1, y: oy2,
                    w: Math.max(24, ox2 - ox1), h: Math.max(10, oy1 - oy2),
                    text: obj.text, fontSize: obj.fontSize, color: obj.color, fontFamily })
                  return
                }
              }
            }
          } catch { /* fall through to cancel */ }
          setDraw({ k: 'idle' })
        })()
        return
      }
      if (Math.abs(ex - sx) < 10 || Math.abs(ey - sy) < 10) { setDraw({ k: 'idle' }); return }
      const bx = Math.min(sx, ex), by = Math.min(sy, ey)
      const bw = Math.abs(ex - sx), bh = Math.abs(ey - sy)
      // Immediate prefill from the PDF.js text layer (instant box)
      const dom = readRegionText(sx, sy, ex, ey)
      setDraw({ k: 'text-edit-edit', x: bx, y: by, w: bw, h: bh,
        text: dom.text, fontSize: dom.fontSize, color: dom.color })
      // Upgrade the prefill to exactly the text PDFium will replace, so what the
      // user edits == what gets written back (no partial-line data loss).
      const [px1, py2] = toPdf(bx, by)
      const [px2, py1] = toPdf(bx + bw, by + bh)
      ;(async () => {
        try {
          if (!(await pdfiumReady())) return
          const store = usePdfStore.getState()
          const bytes = await store.getBakedBytes()
          const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
          const res = await window.electronAPI.pdfiumTextInRegion(ab, pageNum - 1, { x1: px1, y1: py1, x2: px2, y2: py2 })
          if (res.found) {
            setDraw(d => (d.k === 'text-edit-edit' && d.text === dom.text)
              ? { ...d, text: res.text, fontSize: res.fontSize || d.fontSize }
              : d)
          }
        } catch { /* keep DOM prefill */ }
      })()
    }
  }

  // ── Text selection markup ────────────────────────────────────────────────

  const commitTextSelection = () => {
    if (!activeTool || !isMarkupTool) return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
    const range = sel.getRangeAt(0)
    const svgBounds = svgRef.current!.getBoundingClientRect()
    const rects = Array.from(range.getClientRects()).filter(r => r.width > 1)
    if (rects.length === 0) { sel.removeAllRanges(); return }
    const quads = rects.map(r => {
      const [x_ul, y_ul] = toPdf(r.left - svgBounds.left, r.top - svgBounds.top)
      const [x_ur, y_ur] = toPdf(r.right - svgBounds.left, r.top - svgBounds.top)
      const [x_ll, y_ll] = toPdf(r.left - svgBounds.left, r.bottom - svgBounds.top)
      const [x_lr, y_lr] = toPdf(r.right - svgBounds.left, r.bottom - svgBounds.top)
      return [x_ul, y_ul, x_ur, y_ur, x_ll, y_ll, x_lr, y_lr]
    })
    addAnnotation({ id: newId(), pageNum, type: activeTool as HighlightAnn['type'],
      color: toolColor, opacity: toolOpacity,
      quads, selectedText: sel.toString(), createdAt: Date.now() } as HighlightAnn)
    sel.removeAllRanges()
  }

  // ── Click handlers ───────────────────────────────────────────────────────

  const handleAnnotClick = (ann: Annotation, e: React.MouseEvent) => {
    e.stopPropagation()
    if (activeTool === 'eraser') {
      deleteAnnotation(ann.id)
    } else if (activeTool === 'select' || !activeTool) {
      setSelectedAnnotation(selectedAnnotationId === ann.id ? null : ann.id)
      if (ann.type === 'stickynote') setOpenStickyNote(openStickyNoteId === ann.id ? null : ann.id)
    }
  }

  const handleSvgClick = (e: React.MouseEvent) => {
    if (isCaretTool && e.button === 0) {
      e.stopPropagation()
      const [sx, sy] = getSvgXY(e)
      const [px, py] = toPdf(sx, sy)
      addAnnotation({
        id: newId(), type: 'caret', pageNum,
        color: toolColor, opacity: toolOpacity, createdAt: Date.now(),
        x: px, y: py - 12, width: 10, height: 14,
      } as CaretAnn)
      return
    }
    if (e.target === svgRef.current) {
      setSelectedAnnotation(null)
      setOpenStickyNote(null)
    }
  }

  // ── Commit helpers ───────────────────────────────────────────────────────

  const commitTextBox = (text: string) => {
    if (draw.k !== 'textbox-edit') return
    if (text.trim()) {
      const [x, y_top] = toPdf(draw.x, draw.y)
      const [, y_bot] = toPdf(draw.x, draw.y + draw.h)
      const [x2] = toPdf(draw.x + draw.w, draw.y)
      addAnnotation({ id: newId(), type: 'textbox', pageNum,
        color: toolColor, opacity: toolOpacity,
        x, y: y_bot, width: x2 - x, height: y_top - y_bot,
        text, fontSize: toolFontSize, createdAt: Date.now() } as TextBoxAnn)
    }
    setDraw({ k: 'idle' })
  }

  const commitTypewriter = (text: string) => {
    if (draw.k !== 'typewriter-edit') return
    if (text.trim()) {
      const [px] = toPdf(draw.x, draw.y)
      const [, py_bot] = toPdf(draw.x, draw.y + toolFontSize * scale * 1.5)
      addAnnotation({ id: newId(), type: 'typewriter', pageNum,
        color: toolColor, opacity: toolOpacity,
        x: px, y: py_bot, text, fontSize: toolFontSize, createdAt: Date.now() } as TypewriterAnn)
    }
    setDraw({ k: 'idle' })
  }

  const commitTextEdit = async (text: string) => {
    if (draw.k !== 'text-edit-edit') return
    const d = draw
    const trimmed = text.trim()
    setDraw({ k: 'idle' })
    if (!trimmed) return

    const [x, y_top] = toPdf(d.x, d.y)
    const [, y_bot] = toPdf(d.x, d.y + d.h)
    const [x2] = toPdf(d.x + d.w, d.y)

    // Preferred path: true in-place edit of the original PDF text via PDFium.
    try {
      if (await pdfiumReady()) {
        const store = usePdfStore.getState()
        // No overlay annotations/forms → edit raw bytes and apply incrementally
        // (preserves zoom/scroll, no full reload). Otherwise bake first.
        const hasOverlays = store.annotations.length > 0 || store.formFields.length > 0
        const src = hasOverlays ? await store.getBakedBytes() : store.pdfBytes
        if (src) {
          const ab = src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength) as ArrayBuffer
          const out = await window.electronAPI.pdfiumEditText(
            ab, pageNum - 1, { x1: x, y1: y_bot, x2, y2: y_top }, text,
          )
          if (out && out.byteLength > 0) {
            if (hasOverlays) await store.applyEdit(new Uint8Array(out))
            else await store.applyContentEdit(new Uint8Array(out), pageNum)
            return
          }
        }
      }
    } catch { /* engine unavailable or no text found — fall back to overlay */ }

    // Fallback: cover the region and paint the replacement (font-matched overlay).
    addAnnotation({ id: newId(), type: 'text-edit', pageNum,
      color: d.color ?? toolColor, opacity: toolOpacity,
      x, y: y_bot, width: x2 - x, height: y_top - y_bot,
      text, fontSize: d.fontSize ?? toolFontSize, createdAt: Date.now() } as TextEditAnn)
  }

  const commitCallout = (text: string) => {
    if (draw.k !== 'callout-edit') return
    if (text.trim()) {
      const [x, y_top] = toPdf(draw.x, draw.y)
      const [, y_bot] = toPdf(draw.x, draw.y + draw.h)
      const [x2] = toPdf(draw.x + draw.w, draw.y)
      const [tipX, tipY] = toPdf(draw.tipSvgX, draw.tipSvgY)
      addAnnotation({ id: newId(), type: 'callout', pageNum,
        color: toolColor, opacity: toolOpacity,
        x, y: y_bot, width: x2 - x, height: y_top - y_bot,
        text, fontSize: toolFontSize, lineWidth: toolLineWidth,
        tipX, tipY, createdAt: Date.now() } as CalloutAnn)
    }
    setDraw({ k: 'idle' })
  }

  // ── Keyboard ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const { selectedAnnotationId: sid, deleteAnnotation: del, setSelectedAnnotation: setSel } = usePdfStore.getState()
        if (sid && document.activeElement?.tagName !== 'INPUT' &&
            document.activeElement?.tagName !== 'TEXTAREA') {
          del(sid); setSel(null)
        }
      }
      if (e.key === 'Escape') {
        usePdfStore.getState().setSelectedAnnotation(null)
        usePdfStore.getState().setOpenStickyNote(null)
        setDraw({ k: 'idle' })
      }
      // Enter finishes poly drawing
      if (e.key === 'Enter' && draw.k === 'poly') {
        commitPoly(draw.pts)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [draw]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Rendering helpers ────────────────────────────────────────────────────

  const annStyle = (_ann: Annotation) => ({
    cursor: activeTool === 'eraser' ? 'cell'
      : activeTool === 'select' || !activeTool ? 'pointer' : 'crosshair',
  })

  const selBorder = (ann: Annotation) =>
    selectedAnnotationId === ann.id ? { filter: 'drop-shadow(0 0 3px #4a9eff)' } : {}

  function getBBoxStyle(ann: InkAnn) {
    const pts = ann.paths.flat()
    if (pts.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
    const [sx1, sy1] = toSvg(Math.min(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1])))
    const [sx2, sy2] = toSvg(Math.max(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])))
    return { x: sx1 - 4, y: sy1 - 4, width: sx2 - sx1 + 8, height: sy2 - sy1 + 8 }
  }

  // ── Annotation rendering ─────────────────────────────────────────────────

  const renderAnn = (ann: Annotation) => {
    const sel = selectedAnnotationId === ann.id

    if (ann.type === 'highlight' || ann.type === 'underline' || ann.type === 'strikethrough') {
      const a = ann as HighlightAnn
      return (
        <g key={a.id} onClick={e => handleAnnotClick(a, e)} style={{ ...annStyle(a), ...selBorder(a) }}>
          {a.quads.map((q, qi) => {
            const [lx, ly] = toSvg(q[0], q[1])
            const [rx, ry] = toSvg(q[2], q[3])
            const [blx, bly] = toSvg(q[4], q[5])
            const [brx, bry] = toSvg(q[6], q[7])
            if (a.type === 'highlight')
              return <polygon key={qi} points={`${lx},${ly} ${rx},${ry} ${brx},${bry} ${blx},${bly}`}
                fill={a.color} fillOpacity={a.opacity} stroke="none" pointerEvents="all" />
            if (a.type === 'underline')
              return <line key={qi} x1={blx} y1={bly} x2={brx} y2={bry}
                stroke={a.color} strokeWidth={Math.max(1, scale)} strokeOpacity={a.opacity} pointerEvents="stroke" />
            const mx = (lx + blx) / 2, my = (ly + bly) / 2
            const mx2 = (rx + brx) / 2, my2 = (ry + bry) / 2
            return <line key={qi} x1={mx} y1={my} x2={mx2} y2={my2}
              stroke={a.color} strokeWidth={Math.max(1, scale)} strokeOpacity={a.opacity} pointerEvents="stroke" />
          })}
        </g>
      )
    }

    if (ann.type === 'ink') {
      const a = ann as InkAnn
      return (
        <g key={a.id} onClick={e => handleAnnotClick(a, e)} style={{ ...annStyle(a), ...selBorder(a) }}>
          {a.paths.map((path, pi) => (
            <polyline key={pi} points={path.map(([px, py]) => toSvg(px, py).join(',')).join(' ')}
              fill="none" stroke={a.color} strokeWidth={a.lineWidth * scale} strokeOpacity={a.opacity}
              strokeLinecap="round" strokeLinejoin="round" pointerEvents="stroke" />
          ))}
          {sel && <rect {...getBBoxStyle(a)} fill="none" stroke="#4a9eff" strokeWidth={1} strokeDasharray="4,2" />}
        </g>
      )
    }

    if (ann.type === 'rectangle') {
      const a = ann as ShapeAnn
      const [svgX1, svgY1] = toSvg(Math.min(a.x1, a.x2), Math.max(a.y1, a.y2))
      const [svgX2, svgY2] = toSvg(Math.max(a.x1, a.x2), Math.min(a.y1, a.y2))
      return <rect key={a.id} x={svgX1} y={svgY1} width={svgX2 - svgX1} height={svgY2 - svgY1}
        fill="none" stroke={a.color} strokeWidth={a.lineWidth * scale} strokeOpacity={a.opacity}
        strokeDasharray={sel ? '6,3' : undefined}
        onClick={e => handleAnnotClick(a, e)} style={annStyle(a)} pointerEvents="stroke" />
    }

    if (ann.type === 'ellipse') {
      const a = ann as ShapeAnn
      const [cx, cy] = toSvg((a.x1 + a.x2) / 2, (a.y1 + a.y2) / 2)
      return <ellipse key={a.id} cx={cx} cy={cy}
        rx={Math.abs(a.x2 - a.x1) / 2 * scale} ry={Math.abs(a.y2 - a.y1) / 2 * scale}
        fill="none" stroke={a.color} strokeWidth={a.lineWidth * scale} strokeOpacity={a.opacity}
        strokeDasharray={sel ? '6,3' : undefined}
        onClick={e => handleAnnotClick(a, e)} style={annStyle(a)} pointerEvents="stroke" />
    }

    if (ann.type === 'line' || ann.type === 'arrow') {
      const a = ann as ShapeAnn
      const [x1, y1] = toSvg(a.x1, a.y1)
      const [x2, y2] = toSvg(a.x2, a.y2)
      const mid = `M${pageNum}-${a.id}`
      return (
        <g key={a.id} onClick={e => handleAnnotClick(a, e)} style={annStyle(a)}>
          {a.type === 'arrow' && (
            <defs>
              <marker id={mid} markerWidth={10} markerHeight={7} refX={9} refY={3.5} orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill={a.color} fillOpacity={a.opacity} />
              </marker>
            </defs>
          )}
          <line x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={a.color} strokeWidth={a.lineWidth * scale} strokeOpacity={a.opacity}
            strokeDasharray={sel ? '6,3' : undefined}
            markerEnd={a.type === 'arrow' ? `url(#${mid})` : undefined}
            pointerEvents="stroke" />
        </g>
      )
    }

    if (ann.type === 'textbox') {
      const a = ann as TextBoxAnn
      const [svgX, svgY_top] = toSvg(a.x, a.y + a.height)
      return (
        <foreignObject key={a.id} x={svgX} y={svgY_top} width={a.width * scale} height={a.height * scale}
          onClick={e => handleAnnotClick(a, e)} style={annStyle(a)}>
          <div style={{
            width: '100%', height: '100%', padding: 4,
            fontSize: a.fontSize * scale, color: a.color, opacity: a.opacity,
            fontFamily: 'sans-serif', border: sel ? '1px dashed #4a9eff' : '1px solid rgba(255,255,255,0.2)',
            boxSizing: 'border-box', overflow: 'hidden', wordBreak: 'break-word',
            background: 'rgba(255,255,220,0.08)', pointerEvents: 'all', whiteSpace: 'pre-wrap',
          }}>{a.text}</div>
        </foreignObject>
      )
    }

    if (ann.type === 'stickynote') {
      const a = ann as StickyNoteAnn
      const [sx, sy] = toSvg(a.x, a.y)
      const sz = 22 * scale
      return (
        <g key={a.id} transform={`translate(${sx},${sy - sz})`}
          onClick={e => handleAnnotClick(a, e)} style={{ ...annStyle(a), ...selBorder(a) }}>
          <rect x={0} y={0} width={sz} height={sz} rx={4}
            fill={a.color} fillOpacity={Math.min(1, a.opacity + 0.2)} />
          <text x={sz / 2} y={sz / 2} textAnchor="middle" dominantBaseline="middle"
            fontSize={sz * 0.55} pointerEvents="none">💬</text>
        </g>
      )
    }

    if (ann.type === 'redact') {
      const a = ann as RedactAnn
      const [svgX1, svgY1] = toSvg(Math.min(a.x1, a.x2), Math.max(a.y1, a.y2))
      const [svgX2, svgY2] = toSvg(Math.max(a.x1, a.x2), Math.min(a.y1, a.y2))
      const w = svgX2 - svgX1, h = svgY2 - svgY1
      const filterId = `blur-${a.id}`
      if (a.blurred) {
        return (
          <g key={a.id} onClick={e => handleAnnotClick(a, e)} style={annStyle(a)}>
            <defs>
              <filter id={filterId} x="-5%" y="-5%" width="110%" height="110%">
                <feGaussianBlur stdDeviation="6" />
              </filter>
            </defs>
            <rect x={svgX1} y={svgY1} width={w} height={h}
              fill="rgba(100,100,120,0.55)" filter={`url(#${filterId})`}
              stroke={sel ? '#4a9eff' : '#8888cc'} strokeWidth={sel ? 2 : 1.5}
              strokeDasharray={sel ? '6,3' : '4,3'} pointerEvents="all" />
            {h > 16 && <text x={svgX1 + w / 2} y={svgY1 + h / 2}
              textAnchor="middle" dominantBaseline="middle"
              fill="#aaaadd" fontSize={Math.min(11, h * 0.5)}
              fontWeight="bold" fontFamily="sans-serif" pointerEvents="none">BLUR</text>}
          </g>
        )
      }
      return (
        <g key={a.id} onClick={e => handleAnnotClick(a, e)} style={annStyle(a)}>
          <defs>
            <pattern id={`rp-${a.id}`} patternUnits="userSpaceOnUse" width={10} height={10} patternTransform="rotate(45)">
              <rect width={10} height={10} fill="#1a1a1a" />
              <line x1={0} y1={0} x2={0} y2={10} stroke="#ff4444" strokeWidth={3} />
            </pattern>
          </defs>
          <rect x={svgX1} y={svgY1} width={w} height={h}
            fill={`url(#rp-${a.id})`}
            stroke={sel ? '#4a9eff' : '#ff4444'} strokeWidth={sel ? 2 : 1.5}
            strokeDasharray={sel ? '6,3' : undefined} pointerEvents="all" />
          {h > 16 && <text x={svgX1 + w / 2} y={svgY1 + h / 2}
            textAnchor="middle" dominantBaseline="middle"
            fill="#ff4444" fontSize={Math.min(11, h * 0.5)}
            fontWeight="bold" fontFamily="sans-serif" pointerEvents="none">REDACT</text>}
        </g>
      )
    }

    if (ann.type === 'stamp') {
      const a = ann as StampAnn
      const [sx, sy] = toSvg(a.x, a.y)
      const w = a.width * scale, h = a.height * scale
      return (
        <g key={a.id} transform={`translate(${sx},${sy})`}
          onClick={e => handleAnnotClick(a, e)} style={{ ...annStyle(a), opacity: a.opacity }}>
          {sel && <rect x={-w/2-2} y={-h/2-2} width={w+4} height={h+4}
            fill="none" stroke="#4a9eff" strokeWidth={1} strokeDasharray="4,2" />}
          {a.stampName === 'Custom' && a.imageDataUrl
            ? <image href={a.imageDataUrl} x={-w/2} y={-h/2} width={w} height={h} />
            : <StampShape color={a.color} stampName={a.stampName} w={w} h={h} />}
        </g>
      )
    }

    if (ann.type === 'typewriter') {
      const a = ann as TypewriterAnn
      const [svgX, svgY] = toSvg(a.x, a.y + a.fontSize * 1.5)
      return (
        <foreignObject key={a.id} x={svgX} y={svgY} width={W - svgX} height={a.fontSize * scale * 3}
          onClick={e => handleAnnotClick(a, e)} style={annStyle(a)}>
          <div style={{
            fontSize: a.fontSize * scale, color: a.color, opacity: a.opacity,
            fontFamily: 'sans-serif', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            border: sel ? '1px dashed #4a9eff' : 'none', outline: 'none', padding: 2, boxSizing: 'border-box',
          }}>{a.text}</div>
        </foreignObject>
      )
    }

    if (ann.type === 'text-edit') {
      const a = ann as TextEditAnn
      const [svgX, svgY_top] = toSvg(a.x, a.y + a.height)
      return (
        <g key={a.id} onClick={e => handleAnnotClick(a, e)} style={annStyle(a)}>
          <rect x={svgX} y={svgY_top} width={a.width * scale} height={a.height * scale} fill="white" />
          <foreignObject x={svgX} y={svgY_top} width={a.width * scale} height={a.height * scale}>
            <div style={{
              width: '100%', height: '100%', padding: '0 2px',
              fontSize: a.fontSize * scale, color: a.color, opacity: a.opacity, lineHeight: 1.2,
              fontFamily: 'serif', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              border: sel ? '1px dashed #4a9eff' : '1px solid transparent',
              boxSizing: 'border-box', background: 'white',
            }}>{a.text}</div>
          </foreignObject>
        </g>
      )
    }

    if (ann.type === 'placed-image') {
      const a = ann as PlacedImageAnn
      const [svgX, svgY_top] = toSvg(a.x, a.y + a.height)
      const svgW = a.width * scale, svgH = a.height * scale
      return (
        <g key={a.id}
          onClick={e => { if (imgDrag.k === 'idle') handleAnnotClick(a, e) }}
          style={{ cursor: activeTool === 'eraser' ? 'cell' : 'move', opacity: a.opacity }}>
          <image href={a.dataUrl} x={svgX} y={svgY_top} width={svgW} height={svgH}
            onMouseDown={e => {
              if (activeTool === 'eraser') return
              e.stopPropagation()
              setSelectedAnnotation(a.id)
              const [sx, sy] = getSvgXY(e)
              setImgDrag({ k: 'move', id: a.id, startSvgX: sx, startSvgY: sy, origAnnX: a.x, origAnnY: a.y })
            }} />
          {sel && (
            <>
              <rect x={svgX-1} y={svgY_top-1} width={svgW+2} height={svgH+2}
                fill="none" stroke="#4a9eff" strokeWidth={1.5} strokeDasharray="5,3" pointerEvents="none" />
              <rect x={svgX+svgW-6} y={svgY_top+svgH-6} width={12} height={12}
                fill="#4a9eff" rx={2} style={{ cursor: 'nwse-resize' }}
                onMouseDown={e => {
                  e.stopPropagation()
                  setImgDrag({ k: 'resize', id: a.id, corner: 'br',
                    startSvgX: getSvgXY(e)[0], startSvgY: getSvgXY(e)[1],
                    origW: a.width, origH: a.height })
                }} />
            </>
          )}
        </g>
      )
    }

    // ── Batch 2 new types ────────────────────────────────────────────────

    if (ann.type === 'callout') {
      const a = ann as CalloutAnn
      const [svgX, svgY_top] = toSvg(a.x, a.y + a.height)
      const svgW = a.width * scale, svgH = a.height * scale
      const [tipSvgX, tipSvgY] = toSvg(a.tipX, a.tipY)
      const attachX = svgX, attachY = svgY_top + svgH / 2
      return (
        <g key={a.id} onClick={e => handleAnnotClick(a, e)} style={{ ...annStyle(a), ...selBorder(a) }}>
          <line x1={tipSvgX} y1={tipSvgY} x2={attachX} y2={attachY}
            stroke={a.color} strokeWidth={a.lineWidth * scale} strokeOpacity={a.opacity} pointerEvents="stroke" />
          <rect x={svgX} y={svgY_top} width={svgW} height={svgH}
            fill="rgba(255,255,220,0.9)" stroke={a.color} strokeWidth={a.lineWidth * scale}
            strokeOpacity={a.opacity} strokeDasharray={sel ? '5,3' : undefined} pointerEvents="all" />
          <foreignObject x={svgX+2} y={svgY_top+2} width={Math.max(0,svgW-4)} height={Math.max(0,svgH-4)}>
            <div style={{
              fontSize: a.fontSize * scale, color: a.color, fontFamily: 'sans-serif',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: 2,
            }}>{a.text}</div>
          </foreignObject>
        </g>
      )
    }

    if (ann.type === 'cloud') {
      const a = ann as CloudAnn
      if (a.points.length < 2) return null
      const svgPts = a.points.map(([px, py]) => toSvg(px, py) as [number, number])
      const d = makeCloudPath(svgPts, true)
      return <path key={a.id} d={d} fill="none"
        stroke={a.color} strokeWidth={a.lineWidth * scale} strokeOpacity={a.opacity}
        strokeDasharray={sel ? '6,3' : undefined}
        onClick={e => handleAnnotClick(a, e)} style={annStyle(a)} pointerEvents="stroke" />
    }

    if (ann.type === 'polygon' || ann.type === 'polyline') {
      const a = ann as PolyAnn
      if (a.points.length < 2) return null
      const svgPts = a.points.map(([px, py]) => toSvg(px, py).join(',')).join(' ')
      const Tag = a.type === 'polygon' ? 'polygon' : 'polyline'
      return <Tag key={a.id} points={svgPts} fill="none"
        stroke={a.color} strokeWidth={a.lineWidth * scale} strokeOpacity={a.opacity}
        strokeDasharray={sel ? '6,3' : undefined} strokeLinejoin="round"
        onClick={e => handleAnnotClick(a, e)} style={annStyle(a)} pointerEvents="stroke" />
    }

    if (ann.type === 'caret') {
      const a = ann as CaretAnn
      const [sx, sy] = toSvg(a.x, a.y)
      const sz = Math.max(10, a.height * scale)
      return (
        <g key={a.id} onClick={e => handleAnnotClick(a, e)} style={{ ...annStyle(a), ...selBorder(a) }}>
          <polygon points={`${sx},${sy} ${sx + sz/2},${sy - sz} ${sx + sz},${sy}`}
            fill={a.color} fillOpacity={a.opacity * 0.5}
            stroke={a.color} strokeWidth={1.5} strokeOpacity={a.opacity} />
          <line x1={sx} y1={sy + 2} x2={sx + sz} y2={sy + 2}
            stroke={a.color} strokeWidth={1.5} strokeOpacity={a.opacity} />
        </g>
      )
    }

    if (ann.type === 'measure-distance' || ann.type === 'measure-area' || ann.type === 'measure-perimeter') {
      const a = ann as MeasureAnn
      if (a.points.length < 2) return null
      const svgPts = a.points.map(([px, py]) => toSvg(px, py) as [number, number])
      const midX = svgPts.reduce((s, p) => s + p[0], 0) / svgPts.length
      const midY = svgPts.reduce((s, p) => s + p[1], 0) / svgPts.length
      const ptStr = svgPts.map(p => p.join(',')).join(' ')
      const isLine = a.type === 'measure-distance'
      return (
        <g key={a.id} onClick={e => handleAnnotClick(a, e)} style={{ ...annStyle(a), ...selBorder(a) }}>
          {isLine
            ? <line x1={svgPts[0][0]} y1={svgPts[0][1]} x2={svgPts[1][0]} y2={svgPts[1][1]}
                stroke={a.color} strokeWidth={a.lineWidth * scale} strokeOpacity={a.opacity}
                strokeDasharray="4,2" pointerEvents="stroke" />
            : <polygon points={ptStr} fill="rgba(74,158,255,0.06)"
                stroke={a.color} strokeWidth={a.lineWidth * scale} strokeOpacity={a.opacity}
                strokeDasharray="4,2" pointerEvents="all" />}
          {/* Endpoint dots */}
          {svgPts.map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r={3 * scale}
              fill={a.color} fillOpacity={a.opacity} pointerEvents="none" />
          ))}
          {/* Label */}
          <rect x={midX - 28} y={midY - 10} width={56} height={18} rx={3}
            fill="rgba(0,0,0,0.65)" pointerEvents="none" />
          <text x={midX} y={midY + 5} textAnchor="middle"
            fill={a.color} fontSize={10 * scale} fontFamily="monospace" pointerEvents="none">
            {a.label}
          </text>
        </g>
      )
    }

    if (ann.type === 'link') {
      const a = ann as LinkAnn
      const [svgX1, svgY1] = toSvg(Math.min(a.x1, a.x2), Math.max(a.y1, a.y2))
      const [svgX2, svgY2] = toSvg(Math.max(a.x1, a.x2), Math.min(a.y1, a.y2))
      const label = a.href ? (a.href.length > 28 ? a.href.slice(0, 25) + '…' : a.href)
        : a.destPage != null ? `Page ${a.destPage}` : 'Link'
      return (
        <g key={a.id} onClick={e => handleAnnotClick(a, e)} style={annStyle(a)}>
          <rect x={svgX1} y={svgY1} width={svgX2 - svgX1} height={svgY2 - svgY1}
            fill={a.color} fillOpacity={sel ? 0.25 : 0.12}
            stroke={a.color} strokeWidth={sel ? 2 : 1.5} strokeOpacity={0.8}
            strokeDasharray={sel ? '6,3' : undefined} />
          {svgY2 - svgY1 > 14 && svgX2 - svgX1 > 30 && (
            <text x={svgX1 + 4} y={svgY1 + 12} fontSize={10} fill={a.color} fillOpacity={0.9}
              fontFamily="monospace" pointerEvents="none">
              {label}
            </text>
          )}
        </g>
      )
    }

    return null
  }

  // ── Preview while drawing ────────────────────────────────────────────────

  const renderPreview = () => {
    if (draw.k === 'poly' && draw.pts.length >= 1) {
      const { pts, curX, curY } = draw
      const allPts = [...pts, [curX, curY] as [number, number]]
      const ptStr = allPts.map(p => p.join(',')).join(' ')
      const tool = activeTool
      if (tool === 'cloud') {
        return <path d={makeCloudPath(allPts, false)} fill="none"
          stroke={toolColor} strokeWidth={toolLineWidth * scale} strokeOpacity={toolOpacity} strokeDasharray="4,3" />
      }
      if (tool === 'polygon' || tool === 'measure-area' || tool === 'measure-perimeter') {
        return <>
          <polygon points={ptStr} fill="rgba(74,158,255,0.05)"
            stroke={toolColor} strokeWidth={toolLineWidth * scale} strokeOpacity={toolOpacity} strokeDasharray="4,3" />
          {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={3} fill={toolColor} fillOpacity={0.7} />)}
          <circle cx={curX} cy={curY} r={3} fill={toolColor} fillOpacity={0.4} />
        </>
      }
      if (tool === 'measure-distance') {
        const p0 = pts[0], p1 = [curX, curY] as [number, number]
        const pdfP0 = toPdf(p0[0], p0[1]), pdfP1 = toPdf(curX, curY)
        const dx = pdfP1[0] - pdfP0[0], dy = pdfP1[1] - pdfP0[1]
        const d = Math.sqrt(dx*dx + dy*dy).toFixed(1)
        const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2
        return <>
          <line x1={p0[0]} y1={p0[1]} x2={curX} y2={curY}
            stroke={toolColor} strokeWidth={toolLineWidth * scale} strokeOpacity={toolOpacity} strokeDasharray="4,3" />
          <rect x={mx-26} y={my-10} width={52} height={18} rx={3} fill="rgba(0,0,0,0.6)" />
          <text x={mx} y={my+5} textAnchor="middle" fill={toolColor} fontSize={10*scale} fontFamily="monospace">
            {d} pt
          </text>
        </>
      }
      // polyline
      return <>
        <polyline points={ptStr} fill="none"
          stroke={toolColor} strokeWidth={toolLineWidth * scale} strokeOpacity={toolOpacity} strokeDasharray="4,3" />
        {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={3} fill={toolColor} fillOpacity={0.7} />)}
      </>
    }

    if (draw.k === 'snapshot') {
      const { sx, sy, cx, cy } = draw
      const x = Math.min(sx, cx), y = Math.min(sy, cy)
      const w = Math.abs(cx - sx), h = Math.abs(cy - sy)
      return <rect x={x} y={y} width={w} height={h}
        fill="rgba(74,158,255,0.08)" stroke="#4a9eff" strokeWidth={1.5} strokeDasharray="6,3" />
    }

    if (draw.k === 'callout-size') {
      const { sx, sy, cx, cy } = draw
      const x = Math.min(sx, cx), y = Math.min(sy, cy)
      const w = Math.abs(cx - sx), h = Math.abs(cy - sy)
      return <rect x={x} y={y} width={w} height={h}
        fill="rgba(255,255,220,0.2)" stroke="#4a9eff" strokeWidth={1.5} strokeDasharray="4,3" />
    }

    if (draw.k === 'text-edit-size') {
      const { sx, sy, cx, cy } = draw
      return <rect x={Math.min(sx,cx)} y={Math.min(sy,cy)}
        width={Math.abs(cx-sx)} height={Math.abs(cy-sy)}
        fill="rgba(255,255,255,0.7)" stroke="#ff8800" strokeWidth={1.5} strokeDasharray="4,3" />
    }

    if (draw.k === 'shape' || draw.k === 'textbox-size') {
      const { sx, sy, cx, cy } = draw
      const x = Math.min(sx, cx), y = Math.min(sy, cy)
      const w = Math.abs(cx - sx), h = Math.abs(cy - sy)
      const sw = toolLineWidth * scale
      if (activeTool === 'link')
        return <rect x={x} y={y} width={w} height={h}
          fill="rgba(0,100,255,0.08)" stroke="#0064ff" strokeWidth={1.5} strokeDasharray="4,3" />
      if (activeTool === 'redact')
        return <rect x={x} y={y} width={w} height={h}
          fill="rgba(255,40,40,0.18)" stroke="#ff4444" strokeWidth={1.5} strokeDasharray="4,3" />
      if (activeTool === 'rectangle' || draw.k === 'textbox-size')
        return <rect x={x} y={y} width={w} height={h}
          fill={draw.k === 'textbox-size' ? 'rgba(74,158,255,0.05)' : 'none'}
          stroke={draw.k === 'textbox-size' ? '#4a9eff' : toolColor}
          strokeWidth={draw.k === 'textbox-size' ? 1 : sw}
          strokeOpacity={toolOpacity} strokeDasharray="4,3" />
      if (activeTool === 'ellipse')
        return <ellipse cx={sx + (cx-sx)/2} cy={sy + (cy-sy)/2}
          rx={w/2} ry={h/2} fill="none"
          stroke={toolColor} strokeWidth={sw} strokeOpacity={toolOpacity} strokeDasharray="4,3" />
      if (activeTool === 'line')
        return <line x1={sx} y1={sy} x2={cx} y2={cy}
          stroke={toolColor} strokeWidth={sw} strokeOpacity={toolOpacity} strokeDasharray="4,3" />
      if (activeTool === 'arrow')
        return (
          <g>
            <defs>
              <marker id="pa" markerWidth={10} markerHeight={7} refX={9} refY={3.5} orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill={toolColor} fillOpacity={toolOpacity} />
              </marker>
            </defs>
            <line x1={sx} y1={sy} x2={cx} y2={cy}
              stroke={toolColor} strokeWidth={sw} strokeOpacity={toolOpacity}
              markerEnd="url(#pa)" strokeDasharray="4,3" />
          </g>
        )
    }

    if (draw.k === 'ink' && draw.cur.length > 1) {
      const pts = draw.cur.map(([x, y]) => `${x},${y}`).join(' ')
      return <polyline points={pts} fill="none"
        stroke={toolColor} strokeWidth={toolLineWidth * scale} strokeOpacity={toolOpacity}
        strokeLinecap="round" strokeLinejoin="round" />
    }

    return null
  }

  // ── Popups & edit overlays ───────────────────────────────────────────────

  const renderStickyPopup = () => {
    const ann = pageAnnotations.find(a => a.id === openStickyNoteId && a.type === 'stickynote') as StickyNoteAnn | undefined
    if (!ann) return null
    const [sx, sy] = toSvg(ann.x, ann.y)
    const popW = 220, popH = 140
    const px = Math.min(sx, W - popW - 8), py = Math.max(8, sy - popH - 28)
    return (
      <foreignObject x={px} y={py} width={popW} height={popH} style={{ pointerEvents: 'all' }}>
        <div style={{ width: '100%', height: '100%', background: '#fefcbf', borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ background: ann.color, padding: '4px 8px', fontSize: 11, color: '#000', fontWeight: 600 }}>Note</div>
          <textarea style={{ flex: 1, padding: 8, border: 'none', outline: 'none', resize: 'none',
            fontFamily: 'inherit', fontSize: 12, background: 'transparent', color: '#1a1a1a' }}
            value={ann.text} onChange={e => updateAnnotation(ann.id, { text: e.target.value })}
            placeholder="Type a note…" autoFocus />
        </div>
      </foreignObject>
    )
  }

  const renderTextBoxEdit = () => {
    if (draw.k !== 'textbox-edit') return null
    const { x, y, w, h } = draw
    const rtl = settings.rtlText
    return (
      <foreignObject x={x} y={y} width={w} height={h} style={{ pointerEvents: 'all' }}>
        <textarea style={{ width: '100%', height: '100%', background: 'rgba(255,255,220,0.9)', color: toolColor,
          border: '2px solid #4a9eff', outline: 'none', resize: 'none', fontFamily: 'sans-serif',
          fontSize: toolFontSize * scale, padding: 4, boxSizing: 'border-box',
          direction: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left' }}
          autoFocus value={draw.text}
          onChange={e => setDraw(d => ({ ...(d as any), text: e.target.value } as DrawPhase))}
          onBlur={e => commitTextBox(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') setDraw({ k: 'idle' }) }}
          placeholder="Type text…" />
      </foreignObject>
    )
  }

  const renderTypewriterEdit = () => {
    if (draw.k !== 'typewriter-edit') return null
    const { x, y, text } = draw
    const rtl = settings.rtlText
    return (
      <foreignObject x={x} y={y} width={Math.max(120, W - x - 8)} height={toolFontSize * scale * 4}
        style={{ pointerEvents: 'all' }}>
        <input type="text" style={{ width: '100%', background: 'transparent', color: toolColor,
          border: 'none', borderBottom: `2px solid ${toolColor}`, outline: 'none',
          fontFamily: 'sans-serif', fontSize: toolFontSize * scale, padding: 2,
          direction: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left' }}
          autoFocus value={text}
          onChange={e => setDraw(d => ({ ...(d as any), text: e.target.value } as DrawPhase))}
          onBlur={e => commitTypewriter(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') setDraw({ k: 'idle' })
            if (e.key === 'Enter' && !e.shiftKey) commitTypewriter((e.target as HTMLInputElement).value)
          }}
          placeholder="Type here…" />
      </foreignObject>
    )
  }

  const renderTextEditBox = () => {
    if (draw.k !== 'text-edit-edit') return null
    const { x, y, w, h } = draw
    const fs = (draw.fontSize ?? toolFontSize)
    const col = draw.color ?? toolColor
    // Caret-in-place mode: editor rendered in the real page font, tight border.
    const inPlace = !!draw.fontFamily
    const fam = draw.fontFamily ? `'${draw.fontFamily}', serif` : 'serif'
    return (
      <g>
        <foreignObject x={x} y={y} width={w} height={Math.max(h, fs * scale + 8)} style={{ pointerEvents: 'all' }}>
          <textarea style={{ width: '100%', height: '100%', background: 'white', color: col,
            border: inPlace ? '1px solid #4a9eff' : '2px solid #ff8800', outline: 'none', resize: 'none',
            fontFamily: fam, fontSize: fs * scale, lineHeight: inPlace ? 1.0 : 1.2,
            padding: '0 1px', boxSizing: 'border-box', overflow: 'hidden' }}
            autoFocus value={draw.text}
            onFocus={e => e.currentTarget.select()}
            onChange={e => setDraw(d => ({ ...(d as any), text: e.target.value } as DrawPhase))}
            onBlur={e => {
              if (cancelEditRef.current) { cancelEditRef.current = false; setDraw({ k: 'idle' }); return }
              commitTextEdit(e.target.value)
            }}
            onKeyDown={e => {
              if (e.key === 'Escape') { e.preventDefault(); cancelEditRef.current = true; e.currentTarget.blur() }
              else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur() }
            }}
            placeholder="Edit text…" />
        </foreignObject>
        <foreignObject x={x} y={y + Math.max(h, fs * scale + 8) + 2} width={Math.max(w, 220)} height={18} style={{ pointerEvents: 'none' }}>
          <div style={{ fontSize: 11, fontFamily: 'sans-serif', color: '#ff8800', fontWeight: 600,
            background: 'rgba(0,0,0,0.04)', whiteSpace: 'nowrap' }}>
            Enter = apply · Shift+Enter = new line · Esc = cancel
          </div>
        </foreignObject>
      </g>
    )
  }

  const renderCalloutEdit = () => {
    if (draw.k !== 'callout-edit') return null
    const { x, y, w, h, tipSvgX, tipSvgY } = draw
    return (
      <>
        <line x1={tipSvgX} y1={tipSvgY} x2={x} y2={y + h / 2}
          stroke={toolColor} strokeWidth={toolLineWidth * scale} strokeOpacity={toolOpacity} strokeDasharray="4,3" />
        <circle cx={tipSvgX} cy={tipSvgY} r={5} fill={toolColor} fillOpacity={0.6} />
        <foreignObject x={x} y={y} width={w} height={h} style={{ pointerEvents: 'all' }}>
          <textarea style={{ width: '100%', height: '100%', background: 'rgba(255,255,220,0.95)',
            color: toolColor, border: `2px solid ${toolColor}`, outline: 'none', resize: 'none',
            fontFamily: 'sans-serif', fontSize: toolFontSize * scale, padding: 4, boxSizing: 'border-box' }}
            autoFocus value={draw.text}
            onChange={e => setDraw(d => ({ ...(d as any), text: e.target.value } as DrawPhase))}
            onBlur={e => commitCallout(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setDraw({ k: 'idle' }) }}
            placeholder="Callout text…" />
        </foreignObject>
      </>
    )
  }

  const commitLink = () => {
    if (draw.k !== 'link-pending') return
    const { x1, y1, x2, y2, href, destPage } = draw
    const trimHref = href.trim()
    const pageNum_ = parseInt(destPage, 10)
    if (!trimHref && isNaN(pageNum_)) { setDraw({ k: 'idle' }); return }
    const ann: LinkAnn = {
      id: newId(), type: 'link', pageNum,
      color: '#0055cc', opacity: 0.3, createdAt: Date.now(),
      x1, y1, x2, y2,
      ...(trimHref ? { href: trimHref } : { destPage: pageNum_ }),
    }
    addAnnotation(ann)
    setDraw({ k: 'idle' })
  }

  const renderLinkPending = () => {
    if (draw.k !== 'link-pending') return null
    const [svgX1, svgY1] = toSvg(Math.min(draw.x1, draw.x2), Math.max(draw.y1, draw.y2))
    const [svgX2, svgY2] = toSvg(Math.max(draw.x1, draw.x2), Math.min(draw.y1, draw.y2))
    const formW = 280, formH = 130
    const fx = Math.min(svgX1, W - formW - 8), fy = Math.max(8, svgY1 - formH - 8)
    return (
      <>
        <rect x={svgX1} y={svgY1} width={svgX2 - svgX1} height={svgY2 - svgY1}
          fill="rgba(0,85,204,0.12)" stroke="#0055cc" strokeWidth={1.5} strokeDasharray="4,3" />
        <foreignObject x={fx} y={fy} width={formW} height={formH} style={{ pointerEvents: 'all' }}>
          <div style={{ background: 'var(--bg-secondary, #2a2a2a)', border: '1px solid var(--border, #444)',
            borderRadius: 6, padding: 10, display: 'flex', flexDirection: 'column', gap: 6,
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)', fontSize: 12, color: 'var(--text, #e0e0e0)' }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Add Link</div>
            <input type="text" placeholder="URL (https://…)"
              value={draw.href}
              onChange={e => setDraw(d => ({ ...(d as any), href: e.target.value } as DrawPhase))}
              autoFocus
              style={{ background: 'var(--bg-primary, #1e1e1e)', color: 'inherit', border: '1px solid var(--border, #555)',
                borderRadius: 4, padding: '3px 6px', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box' }}
              onKeyDown={e => { if (e.key === 'Enter') commitLink(); if (e.key === 'Escape') setDraw({ k: 'idle' }) }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ whiteSpace: 'nowrap', fontSize: 11, opacity: 0.7 }}>or page:</span>
              <input type="number" placeholder="page #" min={1}
                value={draw.destPage}
                onChange={e => setDraw(d => ({ ...(d as any), destPage: e.target.value } as DrawPhase))}
                style={{ background: 'var(--bg-primary, #1e1e1e)', color: 'inherit', border: '1px solid var(--border, #555)',
                  borderRadius: 4, padding: '3px 6px', fontSize: 12, outline: 'none', width: 80, boxSizing: 'border-box' }}
                onKeyDown={e => { if (e.key === 'Enter') commitLink(); if (e.key === 'Escape') setDraw({ k: 'idle' }) }} />
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button onClick={() => setDraw({ k: 'idle' })}
                style={{ padding: '3px 10px', fontSize: 11, background: 'transparent', border: '1px solid var(--border, #555)',
                  borderRadius: 4, color: 'inherit', cursor: 'pointer' }}>Cancel</button>
              <button onClick={commitLink}
                style={{ padding: '3px 10px', fontSize: 11, background: '#0055cc', border: 'none',
                  borderRadius: 4, color: '#fff', cursor: 'pointer' }}>OK</button>
            </div>
          </div>
        </foreignObject>
      </>
    )
  }

  // ── Pointer events setup ─────────────────────────────────────────────────

  // Text-select mode (left-palette "Text": no tool + pan off) must let mouse events
  // fall through to the PDF.js text layer below, so the SVG overlay goes transparent.
  const textSelectMode = activeTool === null && !panMode
  const svgPointerEvents: React.CSSProperties['pointerEvents'] =
    activeTool === 'object-edit'
      ? 'none'
      : textSelectMode
      ? 'none'
      : isDragDrawTool || isTextEditTool || isCalloutTool || isPolyTool || isCaretTool || imgDrag.k !== 'idle'
        || draw.k === 'link-pending'
      ? 'all'
      : isMarkupTool ? 'none' : 'all'

  const needsDragHandlers = isDragDrawTool || isTextEditTool || isCalloutTool || imgDrag.k !== 'idle'

  return (
    <div
      className="annot-overlay"
      style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, pointerEvents: 'none' }}
      onMouseUp={isMarkupTool ? handleMouseUp : undefined}
    >
      <svg
        ref={svgRef}
        width={W} height={H}
        style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: svgPointerEvents }}
        onMouseDown={needsDragHandlers ? handleMouseDown : isTypewriterTool ? handleTypewriterClick : undefined}
        onMouseMove={needsDragHandlers || draw.k === 'poly' ? handleMouseMove : undefined}
        onMouseUp={needsDragHandlers ? handleMouseUp : undefined}
        onClick={
          isPolyTool ? handlePolyClick :
          isTypewriterTool ? handleTypewriterClick :
          isCaretTool ? handleSvgClick :
          (!activeTool || activeTool === 'select' || activeTool === 'eraser') ? handleSvgClick : undefined
        }
        onDoubleClick={isPolyTool ? handlePolyDblClick : undefined}
      >
        {pageAnnotations.map(renderAnn)}
        {renderPreview()}
        {renderStickyPopup()}
        {renderTextBoxEdit()}
        {renderTypewriterEdit()}
        {renderTextEditBox()}
        {renderCalloutEdit()}
        {renderLinkPending()}
        {/* Poly drawing: hint for first click */}
        {draw.k === 'poly' && draw.pts.length > 0 && (
          <text x={draw.curX + 8} y={draw.curY - 6} fill={toolColor} fontSize={10}
            fontFamily="sans-serif" pointerEvents="none" opacity={0.7}>
            {draw.pts.length} pt{draw.pts.length > 1 ? 's' : ''} — DblClick or Enter to finish
          </text>
        )}
        {/* Measure distance: auto-finish after 2 clicks */}
        {draw.k === 'poly' && activeTool === 'measure-distance' && draw.pts.length === 1 && (
          <text x={draw.curX + 8} y={draw.curY - 6} fill={toolColor} fontSize={10}
            fontFamily="sans-serif" pointerEvents="none" opacity={0.7}>Click second point</text>
        )}
      </svg>
    </div>
  )
}
