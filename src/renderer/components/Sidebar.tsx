import { useRef } from 'react'
import { usePdfStore } from '../store/usePdfStore'
import ThumbnailItem from './ThumbnailItem'

export default function Sidebar() {
  const sidebarOpen = usePdfStore(s => s.sidebarOpen)
  const numPages = usePdfStore(s => s.numPages)
  const currentPage = usePdfStore(s => s.currentPage)
  const scrollToPage = usePdfStore(s => s.scrollToPage)
  const scrollRef = useRef<HTMLDivElement>(null)

  if (!sidebarOpen) return null

  return (
    <aside className="sidebar">
      <div className="sidebar-header">Pages</div>
      <div className="sidebar-scroll" ref={scrollRef}>
        {Array.from({ length: numPages }, (_, i) => (
          <ThumbnailItem
            key={i + 1}
            pageNum={i + 1}
            scrollRoot={scrollRef.current}
            isActive={currentPage === i + 1}
            onClick={() => scrollToPage(i + 1)}
          />
        ))}
      </div>
    </aside>
  )
}
