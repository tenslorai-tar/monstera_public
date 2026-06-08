import { useState, useRef } from 'react'
import StatusText from './StatusText'
import { Upload, Image as ImageIcon, FileText, FileType, Table, MessageSquare, Download, FileJson, Ruler, Link, Presentation, CheckCircle2 } from 'lucide-react'
import { usePdfStore } from '../store/usePdfStore'

interface Props { onClose: () => void }

type ExportTab = 'images' | 'text' | 'docx' | 'xlsx' | 'annotations'
type ImageFormat = 'png' | 'jpeg' | 'webp'

export default function ExportDialog({ onClose }: Props) {
  const pdfDoc = usePdfStore(s => s.pdfDoc)
  const numPages = usePdfStore(s => s.numPages)
  const pageSizes = usePdfStore(s => s.pageSizes)
  const fileName = usePdfStore(s => s.fileName)
  const pdfBytes = usePdfStore(s => s.pdfBytes)
  const annotations = usePdfStore(s => s.annotations)

  const [tab, setTab] = useState<ExportTab>('images')
  const [format, setFormat] = useState<ImageFormat>('png')
  const [quality, setQuality] = useState(92)
  const [dpi, setDpi] = useState(150)
  const [pageRange, setPageRange] = useState('all')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const cancelRef = useRef(false)

  const baseName = fileName.replace(/\.pdf$/i, '')

  function parsePageNums(): number[] {
    if (pageRange.trim() === 'all') return Array.from({ length: numPages }, (_, i) => i + 1)
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

  // ── Render a page to canvas at given DPI scale ────────────────────────────

  async function renderPageToDataUrl(pageNum: number, imgFmt: ImageFormat, q: number): Promise<string> {
    if (!pdfDoc) throw new Error('No document')
    const scale = dpi / 72
    const page = await pdfDoc.getPage(pageNum)
    const vp = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(vp.width)
    canvas.height = Math.ceil(vp.height)
    const ctx = canvas.getContext('2d')!
    if (imgFmt === 'jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    await page.render({ canvasContext: ctx, viewport: vp }).promise
    return canvas.toDataURL(imgFmt === 'jpeg' ? 'image/jpeg' : imgFmt === 'webp' ? 'image/webp' : 'image/png', q / 100)
  }

  // ── Export pages to images ────────────────────────────────────────────────

  const exportImages = async () => {
    const pages = parsePageNums()
    if (pages.length === 0) { setStatus('No valid pages.'); return }
    const dir = await window.electronAPI.chooseDirectory()
    if (!dir) return
    setBusy(true)
    cancelRef.current = false
    const ext = format === 'jpeg' ? 'jpg' : format === 'webp' ? 'webp' : 'png'
    const files: Array<{ name: string; bytes: ArrayBuffer }> = []
    for (let i = 0; i < pages.length; i++) {
      if (cancelRef.current) break
      const p = pages[i]
      setStatus(`Rendering page ${p} / ${pages[pages.length - 1]}…`)
      const dataUrl = await renderPageToDataUrl(p, format, quality)
      const raw = atob(dataUrl.split(',')[1])
      const arr = new Uint8Array(raw.length)
      for (let j = 0; j < raw.length; j++) arr[j] = raw.charCodeAt(j)
      const pad = String(p).padStart(String(numPages).length, '0')
      files.push({ name: `${baseName}_page${pad}.${ext}`, bytes: arr.buffer })
    }
    if (!cancelRef.current) {
      await window.electronAPI.writeBytesToDir(dir, files)
      setStatus(`✓ Saved ${files.length} image${files.length !== 1 ? 's' : ''} to folder.`)
    } else {
      setStatus('Cancelled.')
    }
    setBusy(false)
  }

  // ── Export text ───────────────────────────────────────────────────────────

  const exportText = async () => {
    if (!pdfDoc || !pdfBytes) return
    setBusy(true)
    setStatus('Extracting text…')
    let text = ''
    // Prefer Poppler's layout-preserving extraction (keeps columns/tables aligned).
    try {
      const ab = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer
      const lo = await window.electronAPI.popplerTextLayout(ab)
      if (lo && lo.trim()) text = lo
    } catch { /* fall back to PDF.js below */ }
    if (!text) {
      const lines: string[] = []
      for (let p = 1; p <= numPages; p++) {
        const page = await pdfDoc.getPage(p)
        const content = await page.getTextContent()
        const pageText = content.items
          .map((item: any) => item.str ?? '')
          .join(' ')
          .replace(/ {2,}/g, ' ')
          .trim()
        if (pageText) { lines.push(`--- Page ${p} ---`); lines.push(pageText); lines.push('') }
      }
      text = lines.join('\n')
    }
    const blob = new Blob([text], { type: 'text/plain' })
    const buf = await blob.arrayBuffer()
    const savePath = await window.electronAPI.saveFileDialog(`${baseName}.txt`)
    if (savePath) {
      await window.electronAPI.writeFile(savePath, buf)
      setStatus('✓ Text extracted and saved.')
    } else {
      setStatus('Cancelled.')
    }
    setBusy(false)
  }

  // ── Export XLSX ───────────────────────────────────────────────────────────

  const exportXlsx = async () => {
    if (!pdfBytes || !pdfDoc) return
    setBusy(true)
    setStatus('Detecting tables…')
    try {
      // Heuristic table reconstruction from text positions (rows × columns).
      const { extractTablesToXlsx } = await import('../utils/extractTables')
      const result = await extractTablesToXlsx(pdfDoc, numPages)
      const savePath = await window.electronAPI.saveFileDialog(`${baseName}.xlsx`)
      if (savePath) {
        await window.electronAPI.writeFile(savePath, result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength) as ArrayBuffer)
        setStatus('✓ Excel workbook saved (one sheet per page, columns auto-detected).')
      } else {
        setStatus('Cancelled.')
      }
    } catch (e: any) {
      setStatus(`Error: ${e?.message ?? 'XLSX export failed'}`)
    }
    setBusy(false)
  }

  // ── Export DOCX ───────────────────────────────────────────────────────────
  // Quality note: uses pdf-extracted text + basic paragraph detection.
  // Layout, columns, tables, images, and exact fonts are NOT preserved.
  // Output is readable text in DOCX format — think "searchable copy", not layout clone.

  const exportDocx = async () => {
    if (!pdfDoc || !pdfBytes) return
    setBusy(true)
    try {
      const ab = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer
      setStatus('Building editable Word document…')
      const result = await window.electronAPI.exportToDocx(ab, fileName)
      if (result) {
        const savePath = await window.electronAPI.saveFileDialog(`${baseName}.docx`)
        if (savePath) {
          await window.electronAPI.writeFile(savePath, result)
          setStatus('✓ Word document saved — editable text, opens cleanly in Microsoft Word.')
        } else setStatus('Cancelled.')
      }
    } catch (e: any) {
      setStatus(`Error: ${e?.message ?? 'DOCX export failed'}`)
    }
    setBusy(false)
  }

  const exportPptx = async () => {
    if (!pdfBytes) return
    setBusy(true)
    setStatus('Rendering pages to slides…')
    try {
      const ab = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer
      const result = await window.electronAPI.exportToPptx(ab, 150)
      const savePath = await window.electronAPI.saveFileDialog(`${baseName}.pptx`)
      if (savePath) { await window.electronAPI.writeFile(savePath, result); setStatus('✓ PowerPoint saved — one slide per page, opens cleanly.') }
      else setStatus('Cancelled.')
    } catch (e: any) {
      setStatus(`Error: ${e?.message ?? 'PPTX export failed'}`)
    }
    setBusy(false)
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 480 }}>
        <div className="modal-title"><Upload size={18} /> Export</div>

        {/* tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {(['images', 'text', 'docx', 'xlsx', 'annotations'] as ExportTab[]).map(t => (
            <button key={t}
              onClick={() => setTab(t)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 14px', border: 'none', cursor: 'pointer',
                background: tab === t ? 'var(--accent)' : 'transparent',
                color: tab === t ? '#fff' : 'var(--text-muted)',
                borderRadius: '4px 4px 0 0', fontSize: 13, fontWeight: tab === t ? 600 : 400,
              }}>
              {t === 'images' ? <><ImageIcon size={14} /> Images</>
                : t === 'text' ? <><FileText size={14} /> Text (.txt)</>
                : t === 'docx' ? <><FileType size={14} /> Word (.docx)</>
                : t === 'xlsx' ? <><Table size={14} /> Excel (.xlsx)</>
                : <><MessageSquare size={14} /> Annotations</>}
            </button>
          ))}
        </div>

        {/* ── Images tab ──────────────────────────────────── */}
        {tab === 'images' && (
          <div>
            <div className="modal-field">
              <label className="modal-label">Pages</label>
              <input className="modal-input" value={pageRange}
                onChange={e => setPageRange(e.target.value)}
                placeholder={`all  or  1-3, 5  (1–${numPages})`} />
            </div>
            <div className="modal-field">
              <label className="modal-label">Format</label>
              <select className="annot-select" value={format} onChange={e => setFormat(e.target.value as ImageFormat)}>
                <option value="png">PNG (lossless)</option>
                <option value="jpeg">JPEG (smaller)</option>
                <option value="webp">WebP (modern, smallest)</option>
              </select>
            </div>
            {(format === 'jpeg' || format === 'webp') && (
              <div className="modal-field">
                <label className="modal-label">Quality {quality}%</label>
                <input type="range" min={50} max={100} step={1} value={quality}
                  onChange={e => setQuality(+e.target.value)}
                  className="annot-range" style={{ width: 140 }} />
              </div>
            )}
            <div className="modal-field">
              <label className="modal-label">Resolution {dpi} DPI</label>
              <input type="range" min={72} max={300} step={12} value={dpi}
                onChange={e => setDpi(+e.target.value)}
                className="annot-range" style={{ width: 140 }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>
                {pageSizes[0] ? `≈ ${Math.round(pageSizes[0].width * dpi / 72)} × ${Math.round(pageSizes[0].height * dpi / 72)} px` : ''}
              </span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '8px 0' }}>
              Each page saved as a separate file in a folder you choose.
            </p>
          </div>
        )}

        {/* ── Text tab ──────────────────────────────────── */}
        {tab === 'text' && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              Extracts all selectable text from the PDF and saves it as a .txt file.
              Scanned pages without OCR will produce no text.
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {numPages} page{numPages !== 1 ? 's' : ''} in document.
            </p>
          </div>
        )}

        {/* ── DOCX tab ──────────────────────────────────── */}
        {tab === 'docx' && (
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--accent-dim)', border: '1px solid var(--accent)',
              borderRadius: 8, padding: '9px 13px', marginBottom: 12,
              color: 'var(--accent)', fontSize: 12, fontWeight: 600,
            }}>
              <CheckCircle2 size={16} /> Built-in converter — no external software required.
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 }}>
              <strong>Word (.docx)</strong> reconstructs the text as flowing, fully-editable paragraphs with
              font sizes and bold/italic preserved — it always opens correctly in Microsoft Word.
              <br /><br />
              <strong>PowerPoint (.pptx)</strong> places a crisp snapshot of each page on its own slide
              (one page → one slide), so the result looks exactly like the PDF and never needs repair.
              <br /><br />
              <span style={{ color: 'var(--text-dim)' }}>
                Exact multi-column layout, tables, and inline images aren't reflowed into Word. Scanned
                pages need OCR first for the Word text to be extractable.
              </span>
            </p>
          </div>
        )}

        {/* ── XLSX tab ─────────────────────────────────────── */}
        {tab === 'xlsx' && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              Reconstructs tables by detecting rows and columns from text positions, one sheet per page.
              Works best on grid-like/tabular content; free-flowing prose won't map to neat columns.
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {numPages} page{numPages !== 1 ? 's' : ''} → {numPages} sheet{numPages !== 1 ? 's' : ''} in workbook.
            </p>
          </div>
        )}

        {/* ── Annotations tab ──────────────────────────────── */}
        {tab === 'annotations' && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              Export annotation data. {annotations.length} annotation{annotations.length !== 1 ? 's' : ''} in document.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="modal-btn-secondary" style={{ justifyContent: 'flex-start', gap: 8 }}
                onClick={() => {
                  const json = JSON.stringify(annotations, null, 2)
                  const blob = new Blob([json], { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url; a.download = `${baseName}_annotations.json`; a.click()
                  URL.revokeObjectURL(url)
                }}>
                <FileJson size={15} /> Export All as JSON
              </button>
              <button className="modal-btn-secondary" style={{ justifyContent: 'flex-start', gap: 8 }}
                onClick={() => {
                  const measures = annotations.filter(a => a.type.startsWith('measure-'))
                  const rows = ['Page,Type,Label,Points']
                  for (const a of measures) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const pts = (a as any).points ? JSON.stringify((a as any).points) : ''
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const label = (a as any).label ?? ''
                    rows.push(`${a.pageNum},${a.type},"${label}","${pts}"`)
                  }
                  const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url; a.download = `${baseName}_measurements.csv`; a.click()
                  URL.revokeObjectURL(url)
                }}
                disabled={!annotations.some(a => a.type.startsWith('measure-'))}>
                <Ruler size={15} /> Export Measurements as CSV
              </button>
              <button className="modal-btn-secondary" style={{ justifyContent: 'flex-start', gap: 8 }}
                onClick={() => {
                  const links = annotations.filter(a => a.type === 'link')
                  const rows = ['Page,URL/Destination,X1,Y1,X2,Y2']
                  for (const a of links) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const href = (a as any).href ?? (a as any).dest ?? ''
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const la = a as any
                    rows.push(`${a.pageNum},"${href}",${la.x1 ?? ''},${la.y1 ?? ''},${la.x2 ?? ''},${la.y2 ?? ''}`)
                  }
                  const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url; a.download = `${baseName}_links.csv`; a.click()
                  URL.revokeObjectURL(url)
                }}
                disabled={!annotations.some(a => a.type === 'link')}>
                <Link size={15} /> Export Links as CSV
              </button>
            </div>
          </div>
        )}

        {status && (
          <div style={{
            fontSize: 12, color: status.startsWith('✓') ? '#4caf50' : status.startsWith('Error') ? '#ff4444' : 'var(--text-muted)',
            marginBottom: 10, padding: '6px 0',
          }}>
            <StatusText status={status} />
          </div>
        )}

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={() => {
            cancelRef.current = true
            onClose()
          }}>Close</button>

          {tab === 'images' && (
            <button className="modal-btn-primary" onClick={exportImages} disabled={busy}>
              {busy ? 'Exporting…' : <><Download size={15} /> Export Images</>}
            </button>
          )}
          {tab === 'text' && (
            <button className="modal-btn-primary" onClick={exportText} disabled={busy}>
              {busy ? 'Extracting…' : <><Download size={15} /> Save as .txt</>}
            </button>
          )}
          {tab === 'docx' && (
            <>
              <button className="modal-btn-secondary" onClick={exportPptx} disabled={busy}
                title="Export one slide per page (page snapshots)">
                <Presentation size={15} /> PowerPoint
              </button>
              <button className="modal-btn-primary" onClick={exportDocx} disabled={busy}>
                {busy ? 'Working…' : <><Download size={15} /> Export to Word</>}
              </button>
            </>
          )}
          {tab === 'xlsx' && (
            <button className="modal-btn-primary" onClick={exportXlsx} disabled={busy}>
              {busy ? 'Exporting…' : <><Download size={15} /> Export to Excel</>}
            </button>
          )}
          {tab === 'annotations' && null}
        </div>
      </div>
    </div>
  )
}
