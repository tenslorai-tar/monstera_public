export type AnnotationTool =
  | 'select' | 'eraser'
  | 'highlight' | 'underline' | 'strikethrough'
  | 'ink'
  | 'rectangle' | 'ellipse' | 'line' | 'arrow'
  | 'polygon' | 'polyline' | 'cloud'
  | 'textbox' | 'stickynote' | 'stamp' | 'callout' | 'caret'
  | 'redact'
  | 'typewriter' | 'text-edit' | 'place-image'
  | 'measure-distance' | 'measure-area' | 'measure-perimeter'
  | 'link'
  | 'snapshot'

export type StampName = 'Approved' | 'Draft' | 'Confidential' | 'Rejected' | 'Custom'
  | 'Today' | 'Received' | 'Revised' | 'Void' | 'For Review'
  | (string & {})

export interface AnnBase {
  id: string
  pageNum: number
  color: string     // '#rrggbb'
  opacity: number   // 0–1
  createdAt: number
}

export interface HighlightAnn extends AnnBase {
  type: 'highlight' | 'underline' | 'strikethrough'
  quads: number[][]
  selectedText: string
}

export interface InkAnn extends AnnBase {
  type: 'ink'
  paths: Array<Array<[number, number]>>
  lineWidth: number
}

export interface ShapeAnn extends AnnBase {
  type: 'rectangle' | 'ellipse' | 'line' | 'arrow'
  x1: number; y1: number; x2: number; y2: number
  lineWidth: number
}

export interface TextBoxAnn extends AnnBase {
  type: 'textbox'
  x: number; y: number
  width: number; height: number
  text: string
  fontSize: number
}

export interface StickyNoteAnn extends AnnBase {
  type: 'stickynote'
  x: number; y: number
  text: string
}

export interface StampAnn extends AnnBase {
  type: 'stamp'
  x: number; y: number
  width: number; height: number
  stampName: StampName
  imageDataUrl?: string
}

export interface RedactAnn extends AnnBase {
  type: 'redact'
  x1: number; y1: number; x2: number; y2: number
}

export interface TypewriterAnn extends AnnBase {
  type: 'typewriter'
  x: number; y: number
  text: string
  fontSize: number
}

export interface TextEditAnn extends AnnBase {
  type: 'text-edit'
  x: number; y: number; width: number; height: number
  text: string
  fontSize: number
}

export interface PlacedImageAnn extends AnnBase {
  type: 'placed-image'
  x: number; y: number
  width: number; height: number
  dataUrl: string
}

// ── Batch 2: New annotation types ────────────────────────────────────────────

/** Callout: text box with a leader arrow pointing to a location on the page */
export interface CalloutAnn extends AnnBase {
  type: 'callout'
  x: number; y: number; width: number; height: number  // text box, PDF pts (bottom-left)
  text: string
  fontSize: number
  lineWidth: number
  tipX: number; tipY: number   // arrow tip location, PDF pts
}

/** Cloud: polygon annotation with cloud-style bumpy border */
export interface CloudAnn extends AnnBase {
  type: 'cloud'
  points: Array<[number, number]>  // PDF pts, polygon vertices (closed automatically)
  lineWidth: number
}

/** Polygon or Polyline: multi-point shape annotation */
export interface PolyAnn extends AnnBase {
  type: 'polygon' | 'polyline'
  points: Array<[number, number]>  // PDF pts
  lineWidth: number
}

/** Caret: marks an insertion point or location in the document */
export interface CaretAnn extends AnnBase {
  type: 'caret'
  x: number; y: number     // bottom-left, PDF pts
  width: number; height: number
}

/** Measurement annotation: distance, area, or perimeter with computed label */
export interface MeasureAnn extends AnnBase {
  type: 'measure-distance' | 'measure-area' | 'measure-perimeter'
  points: Array<[number, number]>  // PDF pts
  lineWidth: number
  label: string   // pre-computed display string, e.g. "42.3 pt"
  unit: string    // unit string: 'pt', 'mm', 'in', etc.
}

/** Link annotation: clickable rectangle → URL or internal page destination */
export interface LinkAnn extends AnnBase {
  type: 'link'
  x1: number; y1: number; x2: number; y2: number
  href?: string       // URI action (external URL)
  destPage?: number   // GoTo action (1-indexed page number)
}

export type Annotation =
  | HighlightAnn | InkAnn | ShapeAnn
  | TextBoxAnn | StickyNoteAnn | StampAnn | RedactAnn
  | TypewriterAnn | TextEditAnn | PlacedImageAnn
  | CalloutAnn | CloudAnn | PolyAnn | CaretAnn | MeasureAnn
  | LinkAnn
