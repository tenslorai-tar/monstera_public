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
