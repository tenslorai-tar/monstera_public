import { useState } from 'react'
import { ListTree } from 'lucide-react'
import { usePdfStore } from '../store/usePdfStore'
import { PDFDocument, PDFPage, rgb, StandardFonts } from 'pdf-lib'

interface Props { onClose: () => void }

export default function TocGeneratorDialog({ onClose }: Props) {
  const pdfBytes    = usePdfStore(s => s.pdfBytes)
  const numPages    = usePdfStore(s => s.numPages)
  const bookmarks   = usePdfStore(s => s.bookmarks)
  const applyEdit   = usePdfStore(s => s.applyEdit)
  const getBakedBytes = usePdfStore(s => s.getBakedBytes)

  const [title,       setTitle]       = useState('Table of Contents')
  const [insertBefore,setInsertBefore]= useState(1)
  const [generating,  setGenerating]  = useState(false)
  const [status,      setStatus]      = useState('')

  const generate = async () => {
    if (!pdfBytes || bookmarks.length === 0) return
    setGenerating(true); setStatus('Generating TOC page…')
    try {
      const bytes = await getBakedBytes()
      const doc   = await PDFDocument.load(bytes)
      const font  = await doc.embedFont(StandardFonts.Helvetica)
      const bold  = await doc.embedFont(StandardFonts.HelveticaBold)

      // Create TOC page (A4 size)
      const tocPage: PDFPage = doc.insertPage(insertBefore - 1, [595, 842])
      const { width, height } = tocPage.getSize()
      const margin = 60

      // Title
      tocPage.drawText(title, {
        x: margin, y: height - 80,
        font: bold, size: 20, color: rgb(0, 0, 0),
      })

      // Separator line
      tocPage.drawLine({
        start: { x: margin, y: height - 95 },
        end:   { x: width - margin, y: height - 95 },
        thickness: 1, color: rgb(0.5, 0.5, 0.5),
      })

      // Entries
      let y = height - 125
      const lineHeight = 22
      const maxEntries = Math.floor((height - 180) / lineHeight)
      const entries = bookmarks.slice(0, maxEntries)

      for (const bm of entries) {
        const pageLabel = `${bm.pageNum + 1}` // TOC page offsets page numbers by 1
        const dots = '·'.repeat(Math.max(3, Math.floor((width - 2 * margin - font.widthOfTextAtSize(bm.title, 12) - font.widthOfTextAtSize(pageLabel, 12)) / font.widthOfTextAtSize('·', 12))))

        tocPage.drawText(bm.title, { x: margin, y, font, size: 12, color: rgb(0, 0, 0) })
        tocPage.drawText(dots, { x: margin + font.widthOfTextAtSize(bm.title, 12) + 4, y, font, size: 12, color: rgb(0.6, 0.6, 0.6) })
        tocPage.drawText(pageLabel, { x: width - margin - font.widthOfTextAtSize(pageLabel, 12), y, font, size: 12, color: rgb(0, 0, 0) })
        y -= lineHeight
      }

      if (bookmarks.length > maxEntries) {
        tocPage.drawText(`… and ${bookmarks.length - maxEntries} more entries`, {
          x: margin, y, font, size: 11, color: rgb(0.5, 0.5, 0.5),
        })
      }

      applyEdit(new Uint8Array(await doc.save()))
      setStatus(`✓ TOC page inserted at position ${insertBefore}.`)
    } catch (e: any) {
      setStatus(`Error: ${e?.message}`)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 440 }}>
        <div className="modal-title"><ListTree size={18} /> Generate Table of Contents</div>

        {bookmarks.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            No bookmarks found. Add bookmarks via the Bookmarks panel first.
          </p>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
              Creates a formatted TOC page from your {bookmarks.length} bookmark{bookmarks.length !== 1 ? 's' : ''}.
            </p>

            <div className="modal-field">
              <label className="modal-label">TOC page title</label>
              <input className="modal-input" value={title} onChange={e => setTitle(e.target.value)} />
            </div>

            <div className="modal-field">
              <label className="modal-label">Insert before page</label>
              <input type="number" className="modal-input" min={1} max={numPages + 1}
                value={insertBefore} onChange={e => setInsertBefore(Math.max(1, parseInt(e.target.value) || 1))} />
              <span className="modal-hint">Insert at position 1 to make it the first page.</span>
            </div>
          </>
        )}

        {status && (
          <div style={{ fontSize: 12, color: status.startsWith('✓') ? '#4caf50' : '#f44336', marginBottom: 8 }}>{status}</div>
        )}

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Close</button>
          {bookmarks.length > 0 && (
            <button className="modal-btn-primary" onClick={generate} disabled={generating}>
              {generating ? 'Generating…' : 'Generate TOC Page'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
