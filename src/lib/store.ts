// App state: persistence in localStorage, immutable commits and undo.
import { useSyncExternalStore } from 'react';
import type { State } from './types';
import { normalize } from './normalize';
export { normalize };
import { sampleState } from './sample';
import { defaults } from './defaults';
export { defaults };

export const KEY = 'shavtzak.v3';

/* ---------------- store ---------------- */
let state: State;
let storageOk = true;
const undoStack: State[] = [];
const subs = new Set<() => void>();

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch { storageOk = false; }
  return sampleState();
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); storageOk = true; } catch { storageOk = false; }
}
state = load();
persist();

const emit = () => subs.forEach(f => f());
export const getState = () => state;
export const isStorageOk = () => storageOk;
export const canUndo = () => undoStack.length > 0;
export function subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }
export function useAppState(): State { return useSyncExternalStore(subscribe, getState); }

/**
 * Apply a change to a copy of the state. Return false from the recipe to cancel.
 * Every commit can be undone.
 */
export function commit(recipe: (draft: State) => void | false): boolean {
  const draft = structuredClone(state);
  if (recipe(draft) === false) return false;
  undoStack.push(state);
  if (undoStack.length > 80) undoStack.shift();
  state = { ...draft }; // fresh identity: never reuse an index cached while the draft was edited
  persist();
  emit();
  return true;
}
export function undo(): boolean {
  const prev = undoStack.pop();
  if (!prev) return false;
  state = prev; persist(); emit();
  return true;
}
/** version bookkeeping for shared images – not an undoable user change */
export function silentUpdate(recipe: (draft: State) => void) {
  const draft = structuredClone(state); recipe(draft); state = { ...draft }; persist(); emit();
}
