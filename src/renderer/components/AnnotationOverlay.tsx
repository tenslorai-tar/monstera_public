import { useEffect, useRef, useState, useCallback } from 'react'
import { usePdfStore } from '../store/usePdfStore'
import { canvasToPdf, pdfToCanvas, newId } from '../utils/annotationUtils'
import type {
  Annotation, HighlightAnn, InkAnn,
  ShapeAnn, TextBoxAnn, StickyNoteAnn, StampAnn, RedactAnn,
  TypewriterAnn, TextEditAnn, PlacedImageAnn,
} from '../types/annotations'

interface Props {
  pageNum: number
  scale: number
  pageW: number   // PDF points
  pageH: number   // PDF points
}

type DrawPhase =
  | { k: 'idle' }
  | { k: 'shape'; sx: number; sy: number; cx: number; cy: number }
  | { k: 'ink'; cur: Array<[number, number]>; done: Array<Array<[number, number]>> }
  | { k: 'textbox-size'; sx: number; sy: number; cx: number; cy: number }
  | { k: 'textbox-edit'; x: number; y: number; w: number; h: number; text: string }
  | { k: 'typewriter-edit'; x: number; y: number; text: string }
  | { k: 'text-edit-size'; sx: number; sy: number; cx: number; cy: number }
  | { k: 'text-edit-edit'; x: number; y: number; w: number; h: number; text: string }

type ImageDrag =
  | { k: 'idle' }
  | { k: 'move'; id: string; startSvgX: number; startSvgY: number; origAnnX: number; origAnnY: number }
  | { k: 'resize'; id: string; corner: 'br'; startSvgX: number; startSvgY: number; origW: number; origH: number }

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

