import { PDFDocument, degrees as libDegrees } from 'pdf-lib'
import type { PDFDocument as PDFDocumentType } from 'pdf-lib'

function copyMeta(src: PDFDocumentType, dst: PDFDocumentType): void {
  const t = src.getTitle(); if (t) dst.setTitle(t)
  const a = src.getAuthor(); if (a) dst.setAuthor(a)
  const s = src.getSubject(); if (s) dst.setSubject(s)
  const k = src.getKeywords(); if (k) dst.setKeywords(k.split(',').map(s => s.trim()))
  const c = src.getCreator(); if (c) dst.setCreator(c)
  const d = src.getCreationDate(); if (d) dst.setCreationDate(d)
  dst.setModificationDate(new Date())
}

export async function deletePages(bytes: Uint8Array, pageNums: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes)
  // Remove in descending order so indices stay valid
  const sorted = [...new Set(pageNums)].sort((a, b) => b - a)
  for (const n of sorted) doc.removePage(n - 1)
  return doc.save()
}

export async function rotatePages(bytes: Uint8Array, pageNums: number[], deg: number): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes)
  for (const n of pageNums) {
    const page = doc.getPage(n - 1)
    page.setRotation(libDegrees((page.getRotation().angle + deg + 360) % 360))
  }
  return doc.save()
}

export async function reorderPage(bytes: Uint8Array, fromIndex: number, toIndex: number): Promise<Uint8Array> {
  if (fromIndex === toIndex) return bytes
  const doc = await PDFDocument.load(bytes)
  const count = doc.getPageCount()
  const order = Array.from({ length: count }, (_, i) => i)
  const [moved] = order.splice(fromIndex, 1)
  order.splice(toIndex, 0, moved)
  const newDoc = await PDFDocument.create()
  copyMeta(doc, newDoc)
  const pages = await newDoc.copyPages(doc, order)
  pages.forEach(p => newDoc.addPage(p))
  return newDoc.save()
}

export async function duplicatePage(bytes: Uint8Array, pageNum: number): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes)
  const [copy] = await doc.copyPages(doc, [pageNum - 1])
  doc.insertPage(pageNum, copy)
  return doc.save()
}

export async function reversePages(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes)
  const count = doc.getPageCount()
  const order = Array.from({ length: count }, (_, i) => count - 1 - i)
  const newDoc = await PDFDocument.create()
  copyMeta(doc, newDoc)
  const pages = await newDoc.copyPages(doc, order)
  pages.forEach(p => newDoc.addPage(p))
  return newDoc.save()
}

// afterPageNum = 0 means insert before page 1
export async function insertBlankPage(bytes: Uint8Array, afterPageNum: number): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes)
  const refIdx = Math.max(0, Math.min(afterPageNum, doc.getPageCount()) - 1)
  const ref = doc.getPage(refIdx)
  const { width, height } = ref.getSize()
  doc.insertPage(afterPageNum, [width, height])
  return doc.save()
}

export async function insertPdfPages(
  destBytes: Uint8Array,
  srcBytes: Uint8Array,
  afterPageNum: number
): Promise<Uint8Array> {
  const destDoc = await PDFDocument.load(destBytes)
  const srcDoc = await PDFDocument.load(srcBytes)
  const indices = Array.from({ length: srcDoc.getPageCount() }, (_, i) => i)
  const copied = await destDoc.copyPages(srcDoc, indices)
  for (let i = 0; i < copied.length; i++) {
    destDoc.insertPage(afterPageNum + i, copied[i])
  }
  return destDoc.save()
}

export async function insertImagePage(
  destBytes: Uint8Array,
  imageBytes: Uint8Array,
  mimeType: string,
  afterPageNum: number
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(destBytes)
  const image = mimeType === 'image/png'
    ? await doc.embedPng(imageBytes)
    : await doc.embedJpg(imageBytes)
  const page = doc.insertPage(afterPageNum, [image.width, image.height])
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
  return doc.save()
}

export async function extractPages(srcBytes: Uint8Array, pageNums: number[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(srcBytes)
  const dst = await PDFDocument.create()
  copyMeta(src, dst)
  const pages = await dst.copyPages(src, pageNums.map(n => n - 1))
  pages.forEach(p => dst.addPage(p))
  return dst.save()
}

export async function mergePdfs(bytesArr: Uint8Array[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create()
  if (bytesArr[0]) {
    const first = await PDFDocument.load(bytesArr[0])
    copyMeta(first, merged)
  }
  for (const bytes of bytesArr) {
    const src = await PDFDocument.load(bytes)
    const indices = Array.from({ length: src.getPageCount() }, (_, i) => i)
    const pages = await merged.copyPages(src, indices)
    pages.forEach(p => merged.addPage(p))
  }
  return merged.save()
}

// Parse "1-3, 4, 5-7" into [[1,2,3],[4],[5,6,7]]
export function parsePageRanges(input: string, numPages: number): number[][] | null {
  const parts = input.split(',').map(s => s.trim()).filter(Boolean)
  const ranges: number[][] = []
  for (const part of parts) {
    const dash = part.indexOf('-')
    if (dash === -1) {
      const n = parseInt(part, 10)
      if (isNaN(n) || n < 1 || n > numPages) return null
      ranges.push([n])
    } else {
      const start = parseInt(part.slice(0, dash), 10)
      const end = parseInt(part.slice(dash + 1), 10)
      if (isNaN(start) || isNaN(end) || start < 1 || end > numPages || start > end) return null
      ranges.push(Array.from({ length: end - start + 1 }, (_, i) => start + i))
    }
  }
  return ranges.length > 0 ? ranges : null
}

export async function splitByRanges(srcBytes: Uint8Array, ranges: number[][]): Promise<Uint8Array[]> {
  const src = await PDFDocument.load(srcBytes)
  const results: Uint8Array[] = []
  for (const range of ranges) {
    const dst = await PDFDocument.create()
    copyMeta(src, dst)
    const pages = await dst.copyPages(src, range.map(n => n - 1))
    pages.forEach(p => dst.addPage(p))
    results.push(await dst.save())
  }
  return results
}

export async function splitOnePerPage(srcBytes: Uint8Array): Promise<Uint8Array[]> {
  const src = await PDFDocument.load(srcBytes)
  const count = src.getPageCount()
  const results: Uint8Array[] = []
  for (let i = 0; i < count; i++) {
    const dst = await PDFDocument.create()
    copyMeta(src, dst)
    const [page] = await dst.copyPages(src, [i])
    dst.addPage(page)
    results.push(await dst.save())
  }
  return results
}
