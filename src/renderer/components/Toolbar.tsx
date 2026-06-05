interface ToolbarProps {
  fileName: string
  onOpen: () => void
}

export default function Toolbar({ fileName, onOpen }: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <span className="app-name">Monstera</span>
        <button className="btn-primary" onClick={onOpen}>
          Open PDF
        </button>
      </div>
      {fileName && <span className="file-name">{fileName}</span>}
    </header>
  )
}
