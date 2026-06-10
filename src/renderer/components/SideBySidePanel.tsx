import { useRef, useEffect, useState, useCallback } from 'react'
import { X, ZoomIn, ZoomOut, FolderOpen } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { usePdfStore } from '../store/usePdfStore'
import { useTabsStore } from '../store/useTabsStore'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

interface Source { label: string; bytes: Uint8Array }

// One page, rendered only once it scrolls near the viewport.
function LazyDocPage({ doc, pageNum, scale, pageW, pageH, root }: {
  doc: PDFDocumentProxy; pageNum: number; scale: number; pageW: number; pageH: number; root: HTMLElement | null
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = wrapRef.current
    if (!el || !root) return
    const obs = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { root, rootMargin: '400px 0px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [root])

  useEffect(() => {
    if (!inView) return
    let cancelled = false
    ;(async () => {
      const page = await doc.getPage(pageNum)
      if (cancelled) return
      const vp = page.getViewport({ scale })
      const c = canvasRef.current
      if (!c) return
      c.width = vp.width; c.height = vp.height
      await page.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise
    })()
    return () => { cancelled = true }
  }, [inView, doc, pageNum, scale])

  return (
    <div ref={wrapRef} style={{ width: pageW * scale, height: pageH * scale,
      background: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.25)', flexShrink: 0 }}>
      {inView && <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />}
    </div>
  )
}

// A single document column: a source picker + an independently scrollable, zoomable
// page list. Used twice in the side-by-side view.
function DocPane({ source, sources, onPick, onBrowse }: {
  source: Source | null
  sources: Source[]
  onPick: (i: number) => void
  onBrowse: () => void
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [pageSize, setPageSize] = useState({ w: 612, h: 792 })
  const [scale, setScale] = useState(1.0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [, forceRoot] = useState(0)

  useEffect(() => {
    let cancelled = false
    if (!source) { setDoc(null); setNumPages(0); return }
    ;(async () => {
      try {
        const d = await pdfjsLib.getDocument({ data: source.bytes.slice() }).promise
        if (cancelled) return
        setDoc(d); setNumPages(d.numPages)
        const p = await d.getPage(1)
        const vp = p.getViewport({ scale: 1 })
        setPageSize({ w: vp.width, h: vp.height })
      } catch { if (!cancelled) { setDoc(null); setNumPages(0) } }
    })()
    return () => { cancelled = true }
  }, [source])

  // Ensure the IntersectionObserver root (scrollRef) is set before pages mount.
  useEffect(() => { forceRoot(v => v + 1) }, [doc])

  const selectedIndex = source ? sources.findIndex(s => s === source) : -1

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-canvas, #1e1e1e)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
        background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
        <select value={selectedIndex} onChange={e => onPick(parseInt(e.target.value, 10))}
          style={{ flex: 1, minWidth: 0, height: 24, fontSize: 12, background: 'var(--bg-primary)',
            color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4, padding: '0 6px' }}>
          <option value={-1} disabled>Choose a document…</option>
          {sources.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
        </select>
        <button className="status-zoom-btn" title="Open another PDF" onClick={onBrowse}><FolderOpen size={13} /></button>
        <span style={{ width: 1, height: 16, background: 'var(--border)' }} />
        <button className="status-zoom-btn" title="Zoom out" onClick={() => setScale(s => Math.max(0.25, Math.round((s - 0.15) * 100) / 100))}><ZoomOut size={13} /></button>
        <span style={{ fontSize: 11, minWidth: 34, textAlign: 'center', color: 'var(--text-muted)' }}>{Math.round(scale * 100)}%</span>
        <button className="status-zoom-btn" title="Zoom in" onClick={() => setScale(s => Math.min(4, Math.round((s + 0.15) * 100) / 100))}><ZoomIn size={13} /></button>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 12, padding: 16 }}>
        {!source && (
          <div style={{ margin: 'auto', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
            Pick an open document above, or <button onClick={onBrowse}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline', font: 'inherit' }}>browse…</button>
          </div>
        )}
        {doc && Array.from({ length: numPages }, (_, i) => (
          <LazyDocPage key={`${selectedIndex}-${i}`} doc={doc} pageNum={i + 1} scale={scale}
            pageW={pageSize.w} pageH={pageSize.h} root={scrollRef.current} />
        ))}
      </div>
    </div>
  )
}

export default function SideBySidePanel({ onClose }: { onClose: () => void }) {
  const tabs = useTabsStore(s => s.tabs)
  const activeTabId = useTabsStore(s => s.activeTabId)
  const livePdfBytes = usePdfStore(s => s.pdfBytes)
  const liveFileName = usePdfStore(s => s.fileName)

  // Build the source list from open tabs (the active tab uses the LIVE bytes so it
  // reflects unsaved edits), plus any documents the user browses to in this session.
  const [browsed, setBrowsed] = useState<Source[]>([])
  const tabSources: Source[] = tabs.map(t => ({
    label: t.fileName,
    bytes: t.id === activeTabId && livePdfBytes ? livePdfBytes : t.pdfBytes,
  }))
  if (tabSources.length === 0 && livePdfBytes) tabSources.push({ label: liveFileName || 'Current document', bytes: livePdfBytes })
  const sources = [...tabSources, ...browsed]

  const [leftIdx, setLeftIdx] = useState(0)
  const [rightIdx, setRightIdx] = useState(sources.length > 1 ? 1 : -1)

  const browse = useCallback(async (side: 'left' | 'right') => {
    try {
      const p = await window.electronAPI.openFileDialog()
      if (!p) return
      const ab = await window.electronAPI.readFileBytes(p)
      const name = p.split(/[\\/]/).pop() ?? p
      const src: Source = { label: name, bytes: new Uint8Array(ab) }
      setBrowsed(b => [...b, src])
      const newIdx = sources.length // appended source lands at the current end
      if (side === 'left') setLeftIdx(newIdx); else setRightIdx(newIdx)
    } catch { /* cancelled or unreadable */ }
  }, [sources.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'var(--bg-secondary)',
      display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px',
        background: 'var(--bg-toolbar, var(--bg-secondary))', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Side&nbsp;by&nbsp;Side</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Compare two open documents</span>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13,
          padding: '3px 10px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          <X size={14} /> Close
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <DocPane source={sources[leftIdx] ?? null} sources={sources} onPick={setLeftIdx} onBrowse={() => browse('left')} />
        <div style={{ width: 1, background: 'var(--border)' }} />
        <DocPane source={sources[rightIdx] ?? null} sources={sources} onPick={setRightIdx} onBrowse={() => browse('right')} />
      </div>
    </div>
  )
}
