/**
 * Barcode / QR reading via zxing-wasm. The wasm is bundled (?url) and pointed at
 * locally so it works offline inside Electron.
 */
import { readBarcodes, prepareZXingModule } from 'zxing-wasm/reader'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

let prepared = false
function prep() {
  if (prepared) return
  prepareZXingModule({ overrides: { locateFile: (p: string, prefix: string) => (p.endsWith('.wasm') ? wasmUrl : prefix + p) } })
  prepared = true
}

export interface BarcodeResult { text: string; format: string }

export async function readBarcodesFromCanvas(canvas: HTMLCanvasElement): Promise<BarcodeResult[]> {
  prep()
  const ctx = canvas.getContext('2d')
  if (!ctx || canvas.width === 0) return []
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const results = await readBarcodes(imgData, { tryHarder: true, formats: [], maxNumberOfSymbols: 20 })
  return results.map(r => ({ text: r.text, format: String(r.format) }))
}
