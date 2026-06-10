// Single place that wires the PDF.js worker. Importing this module guarantees
// GlobalWorkerOptions.workerSrc points at a real bundled asset.
//
// The previous `new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url)`
// pattern silently 404'd under Vite (bare package specifiers aren't rewritten
// inside new URL), so PDF.js fell back to its "fake worker" and parsed every
// document on the UI thread. The ?url import makes Vite bundle the worker and
// hand back the correct asset URL in both dev and production.
import * as pdfjsLib from 'pdfjs-dist'
// eslint-disable-next-line import/no-unresolved
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
