import { useEffect } from 'react'
import { usePdfStore } from '../store/usePdfStore'

interface Callbacks {
  onOpen: () => void
  onSettings: () => void
  onShortcuts: () => void
  onPrint: () => void
}

export function useKeyboardShortcuts({ onOpen, onSettings, onShortcuts, onPrint }: Callbacks) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const store = usePdfStore.getState()
      const hasPdf = store.numPages > 0
      const inInput = document.activeElement?.tagName === 'INPUT' ||
                      document.activeElement?.tagName === 'TEXTAREA' ||
                      document.activeElement?.tagName === 'SELECT'

      if (e.key === 'F1') { e.preventDefault(); onShortcuts(); return }

      if (e.ctrlKey) {
        switch (e.key) {
          case 'o': case 'O':
            e.preventDefault(); onOpen(); return
          case ',':
            e.preventDefault(); onSettings(); return
          case 'p': case 'P':
            if (hasPdf) { e.preventDefault(); onPrint(); return }
            break
          case 's': case 'S':
            if (hasPdf) {
              e.preventDefault()
              if (e.shiftKey) store.saveAs()
              else store.save()
            }
            return
          case 'z': case 'Z':
            if (hasPdf && !inInput) { e.preventDefault(); store.undo() }
            return
          case 'y': case 'Y':
            if (hasPdf && !inInput) { e.preventDefault(); store.redo() }
            return
          case 'f': case 'F':
            if (hasPdf) { e.preventDefault(); store.setSearchOpen(!store.searchOpen) }
            return
          case '+': case '=':
            if (hasPdf) { e.preventDefault(); store.setScale(Math.min(5, Math.round((store.scale + 0.1) * 10) / 10)) }
            return
          case '-': case '_':
            if (hasPdf) { e.preventDefault(); store.setScale(Math.max(0.25, Math.round((store.scale - 0.1) * 10) / 10)) }
            return
          case '0':
            if (hasPdf) {
              e.preventDefault()
              if (e.shiftKey) store.setZoomMode('fit-width')
              else store.setZoomMode('fit-page')
            }
            return
        }
        return
      }

      if (inInput) return
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
        case 'Home':
          e.preventDefault()
          store.scrollToPage(1)
          break
        case 'End':
          e.preventDefault()
          store.scrollToPage(store.numPages)
          break
        case 'ArrowLeft': case 'ArrowUp':
          if (e.altKey) { e.preventDefault(); store.scrollToPage(Math.max(1, store.currentPage - 1)) }
          break
        case 'ArrowRight': case 'ArrowDown':
          if (e.altKey) { e.preventDefault(); store.scrollToPage(Math.min(store.numPages, store.currentPage + 1)) }
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onOpen, onSettings, onShortcuts, onPrint])
}
