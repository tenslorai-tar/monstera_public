import { useCallback } from 'react'
import { usePdfStore } from '../store/usePdfStore'
import * as pdfEdits from '../utils/pdfEdits'

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

  const deleteEmptyPages = useCallback(async (): Promise<number[]> => {
    const result = await pdfEdits.deleteEmptyPages(await requireBytes())
    if (result.deleted.length > 0) applyEdit(result.bytes)
    return result.deleted
  }, [applyEdit, getBakedBytes])

  const normalizePages = useCallback(async () => {
    applyEdit(await pdfEdits.normalizeMediaBox(await requireBytes()))
  }, [applyEdit, getBakedBytes])

  const replacePages = useCallback(async (pageNum: number, srcBytes: Uint8Array, srcPageNum: number) => {
    applyEdit(await pdfEdits.replacePage(await requireBytes(), pageNum, srcBytes, srcPageNum))
  }, [applyEdit, getBakedBytes])

  return {
    deletePages,
    rotatePages,
    reorderPage,
    duplicatePage,
    insertBlankPage,
    insertFromPdf,
    insertFromImage,
    extractPages,
    mergePdfs,
    splitByRanges,
    splitOnePerPage,
    reversePages,
    swapPages,
    resizePages,
    deleteEmptyPages,
    normalizePages,
    replacePages,
  }
}
