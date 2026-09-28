// A soldier: what they do this period with the rest in between, availability and details.
import { useState, type CSSProperties } from 'react';
import { commit, useAppState } from '../../lib/store';
import { boardDays, personNow, postColor, restBefore, slotsOfPerson } from '../../lib/slots';
import type { Person } from '../../lib/types';
import { DAY, HOUR, dur, fromKey, hShort, hm, todayKey, toKey, uid, weekday, whenShort, relDay } from '../../lib/time';
import { Icon } from '../icons';
import { Field, Sheet } from '../primitives';
import { closeSheet, confirmDialog, toast } from '../uiStore';

const REASONS = ['חופשה', 'יציאה', 'מחלה', 'קורס', 'תור'];

export function SoldierSheet({ id }: { id: string | null }) {
  const s = useAppState();
  const existing = id ? s.people.find(p => p.id === id) : null;
  const [edit, setEdit] = useState(!id);
  const [d, setD] = useState<Person>(() => existing ? structuredClone(existing) : { id: '', name: '', team: '', quals: [], unavail: [], note: '' });
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
        items: hits.map(sl => ({ lv: 'bad', text: `${sl.name} · ${weekday(sl.date)} ${sl.allDay ? '' : `${hShort(sl.start)}–${hShort(sl.end)}`}` })),
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
                    <span className="tm" dir="ltr">{sl.allDay ? '' : `${hShort(sl.start)}–${hShort(sl.end)}`}</span>
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
      title={existing ? existing.name : 'חייל חדש'}
      sub={sub || undefined}
      footer={edit
        ? <><button className="btn btn-primary" onClick={save}>שמור</button>{existing ? <button className="btn" onClick={() => { setD(structuredClone(existing)); setEdit(false); }}>ביטול</button> : null}{existing ? <button className="btn danger-t" onClick={remove}><Icon n="trash" /> מחק</button> : null}</>
        : <button className="btn" onClick={() => setEdit(true)}><Icon n="edit" /> עריכת פרטים וזמינות</button>}
    >
      {schedule}
      {edit ? (
        <>
          <div className="g2">
            <Field label="שם"><input className="inp" value={d.name} onChange={e => setD({ ...d, name: e.target.value })} autoFocus={!existing} autoComplete="off" /></Field>
            <Field label="צוות / כיתה"><input className="inp" value={d.team} list="dl-teams" onChange={e => setD({ ...d, team: e.target.value })} placeholder="למשל: כיתה 1" autoComplete="off" /></Field>
          </div>
          <datalist id="dl-teams">{teams.map(t => <option key={t} value={t} />)}</datalist>
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
  const have = new Set(s.people.map(p => p.name));
  const parsed: { name: string; team: string }[] = []; const dup: string[] = [];
  for (let line of txt.split(/\r?\n/)) {
    line = line.replace(/^[\s\d.)\-•*]+/, '').trim(); if (!line) continue;
    // "name, team" · "name - team" · "name<TAB>team"; also comma-separated names on one line
    const m = line.match(/^(.+?)\s*(?:\t|\s-\s|\s–\s)\s*(.+)$/);
    const parts = m ? [{ name: m[1].trim(), team: m[2].trim() }] : line.includes(',') && line.split(',').length > 2
      ? line.split(',').map(n => ({ name: n.trim(), team: team.trim() })).filter(x => x.name)
      : [{ name: line.split(',')[0].trim(), team: (line.split(',')[1] ?? team).trim() }];
    for (const x of parts) { if (have.has(x.name) || parsed.some(y => y.name === x.name)) dup.push(x.name); else parsed.push(x); }
  }
  const add = () => {
    if (!parsed.length) { toast(dup.length ? 'כל השמות כבר ברשימה' : 'לא נמצאו שמות'); return; }
    commit(st => { st.people.push(...parsed.map(x => ({ id: uid(), name: x.name, team: x.team, quals: [], unavail: [], note: '' }))); });
    closeSheet(); toast(`נוספו ${parsed.length} חיילים${dup.length ? ` · ${dup.length} כבר היו ברשימה` : ''}`, { undo: true });
  };
  return (
    <Sheet title="הדבקת רשימת חיילים" sub="שם בכל שורה, או שמות מופרדים בפסיקים. אפשר צוות אחרי מקף: ״כהן - כיתה 1״" footer={<button className="btn btn-primary" onClick={add} disabled={!parsed.length}>{parsed.length ? `הוסף ${parsed.length}` : 'הוסף'}</button>}>
      <Field label="רשימה"><textarea className="inp tall" value={txt} onChange={e => setTxt(e.target.value)} autoFocus placeholder={'כהן\nלוי - כיתה 1\nמזרחי, פרץ, ביטון, דהן'} /></Field>
      <Field label="צוות לשורות בלי צוות (לא חובה)"><input className="inp" value={team} onChange={e => setTeam(e.target.value)} /></Field>
      <p className="hint">{parsed.length || dup.length ? `יתווספו ${parsed.length}${dup.length ? ` · ${dup.length} כבר ברשימה` : ''}${parsed.length ? `: ${parsed.slice(0, 8).map(x => x.name).join(', ')}${parsed.length > 8 ? '…' : ''}` : ''}` : 'אפשר להעתיק עמודה שלמה מהגיליון ולהדביק כאן.'}</p>
    </Sheet>
  );
}
