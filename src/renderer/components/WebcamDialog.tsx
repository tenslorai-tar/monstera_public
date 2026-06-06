import { useRef, useState, useEffect } from 'react'
import { usePdfStore } from '../store/usePdfStore'

interface Props { onClose: () => void }

export default function WebcamDialog({ onClose }: Props) {
  const applyEdit     = usePdfStore(s => s.applyEdit)
  const getBakedBytes = usePdfStore(s => s.getBakedBytes)
  const currentPage   = usePdfStore(s => s.currentPage)
  const addAnnotation = usePdfStore(s => s.addAnnotation)
  const pageSizes     = usePdfStore(s => s.pageSizes)

  const videoRef    = useRef<HTMLVideoElement>(null)
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const streamRef   = useRef<MediaStream | null>(null)

  const [captured,  setCaptured]  = useState<string | null>(null)
  const [error,     setError]     = useState('')
  const [mode,      setMode]      = useState<'stamp' | 'page'>('stamp')

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
      .then(stream => {
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(e => setError(`Camera access denied: ${e.message}`))
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  const capture = () => {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    setCaptured(canvas.toDataURL('image/png'))
    streamRef.current?.getTracks().forEach(t => t.stop())
  }

  const retake = () => {
    setCaptured(null)
    navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
    })
  }

  const insert = async () => {
    if (!captured) return
    const pageSize = pageSizes[currentPage - 1]
    if (!pageSize) return

    if (mode === 'stamp') {
      // Place as an image annotation stamp on current page
      const { newId } = await import('../utils/annotationUtils')
      const w = Math.min(200, pageSize.width * 0.4)
      const h = w * (480 / 640)
      addAnnotation({
        id: newId(), type: 'image-stamp', pageNum: currentPage,
        x: (pageSize.width - w) / 2, y: (pageSize.height - h) / 2,
        width: w, height: h, dataUrl: captured,
        color: '#000000', opacity: 1, lineWidth: 1,
      } as any)
    } else {
      // Insert as a new page after current page
      const { insertImagePage } = await import('../utils/pdfEdits')
      const raw   = atob(captured.split(',')[1])
      const bytes = new Uint8Array(raw.length)
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
      const result = await insertImagePage(await getBakedBytes(), bytes, 'image/png', currentPage)
      applyEdit(result)
    }
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 520 }}>
        <div className="modal-title">📷 Webcam Capture</div>

        {error ? (
          <div style={{ color: '#f44336', fontSize: 13, padding: '12px 0' }}>{error}</div>
        ) : (
          <>
            {!captured ? (
              <video ref={videoRef} autoPlay playsInline muted
                style={{ width: '100%', borderRadius: 6, border: '1px solid var(--border)', background: '#000' }} />
            ) : (
              <img src={captured} alt="Captured"
                style={{ width: '100%', borderRadius: 6, border: '1px solid var(--border)' }} />
            )}
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            <div className="modal-field" style={{ marginTop: 12 }}>
              <label className="modal-label">Insert as</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['stamp', 'page'] as const).map(m => (
                  <button key={m}
                    onClick={() => setMode(m)}
                    style={{ flex: 1, padding: '7px', border: '1px solid', cursor: 'pointer', borderRadius: 5,
                      borderColor: mode === m ? 'var(--accent)' : 'var(--border)',
                      background: mode === m ? 'rgba(74,158,255,0.1)' : 'var(--bg-secondary)',
                      fontSize: 13, color: mode === m ? 'var(--accent)' : 'var(--text)' }}>
                    {m === 'stamp' ? '🖼 Image stamp on page' : '📄 New page'}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="modal-actions" style={{ marginTop: 14 }}>
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          {!captured && !error && (
            <button className="modal-btn-primary" onClick={capture}>📸 Capture</button>
          )}
          {captured && (
            <>
              <button className="modal-btn-secondary" onClick={retake}>↺ Retake</button>
              <button className="modal-btn-primary" onClick={insert}>Insert</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