export default function AnnotationOverlay({ pageNum, scale, pageW, pageH }: Props) {
  const activeTool = usePdfStore(s => s.activeTool)
  const annotations = usePdfStore(s => s.annotations)
  const selectedAnnotationId = usePdfStore(s => s.selectedAnnotationId)
  const toolColor = usePdfStore(s => s.toolColor)
  const toolOpacity = usePdfStore(s => s.toolOpacity)
  const toolLineWidth = usePdfStore(s => s.toolLineWidth)
  const toolFontSize = usePdfStore(s => s.toolFontSize)
  const stampName = usePdfStore(s => s.stampName)
  const customStampDataUrl = usePdfStore(s => s.customStampDataUrl)
  const openStickyNoteId = usePdfStore(s => s.openStickyNoteId)

  const addAnnotation = usePdfStore(s => s.addAnnotation)
  const updateAnnotation = usePdfStore(s => s.updateAnnotation)
  const deleteAnnotation = usePdfStore(s => s.deleteAnnotation)
  const setSelectedAnnotation = usePdfStore(s => s.setSelectedAnnotation)
  const setOpenStickyNote = usePdfStore(s => s.setOpenStickyNote)

  const svgRef = useRef<SVGSVGElement>(null)
  const [draw, setDraw] = useState<DrawPhase>({ k: 'idle' })
  const [imgDrag, setImgDrag] = useState<ImageDrag>({ k: 'idle' })

  const W = pageW * scale
  const H = pageH * scale

  const pageAnnotations = annotations.filter(a => a.pageNum === pageNum)

  const isDrawingTool = activeTool !== null &&
    !['select', 'eraser', 'highlight', 'underline', 'strikethrough', 'typewriter', 'place-image'].includes(activeTool)

  const isRedactTool = activeTool === 'redact'
  const isMarkupTool = activeTool === 'highlight' ||
    activeTool === 'underline' || activeTool === 'strikethrough'
  const isTypewriterTool = activeTool === 'typewriter'
  const isTextEditTool = activeTool === 'text-edit'

  // ── Coordinate helpers ──────────────────────────────────────────────────

  const toPdf = useCallback((svgX: number, svgY: number) =>
    canvasToPdf(svgX, svgY, scale, pageH), [scale, pageH])

  const toSvg = useCallback((pdfX: number, pdfY: number) =>
    pdfToCanvas(pdfX, pdfY, scale, pageH), [scale, pageH])

  const getSvgXY = (e: React.MouseEvent): [number, number] => {
    const rect = svgRef.current!.getBoundingClientRect()
    return [e.clientX - rect.left, e.clientY - rect.top]
  }

  // ── Mouse handlers for drawing tools ───────────────────────────────────

  const handleTypewriterClick = (e: React.MouseEvent) => {
    if (!isTypewriterTool) return
    if (e.button !== 0) return
    e.stopPropagation()
    const [sx, sy] = getSvgXY(e)
    if (draw.k === 'typewriter-edit') {
      // Commit current and start new one at click position
      commitTypewriter(draw.text)
    }
    setDraw({ k: 'typewriter-edit', x: sx, y: sy, text: '' })
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isTextEditTool) {
      if (e.button !== 0) return
      e.stopPropagation()
      const [sx, sy] = getSvgXY(e)
      setDraw({ k: 'text-edit-size', sx, sy, cx: sx, cy: sy })
      return
    }
    if (!activeTool || !isDrawingTool) return
    if (e.button !== 0) return
    e.stopPropagation()
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
    } else {
      // shape tools
      setDraw({ k: 'shape', sx, sy, cx: sx, cy: sy })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    // Handle image drag/resize
    if (imgDrag.k === 'move') {
      const [cx, cy] = getSvgXY(e)
      const dSvgX = cx - imgDrag.startSvgX
      const dSvgY = cy - imgDrag.startSvgY
      // Convert SVG delta to PDF delta via scale factor (PDF y is inverted)
      const dPdfX = dSvgX / scale
      const dPdfY = -dSvgY / scale   // invert Y because PDF y goes up
      updateAnnotation(imgDrag.id, {
        x: imgDrag.origAnnX + dPdfX,
        y: imgDrag.origAnnY + dPdfY,
      } as Partial<PlacedImageAnn>)
      return
    }
    if (imgDrag.k === 'resize') {
      const [cx, cy] = getSvgXY(e)
      const dSvgX = cx - imgDrag.startSvgX
      const dSvgY = cy - imgDrag.startSvgY
      // SVG y goes down, so dragging down (positive dSvgY) increases visual height
      // PDF height increases when dragging down too (we keep bottom-left anchor fixed)
      const newW = Math.max(20, imgDrag.origW + dSvgX / scale)
      const newH = Math.max(20, imgDrag.origH + dSvgY / scale)
      updateAnnotation(imgDrag.id, { width: newW, height: newH } as Partial<PlacedImageAnn>)
      return
    }

    if (draw.k === 'idle') return
    const [cx, cy] = getSvgXY(e)
    if (draw.k === 'shape' || draw.k === 'textbox-size' || draw.k === 'text-edit-size') {
      setDraw(d => ({ ...d, cx, cy } as DrawPhase))
    } else if (draw.k === 'ink') {
      setDraw(d => ({
        ...(d as { k: 'ink'; cur: Array<[number, number]>; done: Array<Array<[number, number]>> }),
        cur: [...(d as any).cur, [cx, cy] as [number, number]],
      }))
    }
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    if (imgDrag.k !== 'idle') {
      setImgDrag({ k: 'idle' })
      return
    }
    // Text markup via selection
    if (isMarkupTool) {
      commitTextSelection()
      return
    }
    if (draw.k === 'idle') return
    const [ex, ey] = getSvgXY(e)

    if (draw.k === 'shape') {
      const [x1, y1] = toPdf(draw.sx, draw.sy)
      const [x2, y2] = toPdf(ex, ey)
      if (Math.abs(ex - draw.sx) < 4 && Math.abs(ey - draw.sy) < 4) { setDraw({ k: 'idle' }); return }
      if (isRedactTool) {
        const ann: RedactAnn = {
          id: newId(), pageNum,
          type: 'redact',
          color: '#000000', opacity: 1,
          x1, y1, x2, y2,
          createdAt: Date.now(),
        }
        addAnnotation(ann)
        setDraw({ k: 'idle' })
        return
      }
      const ann: ShapeAnn = {
        id: newId(), pageNum,
        type: activeTool as ShapeAnn['type'],
        color: toolColor, opacity: toolOpacity,
        lineWidth: toolLineWidth,
        x1, y1, x2, y2,
        createdAt: Date.now(),
      }
      addAnnotation(ann)
      setDraw({ k: 'idle' })
    } else if (draw.k === 'ink') {
      const allPaths = draw.cur.length > 1
        ? [...draw.done, draw.cur.map(([x, y]) => toPdf(x, y) as [number, number])]
        : draw.done
      if (allPaths.length > 0) {
        const ann: InkAnn = {
          id: newId(), type: 'ink', pageNum,
          color: toolColor, opacity: toolOpacity, lineWidth: toolLineWidth,
          paths: allPaths, createdAt: Date.now(),
        }
        addAnnotation(ann)
      }
      setDraw({ k: 'idle' })
    } else if (draw.k === 'textbox-size') {
      const minSize = 20
      if (Math.abs(ex - draw.sx) < minSize || Math.abs(ey - draw.sy) < minSize) {
        setDraw({ k: 'idle' }); return
      }
      const left = Math.min(draw.sx, ex)
      const top = Math.min(draw.sy, ey)
      const w = Math.abs(ex - draw.sx)
      const h = Math.abs(ey - draw.sy)
      setDraw({ k: 'textbox-edit', x: left, y: top, w, h, text: '' })
    } else if (draw.k === 'text-edit-size') {
      const minSize = 10
      if (Math.abs(ex - draw.sx) < minSize || Math.abs(ey - draw.sy) < minSize) {
        setDraw({ k: 'idle' }); return
      }
      const left = Math.min(draw.sx, ex)
      const top = Math.min(draw.sy, ey)
      const w = Math.abs(ex - draw.sx)
      const h = Math.abs(ey - draw.sy)
      setDraw({ k: 'text-edit-edit', x: left, y: top, w, h, text: '' })
    }
  }

  // ── Text selection → markup annotation ─────────────────────────────────

  const commitTextSelection = () => {
    if (!activeTool || !isMarkupTool) return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
    const range = sel.getRangeAt(0)
    const svgEl = svgRef.current
    if (!svgEl) return
    const svgBounds = svgEl.getBoundingClientRect()
    const rects = Array.from(range.getClientRects()).filter(r => r.width > 1)
    if (rects.length === 0) { sel.removeAllRanges(); return }

    const quads: number[][] = rects.map(r => {
      const sx_l = r.left - svgBounds.left
      const sy_t = r.top - svgBounds.top
      const sx_r = r.right - svgBounds.left
      const sy_b = r.bottom - svgBounds.top
      const [x_ul, y_ul] = toPdf(sx_l, sy_t)
      const [x_ur, y_ur] = toPdf(sx_r, sy_t)
      const [x_ll, y_ll] = toPdf(sx_l, sy_b)
      const [x_lr, y_lr] = toPdf(sx_r, sy_b)
      return [x_ul, y_ul, x_ur, y_ur, x_ll, y_ll, x_lr, y_lr]
    })

    const ann: HighlightAnn = {
      id: newId(), pageNum,
      type: activeTool as HighlightAnn['type'],
      color: toolColor, opacity: toolOpacity,
      quads, selectedText: sel.toString(),
      createdAt: Date.now(),
    }
    addAnnotation(ann)
    sel.removeAllRanges()
  }

  // ── Click handler for select / eraser ──────────────────────────────────

  const handleAnnotClick = (ann: Annotation, e: React.MouseEvent) => {
    e.stopPropagation()
    if (activeTool === 'eraser') {
      deleteAnnotation(ann.id)
    } else if (activeTool === 'select' || !activeTool) {
      setSelectedAnnotation(selectedAnnotationId === ann.id ? null : ann.id)
      if (ann.type === 'stickynote') {
        setOpenStickyNote(openStickyNoteId === ann.id ? null : ann.id)
      }
    }
  }

  // Click on SVG background → deselect
  const handleSvgClick = (e: React.MouseEvent) => {
    if (e.target === svgRef.current) {
      setSelectedAnnotation(null)
      setOpenStickyNote(null)
    }
  }

  // ── Finish textbox editing ──────────────────────────────────────────────

  const commitTextBox = (text: string) => {
    if (draw.k !== 'textbox-edit') return
    if (text.trim()) {
      const [x, y_top] = toPdf(draw.x, draw.y)
      const [, y_bot] = toPdf(draw.x, draw.y + draw.h)
      const [x2] = toPdf(draw.x + draw.w, draw.y)
      const ann: TextBoxAnn = {
        id: newId(), type: 'textbox', pageNum,
        color: toolColor, opacity: toolOpacity,
        x, y: y_bot, width: x2 - x, height: y_top - y_bot,
        text, fontSize: toolFontSize, createdAt: Date.now(),
      }
      addAnnotation(ann)
    }
    setDraw({ k: 'idle' })
  }

  // ── Typewriter: click-to-place, no drag needed ──────────────────────────

  const commitTypewriter = (text: string) => {
    if (draw.k !== 'typewriter-edit') return
    if (text.trim()) {
      const [px] = toPdf(draw.x, draw.y)
      const [, py_bot] = toPdf(draw.x, draw.y + toolFontSize * scale * 1.5)
      const ann: TypewriterAnn = {
        id: newId(), type: 'typewriter', pageNum,
        color: toolColor, opacity: toolOpacity,
        x: px, y: py_bot,
        text, fontSize: toolFontSize, createdAt: Date.now(),
      }
      addAnnotation(ann)
    }
    setDraw({ k: 'idle' })
  }

  // ── Text-edit: drag region, whiteout + retype ───────────────────────────

  const commitTextEdit = (text: string) => {
    if (draw.k !== 'text-edit-edit') return
    if (text.trim()) {
      const [x, y_top] = toPdf(draw.x, draw.y)
      const [, y_bot] = toPdf(draw.x, draw.y + draw.h)
      const [x2] = toPdf(draw.x + draw.w, draw.y)
      const ann: TextEditAnn = {
        id: newId(), type: 'text-edit', pageNum,
        color: toolColor, opacity: toolOpacity,
        x, y: y_bot, width: x2 - x, height: y_top - y_bot,
        text, fontSize: toolFontSize, createdAt: Date.now(),
      }
      addAnnotation(ann)
    }
    setDraw({ k: 'idle' })
  }

  // ── Keyboard: Delete selected annotation ────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const { selectedAnnotationId, deleteAnnotation, setSelectedAnnotation } = usePdfStore.getState()
        if (selectedAnnotationId && document.activeElement?.tagName !== 'INPUT' &&
            document.activeElement?.tagName !== 'TEXTAREA') {
          deleteAnnotation(selectedAnnotationId)
          setSelectedAnnotation(null)
        }
      }
      if (e.key === 'Escape') {
        usePdfStore.getState().setSelectedAnnotation(null)
        usePdfStore.getState().setOpenStickyNote(null)
        setDraw({ k: 'idle' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Rendering helpers ───────────────────────────────────────────────────

  const annStyle = (_ann: Annotation) => ({
    cursor: activeTool === 'eraser' ? 'cell'
      : activeTool === 'select' || !activeTool ? 'pointer' : 'crosshair',
  })

  const selBorder = (ann: Annotation) =>
    selectedAnnotationId === ann.id ? { filter: 'drop-shadow(0 0 3px #4a9eff)' } : {}

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
            if (a.type === 'highlight') {
              return <polygon key={qi}
                points={`${lx},${ly} ${rx},${ry} ${brx},${bry} ${blx},${bly}`}
                fill={a.color} fillOpacity={a.opacity} stroke="none" pointerEvents="all" />
            }
            if (a.type === 'underline') {
              return <line key={qi} x1={blx} y1={bly} x2={brx} y2={bry}
                stroke={a.color} strokeWidth={Math.max(1, scale)} strokeOpacity={a.opacity} pointerEvents="stroke" />
            }
            // strikethrough
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
          {a.paths.map((path, pi) => {
            const pts = path.map(([px, py]) => toSvg(px, py).join(',')).join(' ')
            return <polyline key={pi} points={pts} fill="none"
              stroke={a.color} strokeWidth={a.lineWidth * scale} strokeOpacity={a.opacity}
              strokeLinecap="round" strokeLinejoin="round" pointerEvents="stroke" />
          })}
          {sel && <rect {...getBBoxStyle(a)} fill="none" stroke="#4a9eff" strokeWidth={1} strokeDasharray="4,2" />}
        </g>
      )
    }

    if (ann.type === 'rectangle') {
      const a = ann as ShapeAnn
      const [svgX1, svgY1] = toSvg(Math.min(a.x1, a.x2), Math.max(a.y1, a.y2))
      const [svgX2, svgY2] = toSvg(Math.max(a.x1, a.x2), Math.min(a.y1, a.y2))
      return (
        <rect key={a.id} x={svgX1} y={svgY1} width={svgX2 - svgX1} height={svgY2 - svgY1}
          fill="none" stroke={a.color} strokeWidth={a.lineWidth * scale} strokeOpacity={a.opacity}
          strokeDasharray={sel ? '6,3' : undefined}
          onClick={e => handleAnnotClick(a, e)} style={annStyle(a)} pointerEvents="stroke" />
      )
    }

    if (ann.type === 'ellipse') {
      const a = ann as ShapeAnn
      const [cx, cy] = toSvg((a.x1 + a.x2) / 2, (a.y1 + a.y2) / 2)
      const rx = Math.abs(a.x2 - a.x1) / 2 * scale
      const ry = Math.abs(a.y2 - a.y1) / 2 * scale
      return (
        <ellipse key={a.id} cx={cx} cy={cy} rx={rx} ry={ry}
          fill="none" stroke={a.color} strokeWidth={a.lineWidth * scale} strokeOpacity={a.opacity}
          strokeDasharray={sel ? '6,3' : undefined}
          onClick={e => handleAnnotClick(a, e)} style={annStyle(a)} pointerEvents="stroke" />
      )
    }

    if (ann.type === 'line' || ann.type === 'arrow') {
      const a = ann as ShapeAnn
      const [x1, y1] = toSvg(a.x1, a.y1)
      const [x2, y2] = toSvg(a.x2, a.y2)
      const mid = `M${pageNum}`
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
      const svgW = a.width * scale
      const svgH = a.height * scale
      return (
        <foreignObject key={a.id} x={svgX} y={svgY_top} width={svgW} height={svgH}
          onClick={e => handleAnnotClick(a, e)} style={annStyle(a)}>
          <div style={{
            width: '100%', height: '100%', padding: 4,
            fontSize: a.fontSize * scale,
            color: a.color, opacity: a.opacity,
            fontFamily: 'sans-serif',
            border: sel ? '1px dashed #4a9eff' : '1px solid rgba(255,255,255,0.2)',
            boxSizing: 'border-box',
            overflow: 'hidden', wordBreak: 'break-word',
            background: 'rgba(255,255,220,0.08)',
            pointerEvents: 'all',
            whiteSpace: 'pre-wrap',
          }}>
            {a.text}
          </div>
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
      return (
        <g key={a.id} onClick={e => handleAnnotClick(a, e)} style={annStyle(a)}>
          {/* black fill with diagonal warning stripes */}
          <defs>
            <pattern id={`rp-${a.id}`} patternUnits="userSpaceOnUse" width={10} height={10} patternTransform="rotate(45)">
              <rect width={10} height={10} fill="#1a1a1a" />
              <line x1={0} y1={0} x2={0} y2={10} stroke="#ff4444" strokeWidth={3} />
            </pattern>
          </defs>
          <rect x={svgX1} y={svgY1} width={w} height={h}
            fill={`url(#rp-${a.id})`}
            stroke={sel ? '#4a9eff' : '#ff4444'} strokeWidth={sel ? 2 : 1.5}
            strokeDasharray={sel ? '6,3' : undefined}
            pointerEvents="all" />
          {h > 16 && (
            <text x={svgX1 + w / 2} y={svgY1 + h / 2}
              textAnchor="middle" dominantBaseline="middle"
              fill="#ff4444" fontSize={Math.min(11, h * 0.5)}
              fontWeight="bold" fontFamily="sans-serif"
              pointerEvents="none">
              REDACT
            </text>
          )}
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
          {sel && <rect x={-w / 2 - 2} y={-h / 2 - 2} width={w + 4} height={h + 4}
            fill="none" stroke="#4a9eff" strokeWidth={1} strokeDasharray="4,2" />}
          {a.stampName === 'Custom' && a.imageDataUrl
            ? <image href={a.imageDataUrl} x={-w / 2} y={-h / 2} width={w} height={h} />
            : <StampShape color={a.color} stampName={a.stampName} w={w} h={h} />
          }
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
            border: sel ? '1px dashed #4a9eff' : 'none',
            outline: 'none', padding: 2, boxSizing: 'border-box',
          }}>
            {a.text}
          </div>
        </foreignObject>
      )
    }

    if (ann.type === 'text-edit') {
      const a = ann as TextEditAnn
      const [svgX, svgY_top] = toSvg(a.x, a.y + a.height)
      const svgW = a.width * scale
      const svgH = a.height * scale
      return (
        <g key={a.id} onClick={e => handleAnnotClick(a, e)} style={annStyle(a)}>
          <rect x={svgX} y={svgY_top} width={svgW} height={svgH} fill="white" />
          <foreignObject x={svgX} y={svgY_top} width={svgW} height={svgH}>
            <div style={{
              width: '100%', height: '100%', padding: 2,
              fontSize: a.fontSize * scale, color: a.color, opacity: a.opacity,
              fontFamily: 'sans-serif', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              border: sel ? '1px dashed #4a9eff' : '1px solid transparent',
              boxSizing: 'border-box', background: 'white',
            }}>
              {a.text}
            </div>
          </foreignObject>
        </g>
      )
    }

    if (ann.type === 'placed-image') {
      const a = ann as PlacedImageAnn
      const [svgX, svgY_top] = toSvg(a.x, a.y + a.height)
      const svgW = a.width * scale
      const svgH = a.height * scale
      return (
        <g key={a.id}
          onClick={e => { if (imgDrag.k === 'idle') handleAnnotClick(a, e) }}
          style={{ cursor: activeTool === 'eraser' ? 'cell' : 'move', opacity: a.opacity }}
        >
          <image href={a.dataUrl} x={svgX} y={svgY_top} width={svgW} height={svgH}
            onMouseDown={e => {
              if (activeTool === 'eraser') return
              e.stopPropagation()
              setSelectedAnnotation(a.id)
              const [sx, sy] = getSvgXY(e)
              setImgDrag({ k: 'move', id: a.id, startSvgX: sx, startSvgY: sy, origAnnX: a.x, origAnnY: a.y })
            }}
          />
          {sel && (
            <>
              <rect x={svgX - 1} y={svgY_top - 1} width={svgW + 2} height={svgH + 2}
                fill="none" stroke="#4a9eff" strokeWidth={1.5} strokeDasharray="5,3" pointerEvents="none" />
              {/* Resize handle bottom-right */}
              <rect
                x={svgX + svgW - 6} y={svgY_top + svgH - 6} width={12} height={12}
                fill="#4a9eff" rx={2} style={{ cursor: 'nwse-resize' }}
                onMouseDown={e => {
                  e.stopPropagation()
                  setImgDrag({
                    k: 'resize', id: a.id, corner: 'br',
                    startSvgX: getSvgXY(e)[0], startSvgY: getSvgXY(e)[1],
                    origW: a.width, origH: a.height,
                  })
                }}
              />
            </>
          )}
        </g>
      )
    }

    return null
  }

  // Get bounding box for ink (for selection indicator)
  function getBBoxStyle(ann: InkAnn) {
    const pts = ann.paths.flat()
    if (pts.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
    const [sx1, sy1] = toSvg(Math.min(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1])))
    const [sx2, sy2] = toSvg(Math.max(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])))
    return { x: sx1 - 4, y: sy1 - 4, width: sx2 - sx1 + 8, height: sy2 - sy1 + 8 }
  }

  // ── Draw preview ────────────────────────────────────────────────────────

  const renderPreview = () => {
    if (draw.k === 'text-edit-size') {
      const { sx, sy, cx, cy } = draw
      const x = Math.min(sx, cx), y = Math.min(sy, cy)
      const w = Math.abs(cx - sx), h = Math.abs(cy - sy)
      return <rect x={x} y={y} width={w} height={h}
        fill="rgba(255,255,255,0.7)" stroke="#ff8800" strokeWidth={1.5} strokeDasharray="4,3" />
    }
    if (draw.k === 'shape' || draw.k === 'textbox-size') {
      const { sx, sy, cx, cy } = draw
      const x = Math.min(sx, cx), y = Math.min(sy, cy)
      const w = Math.abs(cx - sx), h = Math.abs(cy - sy)
      const stroke = toolColor
      const sw = toolLineWidth * scale
      const op = toolOpacity

      if (activeTool === 'redact') {
        return <rect x={x} y={y} width={w} height={h}
          fill="rgba(255,40,40,0.18)" stroke="#ff4444" strokeWidth={1.5} strokeDasharray="4,3" />
      }
      if (activeTool === 'rectangle' || draw.k === 'textbox-size') {
        return <rect x={x} y={y} width={w} height={h}
          fill={draw.k === 'textbox-size' ? 'rgba(74,158,255,0.05)' : 'none'}
          stroke={draw.k === 'textbox-size' ? '#4a9eff' : stroke}
          strokeWidth={draw.k === 'textbox-size' ? 1 : sw}
          strokeOpacity={op} strokeDasharray="4,3" />
      }
      if (activeTool === 'ellipse') {
        return <ellipse cx={sx + (cx - sx) / 2} cy={sy + (cy - sy) / 2}
          rx={w / 2} ry={h / 2}
          fill="none" stroke={stroke} strokeWidth={sw} strokeOpacity={op} strokeDasharray="4,3" />
      }
      if (activeTool === 'line') {
        return <line x1={sx} y1={sy} x2={cx} y2={cy}
          stroke={stroke} strokeWidth={sw} strokeOpacity={op} strokeDasharray="4,3" />
      }
      if (activeTool === 'arrow') {
        return (
          <g>
            <defs>
              <marker id="preview-arrow" markerWidth={10} markerHeight={7} refX={9} refY={3.5} orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill={stroke} fillOpacity={op} />
              </marker>
            </defs>
            <line x1={sx} y1={sy} x2={cx} y2={cy}
              stroke={stroke} strokeWidth={sw} strokeOpacity={op}
              markerEnd="url(#preview-arrow)" strokeDasharray="4,3" />
          </g>
        )
      }
    }

    if (draw.k === 'ink' && draw.cur.length > 1) {
      const pts = draw.cur.map(([x, y]) => `${x},${y}`).join(' ')
      return <polyline points={pts} fill="none"
        stroke={toolColor} strokeWidth={toolLineWidth * scale} strokeOpacity={toolOpacity}
        strokeLinecap="round" strokeLinejoin="round" />
    }

    return null
  }

  // ── Sticky note popup ────────────────────────────────────────────────────

  const renderStickyPopup = () => {
    const ann = pageAnnotations.find(a => a.id === openStickyNoteId && a.type === 'stickynote') as StickyNoteAnn | undefined
    if (!ann) return null
    const [sx, sy] = toSvg(ann.x, ann.y)
    const popW = 220, popH = 140
    // keep popup on-screen
    const px = Math.min(sx, W - popW - 8)
    const py = Math.max(8, sy - popH - 28)
    return (
      <foreignObject x={px} y={py} width={popW} height={popH} style={{ pointerEvents: 'all' }}>
        <div style={{
          width: '100%', height: '100%',
          background: '#fefcbf', borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{ background: ann.color, padding: '4px 8px', fontSize: 11, color: '#000', fontWeight: 600 }}>
            Note
          </div>
          <textarea
            style={{
              flex: 1, padding: 8, border: 'none', outline: 'none',
              resize: 'none', fontFamily: 'inherit', fontSize: 12,
              background: 'transparent', color: '#1a1a1a',
            }}
            value={ann.text}
            onChange={e => updateAnnotation(ann.id, { text: e.target.value })}
            placeholder="Type a note…"
            autoFocus
          />
        </div>
      </foreignObject>
    )
  }

  // ── Textbox input overlay ────────────────────────────────────────────────

  const renderTextBoxEdit = () => {
    if (draw.k !== 'textbox-edit') return null
    const { x, y, w, h } = draw
    return (
      <foreignObject x={x} y={y} width={w} height={h} style={{ pointerEvents: 'all' }}>
        <textarea
          style={{
            width: '100%', height: '100%',
            background: 'rgba(255,255,220,0.9)', color: toolColor,
            border: '2px solid #4a9eff', outline: 'none',
            resize: 'none', fontFamily: 'sans-serif',
            fontSize: toolFontSize * scale,
            padding: 4, boxSizing: 'border-box',
          }}
          autoFocus
          value={draw.text}
          onChange={e => setDraw(d => ({ ...(d as any), text: e.target.value } as DrawPhase))}
          onBlur={e => commitTextBox(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') setDraw({ k: 'idle' }) }}
          placeholder="Type text…"
        />
      </foreignObject>
    )
  }

  // ── Typewriter cursor overlay ─────────────────────────────────────────────

  const renderTypewriterEdit = () => {
    if (draw.k !== 'typewriter-edit') return null
    const { x, y, text } = draw
    const minW = 120
    return (
      <foreignObject x={x} y={y} width={Math.max(minW, W - x - 8)} height={toolFontSize * scale * 4}
        style={{ pointerEvents: 'all' }}>
        <input
          type="text"
          style={{
            width: '100%', background: 'transparent', color: toolColor,
            border: 'none', borderBottom: `2px solid ${toolColor}`,
            outline: 'none', fontFamily: 'sans-serif',
            fontSize: toolFontSize * scale, padding: 2,
          }}
          autoFocus
          value={text}
          onChange={e => setDraw(d => ({ ...(d as any), text: e.target.value } as DrawPhase))}
          onBlur={e => commitTypewriter(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') setDraw({ k: 'idle' })
            if (e.key === 'Enter' && !e.shiftKey) { commitTypewriter((e.target as HTMLInputElement).value) }
          }}
          placeholder="Type here…"
        />
      </foreignObject>
    )
  }

  // ── Text-edit region overlay ──────────────────────────────────────────────

  const renderTextEditBox = () => {
    if (draw.k !== 'text-edit-edit') return null
    const { x, y, w, h } = draw
    return (
      <foreignObject x={x} y={y} width={w} height={h} style={{ pointerEvents: 'all' }}>
        <textarea
          style={{
            width: '100%', height: '100%',
            background: 'white', color: toolColor,
            border: '2px solid #ff8800', outline: 'none',
            resize: 'none', fontFamily: 'sans-serif',
            fontSize: toolFontSize * scale,
            padding: 4, boxSizing: 'border-box',
          }}
          autoFocus
          value={draw.text}
          onChange={e => setDraw(d => ({ ...(d as any), text: e.target.value } as DrawPhase))}
          onBlur={e => commitTextEdit(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') setDraw({ k: 'idle' }) }}
          placeholder="Type replacement text…"
        />
      </foreignObject>
    )
  }

  // ── Pointer events setup ─────────────────────────────────────────────────

  const svgPointerEvents: React.CSSProperties['pointerEvents'] =
    isDrawingTool || isTextEditTool || imgDrag.k !== 'idle' ? 'all' : isMarkupTool ? 'none' : 'all'

  const needsMouseHandlers = isDrawingTool || isTextEditTool || imgDrag.k !== 'idle'

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
        onMouseDown={needsMouseHandlers ? handleMouseDown : isTypewriterTool ? handleTypewriterClick : undefined}
        onMouseMove={needsMouseHandlers ? handleMouseMove : undefined}
        onMouseUp={needsMouseHandlers ? handleMouseUp : undefined}
        onClick={
          isTypewriterTool ? handleTypewriterClick :
          (!activeTool || activeTool === 'select' || activeTool === 'eraser') ? handleSvgClick : undefined
        }
      >
        {pageAnnotations.map(renderAnn)}
        {renderPreview()}
        {renderStickyPopup()}
        {renderTextBoxEdit()}
        {renderTypewriterEdit()}
        {renderTextEditBox()}
      </svg>
    </div>
  )
}
