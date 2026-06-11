# Monstera PDF Editor — Project Guide

## Goal
A feature-rich desktop PDF editor for **personal use only** on Windows.
It will never be distributed. Ignore all software-licensing obligations (AGPL fine)
and ignore code signing entirely. Target quality: comparable to PDF-XChange Editor.

---

## Locked Tech Stack (do not change without explicit instruction)

| Layer | Library | Responsibility |
|---|---|---|
| Desktop shell | Electron | Window management, native OS integration, .exe packaging |
| UI framework | React + Vite + TypeScript | All renderer-side UI and state |
| PDF rendering | pdfjs-dist (PDF.js) v6 | Render pages to canvas, text layer, search. `render()` takes the `canvas` element (not `canvasContext`); worker wired via `src/renderer/utils/pdfjsWorker.ts` (`?url` import) |
| PDF editing | pdf-lib (aliased to the maintained fork `@cantoo/pdf-lib`) | Page operations, annotations, forms, metadata. Import stays `from 'pdf-lib'` — the alias lives in package.json |
| Heavy PDF ops | mupdf (WASM) v1.27 | Redaction, outline, appearance-stream synthesis, print rendering, etc. **Annotation rects are fitz space (y-down)** — flip PDF-space y before `setRect` |
| OCR | tesseract.js v7 | OCR on scanned pages. Word boxes require `recognize(img, {}, { blocks: true })` and flattening the blocks tree |
| Packaging | electron-builder | Produce Windows NSIS installer + portable .exe |

> **Rule:** When a library cannot do something, propose swapping in a more capable
> library — never hand-roll PDF parsing.

---

## Folder Structure

```
Monstera PDF Editor/
├── src/
│   ├── main/           # Electron main process (Node context)
│   │   └── main.ts     # App lifecycle, BrowserWindow, IPC handlers
│   ├── preload/        # Preload script — bridges main ↔ renderer safely
│   │   └── preload.ts  # contextBridge exposures (electronAPI)
│   └── renderer/       # React app (browser context, no direct Node access)
│       ├── components/ # Reusable React components
│       ├── hooks/      # Custom React hooks
│       ├── store/      # Global state (zustand or similar)
│       ├── utils/      # Pure helper functions
│       ├── types/      # TypeScript type declarations
│       ├── styles/     # CSS files
│       ├── App.tsx     # Root component
│       └── main.tsx    # ReactDOM entry point
├── assets/
│   └── icons/          # App icons (.ico, .png)
├── dist/               # Vite build output (gitignored)
├── dist-electron/      # Compiled Electron main/preload (gitignored)
├── release/            # electron-builder output — installer + portable (gitignored)
├── index.html          # Vite HTML entry
├── vite.config.ts      # Vite configuration
├── tsconfig.json       # TypeScript config for renderer
├── tsconfig.electron.json  # TypeScript config for main + preload
└── package.json        # npm scripts, dependencies, electron-builder config
```

---

## Coding Conventions

- **TypeScript everywhere** — strict mode, no `any` except as last resort.
- **Functional React components** — no class components; hooks for all state/effects.
- **IPC pattern** — renderer calls `window.electronAPI.*` (exposed via contextBridge);
  main process handles `ipcMain.handle(...)`. Never enable nodeIntegration in renderer.
- **No comments** unless the *why* is non-obvious (hidden constraints, workarounds).
- **No premature abstractions** — three similar lines beats an early helper function.
- **Commit after each working feature** (see rule below).

> **Rule:** Commit to git after each working feature.

---

## Feature Checklist

### Phase 0 — Project Scaffold ✅
- [x] Electron + React + Vite + TypeScript scaffold
- [x] Secure Electron setup (contextIsolation, preload, IPC)
- [x] All libraries installed (pdfjs-dist, pdf-lib, mupdf, tesseract.js, electron-builder)
- [x] Minimal UI: toolbar with Open PDF button
- [x] PDF.js renders page 1 to canvas
- [x] electron-builder: NSIS installer + portable .exe (win, x64)
- [x] Git initialized with .gitignore and first commit
- [x] CLAUDE.md created

