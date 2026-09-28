// The roster as tables – one per post, days down the side, shifts and names across. Like the paper board.
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { CSSProperties } from 'react';
import { useAppState } from '../lib/store';
import { boardDays, daySlots, extrasOn, postColor, slotInfo, type RoleFill } from '../lib/slots';
import type { Evaluation, Person, Post, Role, Slot, State } from '../lib/types';
import { dm, durShortH, fromKey, hm, relDay, todayKey, weekday, addDaysKey } from '../lib/time';
import { Icon } from './icons';
import { useDrag } from './Dnd';
import { openSheet } from './uiStore';
import { Picker } from './sheets/Picker';
import { ChipMenu } from './sheets/ChipMenu';
import { PostsEditor } from './sheets/Posts';
import { ExtraForm } from './sheets/Extra';

const openPicker = (key: string, roleId: string | null = null) => openSheet(() => <Picker slotKey={key} roleId={roleId} />);
/** narrow columns for single-seat roles with a qualification (מפקד, נהג), wide for the rest */
const roleCols = (roles: Role[]) => roles.map(r => (r.qual && r.count <= 1 ? 'minmax(84px, .8fr)' : 'minmax(0, 2fr)')).join(' ');

export function BoardView({ search, now }: { search: string; now: number }) {
  const s = useAppState();
  const days = boardDays(s);
  const extras = days.flatMap(d => extrasOn(s, d));
  if (!s.posts.length) {
    return (
      <div className="empty">
        <h3>עוד אין עמדות</h3>
        <p>עמדה היא תפקיד שחוזר כל יום עם משמרות קבועות – למשל שמירה 05–13, 13–21, 21–05.</p>
        <button className="btn btn-primary" onClick={() => openSheet(() => <PostsEditor />)}><Icon n="post" /> הגדרת עמדות</button>
      </div>
    );
  }
  return (
    <div className="boards">
      {s.posts.map(p => <PostTable key={p.id} s={s} post={p} days={days} search={search} now={now} />)}
      {extras.length ? <ExtrasTable s={s} slots={extras} search={search} now={now} /> : null}
    </div>
  );
}

