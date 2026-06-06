import { useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'
import { PDFDocument, PDFName, PDFDict, PDFNumber } from 'pdf-lib'

interface Props { onClose: () => void }

const STYLES = [
  { id: 'S',  label: 'Split',    desc: 'Two lines sweep across the page' },
  { id: 'B',  label: 'Blinds',   desc: 'Multiple lines sweep, like venetian blinds' },
  { id: 'B2', label: 'Box',      desc: 'Inward or outward box' },
  { id: 'W',  label: 'Wipe',     desc: 'Single line sweeps across the page' },
  { id: 'D',  label: 'Dissolve', desc: 'Page dissolves into pixels' },
  { id: 'Gl', label: 'Glitter',  desc: 'Glitter-like dissolve, diagonal' },
  { id: 'R',  label: 'Replace',  desc: 'Immediate replace (no animation)' },
  { id: 'Fl', label: 'Fly',      desc: 'Page flies in from outside' },
  { id: 'Push',label: 'Push',    desc: 'Page is pushed in by new page' },
  { id: 'Cov',label: 'Cover',    desc: 'New page slides over old page' },
  { id: 'Un', label: 'Uncover',  desc: 'Old page slides away revealing new one' },
  { id: 'Fa', label: 'Fade',     desc: 'Old page fades out, new fades in' },
]

export default function PageTransitionsDialog({ onClose }: Props) {
  const pdfBytes      = usePdfStore(s => s.pdfBytes)
  const numPages      = usePdfStore(s => s.numPages)
  const applyEdit     = usePdfStore(s => s.applyEdit)
  const getBakedBytes = usePdfStore(s => s.getBakedBytes)

  const [style,     setStyle]     = useState('D')
  const [duration,  setDuration]  = useState(1)
  const [pageScope, setPageScope] = useState<'all' | 'current' | 'range'>('all')
  const [pageRange, setPageRange] = useState('')
  const [applying,  setApplying]  = useState(false)
  const [status,    setStatus]    = useState('')
  const currentPage = usePdfStore(s => s.currentPage)

  function parsePages(): number[] {
    if (pageScope === 'all')     return Array.from({ length: numPages }, (_, i) => i + 1)
    if (pageScope === 'current') return [currentPage]
    const result: number[] = []
    for (const part of pageRange.split(',')) {
      const p = part.trim()
      const m = p.match(/^(\d+)-(\d+)$/)
      if (m) {
        for (let i = parseInt(m[1]); i <= parseInt(m[2]); i++)
          if (i >= 1 && i <= numPages) result.push(i)
      } else {
        const n = parseInt(p)
        if (!isNaN(n) && n >= 1 && n <= numPages) result.push(n)
      }
    }
    return [...new Set(result)].sort((a, b) => a - b)
  }

  const apply = async () => {
    if (!pdfBytes) return
    setApplying(true); setStatus('Applying transitions…')
    try {
      const bytes = await getBakedBytes()
      const doc   = await PDFDocument.load(bytes)
      const pages = parsePages()
      for (const p of pages) {
        const page = doc.getPage(p - 1)
        const trans = PDFDict.withContext(doc.context)
        trans.set(PDFName.of('Type'), PDFName.of('Trans'))
        trans.set(PDFName.of('S'),    PDFName.of(style))
        trans.set(PDFName.of('D'),    PDFNumber.of(duration))
        page.node.set(PDFName.of('Trans'), trans)
      }
      const result = await doc.save()
      applyEdit(result)
      setStatus(`✓ Applied ${STYLES.find(s => s.id === style)?.label} transition to ${pages.length} page${pages.length !== 1 ? 's' : ''}.`)
    } catch (e: any) {
      setStatus(`Error: ${e?.message ?? 'Failed to apply transitions'}`)
    } finally {
      setApplying(false)
    }
  }

  const clear = async () => {
    if (!pdfBytes) return
    setApplying(true); setStatus('Removing transitions…')
    try {
      const bytes = await getBakedBytes()
      const doc   = await PDFDocument.load(bytes)
      for (let p = 0; p < numPages; p++) {
        doc.getPage(p).node.delete(PDFName.of('Trans'))
      }
      applyEdit(await doc.save())
      setStatus('✓ All page transitions removed.')
    } catch (e: any) {
      setStatus(`Error: ${e?.message}`)
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 480 }}>
        <div className="modal-title">🎬 Page Transitions</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          Sets slide-show transition effects when moving between pages in full-screen PDF viewers.
        </p>

        <div className="modal-field">
          <label className="modal-label">Transition style</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
            {STYLES.map(s => (
              <label key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', padding: '5px 8px', borderRadius: 4,
                background: style === s.id ? 'rgba(74,158,255,0.08)' : 'transparent',
                border: `1px solid ${style === s.id ? 'var(--accent)' : 'transparent'}` }}>
                <input type="radio" name="style" checked={style === s.id} onChange={() => setStyle(s.id)} style={{ marginTop: 2 }} />
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>{s.desc}</span>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="modal-field">
          <label className="modal-label">Duration: {duration}s</label>
          <input type="range" min={0.5} max={5} step={0.5} value={duration}
            onChange={e => setDuration(parseFloat(e.target.value))} style={{ width: '100%' }} />
        </div>

        <div className="modal-field">
          <label className="modal-label">Apply to</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(['all', 'current', 'range'] as const).map(s => (
              <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" name="scope" checked={pageScope === s} onChange={() => setPageScope(s)} />
                {s === 'all' ? `All pages (${numPages})` : s === 'current' ? `Current page (${currentPage})` : 'Page range:'}
              </label>
            ))}
            {pageScope === 'range' && (
              <input className="modal-input" style={{ marginLeft: 20 }} value={pageRange}
                onChange={e => setPageRange(e.target.value)}
                placeholder={`e.g. 1-5, 8 (1–${numPages})`} />
            )}
          </div>
        </div>

        {status && (
          <div style={{ fontSize: 12, color: status.startsWith('✓') ? '#4caf50' : status.startsWith('Error') ? '#f44336' : 'var(--text-muted)', marginBottom: 8 }}>
            {status}
          </div>
        )}

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={clear} disabled={applying}>Clear All</button>
          <button className="modal-btn-secondary" onClick={onClose}>Close</button>
          <button className="modal-btn-primary" onClick={apply} disabled={applying}>
            {applying ? 'Applying…' : 'Apply Transition'}
          </button>
        </div>
      </div>
    </div>
  )
}
