import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import path from 'path'
import fs from 'fs'

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWin: BrowserWindow | null = null

function buildAppMenu(win: BrowserWindow): Menu {
  const send = (action: string) => () => {
    if (!win.isDestroyed()) win.webContents.send('menu:action', action)
  }
  return Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'Open…',               accelerator: 'CmdOrCtrl+O',       click: send('open') },
        { type: 'separator' },
        { label: 'Close Document',       accelerator: 'CmdOrCtrl+W',       click: send('close') },
        { label: 'Save',                 accelerator: 'CmdOrCtrl+S',        click: send('save') },
        { label: 'Save As…',             accelerator: 'CmdOrCtrl+Shift+S', click: send('saveAs') },
        { type: 'separator' },
        { label: 'Document Properties…', click: send('metadata') },
        { label: 'Document Security…',   click: send('security') },
        { type: 'separator' },
        { label: 'Print…',               accelerator: 'CmdOrCtrl+P',       click: send('print') },
        { type: 'separator' },
        { label: 'Exit', role: 'quit' as const },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo',       accelerator: 'CmdOrCtrl+Z',       click: send('undo') },
        { label: 'Redo',       accelerator: 'CmdOrCtrl+Y',       click: send('redo') },
        { type: 'separator' },
        { label: 'Cut',        role: 'cut'       as const },
        { label: 'Copy',       role: 'copy'      as const },
        { label: 'Paste',      role: 'paste'     as const },
        { label: 'Select All', role: 'selectAll' as const },
        { type: 'separator' },
        { label: 'Find…',                accelerator: 'CmdOrCtrl+F', click: send('find') },
        { label: 'Find & Replace…',      accelerator: 'CmdOrCtrl+H', click: send('findReplace') },
        { type: 'separator' },
        { label: 'Preferences…',         accelerator: 'CmdOrCtrl+,', click: send('settings') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Zoom In',         accelerator: 'CmdOrCtrl+=',        click: send('zoomIn') },
        { label: 'Zoom Out',        accelerator: 'CmdOrCtrl+-',        click: send('zoomOut') },
        { label: 'Fit Page',        accelerator: 'CmdOrCtrl+0',        click: send('fitPage') },
        { label: 'Fit Width',       accelerator: 'CmdOrCtrl+Shift+W', click: send('fitWidth') },
        { label: 'Actual Size (100%)',                                  click: send('zoom100') },
        { type: 'separator' },
        { label: 'Thumbnail Sidebar',  accelerator: 'F4', click: send('toggleSidebar') },
        { label: 'Bookmarks Panel',    accelerator: 'F5', click: send('toggleBookmarks') },
        { label: 'Annotations Panel',  accelerator: 'F6', click: send('toggleAnnotationsPanel') },
        { label: 'Forms Panel',        accelerator: 'F7', click: send('toggleFormsPanel') },
        { label: 'Links Panel',        accelerator: 'F8', click: send('toggleLinksPanel') },
        { label: 'Layers Panel',       click: send('toggleLayersPanel') },
        { label: 'Named Destinations', click: send('toggleNamedDestsPanel') },
        { type: 'separator' },
        { label: 'Full Screen',        accelerator: 'F11', click: () => { win.setFullScreen(!win.isFullScreen()) } },
        { type: 'separator' },
        { label: 'Toggle Dark / Light Theme', click: send('toggleTheme') },
      ],
    },
    {
      label: 'Comment',
      submenu: [
        { label: 'Select Annotations',  click: send('tool:select') },
        { label: 'Erase Annotation',    click: send('tool:eraser') },
        { type: 'separator' },
        { label: 'Highlight Text',      click: send('tool:highlight') },
        { label: 'Underline Text',      click: send('tool:underline') },
        { label: 'Strikethrough Text',  click: send('tool:strikethrough') },
        { type: 'separator' },
        { label: 'Typewriter',          click: send('tool:typewriter') },
        { label: 'Text Box',            click: send('tool:textbox') },
        { label: 'Sticky Note',         click: send('tool:stickynote') },
        { type: 'separator' },
        { label: 'Rectangle',           click: send('tool:rectangle') },
        { label: 'Ellipse',             click: send('tool:ellipse') },
        { label: 'Line',                click: send('tool:line') },
        { label: 'Arrow',               click: send('tool:arrow') },
        { label: 'Freehand Drawing',    click: send('tool:ink') },
        { type: 'separator' },
        { label: 'Stamp',               click: send('tool:stamp') },
        { type: 'separator' },
        { label: 'Mark for Redaction',  click: send('tool:redact') },
        { label: 'Apply All Redactions', click: send('applyRedactions') },
        { type: 'separator' },
        { label: 'Annotations Panel',   click: send('toggleAnnotationsPanel') },
      ],
    },
    {
      label: 'Organize',
      submenu: [
        {
          label: 'Insert Pages',
          submenu: [
            { label: 'Blank Page Before Current', click: send('insertBlankBefore') },
            { label: 'Blank Page After Current',  click: send('insertBlankAfter') },
            { label: 'From PDF File…',            click: send('insertFromPdf') },
            { label: 'From Image…',               click: send('insertFromImage') },
          ],
        },
        { label: 'Delete Selected Pages',    click: send('deletePages') },
        { label: 'Extract Selected Pages',   click: send('extractPages') },
        { label: 'Duplicate Selected Pages', click: send('duplicatePages') },
        { type: 'separator' },
        {
          label: 'Rotate Pages',
          submenu: [
            { label: 'Clockwise 90°',          click: send('rotateCW') },
            { label: 'Counter-Clockwise 90°',  click: send('rotateCCW') },
            { label: '180°',                   click: send('rotate180') },
          ],
        },
        { type: 'separator' },
        { label: 'Merge Documents…',  click: send('merge') },
        { label: 'Split Document…',   click: send('split') },
        { type: 'separator' },
        { label: 'Reverse Page Order', click: send('reverseOrder') },
        { type: 'separator' },
        {
          label: 'Page Design',
          submenu: [
            { label: 'Headers & Footers…', click: send('headerFooter') },
            { label: 'Watermark…',          click: send('watermark') },
            { label: 'Page Background…',    click: send('background') },
            { label: 'Bates Numbering…',    click: send('batesNumbers') },
            { label: 'Crop Page…',          click: send('cropPages') },
          ],
        },
      ],
    },
    {
      label: 'Forms',
      submenu: [
        { label: 'Toggle Form Editing Mode', click: send('toggleFormMode') },
        { type: 'separator' },
        { label: 'Text Field',      click: send('formTool:form-text') },
        { label: 'Checkbox',        click: send('formTool:form-checkbox') },
        { label: 'Signature Field', click: send('formTool:form-signature') },
        { type: 'separator' },
        { label: 'Flatten Form Fields', click: send('flattenForm') },
        { label: 'Reset Form',          click: send('resetForm') },
        { type: 'separator' },
        { label: 'Form Fields Panel',   click: send('toggleFormsPanel') },
      ],
    },
    {
      label: 'Tools',
      submenu: [
        { label: 'Document Properties…', click: send('metadata') },
        { label: 'Document Security…',   click: send('security') },
        { type: 'separator' },
        {
          label: 'Digital Signatures',
          submenu: [
            { label: 'Sign Document…',     click: send('digitalSign') },
            { label: 'Verify Signatures…', click: send('digitalSign') },
          ],
        },
        { type: 'separator' },
        { label: 'Run OCR…',   click: send('ocr') },
        { label: 'Export…',    click: send('export') },
        { type: 'separator' },
        { label: 'Preferences…', accelerator: 'CmdOrCtrl+,', click: send('settings') },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Keyboard Shortcuts', accelerator: 'F1', click: send('shortcuts') },
        { type: 'separator' },
        {
          label: 'About Monstera PDF Editor',
          click: () => {
            dialog.showMessageBox(win, {
              type: 'info',
              title: 'About Monstera PDF Editor',
              message: 'Monstera PDF Editor',
              detail: 'Version 1.0.0\n\nA professional-grade PDF editing solution.\n\nBuilt with Electron, React, PDF.js, pdf-lib, and MuPDF WASM.\n\nDesigned for professionals who demand precision.',
              buttons: ['OK'],
            })
          },
        },
      ],
    },
  ])
}

