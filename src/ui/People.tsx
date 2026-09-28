// Soldier list (inside "ניהול") and the search result card on the main screen.
import type { CSSProperties } from 'react';
import { useAppState } from '../lib/store';
import { boardDays, postColor, restBefore, slotsOfPerson } from '../lib/slots';
import { HOUR, dur, hm, weekday } from '../lib/time';
import { Icon } from './icons';
import { Sheet } from './primitives';
import { openSheet } from './uiStore';
import { PasteList, SoldierSheet } from './sheets/Soldier';

export function PeopleSheet() {
  const s = useAppState();
  const days = boardDays(s);
  const list = [...s.people].sort((a, b) => a.name.localeCompare(b.name, 'he'));
  return (
    <Sheet title={`חיילים (${s.people.length})`}
      footer={<>
        <button className="btn btn-primary" onClick={() => openSheet(() => <PasteList />)}><Icon n="clip" /> הדבקת רשימה</button>
        <button className="btn" onClick={() => openSheet(() => <SoldierSheet id={null} />)}><Icon n="plus" /> חייל</button>
      </>}>
      {!list.length ? <p className="hint">עוד אין חיילים. הכי מהיר: ״הדבקת רשימה״ – שם בכל שורה.</p> : (
        <div className="plist">
          {list.map(p => {
            const n = slotsOfPerson(s, p.id).filter(sl => days.includes(sl.date)).length;
            const off = p.unavail.some(u => u.end > Date.now());
            return (
              <button key={p.id} className="prow" onClick={() => openSheet(() => <SoldierSheet id={p.id} />)}>
                <b>{p.name}</b>
                <span className="muted grow">{[p.team, ...p.quals].filter(Boolean).join(' · ')}</span>
                {off ? <span className="tag bad">לא זמין</span> : null}
                <span className="tag">{n} משמרות</span>
              </button>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}

/** Typing a name shows that soldier's shifts in the period, with the rest in between. */
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
                const g = raw !== null && (i > 0 || raw < 24 * HOUR) ? raw : null;
                return (
                  <span key={sl.key} className="f-item">
                    {g !== null ? <span className={`gp${min && g < min ? ' short' : ''}`}><Icon n="moon" size={12} />{dur(g)}</span> : null}
                    <span className="sp" style={{ '--pc': postColor(sl.color) } as CSSProperties}>
                      {weekday(sl.date)} · {sl.name}{sl.allDay ? '' : <> <span className="tm" dir="ltr">{hm(sl.start)}–{hm(sl.end)}</span></>}
                    </span>
                  </span>
                );
              }) : <span className="muted">אין משמרות בימים האלה</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
