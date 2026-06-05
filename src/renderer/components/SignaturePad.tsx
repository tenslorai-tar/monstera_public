import { useRef, useState, useEffect } from 'react'

interface Props {
  onConfirm: (dataUrl: string) => void
  onClose: () => void
}

type Tab = 'draw' | 'upload'

export default function SignaturePad({ onConfirm, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('draw')
  const [uploadUrl, setUploadUrl] = useState<string | null>(null)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const drawing    = useRef(false)
  const fileRef    = useRef<HTMLInputElement>(null)

  // Initialise canvas background
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [tab])

  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    drawing.current = true
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = getPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const onMouseUp = () => { drawing.current = false }

  const clearCanvas = () => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setUploadUrl(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleConfirm = () => {
    if (tab === 'draw') {
      const canvas = canvasRef.current!
      // Check if anything was drawn (compare to blank white canvas)
      const ctx = canvas.getContext('2d')!
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      const blank = px.every((v, i) => (i % 4 === 3) ? v === 255 : v === 255)
      if (blank) return  // nothing drawn
      onConfirm(canvas.toDataURL('image/png'))
    } else {
      if (!uploadUrl) return
      onConfirm(uploadUrl)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 500 }}>
        <div className="modal-title">✍ Capture Signature</div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginTop: 12, borderBottom: '1px solid var(--border)' }}>
          {(['draw', 'upload'] as Tab[]).map(t => (
            <button
              key={t}
              style={{
                padding: '6px 18px', fontSize: 13, border: 'none', cursor: 'pointer',
                background: tab === t ? 'var(--bg-page)' : 'transparent',
                borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
                color: tab === t ? 'var(--text)' : 'var(--text-muted)',
              }}
              onClick={() => setTab(t)}
            >
              {t === 'draw' ? '✏ Draw' : '📁 Upload'}
            </button>
          ))}
        </div>

        {tab === 'draw' && (
          <div style={{ marginTop: 12 }}>
            <canvas
              ref={canvasRef}
              width={460}
              height={180}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 4,
                cursor: 'crosshair',
                display: 'block',
                background: '#fff',
                touchAction: 'none',
              }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Draw your signature above
            </div>
            <button
              className="modal-btn-secondary"
              style={{ marginTop: 8, fontSize: 12 }}
              onClick={clearCanvas}
            >
              Clear
            </button>
          </div>
        )}

        {tab === 'upload' && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
            <button className="modal-btn-secondary" onClick={() => fileRef.current?.click()}>
              📁 Browse image…
            </button>
            {uploadUrl && (
              <img
                src={uploadUrl}
                alt="Signature preview"
                style={{ maxWidth: 460, maxHeight: 180, border: '1px solid var(--border)', borderRadius: 4, background: '#fff' }}
              />
            )}
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn-primary"
            onClick={handleConfirm}
            disabled={tab === 'upload' && !uploadUrl}
          >
            Use Signature
          </button>
        </div>
      </div>
    </div>
  )
}