### Phase 1 — Core Viewer ✅
- [x] Multi-page continuous scroll with lazy rendering (IntersectionObserver per page)
- [x] Zoom controls: fit-width, fit-page, percentage presets, +/- buttons, Ctrl+scroll
- [x] Collapsible thumbnail sidebar (lazy-rendered, click to jump)
- [x] Current page / total pages display with click-to-jump go-to-page input
- [x] Keyboard shortcuts: Ctrl+O, Ctrl+F, Ctrl++/-, Ctrl+0, PageUp/Down, Alt+Arrow
- [x] Recent files list on start screen (localStorage, up to 10)
- [x] PDF.js text layer (selectable + copyable text)
- [x] Full-text search with highlighted matches and Prev/Next navigation (Ctrl+F)
- [x] Search options: match case / whole word / regex; Unicode-normalized matching (accents, ligatures); exact-substring highlights via the CSS Custom Highlight API; cancellable background indexing with progress

### Phase 2 — Page Management ✅
- [x] Delete page(s) — right-click context menu or Page Ops bar when multiple selected
- [x] Rotate page(s) 90°/180°/270° — context menu or Page Ops bar
- [x] Reorder pages by drag-and-drop in thumbnail sidebar
- [x] Duplicate a page — context menu
- [x] Insert blank page before/after — context menu
- [x] Insert pages from another PDF — context menu
- [x] Insert pages from an image (PNG, JPEG) — context menu
- [x] Extract selected pages to new PDF — context menu / Page Ops bar
- [x] Merge multiple PDFs into current document — toolbar Merge button
- [x] Split PDF by page ranges or one-per-page — toolbar Split button + dialog
- [x] Save (Ctrl+S) and Save As (Ctrl+Shift+S) with file dialogs via IPC
- [x] Undo/redo stack (up to 10 states) — Ctrl+Z / Ctrl+Y
- [x] Unsaved-changes indicator (● in title) and Save button enabled when dirty

### Phase 3 — Text & Search
- [ ] Find/Replace (replace not yet implemented)
- [x] Copy selected text to clipboard (works natively via text layer)

### Phase 4 — Annotations ✅
- [x] Highlight, underline, strikethrough text markup — select text with tool active, mouseup captures selection
- [x] Freehand ink / pen drawing — click-drag on page canvas
- [x] Shapes: rectangle, ellipse, line, arrow — click-drag to draw
- [x] Text box — drag to define area, type in inline textarea, blur/Enter to commit
- [x] Sticky note / comment — click to place; popup shows editable text
- [x] Stamps: Approved, Draft, Confidential, Rejected, Custom image — single click to place
- [x] Eraser tool — click any annotation to delete it
- [x] Select tool — click to select (highlight border); Delete key removes selected
- [x] Color, opacity, line-width, font-size controls in annotation toolbar
- [x] Annotations panel (≡ Panel button) — lists all annotations by page, click to jump
- [x] Annotations saved as real PDF annotation objects (pdf-lib) on Ctrl+S / Save As
- [x] Annotations loaded back when PDF is reopened (PDF.js getAnnotations)
- [x] Annotations survive page operations (delete, rotate, reorder) via baked-bytes path
- [x] PDF.js native annotation rendering disabled — overlay renders all annotations

**How to test each feature:**
| Feature | Steps |
|---|---|
| **Highlight** | Select "H" tool → click-drag over text in PDF → yellow highlight appears |
| **Underline** | Select "U" tool → click-drag over text → underline appears |
| **Strikethrough** | Select "S" tool → click-drag over text → strikethrough appears |
| **Ink** | Select ✏ tool → click-drag freely on page → freehand stroke drawn |
| **Rectangle** | Select □ tool → click-drag → rectangle outline drawn |
| **Ellipse** | Select ○ tool → click-drag → ellipse outline drawn |
| **Line** | Select ╱ tool → click-drag → line drawn |
| **Arrow** | Select → tool → click-drag → arrow with arrowhead |
| **Text Box** | Select T tool → click-drag box area → type text → click outside to commit |
| **Sticky Note** | Select 📌 tool → click on page → yellow popup appears; type note |
| **Stamp** | Select ⬡ tool, pick stamp type in dropdown → click on page → stamp appears |
| **Erase** | Select ⌫ tool → click any annotation → it disappears |
| **Select** | Select ↖ tool or no tool → click annotation → blue highlight; press Delete |
| **Color** | Pick color in toolbar color swatch → affects next annotation drawn |
| **Panel** | Click "≡ Panel" → right panel lists all annotations; click to jump to page |
| **Persist** | Add annotations → Ctrl+S → reopen file → annotations still present |
| **Page ops** | Add annotations → delete/rotate page → save → reopen → annotations on correct pages |

