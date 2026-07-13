import { useCallback } from 'react'
import { usePdfStore } from '../store/usePdfStore'
import { toast } from '../store/useToastStore'
import { logger } from '../utils/logger'
import * as pdfEdits from '../utils/pdfEdits'

// Wrap a void-returning page op so a failure surfaces as a toast + log instead of
// an unhandled promise rejection with no user feedback (every op here previously
// ran with zero error handling).
function guard<A extends unknown[]>(label: string, fn: (...args: A) => Promise<void>) {
  return async (...args: A): Promise<void> => {
    try { await fn(...args) }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.error(`${label} failed:`, e)
      toast.error(`${label} failed: ${msg}`)
    }
  }
}

export function usePdfOperations() {
  const numPages = usePdfStore(s => s.numPages)
  const fileName = usePdfStore(s => s.fileName)
  const applyEdit = usePdfStore(s => s.applyEdit)
  const getBakedBytes = usePdfStore(s => s.getBakedBytes)

  const requireBytes = async (): Promise<Uint8Array> => getBakedBytes()

  const deletePages = useCallback(async (pageNums: number[]) => {
    if (pageNums.length === numPages) return  // can't delete all pages
    applyEdit(await pdfEdits.deletePages(await requireBytes(), pageNums))
  }, [numPages, applyEdit, getBakedBytes])

  const rotatePages = useCallback(async (pageNums: number[], deg: 90 | 180 | 270) => {
    applyEdit(await pdfEdits.rotatePages(await requireBytes(), pageNums, deg))
  }, [applyEdit, getBakedBytes])

  const reorderPage = useCallback(async (fromIndex: number, toIndex: number) => {
    applyEdit(await pdfEdits.reorderPage(await requireBytes(), fromIndex, toIndex))
  }, [applyEdit, getBakedBytes])

  const duplicatePage = useCallback(async (pageNum: number) => {
    applyEdit(await pdfEdits.duplicatePage(await requireBytes(), pageNum))
  }, [applyEdit, getBakedBytes])

  const insertBlankPage = useCallback(async (afterPageNum: number) => {
    applyEdit(await pdfEdits.insertBlankPage(await requireBytes(), afterPageNum))
  }, [applyEdit, getBakedBytes])

  const insertFromPdf = useCallback(async (afterPageNum: number) => {
    const path = await window.electronAPI.openFileDialog()
    if (!path) return
    const srcBuf = await window.electronAPI.readFileBytes(path)
    applyEdit(await pdfEdits.insertPdfPages(await requireBytes(), new Uint8Array(srcBuf), afterPageNum))
  }, [applyEdit, getBakedBytes])

  const insertFromImage = useCallback(async (afterPageNum: number) => {
    const path = await window.electronAPI.openImageFile()
    if (!path) return
    const [imgBuf, mime] = await Promise.all([
      window.electronAPI.readFileBytes(path),
      window.electronAPI.getMimeType(path),
    ])
    applyEdit(await pdfEdits.insertImagePage(await requireBytes(), new Uint8Array(imgBuf), mime, afterPageNum))
  }, [applyEdit, getBakedBytes])

  const extractPages = useCallback(async (pageNums: number[]) => {
    const bytes = await requireBytes()
    const stem = fileName.replace(/\.pdf$/i, '')
    const defaultName = `${stem}_pages${pageNums.join('-')}.pdf`
    const savePath = await window.electronAPI.saveFileDialog(defaultName)
    if (!savePath) return
    const out = await pdfEdits.extractPages(bytes, pageNums)
    await window.electronAPI.writeFile(savePath, out.slice(0).buffer)
  }, [fileName, getBakedBytes])

  const mergePdfs = useCallback(async () => {
    const paths = await window.electronAPI.openMultipleFiles()
    if (paths.length === 0) return
    const others = await Promise.all(paths.map(p =>
      window.electronAPI.readFileBytes(p).then(b => new Uint8Array(b))
    ))
    applyEdit(await pdfEdits.mergePdfs([await requireBytes(), ...others]))
  }, [applyEdit, getBakedBytes])

  const splitByRanges = useCallback(async (ranges: number[][]) => {
    const bytes = await requireBytes()
    const stem = fileName.replace(/\.pdf$/i, '')
    if (ranges.length === 1) {
      const savePath = await window.electronAPI.saveFileDialog(`${stem}_split.pdf`)
      if (!savePath) return
      const [out] = await pdfEdits.splitByRanges(bytes, ranges)
      await window.electronAPI.writeFile(savePath, out.slice(0).buffer)
      return
    }
    const dir = await window.electronAPI.chooseDirectory()
    if (!dir) return
    const results = await pdfEdits.splitByRanges(bytes, ranges)
    const files = results.map((b, i) => ({
      name: `${stem}_part${i + 1}.pdf`,
      bytes: b.slice(0).buffer as ArrayBuffer,
    }))
    await window.electronAPI.writeBytesToDir(dir, files)
  }, [fileName, getBakedBytes])

  const splitOnePerPage = useCallback(async () => {
    const bytes = await requireBytes()
    const stem = fileName.replace(/\.pdf$/i, '')
    const dir = await window.electronAPI.chooseDirectory()
    if (!dir) return
    const results = await pdfEdits.splitOnePerPage(bytes)
    const files = results.map((b, i) => ({
      name: `${stem}_page${String(i + 1).padStart(3, '0')}.pdf`,
      bytes: b.slice(0).buffer as ArrayBuffer,
    }))
    await window.electronAPI.writeBytesToDir(dir, files)
  }, [fileName, getBakedBytes])

  const reversePages = useCallback(async () => {
    applyEdit(await pdfEdits.reversePages(await requireBytes()))
  }, [applyEdit, getBakedBytes])

  const swapPages = useCallback(async (page1: number, page2: number) => {
    applyEdit(await pdfEdits.swapPages(await requireBytes(), page1, page2))
  }, [applyEdit, getBakedBytes])

  const resizePages = useCallback(async (pageNums: number[] | 'all', width: number, height: number) => {
    applyEdit(await pdfEdits.resizePages(await requireBytes(), pageNums, width, height))
  }, [applyEdit, getBakedBytes])

  // Returns the deleted page numbers ([] means genuinely none), or null on
  // failure — the caller must NOT show the "no empty pages" dialog for null,
  // since [] is the legitimate "none found" success value.
  const deleteEmptyPages = useCallback(async (): Promise<number[] | null> => {
    try {
      const result = await pdfEdits.deleteEmptyPages(await requireBytes())
      if (result.deleted.length > 0) applyEdit(result.bytes)
      return result.deleted
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.error('Delete empty pages failed:', e)
      toast.error(`Delete empty pages failed: ${msg}`)
      return null
    }
  }, [applyEdit, getBakedBytes])

  const normalizePages = useCallback(async () => {
    applyEdit(await pdfEdits.normalizeMediaBox(await requireBytes()))
  }, [applyEdit, getBakedBytes])

  const replacePages = useCallback(async (pageNum: number, srcBytes: Uint8Array, srcPageNum: number) => {
    applyEdit(await pdfEdits.replacePage(await requireBytes(), pageNum, srcBytes, srcPageNum))
  }, [applyEdit, getBakedBytes])

  return {
    deletePages:     guard('Delete pages', deletePages),
    rotatePages:     guard('Rotate pages', rotatePages),
    reorderPage:     guard('Reorder page', reorderPage),
    duplicatePage:   guard('Duplicate page', duplicatePage),
    insertBlankPage: guard('Insert blank page', insertBlankPage),
    insertFromPdf:   guard('Insert pages from PDF', insertFromPdf),
    insertFromImage: guard('Insert image page', insertFromImage),
    extractPages:    guard('Extract pages', extractPages),
    mergePdfs:       guard('Merge PDFs', mergePdfs),
    splitByRanges:   guard('Split by ranges', splitByRanges),
    splitOnePerPage: guard('Split into single pages', splitOnePerPage),
    reversePages:    guard('Reverse pages', reversePages),
    swapPages:       guard('Swap pages', swapPages),
    resizePages:     guard('Resize pages', resizePages),
    deleteEmptyPages,   // returns number[]; guards internally
    normalizePages:  guard('Normalize pages', normalizePages),
    replacePages:    guard('Replace page', replacePages),
  }
}
