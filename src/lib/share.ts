// Renders the board as clean PNG tables for WhatsApp, plus a plain-text version.
import type { Slot, State } from './types';
import { boardDays, daySlots, extrasOn, peopleInRole, postColor, roleOf, slotsOfPerson } from './slots';
import { dm, fromKey, hm, hours, weekday, ltr, addDaysKey, type DateKey } from './time';

export type ShareMode = 'table' | 'people';
export interface ShareOptions { mode: ShareMode; days: DateKey[]; postIds: string[]; notes: boolean }

const C = { bg: '#FFFFFF', ink: '#111714', ink2: '#4A5650', ink3: '#8A948E', line: '#D9DED7', lineStrong: '#111714', head: '#F1F3F0', band: '#111714', zebra: '#F7F8F6' };
const FUI = '"IBM Plex Sans Hebrew",Rubik,"Arial Hebrew","Noto Sans Hebrew",Arial,sans-serif';
const FN = 'Rubik,"IBM Plex Sans Hebrew","Arial Hebrew","Noto Sans Hebrew",Arial,sans-serif';
const P = 40;

async function fonts() {
  if (!document.fonts) return;
  const want = ['800 56px Rubik', '700 34px Rubik', '600 30px Rubik', '500 30px "IBM Plex Sans Hebrew"', '600 30px "IBM Plex Sans Hebrew"'];
  try { await Promise.race([Promise.all(want.map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 1800))]); } catch { /* fall back */ }
}
type Ctx = CanvasRenderingContext2D;
function rr(cx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, h / 2, w / 2);
  cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath();
}
function text(cx: Ctx, s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'right', dir: CanvasDirection = 'rtl') {
  cx.direction = dir; cx.textAlign = align; cx.font = font; cx.fillStyle = color; cx.fillText(s, x, y);
}
function wrap(cx: Ctx, words: string[], sep: string, max: number, font: string): string[] {
  cx.font = font; cx.direction = 'rtl';
  const out: string[] = []; let cur = '';
  for (const w of words) { const t = cur ? cur + sep + w : w; if (!cur || cx.measureText(t).width <= max) cur = t; else { out.push(cur); cur = w; } }
  if (cur) out.push(cur);
  return out.length ? out : [''];
}
const shiftLabel = (sl: Slot) => sl.allDay ? '' : `${hm(sl.start)}–${hm(sl.end)}`;

/* ---------- blocks: horizontal strips drawn top to bottom ---------- */
interface Block { h: number; draw: (cx: Ctx, y: number) => void }
/** width of one table column in the image */
const CW = 1000;

