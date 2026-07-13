import { useTabsStore, type PdfTab } from '../store/useTabsStore'
import { usePdfStore, type TabRestoreState } from '../store/usePdfStore'

// Single source of truth for saving the live PDF store into the active tab and
// for building the payload that restores it. Previously App.tsx and TabsBar.tsx
// each had their own divergent snapshot that saved different fields and baked the
// whole document through MuPDF on every switch.
//
// The snapshot stores the RAW (un-baked) content bytes by reference plus the live
// overlay state, so it is synchronous and cheap; switching back reuses that state
// instead of re-reading the PDF and resetting to page 1 / default zoom.
export function snapshotActiveTab(): void {
  const st = useTabsStore.getState()
  const ps = usePdfStore.getState()
  if (!st.activeTabId || !ps.pdfBytes) return
  st.updateTab(st.activeTabId, {
    pdfBytes: ps.pdfBytes,
    annotations: ps.annotations,
    formFields: ps.formFields,
    bookmarks: ps.bookmarks,
    isDirty: ps.isDirty,
    currentPage: ps.currentPage,
    scale: ps.scale,
    fileName: ps.fileName,
    filePath: ps.filePath,
    encryptionSettings: ps.encryptionSettings,
  })
}

export function tabRestoreState(tab: PdfTab): TabRestoreState {
  return {
    annotations: tab.annotations,
    formFields: tab.formFields,
    bookmarks: tab.bookmarks,
    currentPage: tab.currentPage,
    scale: tab.scale,
    isDirty: tab.isDirty,
    encryptionSettings: tab.encryptionSettings ?? null,
  }
}
