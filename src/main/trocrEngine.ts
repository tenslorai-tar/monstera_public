/**
 * Local handwriting OCR via TrOCR (ONNX quantized) running fully on this
 * machine through transformers.js. Two model sizes are supported:
 *   small — Xenova/trocr-small-handwritten, ≈80 MB, fast
 *   base  — Xenova/trocr-base-handwritten,  ≈340 MB, better digits and far
 *           fewer language-model hallucinations on messy crops
 * Each model is downloaded once into the configured cache dir; afterwards
 * recognition works offline. TrOCR reads ONE text-line image per call — the
 * renderer segments table cells from pixels and sends each crop separately.
 * Only one model is kept in memory at a time (base is ~400 MB resident).
 */
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'

// CJS main process loading an ESM-only package: dynamic import must survive
// tsc's CommonJS transform, hence the Function constructor.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _esmImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>

export type TrocrModelId = 'small' | 'base'

const MODELS: Record<TrocrModelId, string> = {
  small: 'Xenova/trocr-small-handwritten',
  base: 'Xenova/trocr-base-handwritten',
}

let cacheDir = ''
let loadedModel: TrocrModelId | null = null
let pipeModel: TrocrModelId | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipePromise: Promise<any> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rawImageCls: any = null

export function configure(dir: string): void {
  cacheDir = dir
}

export function isReady(model: TrocrModelId = 'small'): boolean {
  return loadedModel === model
}

export function isCached(model: TrocrModelId = 'small'): boolean {
  try {
    const modelDir = join(cacheDir, ...MODELS[model].split('/'))
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
async function getPipe(model: TrocrModelId): Promise<any> {
  if (pipePromise && pipeModel === model) return pipePromise
  if (pipePromise) {
    const prev = await pipePromise.catch(() => null)
    try { await prev?.dispose?.() } catch {}
    pipePromise = null
    loadedModel = null
  }
  pipeModel = model
  pipePromise = (async () => {
    const t = await _esmImport('@huggingface/transformers')
    if (cacheDir) t.env.cacheDir = cacheDir
    rawImageCls = t.RawImage
    const pipe = await t.pipeline('image-to-text', MODELS[model], { dtype: 'q8' })
    loadedModel = model
    return pipe
  })().catch((e: unknown) => { pipePromise = null; pipeModel = null; throw e })
  return pipePromise
}

export async function setup(model: TrocrModelId = 'small'): Promise<void> {
  await getPipe(model)
}

export async function recognizePng(png: Buffer, model: TrocrModelId = 'small'): Promise<string> {
  const pipe = await getPipe(model)
  const img = await rawImageCls.fromBlob(new Blob([new Uint8Array(png)], { type: 'image/png' }))
  const out = await pipe(img, { max_new_tokens: 48 })
  const text: string = out?.[0]?.generated_text ?? ''
  return text.trim()
}
