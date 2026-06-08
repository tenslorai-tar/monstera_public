// Electron utilityProcess host for MuPDF.
//
// Runs the (synchronous, CPU-heavy) MuPDF WASM operations off the main thread so
// they no longer freeze the UI. The main process forks this file, then sends
// { id, op, args } messages; we reply with { id, result } or { id, error }.
//
// On startup we eagerly load the MuPDF module and report readiness. If it fails
// to load in this environment, we tell the parent so it falls back to running
// MuPDF in the main process (features keep working, just on-thread).

import * as ops from './mupdfOps'

// In a utilityProcess, the channel to the parent is process.parentPort.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parentPort: any = (process as any).parentPort

if (parentPort) {
  // Warm up MuPDF and report whether this process can do the work at all.
  ops.getMupdf()
    .then(() => parentPort.postMessage({ __ready: true }))
    .catch((e: unknown) => parentPort.postMessage({ __ready: false, error: e instanceof Error ? e.message : String(e) }))

  parentPort.on('message', async (e: { data: { id: number; op: string; args: unknown[] } }) => {
    const { id, op, args } = e.data
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fn = (ops as any)[op]
      if (typeof fn !== 'function') throw new Error(`Unknown MuPDF op: ${op}`)
      const result = await fn(...(args ?? []))
      parentPort.postMessage({ id, result })
    } catch (err) {
      parentPort.postMessage({ id, error: err instanceof Error ? err.message : String(err) })
    }
  })
}
