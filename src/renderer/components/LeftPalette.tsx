import { useState, useRef, useEffect } from 'react'
import { usePdfStore } from '../store/usePdfStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { MousePointer2, Hand, TextCursor, ZoomIn, ZoomOut, Crop, Files, Bookmark, MessageSquare, GripVertical } from 'lucide-react'

const ICON = 19
const TOOLS = [
  { id: 'select',   icon: <MousePointer2 size={ICON} />, label: 'Select',  title: 'Select tool — click annotations to select, move or delete them' },
  { id: 'hand',     icon: <Hand size={ICON} />,          label: 'Hand',    title: 'Hand tool — pan without annotating' },
  { id: 'text-sel', icon: <TextCursor size={ICON} />,    label: 'Text',    title: 'Text select — select and copy text' },
  { id: 'zoom-in',  icon: <ZoomIn size={ICON} />,        label: 'Zoom+',  title: 'Zoom in — click to zoom in' },
  { id: 'zoom-out', icon: <ZoomOut size={ICON} />,       label: 'Zoom−',  title: 'Zoom out — click to zoom out' },
  { id: 'snapshot', icon: <Crop size={ICON} />,          label: 'Snap',    title: 'Snapshot — capture a page region as image' },
]

const POS_KEY = 'monstera-dock-pos'
type Pos = { x: number; y: number } | null

export default function LeftPalette() {
  const numPages   = usePdfStore(s => s.numPages)
  const scale      = usePdfStore(s => s.scale)
  const activeTool = usePdfStore(s => s.activeTool)
  const panMode    = usePdfStore(s => s.panMode)
  const setScale   = usePdfStore(s => s.setScale)
  const setActiveTool = usePdfStore(s => s.setActiveTool)
  const setPanMode = usePdfStore(s => s.setPanMode)

  const dockRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ ox: number; oy: number } | null>(null)
  const [pos, setPos] = useState<Pos>(() => {
    try { const s = localStorage.getItem(POS_KEY); return s ? JSON.parse(s) : null } catch { return null }
  })

  // Keep the dock on-screen if the window/content area shrinks.
  useEffect(() => {
    if (!pos) return
    const parent = dockRef.current?.offsetParent as HTMLElement | null
    const el = dockRef.current
    if (!parent || !el) return
    const maxX = parent.clientWidth - el.offsetWidth - 6
    const maxY = parent.clientHeight - el.offsetHeight - 6
    if (pos.x > maxX || pos.y > maxY) {
      setPos({ x: Math.max(6, Math.min(maxX, pos.x)), y: Math.max(6, Math.min(maxY, pos.y)) })
    }
  }, [pos, numPages])

  if (numPages === 0) return null

  const isActive = (id: string) => {
    if (id === 'select')   return activeTool === 'select'
    if (id === 'hand')     return activeTool === null && panMode
    if (id === 'text-sel') return activeTool === null && !panMode
    if (id === 'snapshot') return activeTool === 'snapshot'
    return false
  }

  const handleClick = (id: string) => {
    if (id === 'select')   { setActiveTool('select'); return }
    if (id === 'hand')     { setActiveTool(null); setPanMode(true);  return }
    if (id === 'text-sel') { setActiveTool(null); setPanMode(false); return }
    const zs = useSettingsStore.getState().settings.zoomStep || 0.25
    if (id === 'zoom-in')  { setScale(Math.min(5,    Math.round((scale + zs) * 100) / 100)); return }
    if (id === 'zoom-out') { setScale(Math.max(0.1, Math.round((scale - zs) * 100) / 100)); return }
    if (id === 'snapshot') { setActiveTool('snapshot'); return }
  }

  const startDrag = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    const el = dockRef.current
    const parent = el?.offsetParent as HTMLElement | null
    if (!el || !parent) return
    const r = el.getBoundingClientRect()
    dragRef.current = { ox: e.clientX - r.left, oy: e.clientY - r.top }

    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current
      if (!d || !dockRef.current) return
      const pr = parent.getBoundingClientRect()
      const dw = dockRef.current.offsetWidth, dh = dockRef.current.offsetHeight
      const nx = Math.max(6, Math.min(pr.width - dw - 6, ev.clientX - pr.left - d.ox))
      const ny = Math.max(6, Math.min(pr.height - dh - 6, ev.clientY - pr.top - d.oy))
      setPos({ x: nx, y: ny })
    }
    const onUp = () => {
      dragRef.current = null
      document.body.style.cursor = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setPos(p => { try { if (p) localStorage.setItem(POS_KEY, JSON.stringify(p)) } catch { /* ignore */ } return p })
    }
    document.body.style.cursor = 'grabbing'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const resetPos = () => { setPos(null); try { localStorage.removeItem(POS_KEY) } catch { /* ignore */ } }

  const dockStyle = pos
    ? { left: pos.x, top: pos.y, right: 'auto' as const, bottom: 'auto' as const, transform: 'none' as const }
    : undefined

  return (
    <div className="left-palette" ref={dockRef} style={dockStyle}>
      <button className="left-pal-grip" title="Drag to move · double-click to reset"
        onMouseDown={startDrag} onDoubleClick={resetPos}>
        <GripVertical size={16} />
      </button>
      <div className="left-pal-sep" />
      {TOOLS.map(t => (
        <button
          key={t.id}
          className={`left-pal-btn${isActive(t.id) ? ' left-pal-active' : ''}`}
          title={t.title}
          onClick={() => handleClick(t.id)}
        >
          <span className="left-pal-icon">{t.icon}</span>
          <span className="left-pal-label">{t.label}</span>
        </button>
      ))}
      <div className="left-pal-sep" />
      <button className="left-pal-btn" title="Toggle thumbnail sidebar"
        onClick={() => usePdfStore.getState().toggleSidebar()}>
        <span className="left-pal-icon"><Files size={ICON} /></span>
        <span className="left-pal-label">Pages</span>
      </button>
      <button className="left-pal-btn" title="Bookmarks panel"
        onClick={() => usePdfStore.getState().toggleBookmarksPanel()}>
        <span className="left-pal-icon"><Bookmark size={ICON} /></span>
        <span className="left-pal-label">Marks</span>
      </button>
      <button className="left-pal-btn" title="Annotations panel"
        onClick={() => usePdfStore.getState().toggleAnnotationsPanel()}>
        <span className="left-pal-icon"><MessageSquare size={ICON} /></span>
        <span className="left-pal-label">Notes</span>
      </button>
    </div>
  )
}
