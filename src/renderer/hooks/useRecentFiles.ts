import { useState, useCallback } from 'react'

export interface RecentFile {
  filePath: string
  fileName: string
  lastOpened: number
}

const STORAGE_KEY = 'monstera-recent-files'
const MAX_RECENT = 10

function readRecent(): RecentFile[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as RecentFile[]
  } catch {
    return []
  }
}

function writeRecent(files: RecentFile[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(files))
}

export function useRecentFiles() {
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(readRecent)

  const addRecentFile = useCallback((filePath: string, fileName: string) => {
    setRecentFiles(prev => {
      const filtered = prev.filter(f => f.filePath !== filePath)
      const updated = [{ filePath, fileName, lastOpened: Date.now() }, ...filtered].slice(0, MAX_RECENT)
      writeRecent(updated)
      return updated
    })
  }, [])

  const removeRecentFile = useCallback((filePath: string) => {
    setRecentFiles(prev => {
      const updated = prev.filter(f => f.filePath !== filePath)
      writeRecent(updated)
      return updated
    })
  }, [])

  return { recentFiles, addRecentFile, removeRecentFile }
}