### Phase 5 — Forms ✅
- [x] Render AcroForm fields (PDF.js) — text, checkbox, radio, dropdown, list box, signature
- [x] Fill in form fields — interactive HTML overlays per field type
- [x] Flatten form to PDF (pdf-lib) — "⊞ Flatten" button bakes all values into page content
- [x] Form field creation — draw new text fields, checkboxes, signature areas onto any page
- [x] Forms panel — list all fields by page, click to jump, delete individual fields
- [x] Export form data (JSON + XFDF) — Forms ribbon → Operations group

**How to test each feature:**
| Feature | Steps |
|---|---|
| **Fill text field** | Open a PDF with AcroForm fields → click any text field → type value |
| **Fill checkbox** | Open a form PDF → click a checkbox → it toggles checked/unchecked |
| **Fill radio button** | Open a form PDF → click a radio button → it selects that option |
| **Fill dropdown** | Open a form PDF → click a dropdown → pick an option |
| **Fill listbox** | Open a form PDF → click options in a list box |
| **Save filled form** | Fill fields → Ctrl+S → reopen → field values persist |
| **Forms mode** | Click "📋 Forms" button in toolbar → form creation tools appear |
| **Draw text field** | Forms mode → click T button → drag a rectangle on page → text field appears |
| **Draw checkbox** | Forms mode → click ☑ button → drag a small square → checkbox appears |
| **Draw signature** | Forms mode → click ✍ button → drag a rectangle → signature area appears |
| **Flatten** | Fill fields → click "⊞ Flatten" → Ctrl+S → reopen → fields are baked into content |
| **Forms panel** | Forms mode → click "≡ Fields" → panel lists all fields; click to jump |

### Phase 6 — OCR ✅
- [x] Detect scanned (image-only) pages — pages with < 15 characters of native text are flagged
- [x] Run tesseract.js OCR on selected pages — choose scanned-only or all pages; multi-language support (13 languages)
- [x] Overlay invisible/selectable text layer — OCR words are rendered as transparent, selectable spans aligned to image
- [x] Search integration — OCR text fed into textCache so Ctrl+F finds text on scanned pages; highlights appear on OCR spans
- [x] Export OCR'd PDF — embed invisible text (opacity 0) into PDF bytes via pdf-lib so text is extractable on disk

**How to test:**
| Feature | Steps |
|---|---|
| **Detect scanned pages** | Open a scanned PDF → click "🔍 OCR" in toolbar → dialog shows detected scanned pages |
| **Run OCR** | In OCR dialog, choose language (default English) → click "Run OCR" → progress bar shows per-page |
| **Invisible text overlay** | After OCR, try to select/copy text on a scanned page — transparent selectable spans appear |
| **Search scanned text** | After OCR, open search (Ctrl+F), type a word from the scanned page — matches highlighted |
| **Export searchable PDF** | After OCR, click "Save (overwrite)" or "Save OCR Copy As…" → save → reopen → text is selectable |
| **Language selection** | In OCR dialog, change language to French/German/etc. before running |
| **Page scope** | OCR dialog lets you choose: detected scanned pages only, or all pages |

### Phase 7 — Advanced Editing ✅ (partial)
- [x] Redaction tool — mark areas with drag, apply permanently via MuPDF (content truly removed, not just covered)
- [x] Edit existing text — **line-level in-place editing via the PDFium engine** (koffi FFI, main process). Clicking with Edit Text selects the whole VISUAL line (runs clustered by baseline — never a single kerned fragment); on commit the engine diffs old vs new line text (common prefix/suffix) and rewrites ONLY the changed run(s), so untouched runs keep their font/colour byte-for-byte (proof: `scripts/prove-line-edit.mjs`, incl. pixel-identical region check on a mixed bold-green/regular-black line). The changed run is re-set through its own embedded font when fontkit proves glyph coverage; otherwise an installed substitute or Helvetica touches only that run; otherwise the renderer falls back to cover-and-replace overlay (which samples the real ink colour from the rendered canvas — text-layer spans are `color:transparent` and always read back black). Runs right of the edit shift by the measured width delta. Drag a region for wholesale replacement (`editTextInRegion`). Engine in `src/main/pdfiumEngine.ts` (`getLineAt`/`replaceLineAt`/`getAllTextLines`); see also the opt-in PDFium HD page renderer (Tools → Display → HD Render) and the persistent render session
- Paragraph editing with reflow — **removed by user request (2026-06-11)**: Edit Text is line-by-line only. The engine functions (`getParagraphAt`/`replaceParagraphAt` in pdfiumEngine.ts) remain for potential future use but have no IPC/UI surface. Do not re-add the paragraph-first click path without explicit instruction
- [x] **PDF/A-2b export** — Export → PDF/A tab (`src/main/pdfaExport.ts`): XMP pdfaid identification (unfiltered Metadata stream, Info-synced), sRGB output intent from the Windows ICC profile, trailer /ID, JS/attachments stripped, annotation flags fixed; unembeddable issues (missing fonts, encryption) reported honestly as blockers. Proof: `scripts/prove-pdfa.mjs`
- [x] Typewriter tool — click anywhere on a page and type new text; no box border; saved as FreeText annotation
- [x] Image insertion — insert PNG/JPEG onto any page, placed at page center; drag to move, drag corner handle to resize; deleted with eraser or select+Delete; baked into PDF content stream on save
- [ ] Crop page

