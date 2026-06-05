import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Monstera PDF Editor',
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── File read ────────────────────────────────────────────────────────────────

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('dialog:openMultipleFiles', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
  })
  return result.canceled ? [] : result.filePaths
})

ipcMain.handle('dialog:openImageFile', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('file:readBytes', async (_event, filePath: string) => {
  const buffer = fs.readFileSync(filePath)
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
})

ipcMain.handle('file:getMimeType', async (_event, filePath: string) => {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  return 'application/octet-stream'
})

// ── File write ───────────────────────────────────────────────────────────────

ipcMain.handle('file:writeBytes', async (_event, filePath: string, bytes: ArrayBuffer) => {
  fs.writeFileSync(filePath, Buffer.from(bytes))
})

ipcMain.handle('dialog:saveFile', async (_event, defaultPath: string) => {
  const result = await dialog.showSaveDialog({
    defaultPath,
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
  })
  return result.canceled ? null : result.filePath
})

// For split: open a folder picker, then write N files automatically
ipcMain.handle('dialog:chooseDirectory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('file:writeBytesToDir', async (
  _event,
  dirPath: string,
  files: Array<{ name: string; bytes: ArrayBuffer }>
) => {
  for (const { name, bytes } of files) {
    fs.writeFileSync(path.join(dirPath, name), Buffer.from(bytes))
  }
})

// ── MuPDF operations ─────────────────────────────────────────────────────────
// Dynamic ESM import so the CJS main process can load the ESM mupdf module.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _esmImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _mupdf: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMupdf(): Promise<any> {
  if (!_mupdf) _mupdf = await _esmImport('mupdf')
  return _mupdf
}

ipcMain.handle('mupdf:getMetadata', async (_event, bytes: ArrayBuffer) => {
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')
  return {
    title:    doc.getMetaData('info:Title')    ?? '',
    author:   doc.getMetaData('info:Author')   ?? '',
    subject:  doc.getMetaData('info:Subject')  ?? '',
    keywords: doc.getMetaData('info:Keywords') ?? '',
    creator:  doc.getMetaData('info:Creator')  ?? '',
    producer: doc.getMetaData('info:Producer') ?? '',
    needsPassword: doc.needsPassword(),
    encryption: doc.getMetaData('encryption')  ?? '',
  }
})

ipcMain.handle('mupdf:setMetadata', async (_event, bytes: ArrayBuffer, meta: Record<string, string>) => {
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')
  if (meta.title    !== undefined) doc.setMetaData('info:Title',    meta.title)
  if (meta.author   !== undefined) doc.setMetaData('info:Author',   meta.author)
  if (meta.subject  !== undefined) doc.setMetaData('info:Subject',  meta.subject)
  if (meta.keywords !== undefined) doc.setMetaData('info:Keywords', meta.keywords)
  const buf = doc.saveToBuffer('')
  return buf.asUint8Array().buffer
})

interface EncryptOpts {
  userPassword: string
  ownerPassword: string
  permissions: number
}

ipcMain.handle('mupdf:encrypt', async (_event, bytes: ArrayBuffer, opts: EncryptOpts) => {
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')
  const optStr = [
    'encrypt=aes-256',
    `user-password=${opts.userPassword}`,
    `owner-password=${opts.ownerPassword}`,
    `permissions=${opts.permissions}`,
  ].join(',')
  const buf = doc.saveToBuffer(optStr)
  return buf.asUint8Array().buffer
})

ipcMain.handle('mupdf:removePassword', async (_event, bytes: ArrayBuffer, password: string) => {
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')
  if (doc.needsPassword()) {
    const result = doc.authenticatePassword(password)
    if (!result) throw new Error('Incorrect password')
  }
  const buf = doc.saveToBuffer('decrypt=yes')
  return buf.asUint8Array().buffer
})

interface RedactArea {
  pageNum: number
  x1: number; y1: number; x2: number; y2: number  // PDF pts
}

ipcMain.handle('mupdf:applyRedactions', async (_event, bytes: ArrayBuffer, areas: RedactArea[]) => {
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')

  // Group areas by page, create Redact annotations
  const pageNums = [...new Set(areas.map(a => a.pageNum))]
  for (const pageNum of pageNums) {
    const page = doc.loadPage(pageNum - 1)
    for (const a of areas.filter(r => r.pageNum === pageNum)) {
      const ann = page.createAnnotation('Redact')
      ann.setRect([
        Math.min(a.x1, a.x2), Math.min(a.y1, a.y2),
        Math.max(a.x1, a.x2), Math.max(a.y1, a.y2),
      ])
      ann.setColor([0, 0, 0])
      ann.update()
    }
    // applyRedactions(blackBoxes, imageHandling)
    page.applyRedactions(true, 0)
  }

  const buf = doc.saveToBuffer('')
  return buf.asUint8Array().buffer
})
