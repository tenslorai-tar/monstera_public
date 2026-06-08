import { useRef, useState, useCallback } from 'react'
import { X, Trash2 } from 'lucide-react'
import { usePdfStore } from '../store/usePdfStore'
import { usePdfOperations } from '../hooks/usePdfOperations'
import ThumbnailItem from './ThumbnailItem'
import ContextMenu from './ContextMenu'
import type { ContextMenuEntry } from './ContextMenu'

interface CtxState { x: number; y: number; pageNum: number }

export default function Sidebar() {
  const sidebarOpen = usePdfStore(s => s.sidebarOpen)
  const numPages = usePdfStore(s => s.numPages)
  const currentPage = usePdfStore(s => s.currentPage)
  const scrollToPage = usePdfStore(s => s.scrollToPage)
  const selectedPages = usePdfStore(s => s.selectedPages)
  const togglePageSelection = usePdfStore(s => s.togglePageSelection)
  const clearSelection = usePdfStore(s => s.clearSelection)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [ctx, setCtx] = useState<CtxState | null>(null)
  const ops = usePdfOperations()

  // ── Drag-and-drop ─────────────────────────────────────────────────────────
  const dragSource = useRef(-1)
  const [dragOver, setDragOver] = useState(-1)

  const onDragStart = useCallback((pageIndex: number) => {
    dragSource.current = pageIndex
  }, [])

  const onDragOver = useCallback((pageIndex: number) => {
    setDragOver(pageIndex)
  }, [])

  const onDrop = useCallback((toIndex: number) => {
    const from = dragSource.current
    setDragOver(-1)
    if (from !== -1 && from !== toIndex) {
      ops.reorderPage(from, toIndex)
    }
    dragSource.current = -1
  }, [ops])

  const onDragEnd = useCallback(() => {
    setDragOver(-1)
    dragSource.current = -1
  }, [])

  // ── Context menu ──────────────────────────────────────────────────────────
  const openCtx = useCallback((e: React.MouseEvent, pageNum: number) => {
    e.preventDefault()
    setCtx({ x: e.clientX, y: e.clientY, pageNum })
  }, [])

  const buildMenuItems = (pageNum: number): ContextMenuEntry[] => {
    const sel = selectedPages.size > 1 && selectedPages.has(pageNum)
      ? [...selectedPages]
      : [pageNum]
    const multi = sel.length > 1

    return [
      { label: 'Insert blank page before', action: () => ops.insertBlankPage(pageNum - 1) },
      { label: 'Insert blank page after', action: () => ops.insertBlankPage(pageNum) },
      { label: 'Insert from PDF…', action: () => ops.insertFromPdf(pageNum) },
      { label: 'Insert from image…', action: () => ops.insertFromImage(pageNum) },
      'separator',
      { label: multi ? `Rotate ${sel.length} pages 90° CW` : 'Rotate 90° CW', action: () => ops.rotatePages(sel, 90) },
      { label: multi ? `Rotate ${sel.length} pages 90° CCW` : 'Rotate 90° CCW', action: () => ops.rotatePages(sel, 270) },
      { label: 'Rotate 180°', action: () => ops.rotatePages(sel, 180) },
      'separator',
      { label: 'Duplicate', action: () => ops.duplicatePage(pageNum), disabled: multi },
      'separator',
      { label: multi ? `Extract ${sel.length} pages…` : 'Extract this page…', action: () => ops.extractPages(sel) },
      'separator',
      {
        label: multi ? `Delete ${sel.length} pages` : 'Delete',
        action: () => ops.deletePages(sel),
        disabled: sel.length === numPages,
      },
    ]
  }

  if (!sidebarOpen) return null

  const hasSelection = selectedPages.size > 0

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span>Pages</span>
        {hasSelection && (
          <button className="sidebar-clear-sel" onClick={clearSelection} title="Clear selection"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {selectedPages.size} selected <X size={11} />
          </button>
        )}
      </div>

      <div className="sidebar-scroll" ref={scrollRef}>
        {Array.from({ length: numPages }, (_, i) => (
          <ThumbnailItem
            key={i + 1}
            pageNum={i + 1}
            pageIndex={i}
            scrollRoot={scrollRef.current}
            isActive={currentPage === i + 1}
            isSelected={selectedPages.has(i + 1)}
            isDragOver={dragOver === i}
            onClick={() => scrollToPage(i + 1)}
            onToggleSelect={() => togglePageSelection(i + 1)}
            onContextMenu={openCtx}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>

      {hasSelection && (
        <div className="page-ops-bar">
          <button className="ops-btn" title="Rotate CW" onClick={() => ops.rotatePages([...selectedPages], 90)}>↻</button>
          <button className="ops-btn" title="Rotate CCW" onClick={() => ops.rotatePages([...selectedPages], 270)}>↺</button>
          <button className="ops-btn" title="Extract" onClick={() => ops.extractPages([...selectedPages])}>⤓</button>
          <button className="ops-btn ops-btn-danger" title="Delete" onClick={() => ops.deletePages([...selectedPages])} disabled={selectedPages.size === numPages}><Trash2 size={15} /></button>
        </div>
      )}

      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          items={buildMenuItems(ctx.pageNum)}
          onClose={() => setCtx(null)}
        />
      )}
    </aside>
  )
}