### Phase 8 — Security & Metadata ✅
- [x] View and edit document metadata (title, author, subject, keywords) — ℹ Info button in toolbar
- [x] Password-protect PDF — user password (open), owner password (permissions), AES-256 via MuPDF
- [x] Set permission flags: print, copy, edit, annotate — applied via MuPDF encryption options
- [x] Remove password from PDF — enter current password to decrypt
- [x] Open password-protected PDFs — password prompt appears automatically on open
- [ ] Flatten/sanitize document

**How to test each feature:**
| Feature | Steps |
|---|---|
| **View metadata** | Open PDF → click "ℹ Info" → see title, author, subject, keywords |
| **Edit metadata** | Click "ℹ Info" → change fields → Save → reopen → changes persist |
| **Protect PDF** | Click "🔒 Security" → enter owner password (required) + optional user password → Apply → Ctrl+S → reopen file → prompted for password |
| **Permissions** | In Security dialog, uncheck e.g. "Allow Copying" → Apply → save → open in a viewer → copy disabled |
| **Remove password** | Open a protected PDF → enter password → open → click "🔒 Security" → Remove Password tab → enter current password → Remove → save |
| **Open encrypted PDF** | Open any AES/RC4 encrypted PDF → password dialog appears automatically |
| **Redact area** | Click "REDACT" tool → drag a rectangle over text/image → red striped box appears |
| **Apply redactions** | After marking areas, click "⚠ Apply N Redactions" → warning dialog → confirm → content is permanently removed |
| **Verify redaction** | After applying, Ctrl+S → open in any PDF viewer → try to select/copy text in redacted area — nothing is there |
| **Verify text extraction** | After saving, run `pdftotext file.pdf -` or open with PDF.js text layer — redacted text does not appear |

### Phase 9 — Bookmarks & Signatures ✅

#### Bookmarks / Document Outline
- [x] View bookmarks — loaded from PDF outline on open (MuPDF `loadOutline`)
- [x] Navigate — click any bookmark to scroll to that page
- [x] Add bookmark — "+" button adds one for the current page with editable title
- [x] Rename bookmark — double-click title to edit in place
- [x] Delete bookmark — hover × button removes it
- [x] Reorder bookmarks — drag-and-drop to change order
- [x] Persist bookmarks — written into PDF outline on every Ctrl+S / Save As (MuPDF `outlineIterator`)

**How to test:**
| Feature | Steps |
|---|---|
| **View** | Open a PDF that has bookmarks (e.g. a technical manual) → click "🔖 Bookmarks" in toolbar → panel shows list |
| **Navigate** | Click any bookmark → page scrolls to it |
| **Add** | With a PDF open, navigate to any page → click "🔖 Bookmarks" → click "+" → type a name → press Enter |
| **Rename** | Double-click a bookmark title → edit → press Enter or click away |
| **Delete** | Hover over a bookmark → click × |
| **Reorder** | Drag a bookmark row to a new position in the list |
| **Persist** | Add/rename/delete bookmarks → Ctrl+S → reopen → changes are saved |

#### Signatures

##### Visible Signature (image stamp)
- [x] Draw signature — freehand canvas in the "✍ Sig" toolbar button → modal
- [x] Upload signature — upload any image as a signature
- [x] Place on page — after capturing, click any page location to stamp it
- [x] Persists in PDF — saved as an image annotation (same as custom stamp)

