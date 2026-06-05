export type AnnotationTool =
  | 'select' | 'eraser'
  | 'highlight' | 'underline' | 'strikethrough'
  | 'ink'
  | 'rectangle' | 'ellipse' | 'line' | 'arrow'
  | 'textbox' | 'stickynote' | 'stamp'
  | 'redact'
  | 'typewriter' | 'text-edit' | 'place-image'

export type StampName = 'Approved' | 'Draft' | 'Confidential' | 'Rejected' | 'Custom'

export interface AnnBase {
  id: string
  pageNum: number
  color: string     // '#rrggbb'
  opacity: number   // 0–1
  createdAt: number
}

export interface HighlightAnn extends AnnBase {
  type: 'highlight' | 'underline' | 'strikethrough'
  // Each quad: [x1,y1, x2,y2, x3,y3, x4,y4] upper-left/right, lower-left/right  (PDF pts)
  quads: number[][]
  selectedText: string
}

export interface InkAnn extends AnnBase {
  type: 'ink'
  paths: Array<Array<[number, number]>>  // PDF pts
  lineWidth: number
}

export interface ShapeAnn extends AnnBase {
  type: 'rectangle' | 'ellipse' | 'line' | 'arrow'
  x1: number; y1: number; x2: number; y2: number  // PDF pts
  lineWidth: number
}

export interface TextBoxAnn extends AnnBase {
  type: 'textbox'
  x: number; y: number          // bottom-left, PDF pts
  width: number; height: number
  text: string
  fontSize: number
}

export interface StickyNoteAnn extends AnnBase {
  type: 'stickynote'
  x: number; y: number  // PDF pts
  text: string
}

export interface StampAnn extends AnnBase {
  type: 'stamp'
  x: number; y: number              // center, PDF pts
  width: number; height: number
  stampName: StampName
  imageDataUrl?: string
}

export interface RedactAnn extends AnnBase {
  type: 'redact'
  x1: number; y1: number; x2: number; y2: number  // PDF pts
}

// Typewriter: click-to-place text, no box border, transparent background
export interface TypewriterAnn extends AnnBase {
  type: 'typewriter'
  x: number; y: number   // bottom-left, PDF pts
  text: string
  fontSize: number
}

// Text-edit: whiteout rect + replacement text (overlay approach — see CLAUDE.md)
export interface TextEditAnn extends AnnBase {
  type: 'text-edit'
  x: number; y: number; width: number; height: number  // PDF pts, bottom-left
  text: string
  fontSize: number
}

// Placed image: draggable/resizable image embedded in PDF content stream on save
export interface PlacedImageAnn extends AnnBase {
  type: 'placed-image'
  x: number; y: number          // bottom-left, PDF pts
  width: number; height: number // PDF pts
  dataUrl: string               // data:image/png;base64,... or jpeg
}

export type Annotation =
  | HighlightAnn | InkAnn | ShapeAnn
  | TextBoxAnn | StickyNoteAnn | StampAnn | RedactAnn
  | TypewriterAnn | TextEditAnn | PlacedImageAnn