/** one group of blocks per post (plus one for extra tasks), each drawn between X0 and X1 */
function tableGroups(cx: Ctx, s: State, o: ShareOptions, X0: number, X1: number): Block[][] {
  const groups: Block[][] = [];
  let blocks: Block[] = [];
  const posts = s.posts.filter(p => o.postIds.includes(p.id));
  const F_NAMES = `500 30px ${FUI}`, F_TIME = `600 30px ${FN}`, F_DAY = `700 30px ${FUI}`;
  const colTime = 240;
  for (const post of posts) {
    blocks = [];
    groups.push(blocks);
    const allDay = post.allDay;
    const spans24 = !allDay && ((post.shifts.length === 1 && post.shifts[0].start === post.shifts[0].end) || post.dayStart !== '00:00');
    const colDay = spans24 ? 250 : 170;
    const namesW = X1 - X0 - colDay - (allDay ? 0 : colTime) - 36;
    // role columns (מפקד | נהג | חיילים): narrow for single qualified seats, the rest share what's left
    const roles = post.roles.length > 1 ? post.roles : null;
    const roleW = roles ? (() => {
      const total = X1 - X0 - colDay - colTime;
      // single-seat columns (מפקד, נהג) are as wide as their longest name; the rest share what's left
      cx.font = F_NAMES; cx.direction = 'rtl';
      const longest = (r: typeof roles[number]) => Math.max(cx.measureText(r.name).width, ...o.days.flatMap(d => daySlots(s, d, post))
        .flatMap(sl => peopleInRole(sl, r)).map(pid => cx.measureText(s.people.find(p => p.id === pid)?.name ?? '').width));
      const fixed = roles.map(r => (r.qual && r.count <= 1 ? Math.min(300, Math.max(130, longest(r) + 40)) : 0));
      const wide = fixed.filter(w => !w).length;
      const rest = total - fixed.reduce((t, w) => t + w, 0);
      return fixed.map(w => w || (wide ? rest / wide : 0));
    })() : null;
    const roleX = roleW ? roleW.map((_, i) => X1 - colDay - colTime - roleW.slice(0, i).reduce((t, w) => t + w, 0)) : null;
    // post header
    blocks.push({
      h: 76, draw(cx, y) {
        rr(cx, X1 - 26, y + 28, 22, 22, 6); cx.fillStyle = postColor(post.color); cx.fill();
        text(cx, post.name, X1 - 38, y + 50, `700 36px ${FN}`, C.ink);
      },
    });
    // column header
    blocks.push({
      h: 52, draw(cx, y) {
        cx.fillStyle = C.head; cx.fillRect(X0, y, X1 - X0, 52);
        cx.fillStyle = C.lineStrong; cx.fillRect(X0, y, X1 - X0, 3);
        text(cx, 'יום', X1 - 16, y + 35, `700 24px ${FUI}`, C.ink2);
        if (!allDay) text(cx, 'שעות', X1 - colDay - 16, y + 35, `700 24px ${FUI}`, C.ink2);
        if (roles && roleX) roles.forEach((r, i) => text(cx, r.name, roleX[i] - 16, y + 35, `700 24px ${FUI}`, C.ink2));
        else text(cx, allDay ? 'שם' : 'שמות', X1 - colDay - (allDay ? 0 : colTime) - 16, y + 35, `700 24px ${FUI}`, C.ink2);
      },
    });
    o.days.forEach((date, di) => {
      const nameOf = (id: string) => s.people.find(p => p.id === id)?.name;
      // a shift turned off for this day (need 0, nobody in it) is left out of the image
      const rows = daySlots(s, date, post).filter(sl => sl.need || sl.assigned.length).map(sl => {
        const names = sl.assigned.map(nameOf).filter(Boolean) as string[];
        const lines = wrap(cx, names.length ? names : ['—'], ', ', namesW, F_NAMES);
        const byRole = roles && roleW ? roles.map((r, i) => {
          const ns = peopleInRole(sl, r).map(nameOf).filter(Boolean) as string[];
          return wrap(cx, ns.length ? ns : ['—'], ', ', roleW[i] - 30, F_NAMES);
        }) : null;
        const n = byRole ? Math.max(...byRole.map(x => x.length)) : lines.length;
        const note = o.notes && sl.note ? wrap(cx, sl.note.split(/\s+/), ' ', namesW, `400 24px ${FUI}`) : [];
        return { sl, lines, byRole, n, note, h: 24 + n * 42 + note.length * 32 + 6 };
      });
      if (!rows.length) return;
      if (rows.length === 1) rows[0].h = Math.max(rows[0].h, 92);
      const h = rows.reduce((t, r) => t + r.h, 0);
      const spans = spans24;
      blocks.push({
        h, draw(cx, y) {
          if (di % 2) { cx.fillStyle = C.zebra; cx.fillRect(X0, y, X1 - X0, h); }
          // day cell (merged)
          const dayTxt = spans ? `${weekday(date)} – ${weekday(addDaysKey(date, 1))}` : weekday(date);
          text(cx, dayTxt, X1 - 16, y + h / 2 - 2, F_DAY, C.ink);
          text(cx, ltr(dm(fromKey(date))), X1 - 16, y + h / 2 + 28, `500 22px ${FN}`, C.ink3);
          let ry = y;
          rows.forEach((r, i) => {
            if (i) { cx.fillStyle = C.line; cx.fillRect(X0, ry, X1 - X0 - colDay, 2); }
            const base = ry + Math.max(12, (r.h - r.n * 42 - r.note.length * 32) / 2) + 30;
            if (!allDay) text(cx, ltr(shiftLabel(r.sl)), X1 - colDay - 16, base, F_TIME, C.ink, 'right', 'rtl');
            const nx = X1 - colDay - (allDay ? 0 : colTime) - 16;
            if (r.byRole && roleX) r.byRole.forEach((ls, k) => ls.forEach((l, j) => text(cx, l, roleX[k] - 16, base + j * 42, F_NAMES, l === '—' ? C.ink3 : C.ink)));
            else r.lines.forEach((l, j) => text(cx, l, nx, base + j * 42, F_NAMES, l === '—' ? C.ink3 : C.ink));
            r.note.forEach((l, j) => text(cx, l, nx, base + r.n * 42 + j * 32 - 4, `400 24px ${FUI}`, C.ink3));
            ry += r.h;
          });
          // column separators + bottom rule
          cx.fillStyle = C.line;
          cx.fillRect(X1 - colDay, y, 2, h);
          if (!allDay) cx.fillRect(X1 - colDay - colTime, y, 2, h);
          if (roleX) roleX.slice(1).forEach(x => cx.fillRect(x, y, 1, h));
          cx.fillStyle = C.lineStrong; cx.fillRect(X0, y + h - 2, X1 - X0, 2);
        },
      });
    });
  }
  // one-off tasks
  const extras = o.days.flatMap(d => extrasOn(s, d));
  if (extras.length) {
    blocks = [];
    groups.push(blocks);
    blocks.push({ h: 70, draw(cx, y) { text(cx, 'משימות נוספות', X1, y + 46, `700 34px ${FN}`, C.ink); } });
    for (const sl of extras) {
      const names = sl.assigned.map(id => s.people.find(p => p.id === id)?.name).filter(Boolean) as string[];
      const lines = wrap(cx, names.length ? names : ['—'], ', ', X1 - X0 - 420, F_NAMES);
      const h = 24 + lines.length * 42 + 8;
      blocks.push({
        h, draw(cx, y) {
          text(cx, sl.name, X1 - 16, y + 44, `600 30px ${FUI}`, C.ink);
          text(cx, `${weekday(sl.date)} ${ltr(`${hm(sl.start)}–${hm(sl.end)}`)}`, X1 - 190, y + 44, `500 28px ${FN}`, C.ink2);
          lines.forEach((l, j) => text(cx, l, X1 - 420, y + 44 + j * 42, F_NAMES, C.ink));
          cx.fillStyle = C.line; cx.fillRect(X0, y + h - 2, X1 - X0, 2);
        },
      });
    }
  }
  return groups;
}