**How to test:**
| Feature | Steps |
|---|---|
| **Draw & place** | Open PDF → click "✍" in annotation toolbar → draw signature on canvas → "Use Signature" → click on page to stamp |
| **Upload & place** | Click "✍" → "📁 Upload" tab → browse to a PNG/JPEG → "Use Signature" → click on page |
| **Persist** | Place signature → Ctrl+S → reopen → signature is still on the page |

##### Digital (Cryptographic) Signature
- [x] Sign PDF with PFX/P12 certificate — browse for certificate file, enter password, fill signer info (name, reason, location, contact)
- [x] Save signed copy — signed PDF saved as a separate file (original unchanged)
- [x] Standard format — PKCS#7/CMS detached signature, compatible with Adobe Acrobat, Foxit, PDF readers
- [x] Verify signatures — "✅ Verify" tab shows signer CN, organisation, cert validity dates
- [ ] Cryptographic hash integrity check (certificate info shown; full byte-range hash verification planned)

**Implementation note:** MuPDF WASM has no signing API. Digital signing uses `@signpdf/signpdf` + `@signpdf/signer-p12` (PKCS#7) in the Electron main process (Node.js), with `node-forge` for certificate parsing during verification.

**How to test:**
| Feature | Steps |
|---|---|
| **Sign** | Open PDF → click "🔏 Sign" in toolbar → "✒ Sign" tab → browse to a .pfx/.p12 → enter password → fill reason → "🔏 Sign & Save Copy" → pick output path |
| **Verify** | Open a signed PDF → "🔏 Sign" → "✅ Verify" tab → "Check Signatures" → see signer name and cert validity |
| **Verify with Adobe** | Sign a PDF → open the saved copy in Adobe Acrobat → signature panel shows valid signature |

### Phase 10 — Polish & UX ✅
- [x] Dark/light theme toggle — ☀/🌙 button in toolbar; CSS variables via `data-theme` attribute; persisted in settings
- [x] App settings dialog (Ctrl+,) — default zoom, theme, OCR language, autosave interval, page number badges; stored in `localStorage`
- [x] Autosave — configurable interval (1/2/5/10/30 min or off); silently overwrites file when dirty
- [x] Keyboard shortcut reference panel (F1) — full two-column reference with all shortcuts
- [x] Print support (Ctrl+P) — real PDF printing: Print dialog (range / current / all, 150–600 DPI), pages rendered by MuPDF at print resolution and handed to the system print dialog (`print:pdf` IPC). Never prints the app DOM.
- [x] Find & Replace — expand search bar with ▶ toggle; replace works on text annotations (textbox, typewriter, stickynote); original PDF stream replacement noted as requiring native MuPDF
- [x] Robust error handling — corrupt/unreadable file shows inline error on start screen; password-protected files show password prompt with clear error feedback; all errors caught and displayed
- [x] Window title sync — title bar shows `filename — Monstera PDF Editor` with ● dirty indicator
- [x] Start screen improvements — feature grid, keyboard hint, open error display
- [x] Default zoom applied on file open — respects `defaultZoom` setting
- [x] Home/End keys — jump to first/last page
- [ ] Auto-updater (electron-updater) — not needed for personal use
- [ ] Customizable toolbar — deferred; toolbar is fixed but complete

**How to test:**
| Feature | Steps |
|---|---|
| **Theme toggle** | Click ☀ or 🌙 in toolbar top-right → UI switches between dark and light |
| **Settings** | Ctrl+, or ⚙ button → change zoom default, theme, OCR lang, autosave → Apply |
| **Autosave** | Settings → set autosave to 1 min → edit PDF → wait → file auto-saves |
| **Shortcuts** | F1 or ? button → full keyboard reference dialog |
| **Print** | Open PDF → Ctrl+P or 🖨 Print → system print dialog appears |
| **Find & Replace** | Ctrl+F → click ▶ arrow → type in Replace field → "1" replaces current, "All" replaces all annotations |
| **Error handling** | Try to open a corrupt file → error shown on start screen; open encrypted PDF → password dialog |
| **Window title** | Open any PDF → title bar shows filename; make edit → ● appears |

---

## Build Commands

```bash
# Development (live reload)
npm run dev

# Production build (Vite + TypeScript compile only — no installer)
npm run build:vite && npm run build:electron

# Full installer build (NSIS + portable .exe) — run when ready to package
npm run build
```

## Output locations (after `npm run build`)
- Installer: `release\Monstera PDF Editor Setup 0.1.0.exe`
- Portable:  `release\Monstera PDF Editor 0.1.0.exe`
- Unpacked:  `release\win-unpacked\Monstera PDF Editor.exe`

### Phase 11 — Export ✅
- [x] Export pages to PNG or JPEG — choose pages (range or "all"), DPI (72–300), format, quality; each page saved as separate file to a chosen folder
- [x] Extract all text to .txt — uses PDF.js getTextContent; one section per page; scanned pages without OCR produce no text
- [x] PDF → Word (.docx) — best-effort text extraction via MuPDF + `docx` npm package. **Quality limitation:** layout, images, tables, columns, and exact fonts are NOT preserved. Output is a readable paragraph-per-paragraph text copy. For layout-faithful conversion, use Adobe Acrobat or a dedicated service.

**How to test:**
| Feature | Steps |
|---|---|
| **Export images** | Open PDF → annotation toolbar "↗ Export" → Images tab → set pages/format/DPI → Export Images → pick folder → files saved |
| **Single page PNG** | Set Pages to "1", DPI to 150 → Export → folder has one file |
| **JPEG quality** | Set Format to JPEG → Quality slider → smaller files at lower quality |
| **Extract text** | Export → Text tab → Save as .txt → open file → text from each page |
| **DOCX export** | Export → Word tab → read quality warning → Export to Word → open in Word → readable text, no layout |
| **Typewriter** | Annotation toolbar → Ꭲ button → click anywhere on page → type → Enter or click away → text placed |
| **Text-edit** | Annotation toolbar → ab→cd button → drag over existing text region → type replacement → blur → white rect covers original, new text on top |
| **Insert image** | Annotation toolbar → 🖼 button → pick PNG/JPEG → image appears at page center |
| **Move image** | Select/no tool → drag the placed image to reposition |
| **Resize image** | Select image → drag the blue corner handle to resize |
| **Delete image** | Eraser tool + click image, or select image + Delete key |
| **Save images** | Place image → Ctrl+S → reopen → image is baked into PDF and renders via PDF.js |

### Phase 12 — Advanced Features (Batch 10) ✅

#### Multi-tab document management
- [x] Open multiple PDFs simultaneously — each in its own tab
- [x] Tab bar shows open documents; click to switch; × to close
- [x] Unsaved-changes indicator per tab
- [x] Switching tabs snapshots/restores full PDF state (bytes, annotations, forms, bookmarks, scale)

**How to test:**
| Feature | Steps |
|---|---|
| **Open multiple** | Open one PDF → File → Open another → tab bar appears with both |
| **Switch tabs** | Click a tab → document switches instantly |
| **Close tab** | Click × on tab → prompts to save if dirty |

#### Split View
- [x] Show any two pages side by side in a full-screen panel
- [x] Independent page selectors per panel; "Both ◀/▶" navigates both together
- [x] Renders via PDF.js at current zoom

**How to test:** Home tab → ⧉ Split View (or Tools tab → View group) → two-panel view opens

#### Blurred Redaction
- [x] Toggle between solid-black redaction and blurred redaction using the ▪/〜 button next to REDACT
- [x] Blurred mode: captures a blurred snapshot of the region, then MuPDF **permanently removes the underlying content** (same true removal as solid mode); the blur image is overlaid as a cosmetic placed-image
- [x] Solid mode: permanent content removal via MuPDF with a black box
- [x] Both modes can be mixed in the same document; apply executes both in one pass

**How to test:**
| Feature | Steps |
|---|---|
| **Blur mode** | Select REDACT tool → click 〜 toggle → drag redaction box → shows "BLUR" preview |
| **Apply blur** | Click ⚠ Apply Redactions → blurred overlay appears |
| **Solid mode** | Click ▪ toggle → drag box → apply → content permanently removed |

#### Smooth / Continuous Zoom
- [x] Page resize transitions — CSS `transition: width/height 0.15s ease` on page wrappers
- [x] Zoom changes visually animate instead of jumping

#### Markdown → PDF
- [x] Convert Markdown text to PDF — regex-based converter → HTML → offscreen BrowserWindow → `printToPDF`
- [x] Mode: new PDF or append to open document
- [x] Load .md file from disk via Open button

**How to test:** Tools tab → Import group → Markdown → type or paste markdown → Convert → PDF produced

#### CSV → PDF
- [x] Convert CSV/spreadsheet data to a formatted PDF table — XLSX.js parses CSV → HTML table → `printToPDF` (landscape)
- [x] Shows row × column count preview
- [x] Mode: new PDF or append

**How to test:** Tools tab → Import → CSV → paste CSV data → Convert → formatted table PDF

#### Email Document
- [x] Opens system email client with current PDF attached path in mailto body
- [x] "Save PDF & Open Email" button saves then opens mailto

**How to test:** Tools tab → Email → fill recipient/subject → Open Email Client

#### Edit in External App
- [x] Exports current page as PNG (MuPDF at scale 2×) to temp folder, opens with system image editor
- [x] Reimport button reads the saved PNG back as a placed-image overlay

**How to test:** Tools tab → Edit & OCR → Ext Edit → page opens in default image editor → edit → Reimport

#### Tagged PDF / Reading Order
- [x] Detects H1–H5 headings from MuPDF bookmarks extraction
- [x] Sets document title, language, and Subject/Keywords for accessibility via mupdfSetMetadata
- [x] Displays hierarchical structure with color-coded heading levels

**How to test:** Tools tab → Document → Tagged PDF → view structure → set language → Apply

#### Import Pages to Layer (OCG)
- [x] Imports first page of another PDF as an Optional Content Group (layer)
- [x] Layer name, target page, and opacity controls
- [x] OCG registered in PDF catalog's OCProperties

**How to test:** Tools tab → Document → Layers → Browse source PDF → set layer name → Import

#### OCR Selected Region
- [x] Draw a rectangle on any page; runs Tesseract on just that crop
- [x] Extracted text shown in dialog; copy to clipboard or insert as typewriter annotation

**How to test:** Tools tab → Edit & OCR → OCR Region → drag over scanned text → OCR runs → text extracted

#### Deskew / Enhance Scanned Pages
- [x] Projection-based skew detection: renders page at 0.5× scale, binarizes, tests angles −10° to +10° (0.5° steps), picks angle with maximum horizontal projection variance
- [x] Applies correction via `pdfPage.setRotation()` for whole-degree angles
- [x] Contrast enhancement via pixel-level stretch (factor 1.4) applied as placed-image overlay

**How to test:** Tools tab → Edit & OCR → Deskew → run analysis → review detected angle → Apply

#### Webcam Image Capture
- [x] Access device camera, capture a frame, insert onto any page as placed-image annotation

**How to test:** Tools tab → Manage → Webcam → allow camera → Capture → image placed on current page

#### Page Transition Effects
- [x] Set slide-show page transition effects (Fade, Wipe, Push, Fly, Uncover, Cover, Dissolve)
- [x] Per-page or all-pages mode; duration and direction controls
- [x] Written as PDF /Trans entries via pdf-lib

**How to test:** Tools tab → Document → Transitions → pick effect → Apply

#### Generate TOC from Bookmarks
- [x] Auto-generates a table of contents page from existing bookmarks
- [x] Inserts as a new first page with formatted text entries and page numbers

**How to test:** Open PDF with bookmarks → Tools → Document → TOC → Generate → new page inserted

#### Multi-Page Stamp
- [x] Copy any selected annotation to multiple pages at once
- [x] Page range input (e.g. "1-5, 7, 10-12")

**How to test:** Select an annotation → Comment tab → ⊕ Multi-Page → enter page range → Apply

#### Cloud Storage (OneDrive, Box, SharePoint)
- [x] Browse and open PDFs from OneDrive (Microsoft Graph API), Box (api.box.com), SharePoint
- [x] Token-based authentication; tokens stored in app settings
- [x] Extends existing Google Drive / Dropbox cloud storage panel

**How to test:** Tools → Manage → Cloud → configure token for OneDrive/Box/SharePoint → browse files

#### Find Duplicate Pages
- [x] Compares all pages by content hash; lists duplicate sets
- [x] Select duplicates to delete

**How to test:** Tools → Manage → Find Duplicates → analysis runs → duplicates listed

#### Type Signature
- [x] Type name in a styled font and use as a signature stamp
- [x] Font choices (cursive/script styles), color picker
- [x] Rendered to canvas dataURL and placed as image annotation

**How to test:** Annotation toolbar → ✍ → Type tab → type name → pick font → Use Signature
