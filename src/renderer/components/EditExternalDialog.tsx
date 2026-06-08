import { useState } from 'react'
import { SquarePen, Download, ExternalLink } from 'lucide-react'
import { usePdfStore } from '../store/usePdfStore'

interface Props { onClose: () => void }

export default function EditExternalDialog({ onClose }: Props) {
  const pdfBytes      = usePdfStore(s => s.pdfBytes)
  const currentPage   = usePdfStore(s => s.currentPage)
  const numPages      = usePdfStore(s => s.numPages)
  const getBakedBytes = usePdfStore(s => s.getBakedBytes)
  const pageSizes     = usePdfStore(s => s.pageSizes)
  const addAnnotation = usePdfStore(s => s.addAnnotation)

  const [pageNum,   setPageNum]   = useState(currentPage)
  const [status,    setStatus]    = useState('')
  const [pngPath,   setPngPath]   = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)

  const exportPage = async () => {
    if (!pdfBytes) return
    setExporting(true); setStatus('Exporting page and opening in system editor…')
    try {
      const bytes = await getBakedBytes()
      const result = await window.electronAPI.exportPageForEdit(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, pageNum)
      setPngPath(result.pngPath)
      setStatus(`✓ Page ${pageNum} exported to temp file. Edit it, then click "Reimport Edited Page" when done.`)
    } catch (e: any) {
      setStatus(`Error: ${e?.message}`)
    } finally {
      setExporting(false)
    }
  }

  const reimport = async () => {
    if (!pngPath || !pdfBytes) return
    setImporting(true); setStatus('Re-importing edited image…')
    try {
      const imageBytes = await window.electronAPI.reimportEditedPage(pngPath)
      const imageData  = new Uint8Array(imageBytes)
      const ps = pageSizes[pageNum - 1]

      // Place as an image-stamp annotation over the page (full page coverage)
      const { newId } = await import('../utils/annotationUtils')
      const dataUrl = await new Promise<string>(resolve => {
        const blob = new Blob([imageData], { type: 'image/png' })
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(blob)
      })

      addAnnotation({
        id: newId(), type: 'placed-image', pageNum,
        x: 0, y: 0, width: ps.width, height: ps.height,
        dataUrl, color: '#000000', opacity: 1, lineWidth: 1,
      } as any)

      setStatus(`✓ Reimported. The edited image covers page ${pageNum}. Save to bake into PDF.`)
      setPngPath(null)
    } catch (e: any) {
      setStatus(`Error: ${e?.message}`)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 480 }}>
        <div className="modal-title"><SquarePen size={18} /> Edit Page in External App</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Exports a PDF page as a PNG image, opens it in your system's default image editor,
          then reimports the edited result as an overlay annotation.
        </p>
        <p style={{ fontSize: 11, color: '#ff9800', marginBottom: 12, padding: '6px 10px', background: 'rgba(255,152,0,0.1)', borderRadius: 4 }}>
          ⚠ The edited image will cover the original page content as an overlay. To make it permanent, save the PDF.
        </p>

        <div className="modal-field">
          <label className="modal-label">Page to export</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="number" className="modal-input" style={{ width: 80 }}
              min={1} max={numPages} value={pageNum}
              onChange={e => setPageNum(Math.max(1, Math.min(numPages, parseInt(e.target.value) || 1)))} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>of {numPages}</span>
          </div>
        </div>

        {status && (
          <div style={{ fontSize: 12, marginBottom: 10, padding: '6px 10px', borderRadius: 4,
            color: status.startsWith('✓') ? '#4caf50' : status.startsWith('Error') ? '#f44336' : 'var(--text-muted)',
            background: status.startsWith('✓') ? 'rgba(76,175,80,0.08)' : 'transparent' }}>
            {status}
          </div>
        )}

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Close</button>
          {pngPath && (
            <button className="modal-btn-secondary" onClick={reimport} disabled={importing}>
              {importing ? 'Importing…' : <><Download size={15} /> Reimport Edited Page</>}
            </button>
          )}
          <button className="modal-btn-primary" onClick={exportPage} disabled={exporting || !pdfBytes}>
            {exporting ? 'Exporting…' : <><ExternalLink size={15} /> Export & Open in Editor</>}
          </button>
        </div>
      </div>
    </div>
  )
}
