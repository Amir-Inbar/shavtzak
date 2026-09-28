// The roster as tables – one per post, days down the side, shifts and names across. Like the paper board.
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { CSSProperties } from 'react';
import { useAppState } from '../lib/store';
import { boardDays, daySlots, extrasOn, postColor, slotInfo } from '../lib/slots';
import type { Evaluation, Person, Post, Slot, State } from '../lib/types';
import { dm, durShortH, fromKey, hm, relDay, todayKey, weekday, addDaysKey } from '../lib/time';
import { Icon } from './icons';
import { useDrag } from './Dnd';
import { openSheet } from './uiStore';
import { Picker } from './sheets/Picker';
import { ChipMenu } from './sheets/ChipMenu';
import { PostsEditor } from './sheets/Posts';
import { ExtraForm } from './sheets/Extra';

const openPicker = (key: string) => openSheet(() => <Picker slotKey={key} />);

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
  const spans24 = post.shifts.length === 1 && !post.allDay && post.shifts[0].start === post.shifts[0].end;
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
      <table className="grid">
        <thead>
          <tr>
            <th className="c-day" scope="col">יום</th>
            {post.allDay ? null : <th className="c-time" scope="col">שעות</th>}
            <th scope="col">{post.allDay ? 'שם' : 'שמות'}</th>
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
                    <NamesCell s={s} sl={sl} search={search} showFill={post.allDay} />
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

function Chip({ sl, p, e, search }: { sl: Slot; p: Person; e: Evaluation; search: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `${sl.key}#${p.id}`, data: { key: sl.key, pid: p.id } });
  const q = search.trim();
  const hit = q && p.name.includes(q);
  const cls = ['chip', e.status, isDragging ? 'src' : '', hit ? 'hit' : q ? 'dim' : ''].filter(Boolean).join(' ');
  return (
    <button ref={setNodeRef} {...listeners} {...attributes} className={cls}
      onClick={() => openSheet(() => <ChipMenu slotKey={sl.key} pid={p.id} />)}
      title={e.reasons.join(' · ') || undefined}>
      {p.name}
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
