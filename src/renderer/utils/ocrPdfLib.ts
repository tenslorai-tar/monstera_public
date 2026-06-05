import { PDFDocument, StandardFonts } from 'pdf-lib'
import type { OcrWord } from './ocrUtils'

export async function embedOcrText(
  pdfBytes: Uint8Array,
  ocrData: Map<number, OcrWord[]>
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

  for (const [pageNum, words] of ocrData) {
    if (!words.length) continue
    const page = pdfDoc.getPages()[pageNum - 1]
    if (!page) continue

    for (const word of words) {
      if (!word.text.trim()) continue
      try {
        page.drawText(word.text, {
          x: word.x,
          y: word.y,
          size: Math.max(4, word.h),
          font,
          opacity: 0,
        })
      } catch {
        // Skip words whose characters can't be encoded by Helvetica (e.g. CJK)
      }
    }
  }

  return pdfDoc.save()
}
