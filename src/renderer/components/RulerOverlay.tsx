import { useEffect, useRef } from 'react'

interface Props {
  scale: number
  pageWidth: number   // pts
  pageHeight: number  // pts
  showGrid: boolean
}

const RULER_SIZE = 20  // px

function drawHRuler(ctx: CanvasRenderingContext2D, w: number, scale: number, pagePts: number) {
  ctx.clearRect(0, 0, w, RULER_SIZE)
  ctx.fillStyle = 'var(--bg-secondary, #2a2a2a)'
  ctx.fillRect(0, 0, w, RULER_SIZE)

  const unitPx = 72 * scale  // 72pt = 1 inch
  const step = unitPx < 40 ? 2 : unitPx < 100 ? 1 : 0.5  // inches between labels
  const totalInches = pagePts / 72

  ctx.strokeStyle = 'rgba(160,160,160,0.6)'
  ctx.fillStyle = 'rgba(160,160,160,0.85)'
  ctx.font = `9px sans-serif`
  ctx.textBaseline = 'top'

  for (let in_ = 0; in_ <= totalInches + step; in_ += step) {
    const x = in_ * unitPx
    if (x > w) break
    const major = Math.abs(in_ % 1) < 0.001
    ctx.beginPath()
    ctx.moveTo(x, major ? 6 : 12)
    ctx.lineTo(x, RULER_SIZE)
    ctx.stroke()
    if (major && in_ > 0) {
      ctx.fillText(String(Math.round(in_)), x + 2, 2)
    }
  }
}

function drawVRuler(ctx: CanvasRenderingContext2D, h: number, scale: number, pagePts: number) {
  ctx.clearRect(0, 0, RULER_SIZE, h)
  ctx.fillStyle = 'var(--bg-secondary, #2a2a2a)'
  ctx.fillRect(0, 0, RULER_SIZE, h)

  const unitPx = 72 * scale
  const step = unitPx < 40 ? 2 : unitPx < 100 ? 1 : 0.5
  const totalInches = pagePts / 72

  ctx.strokeStyle = 'rgba(160,160,160,0.6)'
  ctx.fillStyle = 'rgba(160,160,160,0.85)'
  ctx.font = `9px sans-serif`
  ctx.textBaseline = 'middle'

  for (let in_ = 0; in_ <= totalInches + step; in_ += step) {
    const y = in_ * unitPx
    if (y > h) break
    const major = Math.abs(in_ % 1) < 0.001
    ctx.beginPath()
    ctx.moveTo(major ? 6 : 12, y)
    ctx.lineTo(RULER_SIZE, y)
    ctx.stroke()
    if (major && in_ > 0) {
      ctx.save()
      ctx.translate(10, y)
      ctx.rotate(-Math.PI / 2)
      ctx.fillText(String(Math.round(in_)), -16, 0)
      ctx.restore()
    }
  }
}

export default function RulerOverlay({ scale, pageWidth, pageHeight, showGrid }: Props) {
  const hRef = useRef<HTMLCanvasElement>(null)
  const vRef = useRef<HTMLCanvasElement>(null)

  const pageW = pageWidth * scale
  const pageH = pageHeight * scale

  useEffect(() => {
    const hc = hRef.current
    if (!hc) return
    hc.width = pageW + RULER_SIZE
    hc.height = RULER_SIZE
    const ctx = hc.getContext('2d')!
    drawHRuler(ctx, pageW + RULER_SIZE, scale, pageWidth)
  }, [scale, pageWidth, pageW])

  useEffect(() => {
    const vc = vRef.current
    if (!vc) return
    vc.width = RULER_SIZE
    vc.height = pageH + RULER_SIZE
    const ctx = vc.getContext('2d')!
    drawVRuler(ctx, pageH + RULER_SIZE, scale, pageHeight)
  }, [scale, pageHeight, pageH])

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 10 }}>
      {/* Corner square */}
      <div style={{
        position: 'absolute', top: 0, left: 0,
        width: RULER_SIZE, height: RULER_SIZE,
        background: 'var(--bg-secondary, #2a2a2a)',
        borderRight: '1px solid var(--border, #444)',
        borderBottom: '1px solid var(--border, #444)',
      }} />
      {/* Horizontal ruler */}
      <canvas ref={hRef} style={{ position: 'absolute', top: 0, left: RULER_SIZE }} />
      {/* Vertical ruler */}
      <canvas ref={vRef} style={{ position: 'absolute', top: RULER_SIZE, left: 0 }} />

      {/* Grid overlay */}
      {showGrid && (
        <svg
          style={{ position: 'absolute', top: RULER_SIZE, left: RULER_SIZE, pointerEvents: 'none' }}
          width={pageW} height={pageH}
        >
          <defs>
            <pattern id="grid-minor" width={72 * scale / 8} height={72 * scale / 8} patternUnits="userSpaceOnUse">
              <path d={`M ${72 * scale / 8} 0 L 0 0 0 ${72 * scale / 8}`}
                fill="none" stroke="rgba(120,160,255,0.12)" strokeWidth={0.5} />
            </pattern>
            <pattern id="grid-major" width={72 * scale} height={72 * scale} patternUnits="userSpaceOnUse">
              <rect width={72 * scale} height={72 * scale} fill="url(#grid-minor)" />
              <path d={`M ${72 * scale} 0 L 0 0 0 ${72 * scale}`}
                fill="none" stroke="rgba(120,160,255,0.25)" strokeWidth={1} />
            </pattern>
          </defs>
          <rect width={pageW} height={pageH} fill="url(#grid-major)" />
        </svg>
      )}
    </div>
  )
}
