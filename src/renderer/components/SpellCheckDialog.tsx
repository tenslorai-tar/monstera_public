import { useState } from 'react'
import StatusText from './StatusText'
import { SpellCheck } from 'lucide-react'
import { usePdfStore } from '../store/usePdfStore'
import type { Annotation } from '../types/annotations'

type TextAnnotation = Annotation & { text: string }

function hasText(a: Annotation): a is TextAnnotation {
  return typeof (a as unknown as Record<string, unknown>).text === 'string'
    && !!(a as unknown as Record<string, unknown>).text
}

interface Issue { annId: string; pageNum: number; word: string; suggestions: string[] }

export default function SpellCheckDialog({ onClose }: { onClose: () => void }) {
  const annotations = usePdfStore(s => s.annotations)
  const updateAnnotation = usePdfStore(s => s.updateAnnotation)
  const scrollToPage = usePdfStore(s => s.scrollToPage)

  const textAnns = annotations.filter(hasText) as TextAnnotation[]
  const [issues, setIssues] = useState<Issue[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  const run = async () => {
    setBusy(true); setStatus('Checking…')
    try {
      const found: Issue[] = []
      for (const a of textAnns) {
        const res = await window.electronAPI.spellCheck(a.text)
        for (const r of res) found.push({ annId: a.id, pageNum: a.pageNum, word: r.word, suggestions: r.suggestions })
      }
      setIssues(found)
      setStatus(found.length === 0 ? '✓ No misspellings found.' : `${found.length} possible misspelling${found.length !== 1 ? 's' : ''}.`)
    } catch (e: any) {
      setStatus(`Error: ${e?.message ?? 'spell check failed'}`)
    }
    setBusy(false)
  }

  // Replace a whole-word occurrence in the annotation's text
  const applyFix = (issue: Issue, replacement: string) => {
    const ann = annotations.find(a => a.id === issue.annId) as TextAnnotation | undefined
    if (!ann) return
    const re = new RegExp(`\\b${issue.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
    const next = ann.text.replace(re, replacement)
    updateAnnotation(issue.annId, { text: next } as Partial<Annotation>)
    setIssues(prev => prev ? prev.filter(i => !(i.annId === issue.annId && i.word === issue.word)) : prev)
  }

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-box" style={{ width: 560, maxHeight: '78vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-title"><SpellCheck size={18} /> Spell Check</div>

        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Checks all text annotations (text boxes, sticky notes, typewriter, callouts) with a
          Hunspell dictionary and offers one-click corrections. {textAnns.length} text annotation{textAnns.length !== 1 ? 's' : ''} found.
        </div>

        <div style={{ flex: 1, overflowY: 'auto', margin: '0 -4px', padding: '0 4px' }}>
          {issues === null && (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Click <strong>Check Spelling</strong> to scan.
            </div>
          )}
          {issues && issues.length === 0 && (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--accent)', fontSize: 14 }}>
              ✓ No misspellings found.
            </div>
          )}
          {issues && issues.map((issue, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px',
              borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 700, color: 'var(--danger)', minWidth: 110, wordBreak: 'break-all' }}>{issue.word}</span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>p{issue.pageNum}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, flex: 1 }}>
                {issue.suggestions.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>no suggestions</span>}
                {issue.suggestions.map(s => (
                  <button key={s} className="modal-btn-secondary" style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => applyFix(issue, s)}>{s}</button>
                ))}
              </div>
              <button className="modal-btn-secondary" style={{ fontSize: 10, padding: '2px 6px' }}
                onClick={() => scrollToPage(issue.pageNum)}>Go</button>
            </div>
          ))}
        </div>

        <div className="modal-actions" style={{ alignItems: 'center' }}>
          <span style={{ marginRight: 'auto', fontSize: 12, color: 'var(--text-muted)' }}><StatusText status={status} /></span>
          <button className="modal-btn-secondary" onClick={onClose}>Close</button>
          <button className="modal-btn-primary" onClick={run} disabled={busy || textAnns.length === 0}>
            {busy ? 'Checking…' : 'Check Spelling'}
          </button>
        </div>
      </div>
    </div>
  )
}
