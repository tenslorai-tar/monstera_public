/**
 * Document-scanning pipeline (OpenCV WASM). Turns a photo of a page into a clean
 * "scan": detects the document's edges, perspective-corrects (dewarps) it, and
 * enhances it. OpenCV is ~10MB so it is lazy-loaded only when first used.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cvPromise: Promise<any> | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadCv(): Promise<any> {
  if (cvPromise) return cvPromise
  cvPromise = (async () => {
    const mod = await import('@techstark/opencv-js')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cv: any = (mod as any).default ?? mod
    if (!cv.Mat) await new Promise<void>(res => { cv.onRuntimeInitialized = res })
    return cv
  })()
  return cvPromise
}

export type ScanMode = 'color' | 'grayscale' | 'bw'

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = dataUrl
  })
}

// Order 4 points as [tl, tr, br, bl]
function orderQuad(pts: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  const bySum = [...pts].sort((a, b) => (a.x + a.y) - (b.x + b.y))
  const byDiff = [...pts].sort((a, b) => (a.y - a.x) - (b.y - b.x))
  return [bySum[0], byDiff[0], bySum[3], byDiff[3]] // tl, tr, br, bl
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findDocumentQuad(cv: any, src: any): Array<{ x: number; y: number }> | null {
  const gray = new cv.Mat(), blur = new cv.Mat(), edges = new cv.Mat()
  const contours = new cv.MatVector(), hierarchy = new cv.Mat()
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0)
    cv.Canny(blur, edges, 50, 150)
    cv.dilate(edges, edges, cv.Mat.ones(3, 3, cv.CV_8U))
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)
    const imgArea = src.rows * src.cols
    let best: Array<{ x: number; y: number }> | null = null
    let bestArea = 0.2 * imgArea // document must cover >20% of the photo
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i)
      const peri = cv.arcLength(cnt, true)
      const approx = new cv.Mat()
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true)
      if (approx.rows === 4 && cv.isContourConvex(approx)) {
        const area = cv.contourArea(approx)
        if (area > bestArea) {
          bestArea = area
          best = []
          for (let r = 0; r < 4; r++) best.push({ x: approx.data32S[r * 2], y: approx.data32S[r * 2 + 1] })
        }
      }
      approx.delete(); cnt.delete()
    }
    return best ? orderQuad(best) : null
  } finally {
    gray.delete(); blur.delete(); edges.delete(); contours.delete(); hierarchy.delete()
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function warp(cv: any, src: any, quad: Array<{ x: number; y: number }>): any {
  const [tl, tr, br, bl] = quad
  const wTop = Math.hypot(tr.x - tl.x, tr.y - tl.y)
  const wBot = Math.hypot(br.x - bl.x, br.y - bl.y)
  const hL = Math.hypot(bl.x - tl.x, bl.y - tl.y)
  const hR = Math.hypot(br.x - tr.x, br.y - tr.y)
  const W = Math.max(1, Math.round(Math.max(wTop, wBot)))
  const H = Math.max(1, Math.round(Math.max(hL, hR)))
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y])
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, W, 0, W, H, 0, H])
  const M = cv.getPerspectiveTransform(srcTri, dstTri)
  const out = new cv.Mat()
  cv.warpPerspective(src, out, M, new cv.Size(W, H), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255))
  srcTri.delete(); dstTri.delete(); M.delete()
  return out
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function enhance(cv: any, src: any, mode: ScanMode): any {
  if (mode === 'color') {
    const out = new cv.Mat()
    src.convertTo(out, -1, 1.25, 8) // mild contrast/brightness lift
    return out
  }
  const gray = new cv.Mat()
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
  if (mode === 'grayscale') return gray
  const bw = new cv.Mat()
  cv.adaptiveThreshold(gray, bw, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 21, 10)
  gray.delete()
  return bw
}

export interface ScanOptions { dewarp: boolean; mode: ScanMode }

/** Process a photo/image into a cleaned scan; returns a PNG data URL. */
export async function scanDocument(srcDataUrl: string, opts: ScanOptions): Promise<{ dataUrl: string; dewarped: boolean }> {
  const cv = await loadCv()
  const img = await loadImage(srcDataUrl)
  const inCanvas = document.createElement('canvas')
  inCanvas.width = img.naturalWidth; inCanvas.height = img.naturalHeight
  inCanvas.getContext('2d')!.drawImage(img, 0, 0)

  const src = cv.imread(inCanvas)
  let working = src
  let dewarped = false
  try {
    if (opts.dewarp) {
      const quad = findDocumentQuad(cv, src)
      if (quad) { working = warp(cv, src, quad); dewarped = true }
    }
    const out = enhance(cv, working, opts.mode)
    const outCanvas = document.createElement('canvas')
    cv.imshow(outCanvas, out)
    const dataUrl = outCanvas.toDataURL('image/png')
    out.delete()
    return { dataUrl, dewarped }
  } finally {
    if (working !== src) working.delete()
    src.delete()
  }
}
