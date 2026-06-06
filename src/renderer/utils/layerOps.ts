/**
 * Layer (OCG) authoring via pdf-lib at the OCProperties level — safe edits that
 * never touch the content stream:
 *  - flattenAllLayers: remove /OCProperties so all optional content is permanently shown
 *  - removeLayer: drop one OCG from OCProperties (its content becomes always-visible)
 *  - renameLayer: change an OCG's /Name
 *
 * Adding/merging/reordering layer *content* would require rewriting marked content
 * in the page streams and is intentionally not done here.
 */
import { PDFDocument, PDFName, PDFArray, PDFDict, PDFString, PDFHexString } from 'pdf-lib'

function ocgName(dict: PDFDict): string {
  const n = dict.get(PDFName.of('Name'))
  if (n instanceof PDFString || n instanceof PDFHexString) return n.decodeText()
  return ''
}

export async function flattenAllLayers(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  doc.catalog.delete(PDFName.of('OCProperties'))
  return doc.save()
}

export async function renameLayer(bytes: Uint8Array, oldName: string, newName: string): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const oc = doc.catalog.lookupMaybe(PDFName.of('OCProperties'), PDFDict)
  const ocgs = oc?.lookupMaybe(PDFName.of('OCGs'), PDFArray)
  if (ocgs) {
    for (let i = 0; i < ocgs.size(); i++) {
      const g = ocgs.lookup(i, PDFDict)
      if (g && ocgName(g) === oldName) { g.set(PDFName.of('Name'), PDFString.of(newName)); break }
    }
  }
  return doc.save()
}

// Remove one OCG from OCProperties (OCGs + /D ON/OFF/Order); its content stays visible.
export async function removeLayer(bytes: Uint8Array, name: string): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const oc = doc.catalog.lookupMaybe(PDFName.of('OCProperties'), PDFDict)
  if (!oc) return doc.save()
  const ocgs = oc.lookupMaybe(PDFName.of('OCGs'), PDFArray)
  if (!ocgs) return doc.save()

  // Find the target OCG's index/ref.
  let targetIdx = -1
  for (let i = 0; i < ocgs.size(); i++) {
    const g = ocgs.lookup(i, PDFDict)
    if (g && ocgName(g) === name) { targetIdx = i; break }
  }
  if (targetIdx < 0) return doc.save()
  const targetRef = ocgs.get(targetIdx)

  const stripFromArray = (arr: PDFArray | undefined) => {
    if (!arr) return
    for (let i = arr.size() - 1; i >= 0; i--) {
      if (arr.get(i) === targetRef) arr.remove(i)
    }
  }
  stripFromArray(ocgs)
  const d = oc.lookupMaybe(PDFName.of('D'), PDFDict)
  if (d) {
    stripFromArray(d.lookupMaybe(PDFName.of('ON'), PDFArray))
    stripFromArray(d.lookupMaybe(PDFName.of('OFF'), PDFArray))
    stripFromArray(d.lookupMaybe(PDFName.of('Order'), PDFArray))
  }
  return doc.save()
}
