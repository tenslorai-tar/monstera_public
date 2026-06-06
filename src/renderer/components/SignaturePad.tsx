import { useRef, useState, useEffect } from 'react'

interface Props {
  onConfirm: (dataUrl: string) => void
  onClose: () => void
}

type Tab = 'draw' | 'type' | 'upload'

const SIG_FONTS = [
  { label: 'Cursive (Script)',  value: 'cursive' },
  { label: 'Brush Script',     value: '"Brush Script MT", cursive' },
  { label: 'Dancing Script',   value: '"Dancing Script", cursive' },
  { label: 'Segoe Script',     value: '"Segoe Script", cursive' },
  { label: 'Georgia (Serif)',  value: 'Georgia, serif' },
  { label: 'Arial (Sans)',     value: 'Arial, sans-serif' },
]

function renderTypedSignature(text: string, font: string, color: string, size: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = 460; canvas.height = 140
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = `italic ${size}px ${font}`
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Auto-shrink if text is too wide
  let actualSize = size
  while (ctx.measureText(text).width > 420 && actualSize > 16) {
    actualSize -= 2
    ctx.font = `italic ${actualSize}px ${font}`
  }
  ctx.fillText(text, 230, 70)
  return canvas.toDataURL('image/png')
}

export default function SignaturePad({ onConfirm, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('draw')
  const [uploadUrl, setUploadUrl] = useState<string | null>(null)
  const [typedText, setTypedText]   = useState('')
  const [typedFont, setTypedFont]   = useState(SIG_FONTS[0].value)
  const [typedColor, setTypedColor] = useState('#1a1a1a')
  const [typedSize, setTypedSize]   = useState(52)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const drawing    = useRef(false)
  const fileRef    = useRef<HTMLInputElement>(null)

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

  // Update typed preview
  useEffect(() => {
    if (tab !== 'type' || !previewRef.current) return
    const ctx = previewRef.current.getContext('2d')!
    ctx.clearRect(0, 0, 460, 140)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 460, 140)
    if (typedText) {
      ctx.font = `italic ${typedSize}px ${typedFont}`
      ctx.fillStyle = typedColor
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      let sz = typedSize
      while (ctx.measureText(typedText).width > 420 && sz > 16) {
        sz -= 2
        ctx.font = `italic ${sz}px ${typedFont}`
      }
      ctx.fillText(typedText, 230, 70)
    }
  }, [tab, typedText, typedFont, typedColor, typedSize])

  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    drawing.current = true
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = getPos(e)
    ctx.beginPath(); ctx.moveTo(x, y)
  }

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = getPos(e)
    ctx.lineTo(x, y); ctx.stroke()
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
      const ctx = canvas.getContext('2d')!
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      const blank = px.every((v, i) => (i % 4 === 3) ? v === 255 : v === 255)
      if (blank) return
      onConfirm(canvas.toDataURL('image/png'))
    } else if (tab === 'type') {
      if (!typedText.trim()) return
      onConfirm(renderTypedSignature(typedText, typedFont, typedColor, typedSize))
    } else {
      if (!uploadUrl) return
      onConfirm(uploadUrl)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 500 }}>
        <div className="modal-title">✍ Capture Signature</div>

        <div style={{ display: 'flex', gap: 0, marginTop: 12, borderBottom: '1px solid var(--border)' }}>
          {(['draw', 'type', 'upload'] as Tab[]).map(t => (
            <button key={t}
              style={{
                padding: '6px 18px', fontSize: 13, border: 'none', cursor: 'pointer',
                background: tab === t ? 'var(--bg-page)' : 'transparent',
                borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
                color: tab === t ? 'var(--text)' : 'var(--text-muted)',
              }}
              onClick={() => setTab(t)}>
              {t === 'draw' ? '✏ Draw' : t === 'type' ? 'Aa Type' : '📁 Upload'}
            </button>
          ))}
        </div>

        {tab === 'draw' && (
          <div style={{ marginTop: 12 }}>
            <canvas ref={canvasRef} width={460} height={180}
              style={{ border: '1px solid var(--border)', borderRadius: 4, cursor: 'crosshair', display: 'block', background: '#fff', touchAction: 'none' }}
              onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Draw your signature above</div>
            <button className="modal-btn-secondary" style={{ marginTop: 8, fontSize: 12 }} onClick={clearCanvas}>Clear</button>
          </div>
        )}

        {tab === 'type' && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input className="modal-input" placeholder="Type your name…" value={typedText}
              onChange={e => setTypedText(e.target.value)}
              style={{ fontSize: 18, fontFamily: typedFont, fontStyle: 'italic', color: typedColor }} />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <label className="modal-label" style={{ fontSize: 11 }}>Font style</label>
                <select className="annot-select" style={{ width: '100%', fontSize: 12 }}
                  value={typedFont} onChange={e => setTypedFont(e.target.value)}>
                  {SIG_FONTS.map(f => <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="modal-label" style={{ fontSize: 11 }}>Color</label>
                <input type="color" value={typedColor} onChange={e => setTypedColor(e.target.value)}
                  style={{ width: 44, height: 32, padding: 2, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }} />
              </div>
              <div style={{ minWidth: 100 }}>
                <label className="modal-label" style={{ fontSize: 11 }}>Size {typedSize}px</label>
                <input type="range" min={24} max={80} value={typedSize}
                  onChange={e => setTypedSize(+e.target.value)} style={{ width: '100%' }} />
              </div>
            </div>
            <canvas ref={previewRef} width={460} height={140}
              style={{ border: '1px solid var(--border)', borderRadius: 4, background: '#fff', display: 'block' }} />
          </div>
        )}

        {tab === 'upload' && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
            <button className="modal-btn-secondary" onClick={() => fileRef.current?.click()}>📁 Browse image…</button>
            {uploadUrl && (
              <img src={uploadUrl} alt="Signature preview"
                style={{ maxWidth: 460, maxHeight: 180, border: '1px solid var(--border)', borderRadius: 4, background: '#fff' }} />
            )}
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleConfirm}
            disabled={tab === 'upload' && !uploadUrl}>
            Use Signature
          </button>
        </div>
      </div>
    </div>
  )
}
