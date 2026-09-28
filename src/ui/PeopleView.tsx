// One row per soldier, one column per day: find your name, read across.
import { useState, type CSSProperties } from 'react';
import { useAppState } from '../lib/store';
import { boardDays, personNow, postColor, restBefore, slotsOfPerson } from '../lib/slots';
import type { Person, Slot, State } from '../lib/types';
import { HOUR, dm, dur, fromKey, hShort, hours, relDay, todayKey, weekday } from '../lib/time';
import { Icon } from './icons';
import { openSheet } from './uiStore';
import { SoldierSheet, PasteList } from './sheets/Soldier';

export function PeopleView({ search, now }: { search: string; now: number }) {
  const s = useAppState();
  const [team, setTeam] = useState('');
  const days = boardDays(s);
  const teams = [...new Set(s.people.map(p => p.team).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'));
  const q = search.trim();
  const list = s.people
    .filter(p => (!team || p.team === team) && (!q || p.name.includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  const showPost = s.posts.length > 1 || s.extras.length > 0;
  const today = todayKey();

  if (!s.people.length) {
    return (
      <div className="empty">
        <h3>עוד אין חיילים</h3>
        <p>הדביקו רשימת שמות – שם בכל שורה – או הוסיפו אחד־אחד.</p>
        <div className="row center">
          <button className="btn btn-primary" onClick={() => openSheet(() => <PasteList />)}><Icon n="clip" /> הדבקת רשימה</button>
          <button className="btn" onClick={() => openSheet(() => <SoldierSheet id={null} />)}><Icon n="plus" /> חייל</button>
        </div>
      </div>
    );
  }
  return (
    <>
      <div className="pv-tools">
        {teams.length ? (
          <div className="hscroll">
            <button className={`pill${!team ? ' on' : ''}`} onClick={() => setTeam('')}>כולם · {s.people.length}</button>
            {teams.map(t => <button key={t} className={`pill${team === t ? ' on' : ''}`} onClick={() => setTeam(t)}>{t}</button>)}
          </div>
        ) : <span className="grow" />}
        <button className="btn btn-sm" onClick={() => openSheet(() => <PasteList />)}><Icon n="clip" size={18} /> הדבקה</button>
        <button className="btn btn-sm btn-primary" onClick={() => openSheet(() => <SoldierSheet id={null} />)}><Icon n="plus" size={18} /> חייל</button>
      </div>
      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th className="m-name" scope="col">חייל</th>
              {days.map(d => <th key={d} scope="col" className={d === today ? 'today' : ''}>{weekday(d)}<small className="tm">{dm(fromKey(d))}</small></th>)}
              <th className="m-tot" scope="col">שעות</th>
            </tr>
          </thead>
          <tbody>
            {list.map(p => <Row key={p.id} s={s} p={p} days={days} now={now} showPost={showPost} today={today} />)}
          </tbody>
        </table>
      </div>
      {!list.length ? <p className="hint center">לא נמצא חייל בשם הזה.</p> : null}
      <p className="hint center">הקשה על שורה פותחת את סדר היום של החייל, זמינות ופרטים.</p>
    </>
  );
}

function Row({ s, p, days, now, showPost, today }: { s: State; p: Person; days: string[]; now: number; showPost: boolean; today: string }) {
  const mine = slotsOfPerson(s, p.id);
  const inBoard = mine.filter(sl => days.includes(sl.date));
  const min = s.settings.minRest * HOUR;
  // shortest rest around the shown days – includes the shift just before or after them
  const gaps = restBefore(s, p.id);
  const tiring = mine.filter(x => x.rest);
  let shortest: number | null = null;
  tiring.forEach((x, i) => {
    const g = gaps.get(x.key);
    const touches = days.includes(x.date) || (i > 0 && days.includes(tiring[i - 1].date));
    if (g != null && g >= 0 && touches && (shortest === null || g < shortest)) shortest = g;
  });
  const tot = inBoard.filter(x => x.blocks).reduce((t, x) => t + (x.end - x.start), 0);
  const st = days.includes(today) ? personNow(s, p, now) : null;
  return (
    <tr onClick={() => openSheet(() => <SoldierSheet id={p.id} />)}>
      <th className="m-name" scope="row">
        <span className="m-n">{st ? <i className={`sdot ${st.kind}`} title={st.label} /> : null}<b>{p.name}</b></span>
        {p.team || p.quals.length ? <small>{[p.team, ...p.quals].filter(Boolean).join(' · ')}</small> : null}
      </th>
      {days.map(d => {
        const cell = inBoard.filter(sl => sl.date === d);
        const off = p.unavail.find(u => u.start < fromKey(d) + 24 * HOUR && u.end > fromKey(d));
        return (
          <td key={d} className={d === today ? 'today' : ''}>
            {cell.map(sl => <Pill key={sl.key} sl={sl} showPost={showPost} />)}
            {off && !cell.length ? <span className="m-off">{off.reason || 'לא זמין'}</span> : null}
          </td>
        );
      })}
      <td className="m-tot">
        <b className="tm">{hours(tot)}</b>
        {shortest !== null ? <small className={min && shortest < min ? 'warn' : ''}><Icon n="moon" size={11} />{dur(shortest)}</small> : null}
      </td>
    </tr>
  );
}

function Pill({ sl, showPost }: { sl: Slot; showPost: boolean }) {
  return (
    <span className="mp" style={{ '--pc': postColor(sl.color) } as CSSProperties}>
      {sl.allDay ? <b>{sl.name}</b> : <b className="tm" dir="ltr">{hShort(sl.start)}–{hShort(sl.end)}</b>}
      {showPost && !sl.allDay ? <small>{sl.name}</small> : null}
    </span>
  );
}

export function FoundCard({ search }: { search: string }) {
  const s = useAppState();
  const q = search.trim();
  if (!q) return null;
  const matches = s.people.filter(p => p.name.includes(q));
  if (!matches.length) return <div className="found none">לא נמצא חייל בשם ״{q}״</div>;
  if (matches.length > 4) return <div className="found none">{matches.length} חיילים מתאימים – המשיכו להקליד</div>;
  const days = boardDays(s);
  const min = s.settings.minRest * HOUR;
  return (
    <div className="found-list">
      {matches.map(p => {
        const mine = slotsOfPerson(s, p.id).filter(sl => days.includes(sl.date));
        const gaps = restBefore(s, p.id);
        return (
          <button key={p.id} className="found" onClick={() => openSheet(() => <SoldierSheet id={p.id} />)}>
            <b className="f-name">{p.name}</b>
            <span className="f-seq">
              {mine.length ? mine.map((sl, i) => {
                const raw = gaps.get(sl.key) ?? null;
                // show the gap between listed shifts, and before the first one only if it came from a recent shift
                const g = raw !== null && (i > 0 || raw < 24 * HOUR) ? raw : null;
                return (
                  <span key={sl.key} className="f-item">
                    {g !== null ? <span className={`gp${min && g < min ? ' short' : ''}`}><Icon n="moon" size={12} />{dur(g)}</span> : null}
                    <span className="sp" style={{ '--pc': postColor(sl.color) } as CSSProperties}>
                      {weekday(sl.date)}{relDay(sl.date) === 'היום' ? ' (היום)' : ''} · {sl.name}{sl.allDay ? '' : <> <span className="tm" dir="ltr">{hShort(sl.start)}–{hShort(sl.end)}</span></>}
                    </span>
                  </span>
                );
              }) : <span className="muted">אין משמרות בתקופה הזו</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
