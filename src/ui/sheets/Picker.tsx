// Choose who goes into a shift. Everyone is sorted by whether they can take it, with their rest shown big.
import { useState } from 'react';
import { getState, useAppState } from '../../lib/store';
import { slotOf } from '../../lib/slots';
import { HOUR, dur, weekday, dm, fromKey, hm } from '../../lib/time';
import { Icon } from '../icons';
import { Sheet } from '../primitives';
import { applyPick, pickerGroups, removeFrom, autoFill, type Candidate } from '../actions';
import { closeSheet } from '../uiStore';

export function Picker({ slotKey }: { slotKey: string }) {
  const s = useAppState();
  const sl = slotOf(s, slotKey);
  // the recommended soldiers start checked, so filling a shift is one tap
  const [sel, setSel] = useState<string[]>(() => {
    const s0 = getState(); const sl0 = slotOf(s0, slotKey);
    if (!sl0) return [];
    return pickerGroups(s0, sl0).ok.slice(0, Math.max(0, sl0.need - sl0.assigned.length)).map(c => c.p.id);
  });
  const [q, setQ] = useState('');
  if (!sl) return <Sheet title="המשמרת לא נמצאה"><p className="hint">ייתכן שהיא נמחקה.</p></Sheet>;
  const g = pickerGroups(s, sl);
  const missing = Math.max(0, sl.need - sl.assigned.length);
  const choosable = new Set([...g.ok, ...g.warn, ...g.move].map(c => c.p.id));
  const chosen = sel.filter(id => choosable.has(id));
  const toggle = (id: string) => setSel(x => (x.includes(id) ? x.filter(i => i !== id) : [...x, id]));
  const match = (name: string) => !q.trim() || name.includes(q.trim());
  const teams = [...new Set(s.people.map(p => p.team).filter(Boolean))];
  const pickTeam = (t: string) => {
    const ids = [...g.ok, ...g.warn].filter(c => c.p.team === t).map(c => c.p.id);
    const all = ids.every(id => sel.includes(id));
    setSel(x => (all ? x.filter(i => !ids.includes(i)) : [...new Set([...x, ...ids])]));
  };
  const recommend = () => {
    const need = sl.need - sl.assigned.length - chosen.length; if (need <= 0) return;
    setSel(x => [...x, ...g.ok.filter(c => !x.includes(c.p.id)).slice(0, need).map(c => c.p.id)]);
  };

  const row = (c: Candidate, kind: 'ok' | 'warn' | 'move' | 'out', i: number) => {
    const on = chosen.includes(c.p.id);
    const e = kind === 'move' && c.e2 ? c.e2 : c.e;
    let why = '';
    if (kind === 'ok') why = e.prev ? `אחרי ${e.prev.name} ${weekday(e.prev.date)} ${hm(e.prev.start)}–${hm(e.prev.end)}` : 'אין משמרת לפני';
    else if (kind === 'warn') why = e.reasons.join(' · ');
    else if (kind === 'move' && c.from) {
      const m = Math.max(0, c.from.need - (c.from.assigned.length - 1));
      why = `עכשיו ב${c.from.name} ${hm(c.from.start)}–${hm(c.from.end)} · שם ${m ? (m === 1 ? 'יחסר אחד' : `יחסרו ${m}`) : 'עדיין מאויש'}`;
    } else why = c.e.reasons[0];
    const rest = e.restBefore;
    return (
      <button key={c.p.id} className={`cand k-${kind}${on ? ' on' : ''}`} disabled={kind === 'out'} hidden={!match(c.p.name)} aria-pressed={on} onClick={() => toggle(c.p.id)}>
        <span className="box">{on ? <Icon n="check" size={15} /> : null}</span>
        <span className="c-main">
          <span className="c-name">
            <b>{c.p.name}</b>
            {kind === 'ok' && i < missing ? <span className="tg rec">מומלץ</span> : null}
            {c.p.team ? <span className="tg">{c.p.team}</span> : null}
            {c.p.quals.map(q2 => <span key={q2} className={`tg ${q2 === sl.qual ? 'hit' : 'q'}`}>{q2}</span>)}
          </span>
          <span className="c-why">{why}</span>
        </span>
        {kind === 'out' ? null : (
          <span className={`c-rest ${kind === 'warn' ? 'warn' : 'ok'}`}>
            <b>{rest == null ? '—' : dur(rest)}</b><small>מנוחה</small>
          </span>
        )}
      </button>
    );
  };
  const grp = (k: 'ok' | 'warn' | 'move' | 'out', label: string, arr: Candidate[]) =>
    arr.length ? (<><h4 className={`grp g-${k}`}><i />{label}<span className="n">{arr.length}</span></h4>{arr.map((c, i) => row(c, k, i))}</>) : null;

  const title = `${sl.name}${sl.allDay ? '' : ` ${hm(sl.start)}–${hm(sl.end)}`}`;
  return (
    <Sheet
      title={<>שיבוץ: {sl.name} {sl.allDay ? null : <span className="tm" dir="ltr">{hm(sl.start)}–{hm(sl.end)}</span>}</>}
      sub={<>{weekday(sl.date)} {dm(fromKey(sl.date))} · {sl.assigned.length}/{sl.need}{missing ? <b className="bad-t"> · {missing === 1 ? 'חסר אחד' : `חסרים ${missing}`}</b> : null}{sl.qual ? ` · נדרש ${sl.qual}` : ''}</>}
      footer={<>
        {chosen.length ? <button className="btn" onClick={() => setSel([])}>נקה בחירה</button> : <button className="btn" onClick={recommend} disabled={!(missing && g.ok.length)}><Icon n="sparkle" /> בחר מומלצים</button>}
        <button className="btn btn-primary" disabled={!chosen.length} onClick={async () => { if (await applyPick(sl.key, chosen)) closeSheet(); }}>{chosen.length ? `שבץ ${chosen.length}` : 'בחרו חיילים'}</button>
      </>}
    >
      <label className="search in-sheet"><Icon n="search" size={18} /><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש חייל" aria-label={`חיפוש חייל ל${title}`} /></label>
      {teams.length ? <div className="hscroll" style={{ marginTop: 10 }}>{teams.map(t => <button key={t} className="pill" onClick={() => pickTeam(t)}><Icon n="users" size={16} /> כל {t}</button>)}</div> : null}
      {g.cur.length ? (
        <>
          <h4 className="grp g-cur"><i />משובצים<span className="n">{g.cur.length}</span></h4>
          {g.cur.map(({ p, e }) => (
            <div key={p.id} className="cur" hidden={!match(p.name)}>
              <span className="c-main">
                <span className="c-name"><b>{p.name}</b></span>
                <span className={`c-why ${e.status}`}>{e.status === 'ok' ? (e.restBefore != null ? `נח ${dur(e.restBefore)} לפני` : 'ללא התרעות') : e.reasons.join(' · ')}</span>
              </span>
              <button className="ibtn" onClick={() => removeFrom(sl.key, p.id)} aria-label={`הסר את ${p.name}`}><Icon n="x" /></button>
            </div>
          ))}
        </>
      ) : null}
      {grp('ok', 'פנויים ונחו מספיק', g.ok)}
      {grp('warn', `פנויים – מנוחה קצרה מ־${dur(s.settings.minRest * HOUR)}`, g.warn)}
      {grp('move', 'במשמרת חופפת – אפשר להעביר', g.move)}
      {grp('out', 'לא זמינים', g.out)}
      {!s.people.length ? <p className="hint">אין עדיין חיילים. הוסיפו אותם בלשונית ״חיילים״.</p> : null}
      {missing > 1 ? <button className="link" onClick={() => void autoFill([sl.key])}>מלא את המשמרת הזו אוטומטית</button> : null}
    </Sheet>
  );
}
