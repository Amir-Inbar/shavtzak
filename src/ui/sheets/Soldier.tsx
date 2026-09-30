// A soldier: what they do this period with the rest in between, availability and details.
import { useState, type CSSProperties } from 'react';
import { commit, useAppState } from '../../lib/store';
import { boardDays, personNow, postColor, restBefore, slotsOfPerson } from '../../lib/slots';
import type { Person } from '../../lib/types';
import { DAY, HOUR, dur, fromKey, hm, todayKey, toKey, uid, weekday, whenShort, relDay } from '../../lib/time';
import { Icon } from '../icons';
import { RANKS, rankOf } from '../../lib/rank';
import { RankIcon } from '../RankIcon';
import { parsePeople, qualsFor } from '../../lib/pasteList';
import { setSearch } from '../uiStore';
import { Field, Sheet } from '../primitives';
import { closeSheet, confirmDialog, toast } from '../uiStore';

const REASONS = ['חופשה', 'יציאה', 'מחלה', 'קורס', 'תור'];

export function SoldierSheet({ id }: { id: string | null }) {
  const s = useAppState();
  const existing = id ? s.people.find(p => p.id === id) : null;
  const [edit, setEdit] = useState(!id);
  const [d, setD] = useState<Person>(() => existing ? structuredClone(existing) : { id: '', name: '', rank: '', piece: '', team: '', quals: [], unavail: [], note: '' });
  const nowH = new Date(); nowH.setMinutes(0, 0, 0); nowH.setHours(nowH.getHours() + 1);
  const [u, setU] = useState({ fd: toKey(nowH.getTime()), ft: hm(nowH.getTime()), td: toKey(nowH.getTime() + DAY), tt: hm(nowH.getTime()), reason: 'חופשה' });
  const [newQ, setNewQ] = useState('');
  if (id && !existing) return <Sheet title="החייל נמחק"><p className="hint">אפשר לבטל את המחיקה מההודעה למטה.</p></Sheet>;

  const quals = [...new Set([...s.people.flatMap(p => p.quals), ...s.posts.map(p => p.qual), ...d.quals].filter(Boolean))];
  const teams = [...new Set(s.people.map(p => p.team).filter(Boolean))];
  const now = Date.now();

  const save = async () => {
    const name = d.name.trim();
    if (!name) { toast('חסר שם'); return; }
    if (s.people.some(p => p.name === name && p.id !== d.id)) { toast('כבר יש חייל בשם הזה – הוסיפו אות או שם פרטי'); return; }
    let drop: string[] = [];
    if (existing) {
      const hits = slotsOfPerson(s, existing.id).filter(sl => d.unavail.some(x => x.start < sl.end && x.end > sl.start));
      if (hits.length && await confirmDialog({
        title: `${name} משובץ בזמן שהוא לא זמין`,
        items: hits.map(sl => ({ lv: 'bad', text: `${sl.name} · ${weekday(sl.date)} ${sl.allDay ? '' : `${hm(sl.start)}–${hm(sl.end)}`}` })),
        ok: 'הסר אותו מהמשמרות האלו', cancel: 'השאר – יסומן באדום',
      })) drop = hits.map(x => x.key);
    }
    const next: Person = { ...d, name, team: d.team.trim(), id: d.id || uid() };
    commit(st => {
      const i = st.people.findIndex(p => p.id === next.id);
      if (i >= 0) st.people[i] = next; else st.people.push(next);
      for (const k of drop) {
        const x = st.extras.find(e => e.id === k);
        if (x) x.assigned = x.assigned.filter(a => a !== next.id);
        else if (st.cells[k]) st.cells[k].assigned = st.cells[k].assigned.filter(a => a !== next.id);
      }
    });
    toast(existing ? `${name} עודכן` : `${name} נוסף`, { undo: true });
    if (existing) setEdit(false); else closeSheet();
  };
  const remove = async () => {
    if (!existing) return;
    const n = slotsOfPerson(s, existing.id).length;
    if (!(await confirmDialog({ title: `למחוק את ${existing.name}?`, text: n ? `הוא יוסר גם מ־${n} משמרות.` : undefined, ok: 'מחק', danger: true }))) return;
    commit(st => {
      st.people = st.people.filter(p => p.id !== existing.id);
      for (const c of Object.values(st.cells)) c.assigned = c.assigned.filter(a => a !== existing.id);
      for (const x of st.extras) x.assigned = x.assigned.filter(a => a !== existing.id);
    });
    closeSheet(); toast(`${existing.name} נמחק`, { undo: true });
  };
  const addU = () => {
    const a = fromKey(u.fd, u.ft || '00:00'), b = fromKey(u.td, u.tt || '00:00');
    if (!(b > a)) { toast('הסיום צריך להיות אחרי ההתחלה'); return; }
    setD(x => ({ ...x, unavail: [...x.unavail, { id: uid(), start: a, end: b, reason: u.reason.trim() }] }));
  };

  /* ---------- read-only schedule ---------- */
  let schedule = null;
  if (existing && !edit) {
    const days = boardDays(s);
    const mine = slotsOfPerson(s, existing.id).filter(sl => days.includes(sl.date) || (sl.end > now - DAY && sl.start < now + 2 * DAY));
    const st = days.includes(todayKey()) ? personNow(s, existing, now) : null;
    const min = s.settings.minRest * HOUR;
    const gaps = restBefore(s, existing.id);
    schedule = (
      <>
        {st ? <div className={`now-card ${st.kind}${st.short ? ' short' : ''}`}><b>{st.label}</b>{st.detail ? <span>{st.detail}</span> : null}</div> : null}
        <h4 className="grp">משמרות</h4>
        {mine.length ? (
          <ul className="sched">
            {mine.map((sl, i) => {
              const raw = gaps.get(sl.key) ?? null;
              const g = raw !== null && (i > 0 || raw < 24 * HOUR) ? raw : null;
              return (
                <li key={sl.key}>
                  {g !== null ? <div className={`gapi${min && g < min ? ' short' : ''}`}><Icon n="moon" size={14} /> מנוחה {dur(g)}</div> : null}
                  <div className="si" style={{ '--pc': postColor(sl.color) } as CSSProperties}>
                    <i className="pdot" />
                    <span className="si-day">{weekday(sl.date)}{relDay(sl.date) ? <small>{relDay(sl.date)}</small> : null}</span>
                    <span className="tm" dir="ltr">{sl.allDay ? '' : `${hm(sl.start)}–${hm(sl.end)}`}</span>
                    <b className="grow">{sl.name}</b>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <p className="hint">אין משמרות בתקופה הזו.</p>}
        {existing.unavail.filter(x => x.end > now).length ? (
          <>
            <h4 className="grp">לא זמין</h4>
            <ul className="ulist">{existing.unavail.filter(x => x.end > now).map(x => <li key={x.id}><b>{x.reason || 'לא זמין'}</b> · {whenShort(x.start)} עד {whenShort(x.end)}</li>)}</ul>
          </>
        ) : null}
        {existing.note ? <p className="t-note">{existing.note}</p> : null}
      </>
    );
  }

  const sub = existing ? [existing.team, ...existing.quals].filter(Boolean).join(' · ') : '';
  return (
    <Sheet
      title={existing ? <span className="title-rk"><RankIcon p={existing} size={24} />{existing.name}</span> : 'חייל חדש'}
      sub={existing ? [rankOf(existing), sub].filter(Boolean).join(' · ') : undefined}
      footer={edit
        ? <><button className="btn btn-primary" onClick={save}>שמור</button>{existing ? <button className="btn" onClick={() => { setD(structuredClone(existing)); setEdit(false); }}>ביטול</button> : null}{existing ? <button className="btn danger-t" onClick={remove}><Icon n="trash" /> מחק</button> : null}</>
        : <><button className="btn btn-accent" onClick={() => { setSearch(existing!.name); closeSheet(); }}><Icon n="search" /> סמן בלוח</button><button className="btn" onClick={() => setEdit(true)}><Icon n="edit" /> עריכה וזמינות</button></>}
    >
      {schedule}
      {edit ? (
        <>
          <div className="g2">
            <Field label="שם"><input className="inp" value={d.name} onChange={e => setD({ ...d, name: e.target.value })} autoFocus={!existing} autoComplete="off" /></Field>
            <Field label="צוות / כיתה"><input className="inp" value={d.team} list="dl-teams" onChange={e => setD({ ...d, team: e.target.value })} placeholder="למשל: כיתה 1" autoComplete="off" /></Field>
          </div>
          <datalist id="dl-teams">{teams.map(t => <option key={t} value={t} />)}</datalist>
          <div className="fld"><span className="fld-l">תפקיד</span>
            <div className="row">
              {RANKS.map(r => <button key={r.name} type="button" className={`pill${rankOf(d) === r.name ? ' on' : ''}`} onClick={() => setD({ ...d, rank: r.name, piece: '', quals: r.name === 'מפקד' && !d.quals.includes('מפקד') ? [...d.quals, 'מפקד'] : r.name === 'נהג' && !d.quals.includes('נהג') ? [...d.quals, 'נהג'] : d.quals })}>
                <RankIcon kind={r.kind} size={16} />{r.name}</button>)}
            </div>
          </div>
          <div className="fld"><span className="fld-l">כשירויות</span>
            <div className="row">
              {quals.map(q => {
                const on = d.quals.includes(q);
                return <button key={q} type="button" className={`pill${on ? ' on' : ''}`} onClick={() => setD({ ...d, quals: on ? d.quals.filter(x => x !== q) : [...d.quals, q] })}>{on ? <Icon n="check" size={15} /> : null}{q}</button>;
              })}
              <span className="row nowrap grow">
                <input className="inp sm" value={newQ} onChange={e => setNewQ(e.target.value)} placeholder="כשירות חדשה (נהג, חובש…)" />
                <button type="button" className="btn btn-sm" onClick={() => { const v = newQ.trim(); if (v && !d.quals.includes(v)) setD({ ...d, quals: [...d.quals, v] }); setNewQ(''); }}>הוסף</button>
              </span>
            </div>
          </div>
          <div className="fld"><span className="fld-l">אי־זמינות</span>
            {d.unavail.length ? (
              <ul className="ulist">
                {[...d.unavail].sort((a, b) => a.start - b.start).map(x => (
                  <li key={x.id}><span className="grow"><b>{x.reason || 'לא זמין'}</b> · {whenShort(x.start)} עד {whenShort(x.end)}{x.end < now ? ' (עבר)' : ''}</span>
                    <button type="button" className="ibtn sm" onClick={() => setD({ ...d, unavail: d.unavail.filter(y => y.id !== x.id) })} aria-label="מחיקה"><Icon n="x" size={18} /></button></li>
                ))}
              </ul>
            ) : <p className="hint">זמין תמיד.</p>}
            <div className="card">
              <div className="row">{REASONS.map(r => <button key={r} type="button" className={`pill${u.reason === r ? ' on' : ''}`} onClick={() => setU({ ...u, reason: r })}>{r}</button>)}</div>
              <div className="g2">
                <Field label="מ־"><input className="inp" type="date" value={u.fd} onChange={e => setU({ ...u, fd: e.target.value })} /><input className="inp" type="time" value={u.ft} onChange={e => setU({ ...u, ft: e.target.value })} /></Field>
                <Field label="עד"><input className="inp" type="date" value={u.td} onChange={e => setU({ ...u, td: e.target.value })} /><input className="inp" type="time" value={u.tt} onChange={e => setU({ ...u, tt: e.target.value })} /></Field>
              </div>
              <Field label="סיבה"><input className="inp" value={u.reason} onChange={e => setU({ ...u, reason: e.target.value })} /></Field>
              <button type="button" className="btn btn-sm" style={{ marginTop: 12 }} onClick={addU}><Icon n="plus" size={18} /> הוסף אי־זמינות</button>
            </div>
          </div>
          <Field label="הערה אישית (לא נשלחת)"><textarea className="inp" value={d.note} onChange={e => setD({ ...d, note: e.target.value })} /></Field>
        </>
      ) : null}
    </Sheet>
  );
}

export function PasteList() {
  const s = useAppState();
  const [txt, setTxt] = useState('');
  const [team, setTeam] = useState('');
  const r = parsePeople(txt, s.people, team.trim());
  const total = r.add.length + r.update.length;
  // the rank written in the list decides the מפקד / נהג qualifications
  const withRank = (rank: string, quals: string[]) => (rank ? qualsFor(rank, quals.filter(q => q !== 'מפקד' && q !== 'נהג')) : quals);
  const noteWith = (old: string, extra: string[]) => [...new Set([...old.split(' · ').filter(Boolean), ...extra])].join(' · ');
  const add = () => {
    if (!total) { toast('לא נמצאו שמות'); return; }
    commit(st => {
      for (const { p, from } of r.update) {
        const x = st.people.find(y => y.id === p.id); if (!x) continue;
        if (from.team) x.team = from.team;
        if (from.rank) { x.rank = from.rank; x.piece = ''; }
        x.quals = withRank(from.rank, x.quals);
        x.note = noteWith(x.note, [from.name !== x.name ? from.name : '', ...from.notes].filter(Boolean));
      }
      st.people.push(...r.add.map(x => ({ id: uid(), name: x.name, rank: x.rank, piece: '' as const, team: x.team, quals: withRank(x.rank, []), unavail: [], note: x.notes.join(' · ') })));
    });
    closeSheet();
    toast([r.add.length ? `נוספו ${r.add.length}` : '', r.update.length ? `עודכנו ${r.update.length}` : ''].filter(Boolean).join(' · '), { undo: true });
  };
  return (
    <Sheet title="הדבקת רשימת חיילים" sub="שם בכל שורה. כותרות ״מפקדים״, ״נהגים״, ״לוחמים״, ״מסופחים״ קובעות תפקיד, ו־״(מחלקה 1)״ קובע מחלקה. מי שכבר בלוח – מתעדכן." footer={<button className="btn btn-primary" onClick={add} disabled={!total}>{total ? 'עדכן רשימה' : 'הוסף'}</button>}>
      <Field label="רשימה"><textarea className="inp tall" value={txt} onChange={e => setTxt(e.target.value)} autoFocus placeholder={'מפקדים\nסאפר (מחלקה 1)\n\nנהגים\nשנהב (מחלקה 3)\n\nלוחמים\nישי ניסים (מחלקה 1)'} /></Field>
      <Field label="צוות לשורות בלי צוות (לא חובה)"><input className="inp" value={team} onChange={e => setTeam(e.target.value)} /></Field>
      {total ? (
        <div className="card">
          {r.add.length ? <p><b>יתווספו {r.add.length}:</b> {r.add.map(x => `${x.name}${x.rank ? ` (${x.rank})` : ''}`).join(', ')}</p> : null}
          {r.update.length ? <p style={{ marginTop: 6 }}><b>יעודכנו {r.update.length}:</b> {r.update.map(u => (u.from.name !== u.p.name ? `${u.p.name} ← ${u.from.name}` : u.p.name)).join(', ')}</p> : null}
          {r.dup.length ? <p className="hint">מופיעים פעמיים ברשימה: {r.dup.join(', ')}</p> : null}
        </div>
      ) : <p className="hint">אפשר להעתיק עמודה שלמה מהגיליון ולהדביק כאן.</p>}
    </Sheet>
  );
}