function peopleBlocks(_cx: Ctx, s: State, o: ShareOptions, W: number): Block[] {
  const X0 = P, X1 = W - P;
  const colName = 210, colTot = 110;
  const colW = (X1 - X0 - colName - colTot) / o.days.length;
  const posts = new Set(o.postIds);
  const inRange = (sl: Slot) => (sl.postId ? posts.has(sl.postId) : true) && o.days.includes(sl.date);
  const people = [...s.people].sort((a, b) => a.name.localeCompare(b.name, 'he'));
  const blocks: Block[] = [];
  const showPost = s.posts.filter(p => posts.has(p.id)).length > 1 || s.extras.length > 0;
  blocks.push({
    h: 56, draw(cx, y) {
      cx.fillStyle = C.head; cx.fillRect(X0, y, X1 - X0, 56);
      cx.fillStyle = C.lineStrong; cx.fillRect(X0, y, X1 - X0, 3);
      text(cx, 'שם', X1 - 16, y + 37, `700 24px ${FUI}`, C.ink2);
      o.days.forEach((d, i) => {
        const cxm = X1 - colName - colW * i - colW / 2;
        text(cx, weekday(d), cxm, y + 26, `700 24px ${FUI}`, C.ink, 'center');
        text(cx, dm(fromKey(d)), cxm, y + 49, `500 19px ${FN}`, C.ink3, 'center', 'ltr');
      });
      text(cx, 'שעות', X0 + colTot / 2, y + 37, `700 24px ${FUI}`, C.ink2, 'center');
    },
  });
  people.forEach((p, i) => {
    const mine = slotsOfPerson(s, p.id).filter(inRange);
    const per = o.days.map(d => mine.filter(sl => sl.date === d));
    const lines = Math.max(1, ...per.map(x => x.length));
    const h = 22 + lines * (showPost ? 58 : 38) + 4;
    const tot = mine.filter(x => x.blocks && !x.allDay).reduce((t, x) => t + (x.end - x.start), 0);
    blocks.push({
      h, draw(cx, y) {
        if (i % 2) { cx.fillStyle = C.zebra; cx.fillRect(X0, y, X1 - X0, h); }
        text(cx, p.name, X1 - 16, y + 22 + 26, `700 30px ${FUI}`, C.ink);
        per.forEach((list, di) => {
          const xm = X1 - colName - colW * di - colW / 2;
          list.forEach((sl, j) => {
            const yy = y + 22 + j * (showPost ? 58 : 38);
            const label = sl.allDay ? sl.name : `${hm(sl.start)}–${hm(sl.end)}`;
            cx.font = `600 24px ${FN}`; const tw = cx.measureText(label).width;
            rr(cx, xm - tw / 2 - 12, yy, tw + 24, 36, 9); cx.fillStyle = postColor(sl.color) + '22'; cx.fill();
            text(cx, label, xm, yy + 26, `600 24px ${FN}`, C.ink, 'center', sl.allDay ? 'rtl' : 'ltr');
            const rn = sl.roles.length > 1 ? roleOf(sl, p.id)?.name : '';
            if (showPost && !sl.allDay) text(cx, rn && rn !== 'חיילים' ? `${sl.name} · ${rn}` : sl.name, xm, yy + 55, `500 18px ${FUI}`, postColor(sl.color), 'center');
          });
        });
        text(cx, hours(tot), X0 + colTot / 2, y + 22 + 26, `600 26px ${FN}`, C.ink2, 'center', 'ltr');
        cx.fillStyle = C.line; cx.fillRect(X0, y + h - 2, X1 - X0, 2);
        cx.fillRect(X1 - colName, y, 2, h);
        for (let k = 1; k < o.days.length; k++) cx.fillRect(X1 - colName - colW * k, y, 1, h);
        cx.fillRect(X0 + colTot, y, 2, h);
      },
    });
  });
  return blocks;
}

