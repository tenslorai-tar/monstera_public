import { usePdfStore } from '../store/usePdfStore'
import type { Annotation } from '../types/annotations'

const TYPE_LABEL: Record<string, string> = {
  highlight: 'Highlight', underline: 'Underline', strikethrough: 'Strikethrough',
  ink: 'Drawing', rectangle: 'Rectangle', ellipse: 'Ellipse',
  line: 'Line', arrow: 'Arrow', textbox: 'Text Box',
  stickynote: 'Sticky Note', stamp: 'Stamp',
}

function annLabel(ann: Annotation): string {
  if (ann.type === 'highlight' || ann.type === 'underline' || ann.type === 'strikethrough') {
    const t = ann.selectedText?.trim()
    return t ? `"${t.slice(0, 40)}${t.length > 40 ? '…' : ''}"` : TYPE_LABEL[ann.type]
  }
  if (ann.type === 'stickynote') return ann.text?.trim().slice(0, 50) || 'Empty note'
  if (ann.type === 'textbox') return ann.text?.trim().slice(0, 50) || 'Empty text box'
  if (ann.type === 'stamp') return ann.stampName
  return TYPE_LABEL[ann.type] || ann.type
}

export default function AnnotationsPanel() {
  const annotations = usePdfStore(s => s.annotations)
  const selectedAnnotationId = usePdfStore(s => s.selectedAnnotationId)
  const scrollToPage = usePdfStore(s => s.scrollToPage)
  const deleteAnnotation = usePdfStore(s => s.deleteAnnotation)
  const setSelectedAnnotation = usePdfStore(s => s.setSelectedAnnotation)
  const setOpenStickyNote = usePdfStore(s => s.setOpenStickyNote)

  // Group by page
  const byPage = annotations.reduce<Record<number, Annotation[]>>((acc, ann) => {
    ;(acc[ann.pageNum] ??= []).push(ann)
    return acc
  }, {})

  const pages = Object.keys(byPage).map(Number).sort((a, b) => a - b)

  const handleClick = (ann: Annotation) => {
    setSelectedAnnotation(ann.id)
    scrollToPage(ann.pageNum)
    if (ann.type === 'stickynote') setOpenStickyNote(ann.id)
  }

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    deleteAnnotation(id)
  }

  return (
    <div className="annot-panel">
      <div className="annot-panel-header">
        <span>Annotations</span>
        <span className="annot-panel-count">{annotations.length}</span>
      </div>
      {annotations.length === 0 ? (
        <div className="annot-panel-empty">No annotations yet.<br />Select a tool above to start.</div>
      ) : (
        <div className="annot-panel-scroll">
          {pages.map(pageNum => (
            <div key={pageNum} className="annot-page-group">
              <div className="annot-page-label">Page {pageNum}</div>
              {byPage[pageNum].map(ann => (
                <div
                  key={ann.id}
                  className={`annot-panel-item${selectedAnnotationId === ann.id ? ' annot-panel-selected' : ''}`}
                  onClick={() => handleClick(ann)}
                >
                  <span
                    className="annot-panel-swatch"
                    style={{ background: ann.color, opacity: ann.opacity + 0.2 }}
                  />
                  <div className="annot-panel-info">
                    <span className="annot-panel-type">{TYPE_LABEL[ann.type]}</span>
                    <span className="annot-panel-text">{annLabel(ann)}</span>
                  </div>
                  <button
                    className="annot-panel-del"
                    onClick={e => handleDelete(e, ann.id)}
                    title="Delete annotation"
                  >✕</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
