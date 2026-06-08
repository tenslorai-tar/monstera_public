import { useState } from 'react'
import { X } from 'lucide-react'
import { usePdfStore } from '../store/usePdfStore'

interface DiffLine { text: string; kind: 'same' | 'add' | 'del' }

function diffLines(a: string, b: string): DiffLine[] {
  const aLines = a.split('\n').filter(l => l.trim())
  const bLines = b.split('\n').filter(l => l.trim())
  const result: DiffLine[] = []
  const aSet = new Set(aLines)
  const bSet = new Set(bLines)
  for (const l of aLines) {
    if (bSet.has(l)) result.push({ text: l, kind: 'same' })
    else result.push({ text: l, kind: 'del' })
  }
  for (const l of bLines) {
    if (!aSet.has(l)) result.push({ text: l, kind: 'add' })
  }
  return result
}

export default function CompareDialog({ onClose }: { onClose: () => void }) {
  const pdfBytes  = usePdfStore(s => s.pdfBytes)
  const fileName  = usePdfStore(s => s.fileName)

  const [status,   setStatus]   = useState('')
  const [loading,  setLoading]  = useState(false)
  const [diffPages, setDiffPages] = useState<Array<{ pageNum: number; lines: DiffLine[] }>>([])
  const [otherName, setOtherName] = useState('')
  const [showSame, setShowSame] = useState(false)

  const handleCompare = async () => {
    if (!pdfBytes) return
    const path = await window.electronAPI.openFileDialog()
    if (!path) return
    setLoading(true)
    setStatus('')
    try {
      const otherBytes = await window.electronAPI.readFileBytes(path)
      setOtherName(path.split(/[\\/]/).pop() ?? path)

      const [aPages, bPages] = await Promise.all([
        window.electronAPI.mupdfExtractAllText(pdfBytes.buffer as ArrayBuffer),
        window.electronAPI.mupdfExtractAllText(otherBytes),
      ])

      const maxPages = Math.max(aPages.length, bPages.length)
      const result = []
      for (let i = 0; i < maxPages; i++) {
        const aText = aPages[i]?.text ?? ''
        const bText = bPages[i]?.text ?? ''
        const lines = diffLines(aText, bText)
        const hasDiff = lines.some(l => l.kind !== 'same')
        if (hasDiff || aText !== bText) result.push({ pageNum: i + 1, lines })
      }
      setDiffPages(result)
      if (result.length === 0) setStatus('Documents appear identical (no text differences found).')
      else setStatus(`${result.length} page(s) with differences.`)
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  const totalAdded   = diffPages.reduce((n, p) => n + p.lines.filter(l => l.kind === 'add').length, 0)
  const totalDeleted = diffPages.reduce((n, p) => n + p.lines.filter(l => l.kind === 'del').length, 0)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 720, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>Compare Documents</span>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13 }}>
              Base: <strong>{fileName || 'Current document'}</strong>
            </div>
            <button className="modal-btn" onClick={handleCompare} disabled={loading || !pdfBytes}>
              {loading ? 'Comparing…' : 'Select File to Compare…'}
            </button>
            {otherName && <div style={{ fontSize: 12, opacity: 0.7 }}>vs <strong>{otherName}</strong></div>}
          </div>
          {status && <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>{status}</div>}
          {diffPages.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', gap: 16, fontSize: 12 }}>
              <span style={{ color: '#4caf50' }}>+ {totalAdded} added lines</span>
              <span style={{ color: '#f44336' }}>− {totalDeleted} removed lines</span>
              <label style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={showSame}
                  onChange={e => setShowSame(e.target.checked)} style={{ marginRight: 4 }} />
                Show unchanged
              </label>
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px', fontFamily: 'monospace', fontSize: 12 }}>
          {diffPages.length === 0 && !loading && !status && (
            <div style={{ opacity: 0.5, padding: 16 }}>
              Select a PDF to compare against the current document.
              Differences will be shown line-by-line per page.
            </div>
          )}
          {diffPages.map(({ pageNum, lines }) => {
            const visible = showSame ? lines : lines.filter(l => l.kind !== 'same')
            if (visible.length === 0) return null
            return (
              <div key={pageNum} style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 600, opacity: 0.5, fontSize: 11, marginBottom: 4 }}>
                  PAGE {pageNum}
                </div>
                {visible.map((l, i) => (
                  <div key={i} style={{
                    background: l.kind === 'add' ? 'rgba(76,175,80,0.15)'
                      : l.kind === 'del' ? 'rgba(244,67,54,0.15)'
                      : 'transparent',
                    color: l.kind === 'add' ? '#4caf50' : l.kind === 'del' ? '#f44336' : 'inherit',
                    padding: '1px 4px', borderRadius: 2, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  }}>
                    {l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ' '} {l.text}
                  </div>
                ))}
              </div>
            )
          })}
        </div>

        <div className="modal-footer">
          <button className="modal-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
