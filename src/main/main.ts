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
  const ext = path.extname(defaultPath).toLowerCase().slice(1) || 'pdf'
  const filterMap: Record<string, { name: string; extensions: string[] }> = {
    pdf:  { name: 'PDF Files',  extensions: ['pdf']  },
    txt:  { name: 'Text Files', extensions: ['txt']  },
    docx: { name: 'Word Files', extensions: ['docx'] },
    png:  { name: 'PNG Images', extensions: ['png']  },
    jpg:  { name: 'JPEG Images', extensions: ['jpg', 'jpeg'] },
  }
  const filters = [filterMap[ext] ?? { name: 'Files', extensions: [ext] }]
  const result = await dialog.showSaveDialog({ defaultPath, filters })
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

// ── Outline (Bookmarks) ───────────────────────────────────────────────────────

interface BookmarkItem { id: string; title: string; pageNum: number }

ipcMain.handle('mupdf:getOutline', async (_event, bytes: ArrayBuffer): Promise<BookmarkItem[]> => {
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function flatten(items: any[], out: BookmarkItem[]): void {
    if (!items) return
    for (const item of items) {
      out.push({
        id: Math.random().toString(36).slice(2),
        title: item.title ?? 'Untitled',
        pageNum: (item.page ?? 0) + 1,  // mupdf page is 0-indexed
      })
      if (item.down) flatten(item.down, out)
    }
  }
  const outline = doc.loadOutline()
  const result: BookmarkItem[] = []
  if (outline) flatten(outline, result)
  return result
})

ipcMain.handle('mupdf:writeOutline', async (
  _event,
  bytes: ArrayBuffer,
  bookmarks: BookmarkItem[]
): Promise<ArrayBuffer> => {
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')
  const iter = doc.outlineIterator()
  while (iter.item() !== null) iter.delete()
  for (const bm of bookmarks) {
    iter.insert({ title: bm.title, uri: `#page=${bm.pageNum}`, open: false })
  }
  const outBuf = doc.saveToBuffer('')
  return outBuf.asUint8Array().buffer
})

// ── Digital Signatures ────────────────────────────────────────────────────────

interface SignerInfo { name: string; reason: string; location: string; contactInfo: string }

interface SignatureVerifyResult {
  signerName: string; signerOrg: string; reason: string; location: string
  contactInfo: string; certValidFrom: string; certValidTo: string; certCurrentlyValid: boolean
}

ipcMain.handle('pdf:sign', async (
  _event,
  bytes: ArrayBuffer,
  pfxPath: string,
  pfxPassword: string,
  info: SignerInfo
): Promise<ArrayBuffer> => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PDFDocument } = require('pdf-lib')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { SignPdf } = require('@signpdf/signpdf')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { P12Signer } = require('@signpdf/signer-p12')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { pdflibAddPlaceholder } = require('@signpdf/placeholder-pdf-lib')

  const pfxBuffer = fs.readFileSync(pfxPath)
  const pdfDoc = await PDFDocument.load(new Uint8Array(bytes))
  await pdflibAddPlaceholder({
    pdfDoc,
    reason: info.reason || 'Approved',
    contactInfo: info.contactInfo || '',
    name: info.name || 'Signer',
    location: info.location || '',
  })
  const preparedPdf = Buffer.from(await pdfDoc.save({ useObjectStreams: false }))
  const signer = new P12Signer(pfxBuffer, { passphrase: pfxPassword })
  const signedPdf = await new SignPdf().sign(preparedPdf, signer)
  return signedPdf.buffer.slice(signedPdf.byteOffset, signedPdf.byteOffset + signedPdf.byteLength)
})

ipcMain.handle('pdf:verifySignatures', async (
  _event,
  bytes: ArrayBuffer
): Promise<SignatureVerifyResult[]> => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { extractSignature } = require('@signpdf/utils')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const forge = require('node-forge')

  const pdfBuf = Buffer.from(bytes)
  const results: SignatureVerifyResult[] = []
  try {
    const extracted = extractSignature(pdfBuf)
    if (!extracted?.signature) return results

    const sigBuf = Buffer.from(extracted.signature, 'binary')
    // Determine actual DER sequence length to strip null padding
    let derLen = sigBuf.length
    if (sigBuf[0] === 0x30) {
      let li = sigBuf[1], off = 2
      if (li & 0x80) { const n = li & 0x7f; li = 0; for (let i = 0; i < n; i++) li = (li << 8) | sigBuf[off++] }
      derLen = off + li
    }
    const p7 = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(sigBuf.slice(0, derLen).toString('binary')))
    for (const cert of (p7.certificates ?? [])) {
      const now = new Date()
      results.push({
        signerName:         cert.subject.getField('CN')?.value ?? 'Unknown',
        signerOrg:          cert.subject.getField('O')?.value  ?? '',
        reason:             '',
        location:           '',
        contactInfo:        '',
        certValidFrom:      cert.validity.notBefore.toISOString(),
        certValidTo:        cert.validity.notAfter.toISOString(),
        certCurrentlyValid: now >= cert.validity.notBefore && now <= cert.validity.notAfter,
      })
    }
  } catch { /* not signed or unrecognised format */ }
  return results
})

// ── DOCX Export ───────────────────────────────────────────────────────────────
// Approach: extract text via MuPDF page-by-page, build a Word document using the
// `docx` npm package. Layout, images, tables, and font matching are NOT preserved —
// this produces a readable text copy in DOCX format.

ipcMain.handle('export:toDocx', async (_event, bytes: ArrayBuffer, _fileName: string): Promise<ArrayBuffer> => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Document, Paragraph, TextRun, HeadingLevel, Packer } = require('docx')
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')
  const numPages = doc.countPages()

  const children: unknown[] = []

  for (let i = 0; i < numPages; i++) {
    const page = doc.loadPage(i)
    // extractText returns a plain-text string from the page
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rawText: string = ''
    try { rawText = page.toStructuredText('preserve-whitespace').asText() } catch {
      try { rawText = page.toStructuredText().asText() } catch { rawText = '' }
    }

    // Page separator heading
    children.push(new Paragraph({
      text: `Page ${i + 1}`,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 80 },
    }))

    // Split into lines and create paragraphs, skipping blank runs
    const lines = rawText.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      children.push(new Paragraph({
        children: [new TextRun({ text: trimmed, size: 22 })],
        spacing: { after: trimmed ? 80 : 20 },
      }))
    }
  }

  const wordDoc = new Document({
    sections: [{ properties: {}, children }],
    creator: 'Monstera PDF Editor',
  })

  const buf = await Packer.toBuffer(wordDoc)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
})
