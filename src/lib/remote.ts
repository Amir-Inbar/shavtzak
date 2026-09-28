// A board published on the site, encrypted with a code only the manager has.
// The public repo and site only ever hold the ciphertext (AES-GCM, key from PBKDF2-SHA256).
export interface RemoteBoard { v: 1; iterations: number; salt: string; iv: string; data: string; updatedAt: number }

const KEY_STORE = 'shavtzak.remoteKey';
const APPLIED = 'shavtzak.remoteAt';

const b64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
/** codes are forgiving: case, spaces and dashes don't matter */
export const cleanCode = (c: string) => c.toLowerCase().replace(/[^a-z0-9]/g, '');

export async function fetchRemote(): Promise<RemoteBoard | null> {
  try {
    const r = await fetch('./board.enc.json', { cache: 'no-cache' });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.v === 1 && j.data ? (j as RemoteBoard) : null;
  } catch { return null; }
}

/** throws when the code is wrong */
export async function decryptRemote(r: RemoteBoard, code: string): Promise<unknown> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(cleanCode(code)), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(r.salt), iterations: r.iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(r.iv) }, key, b64(r.data));
  return JSON.parse(new TextDecoder().decode(plain));
}

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
export const savedCode = () => get(KEY_STORE);
export const saveCode = (c: string) => put(KEY_STORE, cleanCode(c));
export const appliedAt = () => Number(get(APPLIED) || 0);
export const markApplied = (t: number) => put(APPLIED, String(t));
