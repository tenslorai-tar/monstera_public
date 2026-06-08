import { useTabsStore } from '../store/useTabsStore'
import { usePdfStore } from '../store/usePdfStore'

export default function TabsBar() {
  const tabs        = useTabsStore(s => s.tabs)
  const activeTabId = useTabsStore(s => s.activeTabId)
  const isDirty     = usePdfStore(s => s.isDirty)

  if (tabs.length === 0) return null

  // Snapshot the live PDF store into whichever tab is currently active.
  // Reads fresh state from the stores so it stays correct when called
  // multiple times in one handler (e.g. switching twice while closing a tab).
  const snapshotActive = async () => {
    const st = useTabsStore.getState()
    const ps = usePdfStore.getState()
    if (st.activeTabId && ps.filePath) {
      try {
        const bytes = await ps.getBakedBytes()
        st.updateTab(st.activeTabId, {
          pdfBytes: bytes,
          annotations: ps.annotations, formFields: ps.formFields, bookmarks: ps.bookmarks,
          isDirty: ps.isDirty, currentPage: ps.currentPage, scale: ps.scale,
          fileName: ps.fileName, filePath: ps.filePath,
        })
      } catch { /* ignore */ }
    }
  }

  const switchTo = async (tabId: string) => {
    if (tabId === useTabsStore.getState().activeTabId) return
    await snapshotActive()
    const target = useTabsStore.getState().tabs.find(t => t.id === tabId)
    if (!target) return
    useTabsStore.getState().setActiveTab(tabId)
    await usePdfStore.getState().loadPdf(
      target.pdfBytes.buffer.slice(target.pdfBytes.byteOffset, target.pdfBytes.byteOffset + target.pdfBytes.byteLength) as ArrayBuffer,
      target.filePath,
      target.fileName
    )
  }

  const closeTab = async (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation()
    const tab = useTabsStore.getState().tabs.find(t => t.id === tabId)
    if (!tab) return

    // The active tab's dirty flag lives in the live PDF store; inactive tabs
    // keep their last snapshot. (The old code read the stale snapshot for the
    // active tab, so a single-tab close never prompted.)
    const liveActive = useTabsStore.getState().activeTabId
    const tabDirty = tabId === liveActive ? usePdfStore.getState().isDirty : tab.isDirty

    if (tabDirty) {
      // Make the tab we're prompting about the active document so Save targets it.
      if (tabId !== liveActive) await switchTo(tabId)
      const choice = await window.electronAPI.confirmUnsaved(tab.fileName)
      if (choice === 'cancel') return
      if (choice === 'save') {
        const ps = usePdfStore.getState()
        if (ps.filePath) await ps.save()
        else await ps.saveAs()
        // Save As was cancelled (still dirty) → abort the close, keep the tab.
        if (usePdfStore.getState().isDirty) return
      }
    }

    const remaining = useTabsStore.getState().tabs.filter(t => t.id !== tabId)
    if (tabId === useTabsStore.getState().activeTabId && remaining.length > 0) {
      await switchTo(remaining[remaining.length - 1].id)
    }
    useTabsStore.getState().removeTab(tabId)
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
