import { create } from 'zustand'

export type ToastKind = 'info' | 'success' | 'error'
export interface Toast { id: string; kind: ToastKind; message: string }

interface ToastStore {
  toasts: Toast[]
  push: (kind: ToastKind, message: string, timeoutMs?: number) => string
  dismiss: (id: string) => void
}

// A tiny global toast queue. Lives in a zustand store (not React context) so it
// can be called from anywhere — components, hooks, stores, plain utils — which is
// exactly where the old `alert()` calls and swallowed errors lived.
export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (kind, message, timeoutMs) => {
    const id = Math.random().toString(36).slice(2)
    const ttl = timeoutMs ?? (kind === 'error' ? 8000 : 3500)
    set(s => ({ toasts: [...s.toasts.slice(-4), { id, kind, message }] }))
    if (ttl > 0) setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), ttl)
    return id
  },
  dismiss: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}))

export const toast = {
  info:    (m: string) => useToastStore.getState().push('info', m),
  success: (m: string) => useToastStore.getState().push('success', m),
  error:   (m: string) => useToastStore.getState().push('error', m),
}
