import { useState } from 'react'
import { Anchor } from 'lucide-react'
import { usePdfStore } from '../store/usePdfStore'

export default function NamedDestsPanel() {
  const namedDests = usePdfStore(s => s.namedDests)
  const scrollToPage = usePdfStore(s => s.scrollToPage)
  const [filter, setFilter] = useState('')

  const visible = filter.trim()
    ? namedDests.filter(d => d.name.toLowerCase().includes(filter.toLowerCase()))
    : namedDests

  return (
    <div className="side-panel" style={{ width: 260, borderLeft: '1px solid var(--border)' }}>
      <div className="side-panel-header">
        <span>Destinations ({namedDests.length})</span>
      </div>
      <div style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>
        <input
          type="text"
          placeholder="Filter…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ width: '100%', background: 'var(--bg-primary)', color: 'inherit',
            border: '1px solid var(--border)', borderRadius: 3, padding: '3px 6px',
            fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
        />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {namedDests.length === 0 && (
          <div style={{ padding: '12px 10px', fontSize: 12, opacity: 0.5 }}>
            No named destinations found.
          </div>
        )}
        {visible.length === 0 && namedDests.length > 0 && (
          <div style={{ padding: '12px 10px', fontSize: 12, opacity: 0.5 }}>
            No matches.
          </div>
        )}
        {visible.map(dest => (
          <div
            key={dest.name}
            style={{ padding: '5px 10px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
              fontSize: 12 }}
            onClick={() => scrollToPage(dest.pageNum)}
            title={`Go to page ${dest.pageNum}`}
          >
            <span style={{ opacity: 0.5, display: 'inline-flex' }}><Anchor size={15} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, wordBreak: 'break-all' }}>
                {dest.name.length > 35 ? dest.name.slice(0, 32) + '…' : dest.name}
              </div>
              <div style={{ fontSize: 10, opacity: 0.5 }}>Page {dest.pageNum}</div>
            </div>
            <span style={{ fontSize: 16, opacity: 0.4 }}>→</span>
          </div>
        ))}
      </div>
    </div>
  )
}
