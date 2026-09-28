// Actions for one name in one shift: move, swap, remove, open the soldier.
import { useAppState } from '../../lib/store';
import { boardSlots, evaluate, personOf, postColor, slotOf } from '../../lib/slots';
import type { Slot } from '../../lib/types';
import { dur, weekday, hm } from '../../lib/time';
import { Icon } from '../icons';
import { MenuItem, Sheet } from '../primitives';
import { moveGroup, removeFrom, swapPeople, slotLabel } from '../actions';
import { closeSheet, openSheet } from '../uiStore';
import { SoldierSheet } from './Soldier';

export function ChipMenu({ slotKey, pid }: { slotKey: string; pid: string }) {
  const s = useAppState();
  const sl = slotOf(s, slotKey), p = personOf(s, pid);
  if (!sl || !p || !sl.assigned.includes(pid)) return <Sheet title="השיבוץ השתנה"><p className="hint">החייל כבר לא במשמרת הזו.</p></Sheet>;
  const e = evaluate(s, pid, sl);
  return (
    <Sheet title={p.name} sub={slotLabel(sl)}>
      {e.status === 'ok'
        ? <p className="okbox">אין התרעות{e.restBefore != null ? ` · נח ${dur(e.restBefore)} לפני` : ''}{e.restAfter != null ? ` · ${dur(e.restAfter)} אחרי` : ''}</p>
        : <ul className="notes">{e.reasons.map((r, i) => <li key={i} className={e.status === 'block' ? 'bad' : 'warn'}>{r}</li>)}</ul>}
      <div className="menu">
        <MenuItem icon="move" label="העבר למשמרת אחרת" onClick={() => openSheet(() => <Targets mode="move" slotKey={slotKey} pid={pid} />)} />
        <MenuItem icon="swap" label="החלף עם חייל אחר" sub="שניהם עוברים משמרת" onClick={() => openSheet(() => <Targets mode="swap" slotKey={slotKey} pid={pid} />)} />
        <MenuItem icon="x" label="הסר מהמשמרת" onClick={() => { removeFrom(slotKey, pid); closeSheet(); }} />
        <MenuItem icon="users" label="סדר היום וזמינות" onClick={() => openSheet(() => <SoldierSheet id={pid} />)} />
      </div>
      <p className="hint">אפשר גם ללחוץ לחיצה ארוכה על השם בטבלה ולגרור אותו למשמרת אחרת.</p>
    </Sheet>
  );
}

/** list of board shifts to move into, or people to swap with – each with a clear verdict */
function Targets({ mode, slotKey, pid }: { mode: 'move' | 'swap'; slotKey: string; pid: string }) {
  const s = useAppState();
  const from = slotOf(s, slotKey), p = personOf(s, pid);
  if (!from || !p) return <Sheet title="השיבוץ השתנה"><p className="hint">נסו שוב.</p></Sheet>;
  const all = boardSlots(s).filter(x => x.key !== slotKey);
  const byDay = new Map<string, Slot[]>();
  for (const x of all) byDay.set(x.date, [...(byDay.get(x.date) ?? []), x]);
  const done = () => closeSheet(2);
  return (
    <Sheet title={mode === 'move' ? `להעביר את ${p.name} ל…` : `להחליף את ${p.name} עם…`} sub={`עכשיו: ${slotLabel(from)}`}>
      {[...byDay.entries()].map(([d, list]) => (
        <div key={d}>
          <h4 className="grp"><Icon n="cal" size={16} />{weekday(d)}</h4>
          {list.map(t => {
            if (mode === 'move') {
              const ev = t.assigned.includes(pid) ? null : evaluate(s, pid, t, [slotKey]);
              const st = ev ? ev.status : 'block';
              return (
                <button key={t.key} className={`trow v-${st}`} disabled={st === 'block'} onClick={async () => { if (await moveGroup([{ key: slotKey, pid }], t.key)) done(); }}>
                  <span className="pdot" style={{ background: postColor(t.color) }} />
                  <span className="grow"><b>{t.name}</b> {t.allDay ? null : <span className="tm" dir="ltr">{hm(t.start)}–{hm(t.end)}</span>}
                    <small>{t.assigned.length}/{t.need} · {ev ? (ev.status === 'ok' ? (ev.restBefore != null ? `נח ${dur(ev.restBefore)}` : 'אפשר') : ev.reasons[0]) : 'כבר שם'}</small></span>
                  <Icon n="chevL" />
                </button>
              );
            }
            // swap: every person in that shift is an option
            return t.assigned.map(oid => {
              const o = personOf(s, oid); if (!o || oid === pid) return null;
              const a = evaluate(s, pid, t, [slotKey]), b = evaluate(s, oid, from, [t.key]);
              const st = a.status === 'block' || b.status === 'block' ? 'block' : a.status === 'warn' || b.status === 'warn' ? 'warn' : 'ok';
              const why = st === 'ok' ? 'אפשר' : [a.status !== 'ok' ? `${p.name}: ${a.reasons[0]}` : '', b.status !== 'ok' ? `${o.name}: ${b.reasons[0]}` : ''].filter(Boolean).join(' · ');
              return (
                <button key={t.key + oid} className={`trow v-${st}`} disabled={st === 'block'} onClick={async () => { if (await swapPeople({ key: slotKey, pid }, { key: t.key, pid: oid })) done(); }}>
                  <span className="grow"><b>{o.name}</b> · {t.name} {t.allDay ? null : <span className="tm" dir="ltr">{hm(t.start)}–{hm(t.end)}</span>}<small>{why}</small></span>
                  <Icon n="swap" />
                </button>
              );
            });
          })}
        </div>
      ))}
    </Sheet>
  );
}