export interface Meta { v: number; at: number }

/**
 * Always one image with everything in it.
 * Several posts are laid out side by side like the paper roster: the first post on the right,
 * the others stacked on the left, balanced by height.
 */
export async function buildImages(s: State, o: ShareOptions, meta: Meta): Promise<{ files: File[]; urls: string[] }> {
  await fonts();
  const cv = document.createElement('canvas'); const cx = cv.getContext('2d')!;
  const HEAD = 190, FOOT = 80, GAP = 34;
  const groupH = (g: Block[]) => g.reduce((t, b) => t + b.h, 0);

  // columns[i] = groups drawn in that column; columns[0] is the right-hand one
  let W: number; let columns: Block[][][];
  if (o.mode === 'people') {
    W = Math.max(1080, 2 * P + 210 + 110 + o.days.length * 200);
    columns = [[peopleBlocks(cx, s, o, W)]];
  } else {
    const groups = tableGroups(cx, s, o, P, P + CW).filter(g => g.length);
    const total = groups.reduce((t, g) => t + groupH(g) + GAP, 0);
    if (groups.length >= 2 && total > 1300) {
      W = 3 * P + 2 * CW;
      columns = [[groups[0]], []];
      const hs = [groupH(groups[0]), 0];
      for (const g of groups.slice(1)) { const c = hs[1] <= hs[0] ? 1 : 0; columns[c].push(g); hs[c] += GAP + groupH(g); }
    } else {
      W = 2 * P + CW;
      columns = [groups];
    }
  }
  const colH = columns.map(col => col.reduce((t, g, i) => t + (i ? GAP : 0) + groupH(g), 0));
  const H = HEAD + Math.max(1, ...colH) + FOOT;
  cv.width = W; cv.height = H;

  const first = o.days[0], last = o.days[o.days.length - 1];
  const period = first === last ? `${weekday(first)} ${dm(fromKey(first))}` : `${weekday(first)} ${dm(fromKey(first))} – ${weekday(last)} ${dm(fromKey(last))}`;
  cx.fillStyle = C.bg; cx.fillRect(0, 0, W, H);
  cx.fillStyle = C.band; cx.fillRect(0, 0, W, HEAD - 30);
  text(cx, s.settings.title, W - P, 82, `800 54px ${FN}`, '#FFFFFF');
  text(cx, period, W - P, 132, `500 32px ${FUI}`, 'rgba(255,255,255,.75)');
  text(cx, `גרסה ${meta.v}`, P, 82, `700 30px ${FUI}`, '#FFFFFF', 'left');
  text(cx, ltr(`${dm(meta.at)} ${hm(meta.at)}`), P, 124, `500 24px ${FN}`, 'rgba(255,255,255,.6)', 'left', 'ltr');

  columns.forEach((col, ci) => {
    // tables were laid out for the left-most column; shift the right one over
    const dx = o.mode === 'people' || columns.length === 1 || ci === 1 ? 0 : P + CW;
    cx.save(); cx.translate(dx, 0);
    let y = HEAD;
    col.forEach((g, gi) => { if (gi) y += GAP; for (const b of g) { b.draw(cx, y); y += b.h; } });
    cx.restore();
  });
  if (columns.length === 2) { cx.fillStyle = C.line; cx.fillRect(P + CW + P / 2 - 1, HEAD, 2, Math.max(...colH)); }
  if (!colH.some(Boolean)) text(cx, 'אין מה להציג', W - P, HEAD + 60, `600 34px ${FUI}`, C.ink3);
  text(cx, `גרסה ${meta.v} · עודכן ${dm(meta.at)} בשעה ${hm(meta.at)}`, W - P, H - 30, `500 22px ${FUI}`, C.ink3);

  const blob = await new Promise<Blob>(r => cv.toBlob(b => r(b!), 'image/png'));
  const file = new File([blob], `shavtzak-${first}-v${meta.v}.png`, { type: 'image/png' });
  return { files: [file], urls: [URL.createObjectURL(blob)] };
}

