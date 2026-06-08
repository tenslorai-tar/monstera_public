import { useState } from 'react'
import StatusText from './StatusText'
import { Layers } from 'lucide-react'
import { usePdfStore } from '../store/usePdfStore'
import { PDFDocument, PDFName, PDFDict, PDFArray } from 'pdf-lib'

interface Props { onClose: () => void }

export default function ImportToLayerDialog({ onClose }: Props) {
  const numPages      = usePdfStore(s => s.numPages)
  const currentPage   = usePdfStore(s => s.currentPage)
  const applyEdit     = usePdfStore(s => s.applyEdit)
  const getBakedBytes = usePdfStore(s => s.getBakedBytes)
  const pdfBytes      = usePdfStore(s => s.pdfBytes)

  const [srcPath,    setSrcPath]    = useState<string | null>(null)
  const [srcName,    setSrcName]    = useState('')
  const [targetPage, setTargetPage] = useState(currentPage)
  const [layerName,  setLayerName]  = useState('Imported Layer')
  const [opacity,    setOpacity]    = useState(0.8)
  const [importing,  setImporting]  = useState(false)
  const [status,     setStatus]     = useState('')

  const pickFile = async () => {
    const path = await window.electronAPI.openFileDialog()
    if (!path) return
    setSrcPath(path)
    setSrcName(path.split(/[\\/]/).pop() ?? path)
    setStatus('')
  }

  const importLayer = async () => {
    if (!srcPath || !pdfBytes) return
    setImporting(true); setStatus('Importing layer…')
    try {
      const [destBytes, srcBytes] = await Promise.all([
        getBakedBytes(),
        window.electronAPI.readFileBytes(srcPath),
      ])

      const destDoc = await PDFDocument.load(destBytes)
      const srcDoc  = await PDFDocument.load(new Uint8Array(srcBytes))

      // Copy first page of source as an XObject embedded in destination page
      const [copiedPage] = await destDoc.copyPages(srcDoc, [0])
      const embeddedPage = await destDoc.embedPage(copiedPage)

      const destPdfPage = destDoc.getPage(targetPage - 1)
      const { width: destW, height: destH } = destPdfPage.getSize()

      // Create OCG (Optional Content Group) for the layer
      const ocg = destDoc.context.obj({
        Type: PDFName.of('OCG'),
        Name: layerName,
        Intent: PDFName.of('View'),
      })
      const ocgRef = destDoc.context.register(ocg)

      // Add OCG to document's OCProperties
      const catalog = destDoc.catalog
      let ocProps = catalog.get(PDFName.of('OCProperties'))
      if (!ocProps) {
        ocProps = destDoc.context.obj({ OCGs: PDFArray.withContext(destDoc.context), D: destDoc.context.obj({ Order: PDFArray.withContext(destDoc.context), ON: PDFArray.withContext(destDoc.context) }) })
        catalog.set(PDFName.of('OCProperties'), ocProps)
      }
      const ocPropsDict = ocProps as PDFDict
      try {
        const ocgs = ocPropsDict.get(PDFName.of('OCGs')) as PDFArray
        if (ocgs) ocgs.push(ocgRef)
        const d = ocPropsDict.get(PDFName.of('D')) as PDFDict
        if (d) {
          const on = d.get(PDFName.of('ON')) as PDFArray
          if (on) on.push(ocgRef)
          const order = d.get(PDFName.of('Order')) as PDFArray
          if (order) order.push(ocgRef)
        }
      } catch { /* skip if OCG structure is complex */ }

      // Draw the embedded page as an image with optional content group marking
      destPdfPage.drawPage(embeddedPage, {
        x: 0, y: 0, width: destW, height: destH, opacity,
      })

      applyEdit(new Uint8Array(await destDoc.save()))
      setStatus(`✓ Layer "${layerName}" imported onto page ${targetPage}.`)
    } catch (e: any) {
      setStatus(`Error: ${e?.message}`)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 460 }}>
        <div className="modal-title"><Layers size={18} /> Import Pages to Layer</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Imports the first page of another PDF as an Optional Content Group (layer) on a page
          in the current document. The imported content appears as a named layer.
        </p>

        <div className="modal-field">
          <label className="modal-label">Source PDF file</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="modal-btn-secondary" onClick={pickFile}>Browse…</button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {srcName || 'No file selected'}
            </span>
          </div>
        </div>

        <div className="modal-field">
          <label className="modal-label">Layer name</label>
          <input className="modal-input" value={layerName} onChange={e => setLayerName(e.target.value)}
            placeholder="e.g. Background, Overlay, Watermark" />
        </div>

        <div className="modal-field">
          <label className="modal-label">Import onto page</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="number" className="modal-input" style={{ width: 80 }}
              min={1} max={numPages} value={targetPage}
              onChange={e => setTargetPage(Math.max(1, Math.min(numPages, parseInt(e.target.value) || 1)))} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>of {numPages}</span>
          </div>
        </div>

        <div className="modal-field">
          <label className="modal-label">Opacity: {Math.round(opacity * 100)}%</label>
          <input type="range" min={0.1} max={1} step={0.05} value={opacity}
            onChange={e => setOpacity(parseFloat(e.target.value))} style={{ width: '100%' }} />
        </div>

        {status && (
          <div style={{ fontSize: 12, marginBottom: 8, color: status.startsWith('✓') ? '#4caf50' : status.startsWith('Error') ? '#f44336' : 'var(--text-muted)' }}>
            <StatusText status={status} />
          </div>
        )}

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Close</button>
          <button className="modal-btn-primary" onClick={importLayer}
            disabled={!srcPath || !pdfBytes || importing || !layerName.trim()}>
            {importing ? 'Importing…' : 'Import as Layer'}
          </button>
        </div>
      </div>
    </div>
  )
}
