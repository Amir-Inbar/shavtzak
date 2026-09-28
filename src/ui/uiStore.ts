// Transient UI: stacked sheets (with browser back support), a confirm dialog and toasts.
import { useSyncExternalStore, type ReactNode } from 'react';

export interface DialogItem { lv: 'warn' | 'bad' | 'info'; text: string }
export interface DialogReq { title: string; text?: string; items?: DialogItem[]; ok?: string; cancel?: string; danger?: boolean; resolve: (v: boolean) => void }
export interface ToastReq { id: number; msg: string; undo: boolean }
interface UIState { sheets: { id: number; render: () => ReactNode }[]; dialog: DialogReq | null; toast: ToastReq | null; search: string }

let ui: UIState = { sheets: [], dialog: null, toast: null, search: '' };
const subs = new Set<() => void>();
const set = (p: Partial<UIState>) => { ui = { ...ui, ...p }; subs.forEach(f => f()); };
export function useUI() { return useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => ui); }

let seq = 0;
/** history entries we still owe the browser (closed sheets whose entry hasn't been popped yet) */
let pendingBack = 0;
const depthOf = (st: unknown) => (st && typeof st === 'object' && 'sheetDepth' in st ? Number((st as { sheetDepth: number }).sheetDepth) || 0 : 0);

/** Open a sheet on top of the stack. The phone's back button closes it. */
export function openSheet(render: () => ReactNode) {
  set({ sheets: [...ui.sheets, { id: ++seq, render }] });
  try {
    // reuse an entry that is about to be popped instead of pushing and popping in the same tick
    if (pendingBack > 0) { pendingBack--; history.replaceState({ sheetDepth: ui.sheets.length }, ''); }
    else history.pushState({ sheetDepth: ui.sheets.length }, '');
  } catch { /* ignore */ }
}
/** Swap the top sheet for another without touching history (e.g. surprise → picker). */
export function replaceSheet(render: () => ReactNode) {
  if (!ui.sheets.length) return openSheet(render);
  set({ sheets: [...ui.sheets.slice(0, -1), { id: ++seq, render }] });
}
/** Close the top n sheets. All history steps are taken in one go, so browsers can't merge them. */
export function closeSheet(n = 1) {
  n = Math.min(n, ui.sheets.length);
  if (n <= 0) return;
  set({ sheets: ui.sheets.slice(0, ui.sheets.length - n) });
  if (!pendingBack) queueMicrotask(flushBack);
  pendingBack += n;
}
function flushBack() {
  const n = pendingBack; pendingBack = 0;
  if (n > 0) { try { history.go(-n); } catch { /* ignore */ } }
}
export function closeAllSheets() { closeSheet(ui.sheets.length); }

window.addEventListener('popstate', e => {
  if (ui.dialog) { ui.dialog.resolve(false); set({ dialog: null }); }
  // the entry we landed on says how many sheets should be open
  const depth = depthOf(e.state);
  if (ui.sheets.length > depth) set({ sheets: ui.sheets.slice(0, depth) });
});

export function confirmDialog(o: Omit<DialogReq, 'resolve'>): Promise<boolean> {
  return new Promise(resolve => set({ dialog: { ...o, resolve } }));
}
export function answerDialog(v: boolean) {
  const d = ui.dialog; if (!d) return;
  set({ dialog: null }); d.resolve(v);
}

let toastTimer: number | undefined;
export function toast(msg: string, opts: { undo?: boolean } = {}) {
  const id = ++seq;
  set({ toast: { id, msg, undo: !!opts.undo } });
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { if (ui.toast?.id === id) set({ toast: null }); }, opts.undo ? 6500 : 3500);
}
export function hideToast() { set({ toast: null }); }

/** the soldier being looked for: his name lights up in every cell (like search in a spreadsheet) */
export function setSearch(q: string) { set({ search: q }); }
