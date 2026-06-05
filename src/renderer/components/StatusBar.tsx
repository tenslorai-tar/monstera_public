import { usePdfStore } from '../store/usePdfStore'

export default function StatusBar() {
  const numPages          = usePdfStore(s => s.numPages)
  const currentPage       = usePdfStore(s => s.currentPage)
  const scale             = usePdfStore(s => s.scale)
  const isDirty           = usePdfStore(s => s.isDirty)
  const fileName          = usePdfStore(s => s.fileName)
  const encryptionSettings = usePdfStore(s => s.encryptionSettings)
  const activeTool        = usePdfStore(s => s.activeTool)
  const formMode          = usePdfStore(s => s.formMode)
  const annotations       = usePdfStore(s => s.annotations)
  const selectedPages     = usePdfStore(s => s.selectedPages)

  const hasPdf = numPages > 0

  const modeLabel = formMode ? 'Forms Mode'
    : activeTool
      ? activeTool.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) + ' Tool'
      : hasPdf ? 'Ready' : ''

  const annCount = annotations.length

  return (
    <div className="status-bar">
      <div className="status-left">
        {hasPdf && (
          <>
            <span className="status-item">
              Page <strong>{currentPage}</strong> of <strong>{numPages}</strong>
            </span>
            {selectedPages.size > 0 && (
              <span className="status-badge status-sel">{selectedPages.size} page{selectedPages.size !== 1 ? 's' : ''} selected</span>
            )}
            {annCount > 0 && (
              <span className="status-item status-dim">{annCount} annotation{annCount !== 1 ? 's' : ''}</span>
            )}
          </>
        )}
      </div>

      <div className="status-center">
        {hasPdf && (
          <span className="status-item status-dim" title={fileName}>{fileName}</span>
        )}
      </div>

      <div className="status-right">
        {hasPdf && modeLabel && (
          <span className={`status-badge${formMode ? ' status-forms' : activeTool ? ' status-tool' : ' status-ready'}`}>
            {modeLabel}
          </span>
        )}
        {hasPdf && encryptionSettings && (
          <span className="status-badge status-lock" title="This document is encrypted">🔒 Encrypted</span>
        )}
        {hasPdf && isDirty && (
          <span className="status-badge status-dirty" title="You have unsaved changes">● Unsaved</span>
        )}
        {hasPdf && (
          <span className="status-item">{Math.round(scale * 100)}%</span>
        )}
      </div>
    </div>
  )
}
