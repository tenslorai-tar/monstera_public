import { usePdfStore } from '../store/usePdfStore'
import { MousePointer2, Hand, TextCursor, ZoomIn, ZoomOut, Crop, Files, Bookmark, MessageSquare } from 'lucide-react'

const ICON = 19
const TOOLS = [
  { id: 'select',   icon: <MousePointer2 size={ICON} />, label: 'Select',  title: 'Select tool — click annotations to select, move or delete them' },
  { id: 'hand',     icon: <Hand size={ICON} />,          label: 'Hand',    title: 'Hand tool — pan without annotating' },
  { id: 'text-sel', icon: <TextCursor size={ICON} />,    label: 'Text',    title: 'Text select — select and copy text' },
  { id: 'zoom-in',  icon: <ZoomIn size={ICON} />,        label: 'Zoom+',  title: 'Zoom in — click to zoom in' },
  { id: 'zoom-out', icon: <ZoomOut size={ICON} />,       label: 'Zoom−',  title: 'Zoom out — click to zoom out' },
  { id: 'snapshot', icon: <Crop size={ICON} />,          label: 'Snap',    title: 'Snapshot — capture a page region as image' },
]

export default function LeftPalette() {
  const numPages   = usePdfStore(s => s.numPages)
  const scale      = usePdfStore(s => s.scale)
  const activeTool = usePdfStore(s => s.activeTool)
  const panMode    = usePdfStore(s => s.panMode)
  const setScale   = usePdfStore(s => s.setScale)
  const setActiveTool = usePdfStore(s => s.setActiveTool)
  const setPanMode = usePdfStore(s => s.setPanMode)

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
    if (id === 'zoom-in')  { setScale(Math.min(5,    Math.round((scale + 0.25) * 100) / 100)); return }
    if (id === 'zoom-out') { setScale(Math.max(0.1, Math.round((scale - 0.25) * 100) / 100)); return }
    if (id === 'snapshot') { setActiveTool('snapshot'); return }
  }

  return (
    <div className="left-palette">
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
