import { useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'
import type { Annotation } from '../types/annotations'

type TextAnnotation = Annotation & { text: string }

function hasText(a: Annotation): a is TextAnnotation {
  return typeof (a as unknown as Record<string, unknown>).text === 'string'
}

export default function SpellCheckDialog({ onClose }: { onClose: () => void }) {
  const annotations  = usePdfStore(s => s.annotations)
  const updateAnnotation = usePdfStore(s => s.updateAnnotation)
  const scrollToPage = usePdfStore(s => s.scrollToPage)

  const textAnns = annotations.filter(hasText) as TextAnnotation[]
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const startEdit = (a: TextAnnotation) => {
    setEditing(a.id)
    setEditText(a.text)
    scrollToPage(a.pageNum)
  }

  const commit = () => {
    if (editing) {
      updateAnnotation(editing, { text: editText } as Partial<Annotation>)
      setEditing(null)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 560, maxHeight: '75vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>Spell Check Annotations</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, opacity: 0.7 }}>
          Shows all text annotations (text boxes, sticky notes, typewriter, callouts). Use your browser's built-in spell checking (red underlines) to find and fix misspellings. {textAnns.length} text annotations found.
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          {textAnns.length === 0 && (
            <div style={{ padding: '16px', opacity: 0.5, fontSize: 13 }}>
              No text annotations found. Add text boxes, sticky notes, or typewriter annotations to check spelling.
            </div>
          )}
          {textAnns.map(ann => (
            <div key={ann.id} style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 11, opacity: 0.5, textTransform: 'capitalize' }}>
                  {ann.type} — page {ann.pageNum}
                </span>
                <button className="annot-tool-btn" style={{ fontSize: 10, padding: '1px 6px' }}
                  onClick={() => scrollToPage(ann.pageNum)}>Go to</button>
              </div>
              {editing === ann.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <textarea
                    spellCheck
                    lang="en"
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    autoFocus
                    style={{ width: '100%', minHeight: 60, background: 'var(--bg-primary)',
                      color: 'inherit', border: '1px solid var(--accent)', borderRadius: 4,
                      padding: 6, fontSize: 13, fontFamily: 'inherit', resize: 'vertical',
                      boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="modal-btn" style={{ fontSize: 11, padding: '3px 10px' }}
                      onClick={commit}>Save</button>
                    <button className="modal-btn-secondary" style={{ fontSize: 11, padding: '3px 10px' }}
                      onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, fontSize: 13, lineHeight: 1.4,
                    background: 'var(--bg-primary)', padding: '4px 8px', borderRadius: 4,
                    wordBreak: 'break-word', minHeight: 28 }}>
                    {ann.text || <span style={{ opacity: 0.3, fontStyle: 'italic' }}>(empty)</span>}
                  </div>
                  <button className="annot-tool-btn" style={{ flexShrink: 0 }}
                    onClick={() => startEdit(ann)}>Edit</button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button className="modal-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
