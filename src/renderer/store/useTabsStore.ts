import { create } from 'zustand'
import type { Annotation } from '../types/annotations'
import type { FormField } from '../types/forms'
import type { BookmarkItem } from '../types/bookmarks'

export interface PdfTab {
  id: string
  fileName: string
  filePath: string
  pdfBytes: Uint8Array
  annotations: Annotation[]
  formFields: FormField[]
  bookmarks: BookmarkItem[]
  isDirty: boolean
  currentPage: number
  scale: number
}

interface TabsStore {
  tabs: PdfTab[]
  activeTabId: string | null

  addTab: (tab: PdfTab) => void
  removeTab: (id: string) => void
  updateTab: (id: string, update: Partial<PdfTab>) => void
  setActiveTab: (id: string) => void
  getActiveTab: () => PdfTab | null
}

export const useTabsStore = create<TabsStore>((set, get) => ({
  tabs: [],
  activeTabId: null,

  addTab: (tab) => set(s => ({ tabs: [...s.tabs, tab], activeTabId: tab.id })),

  removeTab: (id) => set(s => {
    const remaining = s.tabs.filter(t => t.id !== id)
    const newActive = s.activeTabId === id
      ? (remaining.length > 0 ? remaining[remaining.length - 1].id : null)
      : s.activeTabId
    return { tabs: remaining, activeTabId: newActive }
  }),

  updateTab: (id, update) => set(s => ({
    tabs: s.tabs.map(t => t.id === id ? { ...t, ...update } : t)
  })),

  setActiveTab: (id) => set({ activeTabId: id }),

  getActiveTab: () => {
    const { tabs, activeTabId } = get()
    return tabs.find(t => t.id === activeTabId) ?? null
  },
}))
