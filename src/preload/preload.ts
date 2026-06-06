import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Open dialogs
  openFileDialog: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openFile'),
  openMultipleFiles: (): Promise<string[]> =>
    ipcRenderer.invoke('dialog:openMultipleFiles'),
  openImageFile: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openImageFile'),
  saveFileDialog: (defaultPath: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveFile', defaultPath),
  chooseDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:chooseDirectory'),

  // Read
  readFileBytes: (filePath: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('file:readBytes', filePath),
  getMimeType: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('file:getMimeType', filePath),

  // Write
  writeFile: (filePath: string, bytes: ArrayBuffer): Promise<void> =>
    ipcRenderer.invoke('file:writeBytes', filePath, bytes),
  writeBytesToDir: (
    dirPath: string,
    files: Array<{ name: string; bytes: ArrayBuffer }>
  ): Promise<void> =>
    ipcRenderer.invoke('file:writeBytesToDir', dirPath, files),

  // MuPDF operations
  mupdfGetMetadata: (bytes: ArrayBuffer): Promise<{
    title: string; author: string; subject: string; keywords: string;
    creator: string; producer: string; needsPassword: boolean; encryption: string;
  }> => ipcRenderer.invoke('mupdf:getMetadata', bytes),

  mupdfSetMetadata: (bytes: ArrayBuffer, meta: Record<string, string>): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('mupdf:setMetadata', bytes, meta),

  mupdfEncrypt: (bytes: ArrayBuffer, opts: {
    userPassword: string; ownerPassword: string; permissions: number;
  }): Promise<ArrayBuffer> => ipcRenderer.invoke('mupdf:encrypt', bytes, opts),

  mupdfRemovePassword: (bytes: ArrayBuffer, password: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('mupdf:removePassword', bytes, password),

  mupdfApplyRedactions: (bytes: ArrayBuffer, areas: Array<{
    pageNum: number; x1: number; y1: number; x2: number; y2: number;
  }>): Promise<ArrayBuffer> => ipcRenderer.invoke('mupdf:applyRedactions', bytes, areas),

  mupdfGetOutline: (bytes: ArrayBuffer): Promise<Array<{ id: string; title: string; pageNum: number }>> =>
    ipcRenderer.invoke('mupdf:getOutline', bytes),

  mupdfWriteOutline: (bytes: ArrayBuffer, bookmarks: Array<{ id: string; title: string; pageNum: number }>): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('mupdf:writeOutline', bytes, bookmarks),

  pdfSign: (bytes: ArrayBuffer, pfxPath: string, pfxPassword: string, info: {
    name: string; reason: string; location: string; contactInfo: string;
  }): Promise<ArrayBuffer> => ipcRenderer.invoke('pdf:sign', bytes, pfxPath, pfxPassword, info),

  pdfVerifySignatures: (bytes: ArrayBuffer): Promise<Array<{
    signerName: string; signerOrg: string; reason: string; location: string;
    contactInfo: string; certValidFrom: string; certValidTo: string; certCurrentlyValid: boolean;
  }>> => ipcRenderer.invoke('pdf:verifySignatures', bytes),

  exportToDocx: (bytes: ArrayBuffer, fileName: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('export:toDocx', bytes, fileName),

  formsIdentify: (bytes: ArrayBuffer): Promise<Array<{
    pageNum: number; label: string; rect: [number, number, number, number]; fieldType: 'text' | 'checkbox' | 'date';
  }>> => ipcRenderer.invoke('forms:identify', bytes),

  mupdfExtractAllText: (bytes: ArrayBuffer): Promise<Array<{ pageNum: number; text: string }>> =>
    ipcRenderer.invoke('mupdf:extractAllText', bytes),

  mupdfCheckAccessibility: (bytes: ArrayBuffer): Promise<Array<{
    issue: string; severity: 'error' | 'warning' | 'info'; page?: number;
  }>> => ipcRenderer.invoke('mupdf:checkAccessibility', bytes),

  mupdfGenerateBookmarks: (bytes: ArrayBuffer): Promise<Array<{
    title: string; pageNum: number; level: number;
  }>> => ipcRenderer.invoke('mupdf:generateBookmarks', bytes),

  mupdfOptimize: (bytes: ArrayBuffer): Promise<{ bytes: ArrayBuffer; origSize: number; newSize: number }> =>
    ipcRenderer.invoke('mupdf:optimize', bytes),

  openFromUrl: (url: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('file:openFromUrl', url),

  mupdfFindTextRects: (bytes: ArrayBuffer, term: string): Promise<Array<{ pageNum: number; x1: number; y1: number; x2: number; y2: number }>> =>
    ipcRenderer.invoke('mupdf:findTextRects', bytes, term),

  setWindowTitle: (title: string): Promise<void> =>
    ipcRenderer.invoke('window:setTitle', title),

  printWindow: (): Promise<void> =>
    ipcRenderer.invoke('window:print'),

  onMenuAction: (callback: (action: string) => void): void => {
    ipcRenderer.on('menu:action', (_event, action: string) => callback(action))
  },

  removeMenuActionListener: (): void => {
    ipcRenderer.removeAllListeners('menu:action')
  },
})
