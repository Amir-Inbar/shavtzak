// Operations on the real board, for the MCP server. The board lives in data/board.json (git-ignored,
// never public). Publishing encrypts it into public/board.enc.json and pushes – the site then offers it.
import { execFileSync } from 'node:child_process';
import { webcrypto as crypto } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize } from '../src/lib/normalize';
import { defaults } from '../src/lib/defaults';
import { boardDays, cellKey, daySlots, evaluate, extrasOn, peopleInRole, roleOf, slotInfo, slotOf, slotsOfPerson, autoAssign, orderedShifts } from '../src/lib/slots';
import { combinedRows } from '../src/lib/combined';
import { parsePeople, qualsFor } from '../src/lib/pasteList';
import { rankOf } from '../src/lib/rank';
import type { Person, Post, Slot, State } from '../src/lib/types';
import { WD, addDaysKey, dm, fromKey, hm, parseHM, todayKey, toKey, uid } from '../src/lib/time';

// mcp/dist/server.mjs → repo root is two levels up
export const REPO = process.env.SHAVTZAK_REPO || join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOARD = join(REPO, 'data', 'board.json');
const CODE = join(REPO, 'data', '.code');
const ENC = join(REPO, 'public', 'board.enc.json');
export const SITE = 'https://amir-inbar.github.io/shavtzak/';

/* ---------------- load / save ---------------- */
export function load(): State {
  if (!existsSync(BOARD)) return defaults();
  const j = JSON.parse(readFileSync(BOARD, 'utf8'));
  return normalize(j.state ?? j);
}
export function save(s: State) {
  writeFileSync(BOARD, JSON.stringify({ app: 'shavtzak', format: 3, exportedAt: Date.now(), to: '', state: s }, null, 1));
}
/** apply a change to the board file; the recipe gets a fresh state each time */
export function change<T>(fn: (s: State) => T): T {
  const s = load(); const r = fn(s); save({ ...s }); return r;
}

/* ---------------- lookups (forgiving, like people write in a sheet) ---------------- */
const words = (n: string) => n.trim().split(/\s+/).filter(Boolean);
/** other names kept in the note ("מחלקה 2 · לוחם · נועם בנלואיד" → "נועם בנלואיד") */
const META = /מחלקה|לוחם|מפקד|נהג|מסופח|חולה|עד |חוזר|יכול/;
const aliases = (p: Person) => p.note.split(' · ').map(x => x.trim()).filter(x => x && !META.test(x));
const fullName = (p: Person) => aliases(p).find(a => words(a).length > 1) ?? '';

export function findPerson(s: State, q: string): Person {
  const n = q.trim();
  const exact = s.people.filter(p => p.name === n || aliases(p).includes(n));
  if (exact.length === 1) return exact[0];
  const w = words(n);
  const loose = s.people.filter(p => {
    const all = [...words(p.name), ...aliases(p).flatMap(words)];
    return w.length === 1 ? all.includes(n) : w.every(x => all.includes(x)) || words(p.name).some(x => w.includes(x) && w[w.length - 1] === x);
  });
  if (loose.length === 1) return loose[0];
  if (!exact.length && !loose.length) throw new Error(`לא נמצא חייל בשם "${q}". חיילים: ${s.people.map(p => p.name).join(', ')}`);
  throw new Error(`השם "${q}" מתאים לכמה חיילים: ${[...exact, ...loose].map(p => p.name + (fullName(p) ? ` (${fullName(p)})` : '')).join(', ')}. כתוב שם מלא.`);
}

export function findPost(s: State, q: string): Post {
  const n = q.trim();
  const p = s.posts.find(x => x.name === n) ?? s.posts.find(x => x.name.includes(n) || n.includes(x.name));
  if (!p) throw new Error(`לא נמצאה עמדה "${q}". עמדות: ${s.posts.map(x => x.name).join(', ')}`);
  return p;
}

