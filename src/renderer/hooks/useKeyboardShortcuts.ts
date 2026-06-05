import { useEffect } from 'react'
import { usePdfStore } from '../store/usePdfStore'

export function useKeyboardShortcuts(onOpen: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const store = usePdfStore.getState()
      const hasPdf = store.numPages > 0

      if (e.ctrlKey) {
        switch (e.key) {
          case 'o':
            e.preventDefault(); onOpen(); break
          case 's':
            if (hasPdf) {
              e.preventDefault()
              if (e.shiftKey) store.saveAs()
              else store.save()
            }
            break
          case 'z':
            if (hasPdf) { e.preventDefault(); store.undo() }
            break
          case 'y':
            if (hasPdf) { e.preventDefault(); store.redo() }
            break
          case 'f':
            if (hasPdf) { e.preventDefault(); store.setSearchOpen(!store.searchOpen) }
            break
          case '+': case '=':
            if (hasPdf) { e.preventDefault(); store.setScale(Math.min(5, Math.round((store.scale + 0.1) * 10) / 10)) }
            break
          case '-':
            if (hasPdf) { e.preventDefault(); store.setScale(Math.max(0.25, Math.round((store.scale - 0.1) * 10) / 10)) }
            break
          case '0':
            if (hasPdf) { e.preventDefault(); store.setZoomMode('fit-page') }
            break
        }
        return
      }

      if (!hasPdf) return

      switch (e.key) {
        case 'Escape':
          if (store.searchOpen) store.setSearchOpen(false)
          break
        case 'PageUp':
          e.preventDefault()
          store.scrollToPage(Math.max(1, store.currentPage - 1))
          break
        case 'PageDown':
          e.preventDefault()
          store.scrollToPage(Math.min(store.numPages, store.currentPage + 1))
          break
        case 'ArrowLeft':
        case 'ArrowUp':
          if (e.altKey) {
            e.preventDefault()
            store.scrollToPage(Math.max(1, store.currentPage - 1))
          }
          break
        case 'ArrowRight':
        case 'ArrowDown':
          if (e.altKey) {
            e.preventDefault()
            store.scrollToPage(Math.min(store.numPages, store.currentPage + 1))
          }
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onOpen])
}
