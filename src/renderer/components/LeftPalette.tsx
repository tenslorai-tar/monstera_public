import { usePdfStore } from '../store/usePdfStore'

const TOOLS = [
  { id: 'hand',     icon: '☞',  label: 'Hand',    title: 'Hand tool — pan without annotating' },
  { id: 'text-sel', icon: 'I',  label: 'Text',    title: 'Text select — select and copy text' },
  { id: 'zoom-in',  icon: '⊕',  label: 'Zoom+',  title: 'Zoom in — click to zoom in' },
  { id: 'zoom-out', icon: '⊖',  label: 'Zoom−',  title: 'Zoom out — click to zoom out' },
  { id: 'snapshot', icon: '✂',  label: 'Snap',    title: 'Snapshot — capture a page region as image' },
]

export default function LeftPalette() {
  const numPages   = usePdfStore(s => s.numPages)
  const scale      = usePdfStore(s => s.scale)
  const activeTool = usePdfStore(s => s.activeTool)
  const setScale   = usePdfStore(s => s.setScale)
  const setActiveTool = usePdfStore(s => s.setActiveTool)

  if (numPages === 0) return null

  const isHand   = activeTool === null
  const isActive = (id: string) => {
    if (id === 'hand') return isHand
    return false
  }

  const handleClick = (id: string) => {
    if (id === 'hand' || id === 'text-sel') { setActiveTool(null); return }
    if (id === 'zoom-in')  { setScale(Math.min(5,    Math.round((scale + 0.25) * 100) / 100)); return }
    if (id === 'zoom-out') { setScale(Math.max(0.1, Math.round((scale - 0.25) * 100) / 100)); return }
    // snapshot — placeholder
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
        <span className="left-pal-icon">▤</span>
        <span className="left-pal-label">Pages</span>
      </button>
      <button className="left-pal-btn" title="Bookmarks panel"
        onClick={() => usePdfStore.getState().toggleBookmarksPanel()}>
        <span className="left-pal-icon">🔖</span>
        <span className="left-pal-label">Marks</span>
      </button>
      <button className="left-pal-btn" title="Annotations panel"
        onClick={() => usePdfStore.getState().toggleAnnotationsPanel()}>
        <span className="left-pal-icon">💬</span>
        <span className="left-pal-label">Notes</span>
      </button>
    </div>
  )
}
