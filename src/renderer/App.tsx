import { useCallback } from 'react'
import Toolbar from './components/Toolbar'
import PdfViewer from './components/PdfViewer'
import SearchPanel from './components/SearchPanel'
import StartScreen from './components/StartScreen'
import { usePdfStore } from './store/usePdfStore'
import { useRecentFiles } from './hooks/useRecentFiles'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import './styles/app.css'

export default function App() {
  const loadPdf = usePdfStore(s => s.loadPdf)
  const numPages = usePdfStore(s => s.numPages)
  const { recentFiles, addRecentFile, removeRecentFile } = useRecentFiles()

  const openFile = useCallback(async (filePath?: string) => {
    const path = filePath ?? await window.electronAPI.openFileDialog()
    if (!path) return
    const bytes = await window.electronAPI.readFileBytes(path)
    const name = path.split(/[\\/]/).pop() ?? path
    await loadPdf(bytes, path, name)
    addRecentFile(path, name)
  }, [loadPdf, addRecentFile])

  useKeyboardShortcuts(openFile)

  const hasPdf = numPages > 0

  return (
    <div className="app">
      <Toolbar onOpen={openFile} />
      {hasPdf ? (
        <div className="content-area">
          <PdfViewer />
          <SearchPanel />
        </div>
      ) : (
        <StartScreen
          recentFiles={recentFiles}
          onOpen={openFile}
          onOpenRecent={path => openFile(path)}
          onRemoveRecent={removeRecentFile}
        />
      )}
    </div>
  )
}
