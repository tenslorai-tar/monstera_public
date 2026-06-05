import { useEffect, useRef } from 'react'

export interface ContextMenuAction {
  label: string
  action: () => void
  disabled?: boolean
}

export type ContextMenuEntry = ContextMenuAction | 'separator'

interface Props {
  x: number
  y: number
  items: ContextMenuEntry[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const closeKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', close, true)
    document.addEventListener('keydown', closeKey)
    return () => {
      document.removeEventListener('mousedown', close, true)
      document.removeEventListener('keydown', closeKey)
    }
  }, [onClose])

  // Keep menu on screen
  const style: React.CSSProperties = { position: 'fixed', zIndex: 1000 }
  const menuW = 220
  const menuH = items.length * 28 + 8
  style.left = x + menuW > window.innerWidth ? x - menuW : x
  style.top = y + menuH > window.innerHeight ? y - menuH : y

  return (
    <div ref={ref} className="context-menu" style={style}>
      {items.map((item, i) =>
        item === 'separator'
          ? <div key={i} className="ctx-separator" />
          : (
            <button
              key={i}
              className="ctx-item"
              disabled={item.disabled}
              onClick={() => { item.action(); onClose() }}
            >
              {item.label}
            </button>
          )
      )}
    </div>
  )
}
