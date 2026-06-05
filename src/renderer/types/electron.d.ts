export {}

declare global {
  interface Window {
    electronAPI: {
      openFileDialog: () => Promise<string | null>
      readFileBytes: (filePath: string) => Promise<ArrayBuffer>
    }
  }
}
