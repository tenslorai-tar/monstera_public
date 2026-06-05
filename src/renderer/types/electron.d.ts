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

      mupdfGetMetadata: (bytes: ArrayBuffer) => Promise<{
        title: string; author: string; subject: string; keywords: string;
        creator: string; producer: string; needsPassword: boolean; encryption: string;
      }>
      mupdfSetMetadata: (bytes: ArrayBuffer, meta: Record<string, string>) => Promise<ArrayBuffer>
      mupdfEncrypt: (bytes: ArrayBuffer, opts: {
        userPassword: string; ownerPassword: string; permissions: number;
      }) => Promise<ArrayBuffer>
      mupdfRemovePassword: (bytes: ArrayBuffer, password: string) => Promise<ArrayBuffer>
      mupdfApplyRedactions: (bytes: ArrayBuffer, areas: Array<{
        pageNum: number; x1: number; y1: number; x2: number; y2: number;
      }>) => Promise<ArrayBuffer>

      mupdfGetOutline: (bytes: ArrayBuffer) => Promise<Array<{ id: string; title: string; pageNum: number }>>
      mupdfWriteOutline: (bytes: ArrayBuffer, bookmarks: Array<{ id: string; title: string; pageNum: number }>) => Promise<ArrayBuffer>

      pdfSign: (bytes: ArrayBuffer, pfxPath: string, pfxPassword: string, info: {
        name: string; reason: string; location: string; contactInfo: string;
      }) => Promise<ArrayBuffer>
      pdfVerifySignatures: (bytes: ArrayBuffer) => Promise<Array<{
        signerName: string; signerOrg: string; reason: string; location: string;
        contactInfo: string; certValidFrom: string; certValidTo: string; certCurrentlyValid: boolean;
      }>>

      exportToDocx: (bytes: ArrayBuffer, fileName: string) => Promise<ArrayBuffer>

      setWindowTitle: (title: string) => Promise<void>
      printWindow: () => Promise<void>
      onMenuAction: (callback: (action: string) => void) => void
      removeMenuActionListener: () => void
    }
  }
}
