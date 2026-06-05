export {}

declare global {
  interface Window {
    electronAPI: {
      openFileDialog: () => Promise<string | null>
      openMultipleFiles: () => Promise<string[]>
      openImageFile: () => Promise<string | null>
      saveFileDialog: (defaultPath: string) => Promise<string | null>
      chooseDirectory: () => Promise<string | null>

      readFileBytes: (filePath: string) => Promise<ArrayBuffer>
      getMimeType: (filePath: string) => Promise<string>

      writeFile: (filePath: string, bytes: ArrayBuffer) => Promise<void>
      writeBytesToDir: (
        dirPath: string,
        files: Array<{ name: string; bytes: ArrayBuffer }>
      ) => Promise<void>
    }
  }
}
