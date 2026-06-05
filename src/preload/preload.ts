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
})
