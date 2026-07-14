import { useState, useRef, useEffect } from 'react'
import StatusText from './StatusText'
import { Upload, Image as ImageIcon, FileText, FileType, Table, MessageSquare, Download, FileJson, Ruler, Link, Presentation, CheckCircle2, Sparkles, Download as DownloadIcon, ShieldCheck, AlertTriangle, XCircle, Wrench } from 'lucide-react'
import { usePdfStore } from '../store/usePdfStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { OCR_LANGUAGES } from '../utils/ocrUtils'
import type { OcrWord } from '../utils/ocrUtils'
import type { PageGrid } from '../utils/extractTables'

interface Props { onClose: () => void }

type ExportTab = 'images' | 'text' | 'docx' | 'xlsx' | 'pdfa' | 'annotations'
type ImageFormat = 'png' | 'jpeg' | 'webp'
type DocxMode = 'rich' | 'layout' | 'text' | 'handwriting'
type XlsxEngine = 'auto' | 'ocr' | 'trocr' | 'azure'
type HwEngine = 'trocr' | 'azure'

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
  const [docxMode, setDocxMode] = useState<DocxMode>('layout')
  const [richStatus, setRichStatus] = useState<{ python: string; version: string; installed: boolean } | null>(null)
  const [installing, setInstalling] = useState(false)
  const [pdfaReport, setPdfaReport] = useState<Array<{ level: string; message: string }> | null>(null)
  const pdfaBytesRef = useRef<ArrayBuffer | null>(null)
  const cancelRef = useRef(false)
  const settings = useSettingsStore(s => s.settings)
  const updateSettings = useSettingsStore(s => s.updateSettings)
  const [xlsxEngine, setXlsxEngine] = useState<XlsxEngine>('auto')
  const [xlsxLang, setXlsxLang] = useState(settings.ocrLanguage || 'eng')
  const [grids, setGrids] = useState<PageGrid[] | null>(null)
  const [gridIdx, setGridIdx] = useState(0)
  const [combineSheets, setCombineSheets] = useState(true)
  const [hwEngine, setHwEngine] = useState<HwEngine>('trocr')
  const [hwParas, setHwParas] = useState<Array<{ page: number; paragraphs: string[] }> | null>(null)

  useEffect(() => {
    window.electronAPI.pdf2docxStatus().then(s => {
      setRichStatus(s)
      if (s.installed) setDocxMode('rich') // prefer the best engine when present
    }).catch(() => setRichStatus({ python: '', version: '', installed: false }))
  }, [])

  const setupRichEngine = async () => {
    setInstalling(true)
    setStatus('Setting up the pdf2docx engine (downloads ~80 MB the first time)…')
    try {
      const r = await window.electronAPI.pdf2docxInstall()
      if (r.ok) {
        const s = await window.electronAPI.pdf2docxStatus()
        setRichStatus(s)
        setDocxMode('rich')
        setStatus('✓ pdf2docx engine ready.')
      } else {
        setStatus(`Error: setup failed. ${r.log.split('\n').slice(-1)[0] || ''}`.trim())
      }
    } catch (e: any) {
      setStatus(`Error: ${e?.message ?? 'setup failed'}`)
    }
    setInstalling(false)
  }

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
    await page.render({ canvas, viewport: vp }).promise
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

  // ── Export XLSX: detect (text / OCR / Azure) → review grid → save ─────────

  async function renderPagePixels(pageNum: number, scale: number): Promise<{ data: Uint8ClampedArray; width: number; height: number } | null> {
    if (!pdfDoc) return null
    const page = await pdfDoc.getPage(pageNum)
    const vp = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(vp.width)
    canvas.height = Math.ceil(vp.height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, viewport: vp, annotationMode: 0 }).promise
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return { data: img.data, width: img.width, height: img.height }
  }

  async function rulingSeps(pageNum: number, ex: typeof import('../utils/extractTables')): Promise<number[] | null> {
    const scale = 1.5
    const img = await renderPagePixels(pageNum, scale)
    if (!img) return null
    return ex.detectRuledColumnSeparators({ data: img.data, width: img.width, height: img.height, channels: 4 }, scale)
  }

  const detectTables = async () => {
    if (!pdfDoc || !pdfBytes) return
    const pages = parsePageNums()
    if (pages.length === 0) { setStatus('No valid pages.'); return }
    setBusy(true)
    setGrids(null)
    setGridIdx(0)
    cancelRef.current = false
    try {
      const ex = await import('../utils/extractTables')

      if (xlsxEngine === 'trocr') {
        const model = settings.trocrModel === 'small' ? 'small' : 'base'
        const st = await window.electronAPI.trocrStatus(model)
        if (!st.ready) {
          setStatus(st.cached
            ? 'Loading the local handwriting model…'
            : `Downloading the ${model === 'base' ? 'best-quality' : 'fast'} handwriting model (one-time, ≈${model === 'base' ? '340' : '80'} MB)…`)
          await window.electronAPI.trocrSetup(model)
        }
        const out: PageGrid[] = []
        for (const p of pages) {
          if (cancelRef.current) break
          setStatus(`Analyzing the layout of page ${p}…`)
          const page = await pdfDoc.getPage(p)
          const vp0 = page.getViewport({ scale: 1 })
          const scale = Math.min(3, 4000 / Math.max(vp0.width, vp0.height))
          const vp = page.getViewport({ scale })
          const canvas = document.createElement('canvas')
          canvas.width = Math.ceil(vp.width)
          canvas.height = Math.ceil(vp.height)
          const ctx = canvas.getContext('2d', { willReadFrequently: true })!
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          await page.render({ canvas, viewport: vp, annotationMode: 0 }).promise
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const seg = ex.segmentTableCells({ data: img.data, width: img.width, height: img.height, channels: 4 })
          const grid: string[][] = Array.from({ length: seg.rows }, () => new Array(seg.cols).fill(''))
          for (let i = 0; i < seg.cells.length; i++) {
            if (cancelRef.current) break
            const cell = seg.cells[i]
            setStatus(`Page ${p}: reading cell ${i + 1} / ${seg.cells.length} with the local model…`)
            const c2 = document.createElement('canvas')
            c2.width = cell.w
            c2.height = cell.h
            const ictx = c2.getContext('2d')!
            const id = ictx.createImageData(cell.w, cell.h)
            for (let yy = 0; yy < cell.h; yy++) {
              for (let xx = 0; xx < cell.w; xx++) {
                const v = seg.ink[(cell.y + yy) * img.width + (cell.x + xx)] ? 0 : 255
                const o = (yy * cell.w + xx) * 4
                id.data[o] = v; id.data[o + 1] = v; id.data[o + 2] = v; id.data[o + 3] = 255
              }
            }
            ictx.putImageData(id, 0, 0)
            const blob = await new Promise<Blob | null>(res => c2.toBlob(res, 'image/png'))
            if (!blob) continue
            grid[cell.row][cell.col] = await window.electronAPI.trocrRecognize(await blob.arrayBuffer(), model)
          }
          out.push({ page: p, grid: ex.trimGrid(grid), source: 'trocr' })
        }
        if (cancelRef.current) { setStatus('Cancelled.'); setBusy(false); return }
        setGrids(out)
        const n = out.filter(g => g.grid.length > 0).length
        setStatus(n > 0
          ? `✓ ${n} page${n !== 1 ? 's' : ''} read with the local handwriting model — click any cell below to correct it, then export.`
          : 'No table content found on the selected pages.')
        setBusy(false)
        return
      }

      if (xlsxEngine === 'azure') {
        const endpoint = settings.azureDiEndpoint.trim()
        const key = settings.azureDiKey.trim()
        if (!endpoint || !key) { setStatus('Error: add your Azure endpoint and key in Settings (Ctrl+,) → API keys first.'); setBusy(false); return }
        setStatus('Analyzing with Azure Document Intelligence (reads handwriting)…')
        const ab = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer
        const result = await window.electronAPI.azureLayoutAnalyze(ab, endpoint, key, pages.join(','))
        const gs = ex.azureResultToGrids(result, pages)
        setGrids(gs)
        const n = gs.filter(g => g.grid.length > 0).length
        setStatus(n > 0
          ? `✓ ${n} page${n !== 1 ? 's' : ''} analyzed — click any cell below to correct it, then export.`
          : 'Azure found no readable content on the selected pages.')
        setBusy(false)
        return
      }

      const ocrData = usePdfStore.getState().ocrData
      const out: PageGrid[] = []
      const ocrPages: number[] = []
      for (const p of pages) {
        if (cancelRef.current) break
        if (xlsxEngine === 'auto') {
          setStatus(`Reading text on page ${p}…`)
          const items = await ex.nativeItems(pdfDoc, p)
          if (items.reduce((s, i) => s + i.str.length, 0) >= 15) {
            const detail = ex.itemsToGridDetailed(items)
            let styling: import('../utils/extractTables').PageStyling | undefined
            try {
              const sx = await import('../utils/styledExcel')
              const ab2 = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer
              const runs = await window.electronAPI.pdfiumStyledRuns(ab2, p - 1)
              const scale = 1.5
              const img = await renderPagePixels(p, scale)
              const nR = detail.grid.length
              const nC = nR > 0 ? Math.max(...detail.grid.map(r => r.length)) : 0
              styling = sx.computeStyling(detail, runs, img ? { ...img, channels: 4 } : null, scale, pageSizes[p - 1]?.height ?? 792, nR, nC)
            } catch { /* plain cells when styling is unavailable */ }
            out.push({ page: p, grid: detail.grid, source: 'text', styling })
            continue
          }
        }
        const cached = ocrData.get(p)
        if (cached?.length) out.push({ page: p, grid: ex.itemsToGrid(ex.ocrWordsToItems(cached), await rulingSeps(p, ex)), source: 'ocr' })
        else ocrPages.push(p)
      }

      if (ocrPages.length > 0 && !cancelRef.current) {
        const { runOcrOnPages } = await import('../utils/ocrUtils')
        const collected = new Map<number, OcrWord[]>()
        const ac = new AbortController()
        let idx = 0
        await runOcrOnPages(pdfDoc, pageSizes, ocrPages, xlsxLang,
          (pn, words) => { collected.set(pn, words); idx++ },
          (_done, total, pageProgress) => {
            if (cancelRef.current) ac.abort()
            setStatus(`OCR page ${Math.min(idx + 1, total)} / ${total} — ${Math.round(pageProgress * 100)}%`)
          }, ac.signal)
        for (const p of ocrPages) {
          if (cancelRef.current) break
          const words = collected.get(p) ?? []
          out.push({ page: p, grid: ex.itemsToGrid(ex.ocrWordsToItems(words), await rulingSeps(p, ex)), source: 'ocr' })
        }
      }

      if (cancelRef.current) { setStatus('Cancelled.'); setBusy(false); return }
      out.sort((a, b) => a.page - b.page)
      setGrids(out)
      const n = out.filter(g => g.grid.length > 0).length
      setStatus(n > 0
        ? `✓ Tables detected on ${n} page${n !== 1 ? 's' : ''} — click any cell below to correct it, then export.`
        : 'No table content found on the selected pages. Scanned handwriting needs the Azure AI engine.')
    } catch (e: any) {
      setStatus(`Error: ${e?.message ?? 'table detection failed'}`)
    }
    setBusy(false)
  }

  const updateCell = (ri: number, ci: number, val: string) => {
    setGrids(gs => {
      if (!gs) return gs
      return gs.map((g, i) => i !== gridIdx ? g
        : { ...g, grid: g.grid.map((r, rj) => rj !== ri ? r : r.map((c, cj) => cj === ci ? val : c)) })
    })
  }

  const exportXlsx = async () => {
    if (!grids) return
    setBusy(true)
    try {
      const { gridsToXlsxStyled } = await import('../utils/styledExcel')
      const result = await gridsToXlsxStyled(grids, combineSheets)
      const savePath = await window.electronAPI.saveFileDialog(`${baseName}.xlsx`)
      if (savePath) {
        await window.electronAPI.writeFile(savePath, result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength) as ArrayBuffer)
        setStatus('✓ Excel workbook saved.')
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
    if (!pdfDoc || !pdfBytes || docxMode === 'handwriting') return
    setBusy(true)
    try {
      const ab = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer
      setStatus(
        docxMode === 'rich'   ? 'Reconstructing layout with pdf2docx (this can take a moment)…'
        : docxMode === 'layout' ? 'Rendering pages into Word (preserving design)…'
        : 'Building editable Word document…')
      const result = docxMode === 'rich'
        ? await window.electronAPI.pdf2docxConvert(ab)
        : await window.electronAPI.exportToDocx(ab, fileName, docxMode)
      if (result) {
        const savePath = await window.electronAPI.saveFileDialog(`${baseName}.docx`)
        if (savePath) {
          await window.electronAPI.writeFile(savePath, result)
          setStatus(
            docxMode === 'rich'   ? '✓ Word document saved — editable text with reconstructed layout (columns, tables, images).'
            : docxMode === 'layout' ? '✓ Word document saved — original design preserved, opens cleanly in Microsoft Word.'
            : '✓ Word document saved — editable text, opens cleanly in Microsoft Word.')
        } else setStatus('Cancelled.')
      }
    } catch (e: any) {
      setStatus(`Error: ${e?.message ?? 'DOCX export failed'}`)
    }
    setBusy(false)
  }

  // ── Handwriting → Word (TrOCR prose / Azure read) ─────────────────────────

  const recognizeHandwriting = async () => {
    if (!pdfDoc || !pdfBytes) return
    const pages = parsePageNums()
    if (pages.length === 0) { setStatus('No valid pages.'); return }
    setBusy(true)
    setHwParas(null)
    cancelRef.current = false
    try {
      const ex = await import('../utils/extractTables')

      if (hwEngine === 'azure') {
        const endpoint = settings.azureDiEndpoint.trim()
        const key = settings.azureDiKey.trim()
        if (!endpoint || !key) { setStatus('Error: add your Azure endpoint and key in Settings (Ctrl+,) → API keys first.'); setBusy(false); return }
        setStatus('Reading handwriting with Azure (prebuilt-read)…')
        const ab = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer
        const result = await window.electronAPI.azureReadAnalyze(ab, endpoint, key, pages.join(','))
        const out = ex.azureReadToParagraphs(result, pages)
        setHwParas(out)
        const n = out.filter(g => g.paragraphs.length > 0).length
        setStatus(n > 0
          ? `✓ ${n} page${n !== 1 ? 's' : ''} read — edit any text below, then export to Word.`
          : 'Azure found no readable text on the selected pages.')
        setBusy(false)
        return
      }

      const model = settings.trocrModel === 'small' ? 'small' : 'base'
      const st = await window.electronAPI.trocrStatus(model)
      if (!st.ready) {
        setStatus(st.cached
          ? 'Loading the local handwriting model…'
          : `Downloading the ${model === 'base' ? 'best-quality' : 'fast'} handwriting model (one-time, ≈${model === 'base' ? '340' : '80'} MB)…`)
        await window.electronAPI.trocrSetup(model)
      }
      const out: Array<{ page: number; paragraphs: string[] }> = []
      for (const p of pages) {
        if (cancelRef.current) break
        setStatus(`Analyzing the layout of page ${p}…`)
        const scale = Math.min(200 / 72, 4000 / Math.max(pageSizes[p - 1]?.width ?? 612, pageSizes[p - 1]?.height ?? 792))
        const img = await renderPagePixels(p, scale)
        if (!img) { out.push({ page: p, paragraphs: [] }); continue }
        const seg = ex.segmentTextLines({ data: img.data, width: img.width, height: img.height, channels: 4 })
        const recognized: Array<{ text: string; y: number; h: number }> = []
        for (let i = 0; i < seg.lines.length; i++) {
          if (cancelRef.current) break
          const line = seg.lines[i]
          setStatus(`Page ${p}: reading line ${i + 1} / ${seg.lines.length} with the local model…`)
          const c2 = document.createElement('canvas')
          c2.width = line.w
          c2.height = line.h
          const ictx = c2.getContext('2d')!
          const id = ictx.createImageData(line.w, line.h)
          for (let yy = 0; yy < line.h; yy++) {
            for (let xx = 0; xx < line.w; xx++) {
              const v = seg.ink[(line.y + yy) * img.width + (line.x + xx)] ? 0 : 255
              const o = (yy * line.w + xx) * 4
              id.data[o] = v; id.data[o + 1] = v; id.data[o + 2] = v; id.data[o + 3] = 255
            }
          }
          ictx.putImageData(id, 0, 0)
          const blob = await new Promise<Blob | null>(res => c2.toBlob(res, 'image/png'))
          if (!blob) continue
          const text = await window.electronAPI.trocrRecognize(await blob.arrayBuffer(), model)
          recognized.push({ text, y: line.y, h: line.h })
        }
        out.push({ page: p, paragraphs: ex.groupLinesToParagraphs(recognized) })
      }
      if (cancelRef.current) { setStatus('Cancelled.'); setBusy(false); return }
      setHwParas(out)
      const n = out.filter(g => g.paragraphs.length > 0).length
      setStatus(n > 0
        ? `✓ ${n} page${n !== 1 ? 's' : ''} read with the local handwriting model — edit any text below, then export to Word.`
        : 'No handwriting found on the selected pages.')
    } catch (e: any) {
      setStatus(`Error: ${e?.message ?? 'handwriting recognition failed'}`)
    }
    setBusy(false)
  }

  const updateHwText = (pageIdx: number, value: string) => {
    setHwParas(hp => {
      if (!hp) return hp
      return hp.map((g, i) => i !== pageIdx ? g : { ...g, paragraphs: value.split(/\n{2,}/).map(s => s.trim()).filter(Boolean) })
    })
  }

  const exportHandwritingDocx = async () => {
    if (!hwParas) return
    setBusy(true)
    try {
      const result = await window.electronAPI.paragraphsToDocx(hwParas)
      const savePath = await window.electronAPI.saveFileDialog(`${baseName}.docx`)
      if (savePath) {
        await window.electronAPI.writeFile(savePath, result)
        setStatus('✓ Word document saved — editable text from the recognized handwriting.')
      } else setStatus('Cancelled.')
    } catch (e: any) {
      setStatus(`Error: ${e?.message ?? 'Word export failed'}`)
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

  // ── PDF/A-2b conversion ────────────────────────────────────────────────────

  const runPdfaConvert = async () => {
    setBusy(true)
    setStatus('Converting to PDF/A-2b…')
    setPdfaReport(null)
    pdfaBytesRef.current = null
    try {
      const bytes = await usePdfStore.getState().getBakedBytes()
      const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      const r = await window.electronAPI.pdfaConvert(ab)
      pdfaBytesRef.current = r.bytes
      setPdfaReport(r.report)
      setStatus(r.ok ? '✓ Ready — review the checks below, then save.' : 'Converted with remaining issues — see the report.')
    } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setStatus(`Error: ${e?.message ?? 'PDF/A conversion failed'}`)
    }
    setBusy(false)
  }

  const savePdfa = async () => {
    if (!pdfaBytesRef.current) return
    try {
      const p = await window.electronAPI.saveFileDialog(`${baseName}_pdfa.pdf`)
      if (p) { await window.electronAPI.writeFile(p, pdfaBytesRef.current); setStatus('✓ PDF/A-2b file saved.') }
    } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setStatus(`Error: ${e?.message ?? 'save failed'}`)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{
        width: (tab === 'xlsx' && grids) || (tab === 'docx' && docxMode === 'handwriting' && hwParas) ? 760 : 480, maxWidth: '94vw',
        maxHeight: '88vh', display: 'flex', flexDirection: 'column',
      }}>
        <div className="modal-title"><Upload size={18} /> Export</div>

        {/* tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {(['images', 'text', 'docx', 'xlsx', 'pdfa', 'annotations'] as ExportTab[]).map(t => (
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
                : t === 'pdfa' ? <><ShieldCheck size={14} /> PDF/A</>
                : <><MessageSquare size={14} /> Annotations</>}
            </button>
          ))}
        </div>

        {/* Scrollable body: action buttons below stay visible on small screens */}
        <div style={{ overflowY: 'auto', minHeight: 0, flex: '1 1 auto' }}>

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
              borderRadius: 8, padding: '9px 13px', marginBottom: 14,
              color: 'var(--accent)', fontSize: 12, fontWeight: 600,
            }}>
              <CheckCircle2 size={16} /> {richStatus?.installed
                ? 'Best engine (pdf2docx) ready — editable text with full layout.'
                : 'Built-in modes need no setup; the “Best” engine is optional.'}
            </div>

            <label className="modal-label" style={{ display: 'block', marginBottom: 8 }}>Word (.docx) conversion mode</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>

              {/* Best: pdf2docx (editable + layout) */}
              {(() => {
                const available = richStatus?.installed === true
                const selected = docxMode === 'rich'
                return (
                  <div style={{
                    borderRadius: 8,
                    border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                    background: selected ? 'var(--accent-dim)' : 'transparent',
                  }}>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: available ? 'pointer' : 'default', padding: '9px 12px' }}>
                      <input type="radio" name="docxMode" checked={selected} disabled={!available}
                        onChange={() => available && setDocxMode('rich')} style={{ marginTop: 2 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: selected ? 'var(--accent)' : 'var(--text-primary)' }}>
                          <Sparkles size={14} /> Editable + keep layout
                          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', background: 'var(--accent)', color: '#fff', padding: '1px 6px', borderRadius: 999 }}>Best</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.45 }}>
                          Reconstructs columns, tables, images, and coloured text into a fully-editable Word document — the closest match to the original. Powered by the pdf2docx engine.
                        </div>
                      </div>
                    </label>
                    {!available && (
                      <div style={{ padding: '0 12px 10px 38px', fontSize: 11 }}>
                        {richStatus === null
                          ? <span style={{ color: 'var(--text-muted)' }}>Checking for the engine…</span>
                          : richStatus.python
                            ? <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <button className="modal-btn-secondary" style={{ fontSize: 11, padding: '5px 10px' }} disabled={installing} onClick={setupRichEngine}>
                                  {installing ? 'Setting up…' : <><DownloadIcon size={13} /> Set up engine (one-time)</>}
                                </button>
                                <span style={{ color: 'var(--text-dim)' }}>Uses Python {richStatus.version}. ~80 MB download.</span>
                              </div>
                            : <span style={{ color: 'var(--warning)' }}>Requires Python — install Python 3.12 from python.org, then reopen this dialog.</span>}
                      </div>
                    )}
                  </div>
                )
              })()}

              {([
                { id: 'layout', title: 'Keep original design', desc: 'Each page is placed as a high-resolution image — looks exactly like the PDF (colours, photos, columns). Text is not editable.' },
                { id: 'text',   title: 'Editable text',        desc: 'Reconstructs flowing, editable paragraphs (font size, bold/italic). Best for editing content; the visual layout is not preserved.' },
                { id: 'handwriting', title: 'Handwriting → editable text', desc: 'Reads handwritten (or scanned) pages with AI — locally or via Azure — into editable paragraphs. Review and fix the text before exporting.' },
              ] as const).map(opt => (
                <label key={opt.id}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                    padding: '9px 12px', borderRadius: 8,
                    border: `1px solid ${docxMode === opt.id ? 'var(--accent)' : 'var(--border)'}`,
                    background: docxMode === opt.id ? 'var(--accent-dim)' : 'transparent',
                  }}>
                  <input type="radio" name="docxMode" checked={docxMode === opt.id}
                    onChange={() => { setDocxMode(opt.id); setHwParas(null) }} style={{ marginTop: 2 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: docxMode === opt.id ? 'var(--accent)' : 'var(--text-primary)' }}>{opt.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.45 }}>{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            {docxMode === 'handwriting' && !hwParas && (
              <div style={{ marginBottom: 14 }}>
                <div className="modal-field">
                  <label className="modal-label">Pages</label>
                  <input className="modal-input" value={pageRange}
                    onChange={e => { setPageRange(e.target.value); setHwParas(null) }}
                    placeholder={`all  or  1-3, 5  (1–${numPages})`} />
                </div>

                <label className="modal-label" style={{ display: 'block', marginBottom: 6 }}>Handwriting engine</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                  {([
                    { id: 'trocr', title: 'Local handwriting (offline)', desc: 'Reads handwriting with an AI model on this PC — private, no cloud, no key. One-time model download; slower, so check the text before export.' },
                    { id: 'azure', title: 'Azure AI (read, cloud)',      desc: 'Cloud analysis with the best handwriting accuracy. Needs a free Azure Document Intelligence key.' },
                  ] as const).map(opt => (
                    <label key={opt.id}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                        padding: '7px 11px', borderRadius: 8,
                        border: `1px solid ${hwEngine === opt.id ? 'var(--accent)' : 'var(--border)'}`,
                        background: hwEngine === opt.id ? 'var(--accent-dim)' : 'transparent',
                      }}>
                      <input type="radio" name="hwEngine" checked={hwEngine === opt.id}
                        onChange={() => { setHwEngine(opt.id); setHwParas(null) }} style={{ marginTop: 2 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: hwEngine === opt.id ? 'var(--accent)' : 'var(--text-primary)' }}>{opt.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, lineHeight: 1.4 }}>{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>

                {hwEngine === 'trocr' && (
                  <div style={{ margin: '0 0 6px', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <label className="modal-label" style={{ display: 'block', marginBottom: 5 }}>Model quality</label>
                    {([
                      { id: 'base',  title: 'Best quality (recommended)', desc: 'Reads words more reliably and invents far less text. One-time ≈340 MB download; a little slower per line.' },
                      { id: 'small', title: 'Fast',                       desc: 'Smaller one-time download (≈80 MB) and quicker, but misreads more.' },
                    ] as const).map(opt => (
                      <label key={opt.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', padding: '3px 0' }}>
                        <input type="radio" name="hwTrocrModel" checked={(settings.trocrModel === 'small' ? 'small' : 'base') === opt.id}
                          onChange={() => { updateSettings({ trocrModel: opt.id }); setHwParas(null) }} style={{ marginTop: 2 }} />
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{opt.title}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}> — {opt.desc}</span>
                        </div>
                      </label>
                    ))}
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '5px 0 0' }}>
                      After the one-time download the model works offline. Each line is read individually, so a dense page can take a few minutes.
                    </p>
                  </div>
                )}

                {hwEngine === 'azure' && (
                  <p style={{ fontSize: 11, color: settings.azureDiEndpoint.trim() && settings.azureDiKey.trim() ? 'var(--text-muted)' : 'var(--warning)', margin: '0 0 6px' }}>
                    {settings.azureDiEndpoint.trim() && settings.azureDiKey.trim()
                      ? '✓ Azure is configured — manage the endpoint and key in Settings (Ctrl+,) → API keys.'
                      : 'Not configured yet: add your Azure Document Intelligence endpoint and key in Settings (Ctrl+,) → API keys. The free tier reads only the first 2 pages per call.'}
                  </p>
                )}
              </div>
            )}

            {docxMode === 'handwriting' && hwParas && (() => {
              const g = hwParas[Math.min(gridIdx, hwParas.length - 1)]
              return (
                <div style={{ marginTop: 4, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                    <span>Engine: <strong style={{ color: 'var(--text-primary)' }}>{hwEngine === 'trocr' ? `Local (${settings.trocrModel === 'small' ? 'fast' : 'best quality'})` : 'Azure AI'}</strong> · Pages: {pageRange}</span>
                    <button onClick={() => { setHwParas(null); setStatus('') }}
                      style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', borderRadius: 999, padding: '2px 10px', fontSize: 11, cursor: 'pointer' }}>
                      Change options
                    </button>
                  </div>
                  {hwParas.length > 1 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                      {hwParas.map((gg, i) => (
                        <button key={gg.page} onClick={() => setGridIdx(i)}
                          style={{
                            padding: '3px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 999,
                            border: `1px solid ${i === gridIdx ? 'var(--accent)' : 'var(--border)'}`,
                            background: i === gridIdx ? 'var(--accent)' : 'transparent',
                            color: i === gridIdx ? '#fff' : 'var(--text-muted)',
                          }}>
                          Page {gg.page}
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea
                    value={g ? g.paragraphs.join('\n\n') : ''}
                    onChange={e => updateHwText(Math.min(gridIdx, hwParas.length - 1), e.target.value)}
                    spellCheck
                    style={{
                      width: '100%', minHeight: 220, resize: 'vertical', boxSizing: 'border-box',
                      border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px',
                      background: 'var(--bg)', color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.5,
                    }} />
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>
                    Separate paragraphs with a blank line. Fix any misreads before exporting to Word.
                  </p>
                </div>
              )
            })()}

            {docxMode !== 'handwriting' && (
              <p style={{ fontSize: 11.5, color: 'var(--text-dim)', margin: 0, lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--text-muted)' }}>PowerPoint (.pptx)</strong> places a crisp snapshot of each
                page on its own slide — looks exactly like the PDF and never needs repair.
              </p>
            )}
          </div>
        )}

        {/* ── XLSX tab ─────────────────────────────────────── */}
        {tab === 'xlsx' && (
          <div>
            {/* After detection only the review grid matters — the setup
                controls collapse into one summary line so the action buttons
                never get pushed off-screen. */}
            {grids && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                <span>
                  Engine: <strong style={{ color: 'var(--text-primary)' }}>
                    {xlsxEngine === 'auto' ? 'Automatic' : xlsxEngine === 'ocr' ? 'Force OCR' : xlsxEngine === 'trocr' ? `Local handwriting (${settings.trocrModel === 'small' ? 'fast' : 'best quality'})` : 'Azure AI'}
                  </strong> · Pages: {pageRange}
                </span>
                <button onClick={() => { setGrids(null); setStatus('') }}
                  style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)',
                    borderRadius: 999, padding: '2px 10px', fontSize: 11, cursor: 'pointer' }}>
                  Change options
                </button>
              </div>
            )}
            {!grids && (<>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
              Reconstructs tables into a spreadsheet, one sheet per page. Detect first, fix any
              misread cell in the preview, then export.
            </p>
            <div className="modal-field">
              <label className="modal-label">Pages</label>
              <input className="modal-input" value={pageRange}
                onChange={e => { setPageRange(e.target.value); setGrids(null) }}
                placeholder={`all  or  1-3, 5  (1–${numPages})`} />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 10, fontSize: 12.5, color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={combineSheets} onChange={e => setCombineSheets(e.target.checked)} />
              Combine all pages into one continuous sheet
            </label>

            <label className="modal-label" style={{ display: 'block', marginBottom: 6 }}>Reading engine</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {([
                { id: 'auto',  title: 'Automatic',                    desc: 'Uses the PDF’s own text; scanned pages are read with OCR (printed text).' },
                { id: 'ocr',   title: 'Force OCR',                    desc: 'Re-reads every page with OCR — use when the embedded text layer is wrong.' },
                { id: 'trocr', title: 'Local handwriting (offline)',  desc: 'Reads handwriting with an AI model on this PC — private, no cloud, no key. One-time model download; slower, so check the review grid.' },
                { id: 'azure', title: 'Azure AI (handwriting, cloud)', desc: 'Cloud analysis that reads handwriting and detects table cells precisely. Best accuracy; needs a free Azure Document Intelligence key.' },
              ] as const).map(opt => (
                <label key={opt.id}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                    padding: '7px 11px', borderRadius: 8,
                    border: `1px solid ${xlsxEngine === opt.id ? 'var(--accent)' : 'var(--border)'}`,
                    background: xlsxEngine === opt.id ? 'var(--accent-dim)' : 'transparent',
                  }}>
                  <input type="radio" name="xlsxEngine" checked={xlsxEngine === opt.id}
                    onChange={() => { setXlsxEngine(opt.id); setGrids(null) }} style={{ marginTop: 2 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: xlsxEngine === opt.id ? 'var(--accent)' : 'var(--text-primary)' }}>{opt.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, lineHeight: 1.4 }}>{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            {(xlsxEngine === 'auto' || xlsxEngine === 'ocr') && (
              <div className="modal-field">
                <label className="modal-label">OCR language</label>
                <select className="annot-select" value={xlsxLang} onChange={e => setXlsxLang(e.target.value)}>
                  {OCR_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </div>
            )}

            {xlsxEngine === 'trocr' && (
              <div style={{ margin: '0 0 10px', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 8 }}>
                <label className="modal-label" style={{ display: 'block', marginBottom: 5 }}>Model quality</label>
                {([
                  { id: 'base',  title: 'Best quality (recommended)', desc: 'Reads digits more reliably and invents far less text on messy handwriting. One-time ≈340 MB download; a little slower per cell.' },
                  { id: 'small', title: 'Fast',                       desc: 'Smaller one-time download (≈80 MB) and quicker, but misreads more — expect more fixes in the review grid.' },
                ] as const).map(opt => (
                  <label key={opt.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', padding: '3px 0' }}>
                    <input type="radio" name="trocrModel" checked={(settings.trocrModel === 'small' ? 'small' : 'base') === opt.id}
                      onChange={() => { updateSettings({ trocrModel: opt.id }); setGrids(null) }} style={{ marginTop: 2 }} />
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{opt.title}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}> — {opt.desc}</span>
                    </div>
                  </label>
                ))}
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '5px 0 0' }}>
                  After the one-time download the model works without internet. Each cell is read
                  individually, so a dense page can take a few minutes.
                </p>
              </div>
            )}

            {xlsxEngine === 'azure' && (
              <p style={{ fontSize: 11, color: settings.azureDiEndpoint.trim() && settings.azureDiKey.trim() ? 'var(--text-muted)' : 'var(--warning)', margin: '0 0 10px' }}>
                {settings.azureDiEndpoint.trim() && settings.azureDiKey.trim()
                  ? '✓ Azure is configured — manage the endpoint and key in Settings (Ctrl+,) → API keys.'
                  : 'Not configured yet: add your Azure Document Intelligence endpoint and key in Settings (Ctrl+,) → API keys. The free tier analyzes 500 pages/month (first 2 pages per call).'}
              </p>
            )}
            </>)}

            {grids && (() => {
              const g = grids[Math.min(gridIdx, grids.length - 1)]
              return (
                <div style={{ marginTop: 4 }}>
                  {grids.length > 1 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                      {grids.map((gg, i) => (
                        <button key={gg.page} onClick={() => setGridIdx(i)}
                          style={{
                            padding: '3px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 999,
                            border: `1px solid ${i === gridIdx ? 'var(--accent)' : 'var(--border)'}`,
                            background: i === gridIdx ? 'var(--accent)' : 'transparent',
                            color: i === gridIdx ? '#fff' : 'var(--text-muted)',
                          }}>
                          Page {gg.page}
                        </button>
                      ))}
                    </div>
                  )}
                  {g && g.grid.length > 0 ? (
                    <div style={{ overflow: 'auto', maxHeight: 'min(48vh, 420px)', border: '1px solid var(--border)', borderRadius: 8 }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: '100%' }}>
                        <tbody>
                          {g.grid.map((row, ri) => (
                            <tr key={ri}>
                              {row.map((cell, ci) => (
                                <td key={ci} contentEditable suppressContentEditableWarning
                                  onBlur={e => updateCell(ri, ci, e.currentTarget.textContent ?? '')}
                                  style={{
                                    border: '1px solid var(--border)', padding: '3px 8px', minWidth: 36,
                                    whiteSpace: 'nowrap', color: 'var(--text-primary)', outline: 'none',
                                  }}>
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No table content found on this page.</p>
                  )}
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>
                    {g?.source === 'ocr' ? 'Read with OCR — ' : g?.source === 'azure' ? 'Read with Azure AI — '
                      : g?.source === 'trocr' ? 'Read with the local handwriting model — ' : ''}
                    click any cell to correct it before exporting.
                  </p>
                </div>
              )
            })()}
          </div>
        )}

        {/* ── PDF/A tab ────────────────────────────────────── */}
        {tab === 'pdfa' && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
              Saves an archival <strong>PDF/A-2b</strong> copy: PDF/A identification (XMP), an sRGB output
              intent, synced metadata, and forbidden content (JavaScript, attachments) removed.
              Issues that can't be fixed automatically — like fonts that were never embedded —
              are reported so you know exactly where the file stands.
            </p>
            {pdfaReport && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto',
                border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 4 }}>
                {pdfaReport.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, lineHeight: 1.45,
                    color: r.level === 'blocker' ? 'var(--danger)'
                      : r.level === 'warning' ? 'var(--warning)'
                      : 'var(--text-secondary)' }}>
                    <span style={{ marginTop: 1, flexShrink: 0 }}>
                      {r.level === 'ok' ? <CheckCircle2 size={14} color="var(--success)" />
                        : r.level === 'fixed' ? <Wrench size={14} color="var(--accent)" />
                        : r.level === 'warning' ? <AlertTriangle size={14} />
                        : <XCircle size={14} />}
                    </span>
                    {r.message}
                  </div>
                ))}
              </div>
            )}
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

        </div>{/* /scrollable body */}

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
          {tab === 'docx' && docxMode === 'handwriting' && (
            <>
              {hwParas && (
                <button className="modal-btn-secondary" onClick={recognizeHandwriting} disabled={busy}>
                  {busy ? 'Working…' : 'Re-read'}
                </button>
              )}
              {!hwParas ? (
                <button className="modal-btn-primary" onClick={recognizeHandwriting} disabled={busy || !pdfDoc}>
                  {busy ? 'Reading…' : <><FileType size={15} /> Read Handwriting</>}
                </button>
              ) : (
                <button className="modal-btn-primary" onClick={exportHandwritingDocx} disabled={busy}>
                  {busy ? 'Exporting…' : <><Download size={15} /> Export to Word</>}
                </button>
              )}
            </>
          )}
          {tab === 'docx' && docxMode !== 'handwriting' && (
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
            <>
              {grids && (
                <button className="modal-btn-secondary" onClick={detectTables} disabled={busy}>
                  {busy ? 'Working…' : 'Re-detect'}
                </button>
              )}
              {!grids ? (
                <button className="modal-btn-primary" onClick={detectTables} disabled={busy || !pdfDoc}>
                  {busy ? 'Detecting…' : <><Table size={15} /> Detect Tables</>}
                </button>
              ) : (
                <button className="modal-btn-primary" onClick={exportXlsx} disabled={busy}>
                  {busy ? 'Exporting…' : <><Download size={15} /> Export to Excel</>}
                </button>
              )}
            </>
          )}
          {tab === 'pdfa' && (
            <>
              <button className={pdfaReport ? 'modal-btn-secondary' : 'modal-btn-primary'}
                onClick={runPdfaConvert} disabled={busy || !pdfBytes}>
                {busy ? 'Converting…' : <><ShieldCheck size={15} /> {pdfaReport ? 'Re-check' : 'Convert & Check'}</>}
              </button>
              <button className="modal-btn-primary" onClick={savePdfa}
                disabled={busy || !pdfaReport || !pdfaBytesRef.current}>
                <Download size={15} /> Save PDF/A…
              </button>
            </>
          )}
          {tab === 'annotations' && null}
        </div>
      </div>
    </div>
  )
}
