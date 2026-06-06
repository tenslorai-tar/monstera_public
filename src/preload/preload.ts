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

  // PDFium engine — true in-place text editing
  pdfiumStatus: (): Promise<{ available: boolean }> =>
    ipcRenderer.invoke('pdfium:status'),
  pdfiumRenderPage: (
    bytes: ArrayBuffer,
    pageIndex: number,
    scale: number,
  ): Promise<{ data: ArrayBuffer; width: number; height: number }> =>
    ipcRenderer.invoke('pdfium:renderPage', bytes, pageIndex, scale),
  pdfiumEnsureSession: (token: string, bytes: ArrayBuffer): Promise<boolean> =>
    ipcRenderer.invoke('pdfium:ensureSession', token, bytes),
  pdfiumCloseSession: (): Promise<void> =>
    ipcRenderer.invoke('pdfium:closeSession'),
  pdfiumRenderSession: (
    token: string,
    pageIndex: number,
    scale: number,
  ): Promise<{ stale: boolean; data?: ArrayBuffer; width?: number; height?: number }> =>
    ipcRenderer.invoke('pdfium:renderSession', token, pageIndex, scale),
  pdfiumTextInRegion: (
    bytes: ArrayBuffer,
    pageIndex: number,
    rect: { x1: number; y1: number; x2: number; y2: number },
  ): Promise<{ text: string; fontSize: number; found: boolean }> =>
    ipcRenderer.invoke('pdfium:textInRegion', bytes, pageIndex, rect),
  pdfiumTextObjectAt: (
    bytes: ArrayBuffer,
    pageIndex: number,
    x: number,
    y: number,
  ): Promise<{ found: boolean; text: string; fontSize: number; color: string; x1: number; y1: number; x2: number; y2: number; fontData: ArrayBuffer; fontLoadable: boolean }> =>
    ipcRenderer.invoke('pdfium:textObjectAt', bytes, pageIndex, x, y),
  pdfiumEditText: (
    bytes: ArrayBuffer,
    pageIndex: number,
    rect: { x1: number; y1: number; x2: number; y2: number },
    newText: string,
  ): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('pdfium:editText', bytes, pageIndex, rect, newText),

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

  pdfSignWithTsa: (bytes: ArrayBuffer, pfxPath: string, pfxPassword: string, info: {
    name: string; reason: string; location: string; contactInfo: string;
  }, tsaUrl: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('pdf:signWithTsa', bytes, pfxPath, pfxPassword, info, tsaUrl),

  pdfCertify: (bytes: ArrayBuffer, pfxPath: string, pfxPassword: string, info: {
    reason: string; permission: 1 | 2 | 3;
  }): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('pdf:certify', bytes, pfxPath, pfxPassword, info),

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

  // AI Assistant
  aiQuery: (
    apiKey: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    systemPrompt: string
  ): Promise<string> => ipcRenderer.invoke('ai:query', apiKey, messages, systemPrompt),

  // Office import
  importDocx: (bytes: ArrayBuffer): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('file:importDocx', bytes),

  importXlsx: (bytes: ArrayBuffer): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('file:importXlsx', bytes),

  // PDF → XLSX export
  exportToXlsx: (bytes: ArrayBuffer): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('export:toXlsx', bytes),

  // Multi-type file dialog
  openAnyFile: (filters: Array<{ name: string; extensions: string[] }>): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openAnyFile', filters),

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

  // ── Native binary management ─────────────────────────────────────────────────

  binsGetStatus: (): Promise<{
    mutool:      { path: string; available: boolean }
    ghostscript: { path: string; available: boolean }
    libreoffice: { path: string; available: boolean }
  }> => ipcRenderer.invoke('bins:getStatus'),

  binsOpenUrl: (url: string): Promise<void> =>
    ipcRenderer.invoke('bins:openUrl', url),

  binsDownloadMutool: (): Promise<string> =>
    ipcRenderer.invoke('bins:downloadMutool'),

  onBinsDownloadProgress: (cb: (data: { pct: number; mb?: string; status?: string }) => void): void => {
    ipcRenderer.on('bins:downloadProgress', (_e, data) => cb(data))
  },

  removeBinsDownloadListener: (): void => {
    ipcRenderer.removeAllListeners('bins:downloadProgress')
  },

  // ── Ghostscript operations ───────────────────────────────────────────────────

  gsToPdfa:      (bytes: ArrayBuffer, level: 1 | 2 | 3): Promise<ArrayBuffer> => ipcRenderer.invoke('gs:toPdfa', bytes, level),
  gsToPdfx:      (bytes: ArrayBuffer): Promise<ArrayBuffer>                    => ipcRenderer.invoke('gs:toPdfx', bytes),
  gsToGrayscale: (bytes: ArrayBuffer): Promise<ArrayBuffer>                    => ipcRenderer.invoke('gs:toGrayscale', bytes),
  gsToCmyk:      (bytes: ArrayBuffer): Promise<ArrayBuffer>                    => ipcRenderer.invoke('gs:toCmyk', bytes),
  gsOptimize:    (bytes: ArrayBuffer, preset: string): Promise<ArrayBuffer>    => ipcRenderer.invoke('gs:optimize', bytes, preset),
  gsLinearize:   (bytes: ArrayBuffer): Promise<ArrayBuffer>                    => ipcRenderer.invoke('gs:linearize', bytes),
  gsSanitize:    (bytes: ArrayBuffer): Promise<ArrayBuffer>                    => ipcRenderer.invoke('gs:sanitize', bytes),
  gsRasterize:   (bytes: ArrayBuffer, dpi: number): Promise<ArrayBuffer>       => ipcRenderer.invoke('gs:rasterize', bytes, dpi),

  // ── MuPDF mutool operations ──────────────────────────────────────────────────

  mutoolClean: (bytes: ArrayBuffer, opts: {
    repair?: boolean; garbage?: 0|1|2|3|4; compress?: boolean; linearize?: boolean; sanitize?: boolean
  }): Promise<ArrayBuffer> => ipcRenderer.invoke('mutool:clean', bytes, opts),

  mutoolInfo: (bytes: ArrayBuffer): Promise<string> =>
    ipcRenderer.invoke('mutool:info', bytes),

  mutoolExtractFiles: (bytes: ArrayBuffer): Promise<Array<{ name: string; size: number; dataBase64: string }>> =>
    ipcRenderer.invoke('mutool:extractFiles', bytes),

  // ── LibreOffice operations ───────────────────────────────────────────────────

  libreofficeIsAvailable: (): Promise<boolean> =>
    ipcRenderer.invoke('libreoffice:isAvailable'),

  libreofficeImportFile:  (filePath: string): Promise<ArrayBuffer>  => ipcRenderer.invoke('libreoffice:importFile', filePath),
  libreofficeImportBytes: (bytes: ArrayBuffer, ext: string): Promise<ArrayBuffer> => ipcRenderer.invoke('libreoffice:importBytes', bytes, ext),
  libreofficeExportDocx:  (bytes: ArrayBuffer): Promise<ArrayBuffer> => ipcRenderer.invoke('libreoffice:exportDocx', bytes),
  libreofficeExportPptx:  (bytes: ArrayBuffer): Promise<ArrayBuffer> => ipcRenderer.invoke('libreoffice:exportPptx', bytes),

  openOfficeFileDialog: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openOfficeFile'),

  importDocxSmart: (filePath: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('file:importDocxSmart', filePath),

  // ── Markdown / CSV → PDF ────────────────────────────────────────────────────

  convertMarkdownToPdf: (markdownText: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('convert:markdownToPdf', markdownText),

  convertCsvToPdf: (csvText: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('convert:csvToPdf', csvText),

  // ── Email document ─────────────────────────────────────────────────────────

  openEmail: (recipient: string, subject: string, body: string): Promise<void> =>
    ipcRenderer.invoke('shell:openEmail', recipient, subject, body),

  // ── External editing round-trip ────────────────────────────────────────────

  exportPageForEdit: (bytes: ArrayBuffer, pageNum: number): Promise<{ pngPath: string; width: number; height: number }> =>
    ipcRenderer.invoke('file:exportPageForEdit', bytes, pageNum),

  reimportEditedPage: (pngPath: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('file:reimportEditedPage', pngPath),
})
