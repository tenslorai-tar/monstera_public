import { useState } from 'react'
import Toolbar from './components/Toolbar'
import PdfCanvas from './components/PdfCanvas'
import './styles/app.css'

export default function App() {
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null)
  const [fileName, setFileName] = useState<string>('')

  const handleOpen = async () => {
    const filePath = await window.electronAPI.openFileDialog()
    if (!filePath) return
    const bytes = await window.electronAPI.readFileBytes(filePath)
    const name = filePath.split(/[\\/]/).pop() ?? filePath
    setPdfBytes(bytes)
    setFileName(name)
  }

  return (
    <div className="app">
      <Toolbar fileName={fileName} onOpen={handleOpen} />
      <main className="canvas-area">
        {pdfBytes ? (
          <PdfCanvas pdfBytes={pdfBytes} />
        ) : (
          <div className="empty-state">
            <p>Open a PDF to get started</p>
          </div>
        )}
      </main>
    </div>
  )
}