/** bump the period's version whenever what would be shared changes */
export function periodKey(s: State) { return `${s.board.start}+${s.board.days}`; }
export function signature(s: State): string {
  const days = boardDays(s);
  return JSON.stringify([s.settings.title, days, s.posts.map(p => [p.name, p.shifts.map(sh => [sh.start, sh.end]),
    days.map(d => daySlots(s, d, p).map(sl => sl.assigned.map(id => s.people.find(x => x.id === id)?.name)))]),
  days.map(d => extrasOn(s, d).map(sl => [sl.name, sl.start, sl.end, sl.assigned]))]);
}

export function shareText(s: State, o: ShareOptions, meta: Meta): string {
  const name = (id: string) => s.people.find(p => p.id === id)?.name ?? '';
  let out = `*${s.settings.title}*\n`;
  if (o.mode === 'people') {
    const posts = new Set(o.postIds);
    for (const p of [...s.people].sort((a, b) => a.name.localeCompare(b.name, 'he'))) {
      const mine = slotsOfPerson(s, p.id).filter(sl => o.days.includes(sl.date) && (!sl.postId || posts.has(sl.postId)));
      if (!mine.length) continue;
      out += `\n*${p.name}*: ${mine.map(sl => `${weekday(sl.date)} ${sl.name}${sl.allDay ? '' : ' ' + ltr(`${hm(sl.start)}–${hm(sl.end)}`)}`).join(' · ')}`;
    }
    out += '\n';
  } else {
    for (const d of o.days) {
      out += `\n*${weekday(d)} ${dm(fromKey(d))}*\n`;
      for (const post of s.posts.filter(p => o.postIds.includes(p.id))) {
        for (const sl of daySlots(s, d, post)) {
          const who = post.roles.length > 1
            ? post.roles.map(r => `${r.name}: ${peopleInRole(sl, r).map(name).filter(Boolean).join(', ') || '—'}`).join(' · ')
            : sl.assigned.map(name).filter(Boolean).join(', ') || '—';
          out += `${post.name}${sl.allDay ? '' : ' ' + ltr(`${hm(sl.start)}–${hm(sl.end)}`)}: ${who}\n`;
        }
      }
      for (const sl of extrasOn(s, d)) out += `${sl.name} ${ltr(`${hm(sl.start)}–${hm(sl.end)}`)}: ${sl.assigned.map(name).join(', ') || '—'}\n`;
    }
  }
  out += `\n_גרסה ${meta.v} · עודכן ${dm(meta.at)} בשעה ${hm(meta.at)}_`;
  return out;
}
