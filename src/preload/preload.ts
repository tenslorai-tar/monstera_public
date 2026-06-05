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
})