/** "2026-09-30", "רביעי", "יום רביעי", "היום", "מחר" → a date inside the board period */
export function findDay(s: State, q: string): string {
  const n = q.trim().replace(/^יום\s+/, '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(n)) return n;
  if (n === 'היום') return todayKey();
  if (n === 'מחר') return addDaysKey(todayKey(), 1);
  const i = WD.indexOf(n);
  if (i >= 0) {
    const d = boardDays(s).find(k => new Date(fromKey(k)).getDay() === i);
    if (d) return d;
    throw new Error(`יום ${n} לא נמצא בתקופת הלוח (${boardDays(s).join(', ')})`);
  }
  throw new Error(`לא הבנתי את היום "${q}". כתוב תאריך YYYY-MM-DD או שם יום (שלישי).`);
}

const normHM = (t: string) => { const m = t.trim().match(/^(\d{1,2})(?::(\d{2}))?/); if (!m) throw new Error(`שעה לא תקינה: ${t}`); return `${m[1].padStart(2, '0')}:${m[2] ?? '00'}`; };

export function findSlot(s: State, post: Post, day: string, time?: string): Slot {
  const date = findDay(s, day);
  if (post.allDay || post.shifts.length === 1) {
    const sl = slotOf(s, cellKey(post.id, date, post.shifts[0].id)); if (sl) return sl;
  }
  if (!time) throw new Error(`ל${post.name} יש כמה משמרות – ציין שעת התחלה (${post.shifts.map(x => x.start).join(', ')})`);
  const t = normHM(time);
  const sh = post.shifts.find(x => x.start === t);
  if (!sh) throw new Error(`אין ל${post.name} משמרת שמתחילה ב־${t}. משמרות: ${post.shifts.map(x => `${x.start}–${x.end}`).join(', ')}`);
  return slotOf(s, cellKey(post.id, date, sh.id))!;
}

/* ---------------- reading ---------------- */
const nameOf = (s: State, id: string) => s.people.find(p => p.id === id)?.name ?? '?';

/** the board as text, laid out like the combined roster table */
export function boardText(s: State): string {
  const days = boardDays(s);
  const children = new Set(s.posts.filter(p => p.within).map(p => p.id));
  const posts = s.posts.filter(p => !children.has(p.id));
  const out: string[] = [`${s.settings.title} · ${days.map(d => `${WD[new Date(fromKey(d)).getDay()]} ${dm(fromKey(d))}`).join(' – ')}`];
  out.push(`עמדות: ${s.posts.map(p => `${p.name}${p.allDay ? ' (כל היום)' : ` (${orderedShifts(p).map(x => `${x.start}–${x.end}`).join(', ')})`}${p.roles.length > 1 ? ` [${p.roles.map(r => `${r.name}×${r.count}${r.qual ? `/${r.qual}` : ''}`).join(', ')}]` : ''}${p.within ? ` ← מתוך ${s.posts.find(x => x.id === p.within!.postId)?.name}` : ''}`).join(' · ')}`);
  for (const d of days) {
    out.push('', `יום ${WD[new Date(fromKey(d)).getDay()]} ${d}`);
    for (const row of combinedRows(s, d, posts)) {
      const cells = posts.map((p, i) => {
        const c = row.cells[i];
        if (c.kind === 'cont') return `${p.name}: —`;
        if (c.kind === 'none') return '';
        const sl = c.slot;
        const who = p.roles.length > 1 ? p.roles.map(r => `${r.name}=${peopleInRole(sl, r).map(id => nameOf(s, id)).join(', ') || '∅'}`).join('; ') : sl.assigned.map(id => nameOf(s, id)).join(', ') || '∅';
        const listen = s.posts.filter(x => x.within?.postId === p.id).flatMap(x => listenLines(s, x, sl));
        return `${p.name}: ${who}${listen.length ? ` {האזנה: ${listen.join(', ')}}` : ''}`;
      }).filter(Boolean);
      out.push(`  ${hm(row.start)}–${hm(row.end)} | ${cells.join(' | ')}`);
    }
    for (const x of extrasOn(s, d)) out.push(`  משימה נוספת: ${x.name} ${hm(x.start)}–${hm(x.end)}: ${x.assigned.map(id => nameOf(s, id)).join(', ') || '∅'}`);
  }
  return out.join('\n');
}
function listenLines(s: State, child: Post, parent: Slot): string[] {
  const all = [...boardDays(s), addDaysKey(boardDays(s)[boardDays(s).length - 1], 1)].flatMap(d => daySlots(s, d, child));
  return all.filter(x => x.start >= parent.start && x.end <= parent.end).sort((a, b) => a.start - b.start)
    .map(x => `${hm(x.start)} ${x.assigned.map(id => nameOf(s, id)).join('/') || '∅'}`);
}

export function peopleText(s: State): string {
  const days = boardDays(s);
  const groups = new Map<string, Person[]>();
  for (const p of [...s.people].sort((a, b) => (a.team || 'ת').localeCompare(b.team || 'ת', 'he') || a.name.localeCompare(b.name, 'he'))) {
    const k = rankOf(p); groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  return [...groups.entries()].map(([k, list]) => `${k} (${list.length})\n` + list.map(p => {
    const n = slotsOfPerson(s, p.id).filter(x => days.includes(x.date)).length;
    const un = p.unavail.filter(u => u.end > Date.now()).map(u => `לא זמין ${u.reason} ${toKey(u.start)}→${toKey(u.end)}`);
    return `  ${p.name}${fullName(p) ? ` (${fullName(p)})` : ''} · ${p.team || 'ללא מחלקה'}${p.quals.length ? ` · ${p.quals.join('/')}` : ''} · ${n} משמרות${un.length ? ` · ${un.join('; ')}` : ''}`;
  }).join('\n')).join('\n\n');
}

/** every rule problem on the board: empty seats, overlaps, unavailable people, short rest, missing qualifications */
export function checkText(s: State): string {
  const out: string[] = [];
  const days = boardDays(s);
  for (const d of days) for (const p of s.posts) for (const sl of daySlots(s, d, p)) {
    if (!sl.need && !sl.assigned.length) continue;
    const inf = slotInfo(s, sl);
    const where = `${p.name} ${d} ${hm(sl.start)}`;
    if (inf.missing) out.push(`חסרים ${inf.missing}: ${where}${inf.roles.filter(r => r.missing).map(r => ` (${r.role.name} ${r.missing})`).join('')}`);
    for (const pid of sl.assigned) { const e = evaluate(s, pid, sl); if (e.status !== 'ok') out.push(`${e.status === 'block' ? 'חסום' : 'אזהרה'}: ${nameOf(s, pid)} ב${where} – ${e.reasons.join('; ')}`); }
    for (const r of inf.roles) for (const w of r.wrongQual) out.push(`כשירות: ${w.name} בתפקיד ${r.role.name} ב${where} ואינו ${r.role.qual}`);
  }
  return out.length ? out.join('\n') : 'אין בעיות: כל המקומות מאוישים ואין הפרות כללים.';
}

/* ---------------- changing ---------------- */
export function assign(s: State, a: { post: string; day: string; time?: string; role?: string; people: string[]; mode?: 'replace' | 'add' }): string {
  const post = findPost(s, a.post);
  const sl = findSlot(s, post, a.day, a.time);
  const role = post.roles.length > 1 ? (a.role ? post.roles.find(r => r.name === a.role!.trim() || r.name.includes(a.role!.trim())) : null) : null;
  if (post.roles.length > 1 && !role) throw new Error(`ל${post.name} יש תפקידים (${post.roles.map(r => r.name).join(', ')}) – ציין role`);
  const ids = a.people.filter(x => x.trim() && x.trim() !== '-' && x.trim() !== '—').map(n => findPerson(s, n).id);
  const c = s.cells[sl.key] ?? (s.cells[sl.key] = { assigned: [] });
  if ((a.mode ?? 'replace') === 'replace') {
    const out = role ? c.assigned.filter(pid => (c.roleOf?.[pid] ?? roleOf(sl, pid)?.id) === role.id) : [...c.assigned];
    c.assigned = c.assigned.filter(pid => !out.includes(pid));
    if (c.roleOf) for (const pid of out) delete c.roleOf[pid];
  }
  for (const pid of ids) {
    // the same person again in the same shift (e.g. listening twice) – keep one seat
    if (!c.assigned.includes(pid)) c.assigned.push(pid);
    if (role) c.roleOf = { ...(c.roleOf ?? {}), [pid]: role.id };
  }
  const fresh = { ...s } as State; const now = slotOf(fresh, sl.key)!;
  const warns = ids.map(pid => { const e = evaluate(fresh, pid, now); return e.status !== 'ok' ? `${nameOf(s, pid)}: ${e.reasons.join('; ')}` : ''; }).filter(Boolean);
  return `${post.name} ${now.date} ${hm(now.start)}${role ? ` · ${role.name}` : ''}: ${ids.map(pid => nameOf(s, pid)).join(', ') || '(ריק)'}${warns.length ? `\nאזהרות: ${warns.join(' | ')}` : ''}`;
}

export function updatePeople(s: State, list: string, remove: string[] = []): string {
  const r = parsePeople(list, s.people);
  const withRank = (rank: string, q: string[]) => (rank ? qualsFor(rank, q.filter(x => x !== 'מפקד' && x !== 'נהג')) : q);
  for (const { p, from } of r.update) {
    const x = s.people.find(y => y.id === p.id)!;
    if (from.team) x.team = from.team;
    if (from.rank) { x.rank = from.rank; x.piece = ''; }
    x.quals = withRank(from.rank, x.quals);
    const extra = [from.name !== x.name ? from.name : '', ...from.notes].filter(Boolean);
    x.note = [...new Set([...x.note.split(' · ').filter(Boolean), ...extra])].join(' · ');
  }
  s.people.push(...r.add.map(x => ({ id: uid(), name: x.name, rank: x.rank, piece: '' as const, team: x.team, quals: withRank(x.rank, []), unavail: [], note: x.notes.join(' · ') })));
  const gone: string[] = [];
  for (const n of remove) {
    const p = findPerson(s, n); gone.push(p.name);
    s.people = s.people.filter(y => y.id !== p.id);
    for (const c of Object.values(s.cells)) { c.assigned = c.assigned.filter(a => a !== p.id); if (c.roleOf) delete c.roleOf[p.id]; }
    for (const x of s.extras) x.assigned = x.assigned.filter(a => a !== p.id);
  }
  return [r.add.length ? `נוספו ${r.add.length}: ${r.add.map(x => x.name).join(', ')}` : '', r.update.length ? `עודכנו ${r.update.length}` : '', gone.length ? `נמחקו: ${gone.join(', ')}` : '', r.dup.length ? `כפולים ברשימה: ${r.dup.join(', ')}` : ''].filter(Boolean).join('\n') || 'לא השתנה דבר';
}

export function editPerson(s: State, a: { name: string; newName?: string; rank?: string; team?: string; addQuals?: string[]; removeQuals?: string[]; note?: string; unavailable?: { from: string; to: string; reason?: string }[]; clearUnavailable?: boolean }): string {
  const p = findPerson(s, a.name);
  if (a.newName) p.name = a.newName.trim();
  if (a.rank) { p.rank = a.rank; p.piece = ''; p.quals = qualsFor(a.rank, p.quals.filter(x => x !== 'מפקד' && x !== 'נהג')); }
  if (a.team !== undefined) p.team = a.team;
  if (a.addQuals) p.quals = [...new Set([...p.quals, ...a.addQuals])];
  if (a.removeQuals) p.quals = p.quals.filter(x => !a.removeQuals!.includes(x));
  if (a.note !== undefined) p.note = a.note;
  if (a.clearUnavailable) p.unavail = [];
  for (const u of a.unavailable ?? []) {
    const t = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? fromKey(v) : new Date(v).getTime());
    const from = t(u.from), to = t(u.to);
    if (!(to > from)) throw new Error('unavailable.to צריך להיות אחרי from');
    p.unavail.push({ id: uid(), start: from, end: to, reason: u.reason ?? '' });
  }
  return `${p.name}: ${rankOf(p)} · ${p.team || 'ללא מחלקה'} · ${p.quals.join('/') || 'ללא כשירויות'}${p.unavail.length ? ` · ${p.unavail.length} חלונות אי־זמינות` : ''}`;
}

export function clearSlots(s: State, a: { post?: string; day?: string; time?: string; role?: string; all?: boolean }): string {
  if (a.all) { const n = Object.keys(s.cells).length; for (const c of Object.values(s.cells)) { c.assigned = []; c.roleOf = {}; } return `נוקו ${n} תאים`; }
  if (!a.post || !a.day) throw new Error('ציין post ו־day, או all=true');
  return assign(s, { post: a.post, day: a.day, time: a.time, role: a.role, people: [], mode: 'replace' });
}

export function setPeriod(s: State, start: string, days: number): string {
  s.board = { start: findDay({ ...s, board: { start, days } } as State, start), days: Math.max(1, Math.min(14, Math.round(days))) };
  return `תקופה: ${boardDays(s).join(', ')}`;
}

export function fill(s: State, a: { post?: string; day?: string }): string {
  const keys = boardDays(s).filter(d => !a.day || d === findDay(s, a.day)).flatMap(d => s.posts.filter(p => !a.post || p.id === findPost(s, a.post).id)
    .flatMap(p => p.shifts.map(sh => cellKey(p.id, d, sh.id))));
  const r = autoAssign(s, keys);
  return `שובצו אוטומטית ${r.added}${r.left ? ` · ${r.left} מקומות נשארו ריקים (אין מי שפנוי ונח מספיק)` : ''}`;
}

export function setPosts(s: State, posts: unknown): string {
  const n = normalize({ ...s, posts });
  s.posts = n.posts;
  return `עמדות: ${s.posts.map(p => p.name).join(', ')}`;
}

/* ---------------- publishing ---------------- */
function code(): string {
  if (existsSync(CODE)) return readFileSync(CODE, 'utf8').trim();
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const c = [...crypto.getRandomValues(new Uint8Array(12))].map(x => abc[x % abc.length]).join('').replace(/(.{4})(?=.)/g, '$1-');
  writeFileSync(CODE, c + '\n'); return c;
}
const clean = (c: string) => c.toLowerCase().replace(/[^a-z0-9]/g, '');

async function keyFrom(c: string, salt: Uint8Array, iterations: number, use: 'encrypt' | 'decrypt') {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(clean(c)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, [use]);
}

/** encrypt the board, commit and push; the site shows "יש לוח מעודכן" about a minute later */
export async function publish(message?: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), iterations = 600000;
  const key = await keyFrom(code(), salt, iterations, 'encrypt');
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, readFileSync(BOARD)));
  const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
  writeFileSync(ENC, JSON.stringify({ v: 1, iterations, salt: b64(salt), iv: b64(iv), data: b64(data), updatedAt: Date.now() }));
  const git = (...args: string[]) => execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim();
  git('add', 'public/board.enc.json');
  git('-c', 'user.name=Amir Inbar', '-c', 'user.email=amirsourceai@gmail.com', 'commit', '-m', `Update roster${message ? `: ${message}` : ''}`, '-m', 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>');
  git('push', '-q');
  return `פורסם (${git('rev-parse', '--short', 'HEAD')}). בעוד כדקה האתר יציג ״יש לוח מעודכן באתר״ – לחיצה על ״טען״.\n${SITE}`;
}

/** replace the local board with what's on the site (e.g. after the manager changed things elsewhere) */
export async function pullFromSite(): Promise<string> {
  const r = await fetch(new URL('board.enc.json', SITE), { cache: 'no-store' });
  if (!r.ok) throw new Error(`לא הצלחתי להוריד מהאתר (${r.status})`);
  const j = await r.json();
  const b = (s: string) => Uint8Array.from(Buffer.from(s, 'base64'));
  const key = await keyFrom(code(), b(j.salt), j.iterations, 'decrypt');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b(j.iv) }, key, b(j.data));
  writeFileSync(BOARD, Buffer.from(plain));
  return `הלוח המקומי עודכן מהאתר (פורסם ${new Date(j.updatedAt).toLocaleString('he-IL')}).`;
}

export const periodSummary = (s: State) => `${boardDays(s)[0]} + ${s.board.days} ימים`;
export { parseHM };
