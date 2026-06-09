import { useState } from 'react'
import { X, Pencil, ArrowUpRight } from 'lucide-react'
import { usePdfStore } from '../store/usePdfStore'
import type { LinkAnn } from '../types/annotations'

export default function LinksPanel() {
  const annotations  = usePdfStore(s => s.annotations)
  const scrollToPage = usePdfStore(s => s.jumpToPage)
  const deleteAnnotation  = usePdfStore(s => s.deleteAnnotation)
  const updateAnnotation  = usePdfStore(s => s.updateAnnotation)

  const links = annotations.filter(a => a.type === 'link') as LinkAnn[]

  const [editId,   setEditId]   = useState<string | null>(null)
  const [editHref, setEditHref] = useState('')
  const [editPage, setEditPage] = useState('')

  const startEdit = (a: LinkAnn) => {
    setEditId(a.id)
    setEditHref(a.href ?? '')
    setEditPage(a.destPage != null ? String(a.destPage) : '')
  }

  const commitEdit = () => {
    if (!editId) return
    const trimHref = editHref.trim()
    const page = parseInt(editPage, 10)
    if (trimHref) {
      updateAnnotation(editId, { href: trimHref, destPage: undefined } as Partial<LinkAnn>)
    } else if (!isNaN(page)) {
      updateAnnotation(editId, { href: undefined, destPage: page } as Partial<LinkAnn>)
    }
    setEditId(null)
  }

  const grouped: Map<number, LinkAnn[]> = new Map()
  for (const l of links) {
    if (!grouped.has(l.pageNum)) grouped.set(l.pageNum, [])
    grouped.get(l.pageNum)!.push(l)
  }
  const sortedPages = [...grouped.keys()].sort((a, b) => a - b)

  return (
    <div className="side-panel" style={{ width: 260, borderLeft: '1px solid var(--border)' }}>
      <div className="side-panel-header">
        <span>Links ({links.length})</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {links.length === 0 && (
          <div style={{ padding: '12px 10px', fontSize: 12, opacity: 0.5 }}>
            No links in this document. Use the Link tool to add one.
          </div>
        )}
        {sortedPages.map(pg => (
          <div key={pg}>
            <div style={{ padding: '4px 10px', fontSize: 11, opacity: 0.5, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Page {pg}
            </div>
            {grouped.get(pg)!.map(link => (
              <div key={link.id} style={{ padding: '4px 10px 4px 14px', fontSize: 12,
                borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {editId === link.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <input type="text" placeholder="URL"
                      value={editHref} onChange={e => setEditHref(e.target.value)}
                      autoFocus
                      style={{ background: 'var(--bg-primary)', color: 'inherit', border: '1px solid var(--border)',
                        borderRadius: 3, padding: '2px 5px', fontSize: 11, outline: 'none' }}
                      onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditId(null) }} />
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <span style={{ fontSize: 10, opacity: 0.6 }}>or page:</span>
                      <input type="number" placeholder="#" min={1} value={editPage}
                        onChange={e => setEditPage(e.target.value)}
                        style={{ background: 'var(--bg-primary)', color: 'inherit', border: '1px solid var(--border)',
                          borderRadius: 3, padding: '2px 5px', fontSize: 11, outline: 'none', width: 60 }}
                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditId(null) }} />
                      <button onClick={commitEdit}
                        style={{ padding: '2px 8px', fontSize: 10, background: '#0055cc', border: 'none',
                          borderRadius: 3, color: '#fff', cursor: 'pointer' }}>OK</button>
                      <button onClick={() => setEditId(null)}
                        style={{ padding: '2px 6px', fontSize: 10, background: 'transparent',
                          border: '1px solid var(--border)', borderRadius: 3, color: 'inherit', cursor: 'pointer' }}><X size={12} /></button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {link.href ? (
                        <span style={{ color: '#4a9eff', wordBreak: 'break-all', cursor: 'pointer' }}
                          title={link.href}>
                          {link.href.length > 40 ? link.href.slice(0, 37) + '…' : link.href}
                        </span>
                      ) : link.destPage != null ? (
                        <span style={{ opacity: 0.8 }}>→ Page {link.destPage}</span>
                      ) : (
                        <span style={{ opacity: 0.4, fontStyle: 'italic' }}>no destination</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                      <button className="annot-tool-btn" title="Go to page"
                        onClick={() => scrollToPage(link.pageNum)}><ArrowUpRight size={13} /></button>
                      <button className="annot-tool-btn" title="Edit"
                        onClick={() => startEdit(link)}><Pencil size={13} /></button>
                      <button className="annot-tool-btn" title="Delete"
                        onClick={() => deleteAnnotation(link.id)}><X size={13} /></button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
