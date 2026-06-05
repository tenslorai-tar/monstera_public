import { PDFDocument, PDFName, PDFNumber, PDFString, PDFBool, PDFArray } from 'pdf-lib'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type {
  Annotation, HighlightAnn, InkAnn, ShapeAnn,
  TextBoxAnn, StickyNoteAnn, StampAnn, RedactAnn
} from '../types/annotations'
import { hexToRgb01, rgb255ToHex, newId } from './annotationUtils'

export const NM_PREFIX = 'monstera-'

// ── helpers ──────────────────────────────────────────────────────────────────

function mkC(doc: PDFDocument, hex: string) {
  const [r, g, b] = hexToRgb01(hex)
  return doc.context.obj([r, g, b])
}

function ensureAnnots(doc: PDFDocument, idx: number): PDFArray {
  const page = doc.getPage(idx)
  const key = PDFName.of('Annots')
  const existing = page.node.lookupMaybe(key, PDFArray)
  if (existing) return existing
  const arr = doc.context.obj([]) as PDFArray
  page.node.set(key, arr)
  return arr
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function registerAnnot(doc: PDFDocument, idx: number, dictLiteral: any) {
  const arr = ensureAnnots(doc, idx)
  const ref = doc.context.register(doc.context.obj(dictLiteral))
  arr.push(ref)
}

function clearAll(doc: PDFDocument) {
  for (let i = 0; i < doc.getPageCount(); i++) {
    doc.getPage(i).node.delete(PDFName.of('Annots'))
  }
}

// ── write ─────────────────────────────────────────────────────────────────────

function writeHighlight(doc: PDFDocument, a: HighlightAnn) {
  const subMap = { highlight: 'Highlight', underline: 'Underline', strikethrough: 'StrikeOut' } as const
  const allX = a.quads.flatMap(q => [q[0], q[2], q[4], q[6]])
  const allY = a.quads.flatMap(q => [q[1], q[3], q[5], q[7]])
  registerAnnot(doc, a.pageNum - 1, {
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of(subMap[a.type]),
    Rect: doc.context.obj([Math.min(...allX), Math.min(...allY), Math.max(...allX), Math.max(...allY)]),
    QuadPoints: doc.context.obj(a.quads.flat()),
    C: mkC(doc, a.color),
    CA: PDFNumber.of(a.opacity),
    Contents: PDFString.of(a.selectedText || ''),
    NM: PDFString.of(NM_PREFIX + a.id),
    F: PDFNumber.of(4),
  })
}

function writeInk(doc: PDFDocument, a: InkAnn) {
  if (a.paths.length === 0) return
  const allPts = a.paths.flat()
  registerAnnot(doc, a.pageNum - 1, {
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of('Ink'),
    Rect: doc.context.obj([
      Math.min(...allPts.map(p => p[0])) - 2,
      Math.min(...allPts.map(p => p[1])) - 2,
      Math.max(...allPts.map(p => p[0])) + 2,
      Math.max(...allPts.map(p => p[1])) + 2,
    ]),
    InkList: doc.context.obj(a.paths.map(path => doc.context.obj(path.flat()))),
    BS: doc.context.obj({ W: PDFNumber.of(a.lineWidth) }),
    C: mkC(doc, a.color),
    CA: PDFNumber.of(a.opacity),
    NM: PDFString.of(NM_PREFIX + a.id),
    F: PDFNumber.of(4),
  })
}

function writeShape(doc: PDFDocument, a: ShapeAnn) {
  const base: Record<string, unknown> = {
    Type: PDFName.of('Annot'),
    BS: doc.context.obj({ W: PDFNumber.of(a.lineWidth) }),
    C: mkC(doc, a.color),
    CA: PDFNumber.of(a.opacity),
    NM: PDFString.of(NM_PREFIX + a.id),
    F: PDFNumber.of(4),
  }
  if (a.type === 'rectangle' || a.type === 'ellipse') {
    base.Subtype = PDFName.of(a.type === 'rectangle' ? 'Square' : 'Circle')
    base.Rect = doc.context.obj([
      Math.min(a.x1, a.x2), Math.min(a.y1, a.y2),
      Math.max(a.x1, a.x2), Math.max(a.y1, a.y2),
    ])
  } else {
    base.Subtype = PDFName.of('Line')
    base.L = doc.context.obj([a.x1, a.y1, a.x2, a.y2])
    base.Rect = doc.context.obj([
      Math.min(a.x1, a.x2) - 5, Math.min(a.y1, a.y2) - 5,
      Math.max(a.x1, a.x2) + 5, Math.max(a.y1, a.y2) + 5,
    ])
    if (a.type === 'arrow') {
      base.LE = doc.context.obj([PDFName.of('None'), PDFName.of('OpenArrow')])
    }
  }
  registerAnnot(doc, a.pageNum - 1, base)
}

function writeTextBox(doc: PDFDocument, a: TextBoxAnn) {
  registerAnnot(doc, a.pageNum - 1, {
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of('FreeText'),
    Rect: doc.context.obj([a.x, a.y, a.x + a.width, a.y + a.height]),
    Contents: PDFString.of(a.text),
    DA: PDFString.of(`/Helvetica ${a.fontSize} Tf`),
    BS: doc.context.obj({ W: PDFNumber.of(1) }),
    C: mkC(doc, a.color),
    CA: PDFNumber.of(a.opacity),
    NM: PDFString.of(NM_PREFIX + a.id),
    F: PDFNumber.of(4),
  })
}

function writeStickyNote(doc: PDFDocument, a: StickyNoteAnn) {
  registerAnnot(doc, a.pageNum - 1, {
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of('Text'),
    Rect: doc.context.obj([a.x, a.y, a.x + 20, a.y + 20]),
    Contents: PDFString.of(a.text),
    C: mkC(doc, a.color),
    CA: PDFNumber.of(a.opacity),
    Name: PDFName.of('Comment'),
    Open: PDFBool.False,
    NM: PDFString.of(NM_PREFIX + a.id),
    F: PDFNumber.of(4),
  })
}

function writeRedact(doc: PDFDocument, a: RedactAnn) {
  registerAnnot(doc, a.pageNum - 1, {
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of('Redact'),
    Rect: doc.context.obj([
      Math.min(a.x1, a.x2), Math.min(a.y1, a.y2),
      Math.max(a.x1, a.x2), Math.max(a.y1, a.y2),
    ]),
    IC: doc.context.obj([0, 0, 0]),
    NM: PDFString.of(NM_PREFIX + a.id),
    F: PDFNumber.of(4),
  })
}

function writeStamp(doc: PDFDocument, a: StampAnn) {
  const nameMap: Record<string, string> = {
    Approved: 'Approved', Draft: 'Draft', Confidential: 'Confidential',
    Rejected: 'Rejected', Custom: 'NotApproved',
  }
  registerAnnot(doc, a.pageNum - 1, {
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of('Stamp'),
    Rect: doc.context.obj([
      a.x - a.width / 2, a.y - a.height / 2,
      a.x + a.width / 2, a.y + a.height / 2,
    ]),
    Name: PDFName.of(nameMap[a.stampName] || 'Draft'),
    C: mkC(doc, a.color),
    CA: PDFNumber.of(a.opacity),
    Contents: PDFString.of(a.stampName),
    NM: PDFString.of(NM_PREFIX + a.id),
    F: PDFNumber.of(4),
  })
}

export async function writeAnnotationsToPdf(
  bytes: Uint8Array,
  annotations: Annotation[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  clearAll(doc)
  for (const ann of annotations) {
    if (ann.pageNum < 1 || ann.pageNum > doc.getPageCount()) continue
    switch (ann.type) {
      case 'highlight': case 'underline': case 'strikethrough':
        writeHighlight(doc, ann as HighlightAnn); break
      case 'ink':
        writeInk(doc, ann as InkAnn); break
      case 'rectangle': case 'ellipse': case 'line': case 'arrow':
        writeShape(doc, ann as ShapeAnn); break
      case 'textbox':
        writeTextBox(doc, ann as TextBoxAnn); break
      case 'stickynote':
        writeStickyNote(doc, ann as StickyNoteAnn); break
      case 'stamp':
        writeStamp(doc, ann as StampAnn); break
      case 'redact':
        writeRedact(doc, ann as RedactAnn); break
    }
  }
  return doc.save()
}

// ── read ──────────────────────────────────────────────────────────────────────

export async function readAnnotationsFromPdf(
  pdfDoc: PDFDocumentProxy,
  numPages: number
): Promise<Annotation[]> {
  const result: Annotation[] = []
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum)
    const anns = await page.getAnnotations({ intent: 'display' })
    for (const a of anns) {
      try {
        const rawId = typeof a.id === 'string' ? a.id : ''
        const id = rawId.startsWith(NM_PREFIX)
          ? rawId.slice(NM_PREFIX.length)
          : newId()
        const color = a.color
          ? rgb255ToHex(a.color.r, a.color.g, a.color.b)
          : '#ffff00'
        const opacity = typeof a.opacity === 'number' ? a.opacity : 0.7
        const base = { id, pageNum, color, opacity, createdAt: Date.now() }

        switch (a.subtype) {
          case 'Highlight':
          case 'Underline':
          case 'StrikeOut': {
            const type = a.subtype === 'Highlight' ? 'highlight'
              : a.subtype === 'Underline' ? 'underline' : 'strikethrough' as const
            const rawQ: number[] = Array.isArray(a.quadPoints) ? a.quadPoints : []
            const quads: number[][] = []
            for (let i = 0; i + 7 < rawQ.length; i += 8) quads.push(rawQ.slice(i, i + 8))
            if (quads.length > 0)
              result.push({ ...base, type, quads, selectedText: a.contents || '' } as any)
            break
          }
          case 'Ink': {
            const inkLists = (a.inkLists as Array<Array<{x:number;y:number}>> | undefined) || []
            const paths = inkLists.map(lst => lst.map(p => [p.x, p.y] as [number, number]))
            if (paths.length > 0)
              result.push({ ...base, type: 'ink', paths, lineWidth: a.borderStyle?.width ?? 2 })
            break
          }
          case 'Square': {
            const [x1, y1, x2, y2] = a.rect as number[]
            result.push({ ...base, type: 'rectangle', x1, y1, x2, y2, lineWidth: a.borderStyle?.width ?? 2 })
            break
          }
          case 'Circle': {
            const [x1, y1, x2, y2] = a.rect as number[]
            result.push({ ...base, type: 'ellipse', x1, y1, x2, y2, lineWidth: a.borderStyle?.width ?? 2 })
            break
          }
          case 'Line': {
            const coords = (a.lineCoordinates as number[] | undefined) || (a.rect as number[])
            const isArrow = Array.isArray(a.lineEndings) &&
              a.lineEndings.some((e: string) => e === 'OpenArrow')
            result.push({
              ...base,
              type: isArrow ? 'arrow' : 'line',
              x1: coords[0], y1: coords[1], x2: coords[2], y2: coords[3],
              lineWidth: a.borderStyle?.width ?? 2,
            })
            break
          }
          case 'FreeText': {
            const [x1, y1, x2, y2] = a.rect as number[]
            result.push({
              ...base, type: 'textbox',
              x: x1, y: y1, width: x2 - x1, height: y2 - y1,
              text: a.contents || '',
              fontSize: (a as any).defaultAppearanceData?.fontSize ?? 12,
            })
            break
          }
          case 'Text': {
            const [x, y] = a.rect as number[]
            result.push({ ...base, type: 'stickynote', x, y, text: a.contents || '' })
            break
          }
          case 'Stamp': {
            const [x1, y1, x2, y2] = a.rect as number[]
            const sn = (a.name || 'Draft') as any
            result.push({
              ...base, type: 'stamp',
              x: (x1 + x2) / 2, y: (y1 + y2) / 2,
              width: Math.max(80, x2 - x1), height: Math.max(30, y2 - y1),
              stampName: sn,
            })
            break
          }
          case 'Redact': {
            const [x1, y1, x2, y2] = a.rect as number[]
            result.push({ ...base, type: 'redact', x1, y1, x2, y2 } as RedactAnn)
            break
          }
        }
      } catch { /* skip malformed */ }
    }
  }
  return result
}
