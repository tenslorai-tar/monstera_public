import { useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '../store/useSettingsStore'

const LOUPE_SIZE = 160
const LOUPE_ZOOM = 3

export default function LoupeOverlay() {
  const { settings } = useSettingsStore()
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!settings.loupeEnabled) { setPos(null); return }

    const onMove = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY })
    const onLeave = () => setPos(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseleave', onLeave)
    }
  }, [settings.loupeEnabled])

  useEffect(() => {
    if (!pos || !settings.loupeEnabled) return
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const srcW = LOUPE_SIZE / LOUPE_ZOOM
      const srcH = LOUPE_SIZE / LOUPE_ZOOM
      const srcX = pos.x - srcW / 2
      const srcY = pos.y - srcH / 2

      const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim() || '#1e1e1e'
      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, LOUPE_SIZE, LOUPE_SIZE)

      const pdfCanvases = document.querySelectorAll<HTMLCanvasElement>('.pdf-page-canvas')
      pdfCanvases.forEach(pdfCanvas => {
        const rect = pdfCanvas.getBoundingClientRect()
        const cw = pdfCanvas.width
        const ch = pdfCanvas.height
        if (cw === 0 || ch === 0 || rect.width === 0) return

        const scaleX = cw / rect.width
        const scaleY = ch / rect.height

        const overlapLeft   = Math.max(srcX, rect.left)
        const overlapTop    = Math.max(srcY, rect.top)
        const overlapRight  = Math.min(srcX + srcW, rect.right)
        const overlapBottom = Math.min(srcY + srcH, rect.bottom)
        if (overlapRight <= overlapLeft || overlapBottom <= overlapTop) return

        const clipSrcX = (overlapLeft - rect.left) * scaleX
        const clipSrcY = (overlapTop  - rect.top)  * scaleY
        const clipSrcW = (overlapRight  - overlapLeft) * scaleX
        const clipSrcH = (overlapBottom - overlapTop)  * scaleY

        const destX = (overlapLeft - srcX) * LOUPE_ZOOM
        const destY = (overlapTop  - srcY) * LOUPE_ZOOM
        const destW = (overlapRight  - overlapLeft) * LOUPE_ZOOM
        const destH = (overlapBottom - overlapTop)  * LOUPE_ZOOM

        try {
          ctx.drawImage(pdfCanvas, clipSrcX, clipSrcY, clipSrcW, clipSrcH, destX, destY, destW, destH)
        } catch { /* ignore */ }
      })

      // crosshair
      ctx.strokeStyle = 'rgba(74,158,255,0.6)'
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(LOUPE_SIZE / 2, 0); ctx.lineTo(LOUPE_SIZE / 2, LOUPE_SIZE)
      ctx.moveTo(0, LOUPE_SIZE / 2); ctx.lineTo(LOUPE_SIZE, LOUPE_SIZE / 2)
      ctx.stroke()
    })
    return () => cancelAnimationFrame(rafRef.current)
  })

  if (!settings.loupeEnabled || !pos) return null

  const gap = 18
  let left = pos.x + gap
  let top  = pos.y + gap
  if (left + LOUPE_SIZE + 4 > window.innerWidth)  left = pos.x - LOUPE_SIZE - gap
  if (top  + LOUPE_SIZE + 4 > window.innerHeight) top  = pos.y - LOUPE_SIZE - gap

  return (
    <div style={{
      position: 'fixed', left, top, zIndex: 9999,
      pointerEvents: 'none',
      borderRadius: '50%', overflow: 'hidden',
      border: '2px solid var(--accent)',
      boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
    }}>
      <canvas
        ref={canvasRef}
        width={LOUPE_SIZE}
        height={LOUPE_SIZE}
        style={{ display: 'block' }}
      />
    </div>
  )
}
