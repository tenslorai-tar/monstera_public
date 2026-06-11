/**
 * Local handwriting OCR via TrOCR (microsoft/trocr-small-handwritten, ONNX
 * quantized) running fully on this machine through transformers.js. The model
 * (~80 MB) is downloaded once into the configured cache dir; afterwards
 * recognition works offline. TrOCR reads ONE text-line image per call — the
 * renderer segments table cells from pixels and sends each crop separately.
 */
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'

// CJS main process loading an ESM-only package: dynamic import must survive
// tsc's CommonJS transform, hence the Function constructor.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _esmImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>

const MODEL = 'Xenova/trocr-small-handwritten'

let cacheDir = ''
let ready = false
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipePromise: Promise<any> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rawImageCls: any = null

export function configure(dir: string): void {
  cacheDir = dir
}

export function isReady(): boolean {
  return ready
}

export function isCached(): boolean {
  try {
    const modelDir = join(cacheDir, ...MODEL.split('/'))
    if (!existsSync(modelDir)) return false
    const walk = (d: string): boolean => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.isFile() && e.name.endsWith('.onnx')) return true
        if (e.isDirectory() && walk(join(d, e.name))) return true
      }
      return false
    }
    return walk(modelDir)
  } catch {
    return false
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getPipe(): Promise<any> {
  if (!pipePromise) {
    pipePromise = (async () => {
      const t = await _esmImport('@huggingface/transformers')
      if (cacheDir) t.env.cacheDir = cacheDir
      rawImageCls = t.RawImage
      const pipe = await t.pipeline('image-to-text', MODEL, { dtype: 'q8' })
      ready = true
      return pipe
    })().catch((e: unknown) => { pipePromise = null; throw e })
  }
  return pipePromise
}

export async function setup(): Promise<void> {
  await getPipe()
}

export async function recognizePng(png: Buffer): Promise<string> {
  const pipe = await getPipe()
  const img = await rawImageCls.fromBlob(new Blob([new Uint8Array(png)], { type: 'image/png' }))
  const out = await pipe(img, { max_new_tokens: 48 })
  const text: string = out?.[0]?.generated_text ?? ''
  return text.trim()
}
