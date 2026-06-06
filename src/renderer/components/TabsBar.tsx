import { useTabsStore } from '../store/useTabsStore'
import { usePdfStore } from '../store/usePdfStore'

export default function TabsBar() {
  const { tabs, activeTabId, removeTab, setActiveTab } = useTabsStore()
  const loadPdf     = usePdfStore(s => s.loadPdf)
  const getBakedBytes = usePdfStore(s => s.getBakedBytes)
  const annotations = usePdfStore(s => s.annotations)
  const formFields  = usePdfStore(s => s.formFields)
  const bookmarks   = usePdfStore(s => s.bookmarks)
  const isDirty     = usePdfStore(s => s.isDirty)
  const currentPage = usePdfStore(s => s.currentPage)
  const scale       = usePdfStore(s => s.scale)
  const fileName    = usePdfStore(s => s.fileName)
  const filePath    = usePdfStore(s => s.filePath)
  const updateTab   = useTabsStore(s => s.updateTab)

  if (tabs.length === 0) return null

  const switchTo = async (tabId: string) => {
    if (tabId === activeTabId) return

    // Snapshot current PDF into active tab
    if (activeTabId && filePath) {
      try {
        const bytes = await getBakedBytes()
        updateTab(activeTabId, {
          pdfBytes: bytes, annotations, formFields, bookmarks,
          isDirty, currentPage, scale,
          fileName, filePath,
        })
      } catch { /* ignore */ }
    }

    const target = useTabsStore.getState().tabs.find(t => t.id === tabId)
    if (!target) return
    setActiveTab(tabId)
    await loadPdf(
      target.pdfBytes.buffer.slice(target.pdfBytes.byteOffset, target.pdfBytes.byteOffset + target.pdfBytes.byteLength) as ArrayBuffer,
      target.filePath,
      target.fileName
    )
  }

  const closeTab = async (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation()
    const tab = tabs.find(t => t.id === tabId)
    if (tab?.isDirty && tabId === activeTabId) {
      const ok = window.confirm(`"${tab.fileName}" has unsaved changes. Close anyway?`)
      if (!ok) return
    }
    const remaining = tabs.filter(t => t.id !== tabId)
    if (tabId === activeTabId && remaining.length > 0) {
      await switchTo(remaining[remaining.length - 1].id)
    }
    removeTab(tabId)
    if (remaining.length === 0) {
      usePdfStore.getState().closePdf()
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', overflowX: 'auto',
      background: 'var(--bg-tabs, var(--bg-secondary))',
      borderBottom: '1px solid var(--border)',
      minHeight: 34, flexShrink: 0,
    }}>
      {tabs.map(tab => {
        const isActive = tab.id === activeTabId
        const dirty = isActive ? isDirty : tab.isDirty
        return (
          <div key={tab.id}
            onClick={() => switchTo(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0 14px 0 12px', cursor: 'pointer', flexShrink: 0,
              minWidth: 120, maxWidth: 200,
              borderRight: '1px solid var(--border)',
              background: isActive ? 'var(--bg-primary)' : 'transparent',
              borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: 12,
              userSelect: 'none',
            }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
              title={tab.fileName}>
              {dirty ? '● ' : ''}{tab.fileName}
            </span>
            <button
              onClick={e => closeTab(e, tab.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                color: 'var(--text-muted)', fontSize: 14, lineHeight: 1, flexShrink: 0,
                borderRadius: 3,
              }}
              title="Close tab"
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,80,80,0.15)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >×</button>
          </div>
        )
      })}
    </div>
  )
}
