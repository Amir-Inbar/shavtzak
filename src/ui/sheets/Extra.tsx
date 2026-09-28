// One-off tasks that aren't part of a post, including a surprise task that starts now.
import { useState } from 'react';
import { commit, getState, useAppState } from '../../lib/store';
import type { Extra } from '../../lib/types';
import { DAY, HOUR, MIN, dur, fromKey, hm, toKey, uid } from '../../lib/time';
import { Icon } from '../icons';
import { Field, Seg, Sheet, Stepper } from '../primitives';
import { closeSheet, replaceSheet, toast } from '../uiStore';
import { Picker } from './Picker';

export function ExtraForm({ id, surprise }: { id?: string; surprise?: boolean }) {
  const s = useAppState();
  const existing = id ? s.extras.find(x => x.id === id) : undefined;
  const now = Math.floor(Date.now() / (5 * MIN)) * 5 * MIN;
  const base: Extra = existing ?? { id: '', name: surprise ? 'משימה בהפתעה' : '', start: surprise ? now : now + HOUR, end: (surprise ? now : now + HOUR) + 2 * HOUR, need: 2, qual: '', note: '', assigned: [] };
  const [name, setName] = useState(base.name);
  const [date, setDate] = useState(toKey(base.start));
  const [st, setSt] = useState(hm(base.start));
  const [en, setEn] = useState(hm(base.end));
  const [len, setLen] = useState(2);
  const [need, setNeed] = useState(base.need);
  const [qual, setQual] = useState(base.qual);
  const [note, setNote] = useState(base.note);
  if (id && !existing) return <Sheet title="המשימה נמחקה"><p className="hint">אפשר לבטל מההודעה למטה.</p></Sheet>;

  const start = fromKey(date, st);
  let end = surprise ? start + len * HOUR : fromKey(date, en);
  if (!surprise && end <= start) end += DAY;

  const save = () => {
    if (!name.trim()) { toast('חסר שם'); return; }
    const x: Extra = { ...base, id: base.id || uid(), name: name.trim(), start, end, need, qual: qual.trim(), note: note.trim() };
    commit(d => { const i = d.extras.findIndex(e => e.id === x.id); if (i >= 0) d.extras[i] = x; else d.extras.push(x); });
    if (!existing) {
      const b = getState().board;
      const inBoard = toKey(start) >= b.start && toKey(start) < toKey(fromKey(b.start) + b.days * DAY);
      if (!inBoard) toast('המשימה נוספה, אבל היא מחוץ לתקופה שמוצגת בלוח');
      replaceSheet(() => <Picker slotKey={x.id} />);
    } else { closeSheet(); toast('המשימה עודכנה', { undo: true }); }
  };
  const del = () => { if (!existing) return; commit(d => { d.extras = d.extras.filter(e => e.id !== existing.id); }); closeSheet(); toast(`${existing.name} נמחקה`, { undo: true }); };

  return (
    <Sheet title={existing ? 'עריכת משימה' : surprise ? 'משימה בהפתעה' : 'משימה נוספת'}
      sub={surprise ? 'מתחילה עכשיו. בוחרים משך וכמה חיילים – ומיד רואים מי פנוי ונח מספיק.' : 'משימה חד־פעמית שלא שייכת לעמדה קבועה.'}
      footer={<><button className="btn btn-primary" onClick={save}>{existing ? 'שמור' : <><Icon n="users" /> המשך לבחירת חיילים</>}</button>{existing ? <button className="btn danger-t" onClick={del}><Icon n="trash" /> מחק</button> : null}</>}>
      <Field label="שם"><input className="inp" value={name} onChange={e => setName(e.target.value)} autoFocus={!surprise && !existing} autoComplete="off" /></Field>
      {surprise ? (
        <>
          <Field label="מתחילה ב־"><input className="inp" type="time" value={st} onChange={e => setSt(e.target.value)} /></Field>
          <div className="fld"><span className="fld-l">משך</span>
            <Seg value={String(len)} onChange={v => setLen(Number(v))} options={[['0.5', '30 ד׳'], ['1', '1 ש׳'], ['2', '2 ש׳'], ['3', '3 ש׳'], ['4', '4 ש׳'], ['6', '6 ש׳'], ['8', '8 ש׳']]} />
          </div>
        </>
      ) : (
        <div className="g3">
          <Field label="תאריך"><input className="inp" type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} /></Field>
          <Field label="התחלה"><input className="inp" type="time" value={st} onChange={e => setSt(e.target.value)} /></Field>
          <Field label="סיום"><input className="inp" type="time" value={en} onChange={e => setEn(e.target.value)} /></Field>
        </div>
      )}
      <p className="hint">משך {dur(end - start)}{toKey(end - 1) !== toKey(start) ? ' · נגמרת למחרת' : ''}</p>
      <div className="g2">
        <div className="fld"><span className="fld-l">כמה חיילים</span><Stepper label="חיילים" value={need} min={0} onChange={setNeed} /></div>
        <Field label="כשירות נדרשת"><input className="inp" value={qual} onChange={e => setQual(e.target.value)} placeholder="ללא" /></Field>
      </div>
      {!surprise ? <Field label="הערה"><textarea className="inp" value={note} onChange={e => setNote(e.target.value)} /></Field> : null}
    </Sheet>
  );
}
