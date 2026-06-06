import { useState, useEffect } from 'react'
import { usePdfStore } from '../store/usePdfStore'
import { textCache } from '../utils/textCache'

interface PageStats { pageNum: number; words: number; chars: number; charsNoSpace: number }

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length
}

export default function WordCountDialog({ onClose }: { onClose: () => void }) {
  const numPages  = usePdfStore(s => s.numPages)
  const pdfBytes  = usePdfStore(s => s.pdfBytes)
  const [stats,   setStats]   = useState<PageStats[] | null>(null)
  const [loading, setLoading] = useState(false)

  const analyze = async () => {
    if (!pdfBytes) return
    setLoading(true)
    // Try to use text cache first; fall back to IPC extract
    const cachePages: PageStats[] = []
    for (let p = 1; p <= numPages; p++) {
      const cached = textCache.get(p)
      if (cached) {
        cachePages.push({
          pageNum: p,
          words:   countWords(cached.text),
          chars:   cached.text.length,
          charsNoSpace: cached.text.replace(/\s/g, '').length,
        })
      }
    }
    if (cachePages.length === numPages) {
      setStats(cachePages)
      setLoading(false)
      return
    }
    // Fall back to MuPDF extraction
    try {
      const pages = await window.electronAPI.mupdfExtractAllText(pdfBytes.buffer as ArrayBuffer)
      setStats(pages.map(p => ({
        pageNum: p.pageNum,
        words:   countWords(p.text),
        chars:   p.text.length,
        charsNoSpace: p.text.replace(/\s/g, '').length,
      })))
    } catch { setStats([]) }
    setLoading(false)
  }

  useEffect(() => { analyze() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const totals = stats ? {
    words:        stats.reduce((n, p) => n + p.words, 0),
    chars:        stats.reduce((n, p) => n + p.chars, 0),
    charsNoSpace: stats.reduce((n, p) => n + p.charsNoSpace, 0),
  } : null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 460, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>Word Count</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', opacity: 0.6 }}>Counting…</div>
        ) : totals ? (
          <>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                {[
                  { label: 'Pages',          value: numPages },
                  { label: 'Words',          value: totals.words.toLocaleString() },
                  { label: 'Characters',     value: totals.chars.toLocaleString() },
                  { label: 'Chars (no sp.)', value: totals.charsNoSpace.toLocaleString() },
                ].map(({ label, value }) => (
                  <div key={label} style={{ textAlign: 'center', padding: '8px 4px',
                    background: 'var(--bg-primary)', borderRadius: 6 }}>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
                    <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    {['Page', 'Words', 'Characters', 'No Spaces'].map(h => (
                      <th key={h} style={{ padding: '5px 12px', textAlign: h === 'Page' ? 'center' : 'right',
                        opacity: 0.6, fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats!.map(p => (
                    <tr key={p.pageNum} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '4px 12px', textAlign: 'center', opacity: 0.6 }}>{p.pageNum}</td>
                      <td style={{ padding: '4px 12px', textAlign: 'right' }}>{p.words.toLocaleString()}</td>
                      <td style={{ padding: '4px 12px', textAlign: 'right', opacity: 0.7 }}>{p.chars.toLocaleString()}</td>
                      <td style={{ padding: '4px 12px', textAlign: 'right', opacity: 0.7 }}>{p.charsNoSpace.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div style={{ padding: 24, opacity: 0.5 }}>No data available.</div>
        )}

        <div className="modal-footer">
          <button className="modal-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