function PostTable({ s, post, days, search, now }: { s: State; post: Post; days: string[]; search: string; now: number }) {
  const today = todayKey();
  const spans24 = !post.allDay && ((post.shifts.length === 1 && post.shifts[0].start === post.shifts[0].end) || post.dayStart !== '00:00');
  const roles = post.roles.length > 1 ? post.roles : null;
  const style = { '--pc': postColor(post.color) } as CSSProperties;
  const sub = post.allDay ? 'כל היום' : post.shifts.map(sh => `\u2066${sh.start}–${sh.end}\u2069`).join(' · ');
  return (
    <section className="ptable" style={style} aria-label={post.name}>
      <header className="pt-head">
        <i className="pdot" />
        <h3>{post.name}</h3>
        <span className="pt-sub tm">{sub}</span>
        <button className="ibtn sm" onClick={() => openSheet(() => <PostsEditor focus={post.id} />)} aria-label={`עריכת ${post.name}`}><Icon n="edit" size={18} /></button>
      </header>
      <table className="grid" style={roles ? ({ '--role-cols': roleCols(roles) } as CSSProperties) : undefined}>
        <thead>
          <tr>
            <th className="c-day" scope="col">יום</th>
            {post.allDay ? null : <th className="c-time" scope="col">שעות</th>}
            <th scope="col">{roles ? <div className="roles head">{roles.map(r => <span key={r.id}>{r.name}</span>)}</div> : post.allDay ? 'שם' : 'שמות'}</th>
          </tr>
        </thead>
        {days.map(date => {
          const slots = daySlots(s, date, post);
          const rel = relDay(date);
          return (
            <tbody key={date} className={date === today ? 'today' : ''}>
              {slots.map((sl, i) => {
                const live = sl.start <= now && sl.end > now;
                return (
                  <tr key={sl.key} className={live ? 'live' : sl.end <= now ? 'past' : ''}>
                    {i === 0 ? (
                      <th className="c-day" rowSpan={slots.length} scope="rowgroup">
                        <b>{weekday(date)}</b>
                        {spans24 ? <small className="to">עד {weekday(addDaysKey(date, 1))}</small> : null}
                        <small className="tm">{dm(fromKey(date))}</small>
                        {rel ? <em>{rel}</em> : null}
                      </th>
                    ) : null}
                    {post.allDay ? null : <TimeCell sl={sl} s={s} live={live} />}
                    {roles ? <RolesCell s={s} sl={sl} search={search} /> : <NamesCell s={s} sl={sl} search={search} showFill={post.allDay} />}
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </table>
    </section>
  );
}

function TimeCell({ sl, s, live }: { sl: Slot; s: State; live: boolean }) {
  const inf = slotInfo(s, sl);
  const n = inf.people.length;
  return (
    <td className="c-time" onClick={() => openPicker(sl.key)}>
      <b className="tm">{hm(sl.start)}</b>
      <span className="tm t-end">{hm(sl.end)}</span>
      <span className={`fill ${inf.missing ? 'bad' : n ? 'ok' : 'none'}`}>{n}/{sl.need}</span>
      {live ? <span className="live-tag">עכשיו</span> : null}
    </td>
  );
}

function NamesCell({ s, sl, search, showFill }: { s: State; sl: Slot; search: string; showFill?: boolean }) {
  const drag = useDrag();
  const { setNodeRef, isOver } = useDroppable({ id: sl.key });
  const inf = slotInfo(s, sl);
  const v = drag?.verdict.get(sl.key);
  const cls = ['c-names', v ? `drop-${v.st}` : '', isOver && v ? 'over' : '', inf.missing ? 'short' : ''].filter(Boolean).join(' ');
  return (
    <td ref={setNodeRef} className={cls} onClick={e => { if ((e.target as HTMLElement).closest('.chip')) return; openPicker(sl.key); }}>
      <div className="names">
        {inf.people.map(p => <Chip key={p.id} sl={sl} p={p} e={inf.ev[p.id]} search={search} />)}
        {inf.missing ? <span className="slot-empty"><Icon n="plus" size={14} />{inf.missing === 1 ? 'פנוי' : `${inf.missing} פנויים`}</span> : null}
        {showFill && !inf.missing && !inf.people.length ? <span className="muted">—</span> : null}
      </div>
      {inf.noQual ? <div className="cell-note bad">חסר {sl.qual}</div> : null}
      {sl.note ? <div className="cell-note">{sl.note}</div> : null}
      {v && v.st !== 'src' ? <div className={`drop-tag ${v.st}`}>{v.text}</div> : null}
    </td>
  );
}

/** one row cell split into role columns (stacked with labels on a phone); each column is its own drop target */
function RolesCell({ s, sl, search }: { s: State; sl: Slot; search: string }) {
  const inf = slotInfo(s, sl);
  return (
    <td className="c-roles">
      <div className="roles">{inf.roles.map(rf => <RoleBox key={rf.role.id} sl={sl} rf={rf} ev={inf.ev} search={search} />)}</div>
      {sl.note ? <div className="cell-note">{sl.note}</div> : null}
    </td>
  );
}
function RoleBox({ sl, rf, ev, search }: { sl: Slot; rf: RoleFill; ev: Record<string, Evaluation>; search: string }) {
  const drag = useDrag();
  const { setNodeRef, isOver } = useDroppable({ id: `${sl.key}@${rf.role.id}` });
  let v = drag?.verdict.get(sl.key);
  if (v && v.st === 'ok' && rf.role.qual && drag && !drag.quals.includes(rf.role.qual)) v = { st: 'warn', text: `לא ${rf.role.qual}` };
  const cls = ['rbox', v ? `drop-${v.st}` : '', isOver && v ? 'over' : ''].filter(Boolean).join(' ');
  return (
    <div ref={setNodeRef} className={cls} onClick={e => { if ((e.target as HTMLElement).closest('.chip')) return; e.stopPropagation(); openPicker(sl.key, rf.role.id); }}>
      <span className="rlabel">{rf.role.name}</span>
      <div className="names">
        {rf.people.map(p => <Chip key={p.id} sl={sl} p={p} e={ev[p.id]} search={search} wrong={rf.wrongQual.includes(p) ? rf.role.qual : ''} />)}
        {rf.missing ? <span className="slot-empty"><Icon n="plus" size={14} />{rf.missing === 1 ? 'פנוי' : `${rf.missing} פנויים`}</span> : null}
      </div>
      {v && v.st !== 'src' ? <div className={`drop-tag ${v.st}`}>{v.text}</div> : null}
    </div>
  );
}

function Chip({ sl, p, e, search, wrong = '' }: { sl: Slot; p: Person; e: Evaluation; search: string; wrong?: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `${sl.key}#${p.id}`, data: { key: sl.key, pid: p.id } });
  const q = search.trim();
  const hit = q && p.name.includes(q);
  const st = e.status === 'ok' && wrong ? 'warn' : e.status;
  const cls = ['chip', st, isDragging ? 'src' : '', hit ? 'hit' : q ? 'dim' : ''].filter(Boolean).join(' ');
  return (
    <button ref={setNodeRef} {...listeners} {...attributes} className={cls}
      onClick={() => openSheet(() => <ChipMenu slotKey={sl.key} pid={p.id} />)}
      title={[...e.reasons, wrong ? `אינו ${wrong}` : ''].filter(Boolean).join(' · ') || undefined}>
      {p.name}
      {wrong && e.status === 'ok' ? <span className="cb">!</span> : null}
      {e.status === 'warn' && e.shortest != null ? <span className="cb"><Icon n="moon" size={11} />{durShortH(e.shortest)}</span> : null}
      {e.status === 'block' ? <span className="cb">!</span> : null}
    </button>
  );
}

function ExtrasTable({ s, slots, search, now }: { s: State; slots: Slot[]; search: string; now: number }) {
  return (
    <section className="ptable" style={{ '--pc': postColor(4) } as CSSProperties} aria-label="משימות נוספות">
      <header className="pt-head"><i className="pdot" /><h3>משימות נוספות</h3></header>
      <table className="grid">
        <thead><tr><th className="c-day">משימה</th><th className="c-time">מתי</th><th>שמות</th></tr></thead>
        <tbody>
          {slots.map(sl => {
            const inf = slotInfo(s, sl);
            const live = sl.start <= now && sl.end > now;
            return (
              <tr key={sl.key} className={live ? 'live' : ''}>
                <th className="c-day" onClick={() => openSheet(() => <ExtraForm id={sl.key} />)} style={{ cursor: 'pointer' }}><b>{sl.name}</b><small>{weekday(sl.date)}</small></th>
                <td className="c-time" onClick={() => openPicker(sl.key)}><b className="tm">{hm(sl.start)}</b><span className="tm t-end">{hm(sl.end)}</span><span className={`fill ${inf.missing ? 'bad' : 'ok'}`}>{inf.people.length}/{sl.need}</span></td>
                <NamesCell s={s} sl={sl} search={search} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