function createWindow(): void {
  mainWin = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Monstera PDF Editor',
    backgroundColor: '#1e1e1e',
    icon: path.join(__dirname, '../../assets/icons/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    mainWin.loadURL('http://localhost:5173')
    // mainWin.webContents.openDevTools()   // uncomment to debug renderer
  } else {
    mainWin.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  mainWin.on('closed', () => { mainWin = null })

  Menu.setApplicationMenu(buildAppMenu(mainWin))
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

// ── Window title ──────────────────────────────────────────────────────────────
ipcMain.handle('window:setTitle', (_event, title: string) => {
  mainWin?.setTitle(title)
})

// ── Print ─────────────────────────────────────────────────────────────────────
ipcMain.handle('window:print', () => {
  if (!mainWin) return
  mainWin.webContents.print({ silent: false, printBackground: true }, () => {})
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

// ── Identify Forms (heuristic detection) ──────────────────────────────────────

interface IdentifiedField {
  pageNum: number
  label: string
  rect: [number, number, number, number]   // PDF pts [x1, y_bot, x2, y_top]
  fieldType: 'text' | 'checkbox' | 'date'
}

ipcMain.handle('forms:identify', async (_event, bytes: ArrayBuffer): Promise<IdentifiedField[]> => {
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')
  const numPages = doc.countPages()
  const fields: IdentifiedField[] = []

  for (let pi = 0; pi < numPages; pi++) {
    const page = doc.loadPage(pi)
    let stext: string = ''
    try {
      stext = page.toStructuredText('preserve-whitespace,preserve-ligatures').asJSON()
    } catch {
      try { stext = page.toStructuredText().asJSON() } catch { continue }
    }

    let parsed: {blocks?: Array<{lines?: Array<{spans?: Array<{text: string; bbox: number[]}>}>}>}
    try { parsed = JSON.parse(stext) } catch { continue }

    const pageObj = doc.loadPage(pi)
    const bounds = pageObj.getBounds()
    const pageH = bounds[3] - bounds[1]

    for (const block of (parsed.blocks ?? [])) {
      for (const line of (block.lines ?? [])) {
        for (const span of (line.spans ?? [])) {
          const text = span.text.trim()
          const [, by1, bx2, by2] = span.bbox

          // Detect form labels: text ending with ":" or "_____" style underlines
          const isLabel = /[A-Za-z\s]{2,}[:\s]*$/.test(text) && text.length < 40
          const hasUnderline = text.includes('___') || text.includes('...')
          const isCheckboxLabel = /\b(check|yes|no|agree|select)\b/i.test(text)
          const isDateLabel = /\b(date|dob|birthday|expir)/i.test(text)

          if (isLabel || hasUnderline) {
            // Place a field to the right of or below the label
            const labelRight = bx2
            const fieldX1 = labelRight + 4
            const fieldX2 = Math.min(fieldX1 + 150, 590)
            const fieldY1 = pageH - by2   // convert to PDF coords (y=0 at bottom)
            const fieldY2 = pageH - by1
            if (fieldX2 <= fieldX1 || fieldY2 <= fieldY1) continue

            fields.push({
              pageNum: pi + 1,
              label: text.replace(/[:\s_\.]+$/, ''),
              rect: [fieldX1, fieldY1, fieldX2, fieldY2],
              fieldType: isDateLabel ? 'date' : isCheckboxLabel ? 'checkbox' : 'text',
            })
          }
        }
      }
    }
  }

  return fields
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

// ── Extract all text (for compare, translate, word count) ─────────────────────

ipcMain.handle('mupdf:extractAllText', async (_event, bytes: ArrayBuffer): Promise<Array<{ pageNum: number; text: string }>> => {
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')
  const numPages = doc.countPages()
  const pages: Array<{ pageNum: number; text: string }> = []
  for (let i = 0; i < numPages; i++) {
    const page = doc.loadPage(i)
    let text = ''
    try { text = page.toStructuredText('preserve-whitespace').asText() } catch {
      try { text = page.toStructuredText().asText() } catch {}
    }
    pages.push({ pageNum: i + 1, text })
  }
  return pages
})

// ── Accessibility checker ─────────────────────────────────────────────────────

interface AccessibilityIssue { issue: string; severity: 'error' | 'warning' | 'info'; page?: number }

ipcMain.handle('mupdf:checkAccessibility', async (_event, bytes: ArrayBuffer): Promise<AccessibilityIssue[]> => {
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')
  const issues: AccessibilityIssue[] = []

  // Check document-level metadata
  const title = doc.getMetaData('info:Title') ?? ''
  if (!title.trim()) issues.push({ issue: 'Document has no title. Screen readers need a title.', severity: 'error' })

  const lang = doc.getMetaData('info:Lang') ?? ''
  if (!lang.trim()) issues.push({ issue: 'No document language set (PDF /Lang entry missing).', severity: 'warning' })

  // Check for tags (StructTreeRoot)
  const numPages = doc.countPages()
  let hasImages = false, totalChars = 0
  for (let i = 0; i < numPages; i++) {
    const page = doc.loadPage(i)
    let pageText = ''
    try { pageText = page.toStructuredText().asText() } catch {}
    totalChars += pageText.length

    // Check for very low text: likely image-only page
    if (pageText.trim().length < 10) {
      hasImages = true
      issues.push({ issue: `Page ${i + 1} appears to be image-only (no selectable text). Consider running OCR.`, severity: 'warning', page: i + 1 })
    }
  }

  if (totalChars < 50 && numPages > 0) {
    issues.push({ issue: 'Document appears to have little or no text content — may be a scanned document.', severity: 'error' })
  }
  if (!hasImages && numPages > 0) {
    issues.push({ issue: 'Document has text content on all pages.', severity: 'info' })
  }

  // Check for bookmarks (good for navigation)
  const outline = doc.loadOutline()
  if (!outline || (Array.isArray(outline) && outline.length === 0)) {
    if (numPages > 5) issues.push({ issue: 'No bookmarks/outline found. Bookmarks help users navigate long documents.', severity: 'warning' })
  } else {
    issues.push({ issue: `Document has ${Array.isArray(outline) ? outline.length : 0} bookmarks.`, severity: 'info' })
  }

  if (issues.length === 0) issues.push({ issue: 'No accessibility issues found.', severity: 'info' })
  return issues
})

// ── Generate bookmarks from headings ─────────────────────────────────────────

ipcMain.handle('mupdf:generateBookmarks', async (_event, bytes: ArrayBuffer): Promise<Array<{ title: string; pageNum: number; level: number }>> => {
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')
  const numPages = doc.countPages()
  const suggestions: Array<{ title: string; pageNum: number; level: number }> = []

  for (let i = 0; i < numPages; i++) {
    const page = doc.loadPage(i)
    let stext = ''
    try { stext = page.toStructuredText('preserve-whitespace').asJSON() } catch {
      try { stext = page.toStructuredText().asJSON() } catch { continue }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any
    try { parsed = JSON.parse(stext) } catch { continue }

    // Find large text blocks that look like headings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const block of (parsed.blocks ?? []) as any[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const line of (block.lines ?? []) as any[]) {
        let lineText = ''
        let maxFontSize = 0
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const span of (line.spans ?? []) as any[]) {
          lineText += span.text ?? ''
          if ((span.size ?? 0) > maxFontSize) maxFontSize = span.size ?? 0
        }
        lineText = lineText.trim()
        if (!lineText || lineText.length > 80) continue

        // Heuristic: font size > 14pt → potential heading
        if (maxFontSize >= 16) {
          suggestions.push({ title: lineText, pageNum: i + 1, level: maxFontSize >= 20 ? 1 : 2 })
        } else if (maxFontSize >= 13) {
          suggestions.push({ title: lineText, pageNum: i + 1, level: 3 })
        }
      }
    }
  }

  // Deduplicate consecutive same-page same-title entries
  const seen = new Set<string>()
  return suggestions.filter(s => {
    const k = `${s.pageNum}:${s.title}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  }).slice(0, 200)  // cap at 200 suggestions
})

// ── PDF optimization ──────────────────────────────────────────────────────────

ipcMain.handle('mupdf:optimize', async (
  _event,
  bytes: ArrayBuffer
): Promise<{ bytes: ArrayBuffer; origSize: number; newSize: number }> => {
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')
  const buf = doc.saveToBuffer('garbage=compact,compress=yes,compress-images=yes')
  const result = buf.asUint8Array()
  const out = result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength)
  return { bytes: out, origSize: bytes.byteLength, newSize: result.byteLength }
})

// ── Open PDF from URL ─────────────────────────────────────────────────────────

ipcMain.handle('file:openFromUrl', async (_event, url: string): Promise<ArrayBuffer> => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const https = require('https')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const http = require('http')
  const urlObj = new URL(url)
  const client = urlObj.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req = client.get(url, { headers: { 'User-Agent': 'Monstera PDF Editor/1.0' } }, (res: any) => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return }
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
      })
      res.on('error', reject)
    })
    req.on('error', reject)
  })
})

// ── Find text rectangles (for Find & Redact) ──────────────────────────────────

ipcMain.handle('mupdf:findTextRects', async (
  _event,
  bytes: ArrayBuffer,
  term: string
): Promise<Array<{ pageNum: number; x1: number; y1: number; x2: number; y2: number }>> => {
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')
  const numPages = doc.countPages()
  const results: Array<{ pageNum: number; x1: number; y1: number; x2: number; y2: number }> = []

  for (let i = 0; i < numPages; i++) {
    const page = doc.loadPage(i)
    const bounds = page.getBounds()
    const pageH = bounds[3] - bounds[1]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let hits: any[]
    try { hits = page.search(term) } catch { continue }
    if (!hits || hits.length === 0) continue

    for (const quad of hits) {
      let sx0: number, sy0: number, sx1: number, sy1: number
      if (Array.isArray(quad) && Array.isArray(quad[0])) {
        const xs = (quad as number[][]).map((p) => p[0])
        const ys = (quad as number[][]).map((p) => p[1])
        sx0 = Math.min(...xs); sy0 = Math.min(...ys)
        sx1 = Math.max(...xs); sy1 = Math.max(...ys)
      } else if (Array.isArray(quad) && typeof quad[0] === 'number') {
        const q = quad as number[]
        sx0 = Math.min(q[0], q[2], q[4], q[6])
        sy0 = Math.min(q[1], q[3], q[5], q[7])
        sx1 = Math.max(q[0], q[2], q[4], q[6])
        sy1 = Math.max(q[1], q[3], q[5], q[7])
      } else { continue }
      results.push({
        pageNum: i + 1,
        x1: sx0, y1: pageH - sy1,
        x2: sx1, y2: pageH - sy0,
      })
    }
  }
  return results
})
