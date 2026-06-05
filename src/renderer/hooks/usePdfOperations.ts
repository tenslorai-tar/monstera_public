import { useCallback } from 'react'
import { usePdfStore } from '../store/usePdfStore'
import * as pdfEdits from '../utils/pdfEdits'

export function usePdfOperations() {
  const pdfBytes = usePdfStore(s => s.pdfBytes)
  const numPages = usePdfStore(s => s.numPages)
  const fileName = usePdfStore(s => s.fileName)
  const applyEdit = usePdfStore(s => s.applyEdit)

  const requireBytes = (): Uint8Array => {
    if (!pdfBytes) throw new Error('No document loaded')
    return pdfBytes
  }

  const deletePages = useCallback(async (pageNums: number[]) => {
    if (pageNums.length === numPages) return  // can't delete all pages
    applyEdit(await pdfEdits.deletePages(requireBytes(), pageNums))
  }, [pdfBytes, numPages, applyEdit])

  const rotatePages = useCallback(async (pageNums: number[], deg: 90 | 180 | 270) => {
    applyEdit(await pdfEdits.rotatePages(requireBytes(), pageNums, deg))
  }, [pdfBytes, applyEdit])

  const reorderPage = useCallback(async (fromIndex: number, toIndex: number) => {
    applyEdit(await pdfEdits.reorderPage(requireBytes(), fromIndex, toIndex))
  }, [pdfBytes, applyEdit])

  const duplicatePage = useCallback(async (pageNum: number) => {
    applyEdit(await pdfEdits.duplicatePage(requireBytes(), pageNum))
  }, [pdfBytes, applyEdit])

  const insertBlankPage = useCallback(async (afterPageNum: number) => {
    applyEdit(await pdfEdits.insertBlankPage(requireBytes(), afterPageNum))
  }, [pdfBytes, applyEdit])

  const insertFromPdf = useCallback(async (afterPageNum: number) => {
    const path = await window.electronAPI.openFileDialog()
    if (!path) return
    const srcBuf = await window.electronAPI.readFileBytes(path)
    applyEdit(await pdfEdits.insertPdfPages(requireBytes(), new Uint8Array(srcBuf), afterPageNum))
  }, [pdfBytes, applyEdit])

  const insertFromImage = useCallback(async (afterPageNum: number) => {
    const path = await window.electronAPI.openImageFile()
    if (!path) return
    const [imgBuf, mime] = await Promise.all([
      window.electronAPI.readFileBytes(path),
      window.electronAPI.getMimeType(path),
    ])
    applyEdit(await pdfEdits.insertImagePage(requireBytes(), new Uint8Array(imgBuf), mime, afterPageNum))
  }, [pdfBytes, applyEdit])

  const extractPages = useCallback(async (pageNums: number[]) => {
    const bytes = requireBytes()
    const stem = fileName.replace(/\.pdf$/i, '')
    const defaultName = `${stem}_pages${pageNums.join('-')}.pdf`
    const savePath = await window.electronAPI.saveFileDialog(defaultName)
    if (!savePath) return
    const out = await pdfEdits.extractPages(bytes, pageNums)
    await window.electronAPI.writeFile(savePath, out.slice(0).buffer)
  }, [pdfBytes, fileName])

  const mergePdfs = useCallback(async () => {
    const paths = await window.electronAPI.openMultipleFiles()
    if (paths.length === 0) return
    const others = await Promise.all(paths.map(p =>
      window.electronAPI.readFileBytes(p).then(b => new Uint8Array(b))
    ))
    applyEdit(await pdfEdits.mergePdfs([requireBytes(), ...others]))
  }, [pdfBytes, applyEdit])

  const splitByRanges = useCallback(async (ranges: number[][]) => {
    const bytes = requireBytes()
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
  }, [pdfBytes, fileName])

  const splitOnePerPage = useCallback(async () => {
    const bytes = requireBytes()
    const stem = fileName.replace(/\.pdf$/i, '')
    const dir = await window.electronAPI.chooseDirectory()
    if (!dir) return
    const results = await pdfEdits.splitOnePerPage(bytes)
    const files = results.map((b, i) => ({
      name: `${stem}_page${String(i + 1).padStart(3, '0')}.pdf`,
      bytes: b.slice(0).buffer as ArrayBuffer,
    }))
    await window.electronAPI.writeBytesToDir(dir, files)
  }, [pdfBytes, fileName])

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
  }
}
