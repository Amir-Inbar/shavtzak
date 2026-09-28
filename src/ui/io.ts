// Files and clipboard.
import { toast } from './uiStore';

export function canShareFiles(files: File[]): boolean {
  try { return !!(navigator.canShare && navigator.canShare({ files })); } catch { return false; }
}

export function downloadFile(file: File) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export async function copyText(txt: string, msg: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(txt); toast(msg); return true; } catch {
    // fallback for browsers that block the async clipboard
    const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove();
    toast(ok ? msg : 'ההעתקה נחסמה בדפדפן'); return ok;
  }
}
