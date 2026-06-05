export function hexToRgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16 & 0xff) / 255, (n >> 8 & 0xff) / 255, (n & 0xff) / 255]
}

export function rgb255ToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
}

// SVG/canvas pixel coords → PDF point coords  (PDF: origin bottom-left, y-up)
export function canvasToPdf(cx: number, cy: number, scale: number, pageH: number): [number, number] {
  return [cx / scale, pageH - cy / scale]
}

// PDF point coords → SVG/canvas pixel coords
export function pdfToCanvas(px: number, py: number, scale: number, pageH: number): [number, number] {
  return [px * scale, (pageH - py) * scale]
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}
