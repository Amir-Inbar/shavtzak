// Posts (roles that repeat every day) and their shifts, plus the board period.
import { useState, type CSSProperties } from 'react';
import { commit, useAppState } from '../../lib/store';
import { POST_COLORS } from '../../lib/slots';
import type { Post, ShiftDef } from '../../lib/types';
import { addDaysKey, dayName, fromKey, parseHM, todayKey, uid, weekday } from '../../lib/time';
import { Icon } from '../icons';
import { Field, Seg, Sheet, Stepper } from '../primitives';
import { closeSheet, confirmDialog, toast } from '../uiStore';

const TEMPLATES: { label: string; make: () => Post }[] = [
  { label: 'שמירה 3 × 8 ש׳', make: () => ({ id: uid(), name: 'שמירה', color: 0, allDay: false, blocks: true, rest: true, qual: '', shifts: [{ id: uid(), start: '05:00', end: '13:00', need: 4 }, { id: uid(), start: '13:00', end: '21:00', need: 4 }, { id: uid(), start: '21:00', end: '05:00', need: 4 }] }) },
  { label: 'שמירה 6 × 4 ש׳', make: () => ({ id: uid(), name: 'עמדה', color: 3, allDay: false, blocks: true, rest: true, qual: '', shifts: ['02', '06', '10', '14', '18', '22'].map((h, i, a) => ({ id: uid(), start: `${h}:00`, end: `${a[(i + 1) % a.length]}:00`, need: 2 })) }) },
  { label: 'כוננות 24 ש׳', make: () => ({ id: uid(), name: 'כוננות', color: 1, allDay: false, blocks: true, rest: false, qual: '', shifts: [{ id: uid(), start: '12:00', end: '12:00', need: 6 }] }) },
  { label: 'תורן יומי', make: () => ({ id: uid(), name: 'תורן', color: 2, allDay: true, blocks: false, rest: false, qual: '', shifts: [{ id: uid(), start: '00:00', end: '00:00', need: 1 }] }) },
];

export function PostsEditor({ focus }: { focus?: string }) {
  const s = useAppState();
  const [posts, setPosts] = useState<Post[]>(() => structuredClone(s.posts));
  const [open, setOpen] = useState<string | null>(focus ?? (s.posts.length ? null : null));
  const upd = (id: string, f: (p: Post) => Post) => setPosts(ps => ps.map(p => (p.id === id ? f(p) : p)));

  const save = async () => {
    // cells that would disappear (post or shift deleted) but have people in them
    const alive = new Set(posts.flatMap(p => p.shifts.map(sh => `${p.id}|${sh.id}`)));
    const lost = Object.entries(s.cells).filter(([k, c]) => { const [pid, , sid] = k.split('|'); return c.assigned.length && !alive.has(`${pid}|${sid}`); });
    if (lost.length && !(await confirmDialog({ title: 'שיבוצים יימחקו', text: `${lost.length} משמרות עם חיילים שייכות לעמדה או משמרת שהסרתם. אפשר לבטל מיד אחרי.`, ok: 'שמור ומחק', danger: true }))) return;
    const bad = posts.find(p => !p.name.trim() || !p.shifts.length);
    if (bad) { toast(bad.name.trim() ? `לעמדה ${bad.name} אין משמרות` : 'לכל עמדה צריך שם'); setOpen(bad.id); return; }
    commit(d => {
      d.posts = posts.map(p => ({ ...p, name: p.name.trim() }));
      for (const [k] of lost) delete d.cells[k];
    });
    closeSheet(); toast('העמדות נשמרו', { undo: true });
  };

  return (
    <Sheet title="עמדות ומשמרות" sub="עמדה חוזרת בכל יום של הלוח. לכל עמדה קובעים משמרות וכמה חיילים בכל אחת." wide
      footer={<button className="btn btn-primary" onClick={save}>שמור</button>}>
      {posts.map((p, i) => {
        const isOpen = open === p.id;
        return (
          <div key={p.id} className={`post-ed${isOpen ? ' open' : ''}`} style={{ '--pc': POST_COLORS[p.color % POST_COLORS.length] } as CSSProperties}>
            <button className="pe-head" onClick={() => setOpen(isOpen ? null : p.id)} aria-expanded={isOpen}>
              <i className="pdot" /><b className="grow">{p.name || 'עמדה חדשה'}</b>
              <span className="muted tm">{p.allDay ? 'כל היום' : p.shifts.map(sh => `\u2066${sh.start}–${sh.end}\u2069`).join(' · ')}</span>
              <Icon n={isOpen ? 'up' : 'down'} size={18} />
            </button>
            {isOpen ? (
              <div className="pe-body">
                <Field label="שם העמדה"><input className="inp" value={p.name} onChange={e => upd(p.id, x => ({ ...x, name: e.target.value }))} /></Field>
                <div className="fld"><span className="fld-l">צבע</span>
                  <div className="row">{POST_COLORS.map((c, ci) => <button key={c} type="button" className={`swatch${p.color % POST_COLORS.length === ci ? ' on' : ''}`} style={{ background: c }} onClick={() => upd(p.id, x => ({ ...x, color: ci }))} aria-label={`צבע ${ci + 1}`} />)}</div>
                </div>
                <div className="fld"><span className="fld-l">סוג</span>
                  <Seg full value={p.allDay ? 'allday' : 'shifts'} onChange={v => upd(p.id, x => v === 'allday'
                    ? { ...x, allDay: true, blocks: false, rest: false, shifts: [{ id: x.shifts[0]?.id ?? uid(), start: '00:00', end: '00:00', need: x.shifts[0]?.need ?? 1 }] }
                    : { ...x, allDay: false, blocks: true, rest: true, shifts: x.shifts.length ? x.shifts : [{ id: uid(), start: '08:00', end: '16:00', need: 2 }] })}
                    options={[['shifts', 'משמרות עם שעות'], ['allday', 'תפקיד לכל היום (תורן)']]} />
                </div>
                {p.allDay ? (
                  <div className="fld"><span className="fld-l">כמה חיילים ביום</span><Stepper label="כמות" value={p.shifts[0]?.need ?? 1} min={0} onChange={v => upd(p.id, x => ({ ...x, shifts: [{ ...x.shifts[0], need: v }] }))} /></div>
                ) : (
                  <div className="fld"><span className="fld-l">משמרות</span>
                    <div className="shift-list">
                      {p.shifts.map(sh => <ShiftRow key={sh.id} sh={sh} onChange={nsh => upd(p.id, x => ({ ...x, shifts: x.shifts.map(y => (y.id === sh.id ? nsh : y)) }))} onDelete={() => upd(p.id, x => ({ ...x, shifts: x.shifts.filter(y => y.id !== sh.id) }))} />)}
                    </div>
                    <button type="button" className="btn btn-sm" onClick={() => upd(p.id, x => {
                      const last = x.shifts[x.shifts.length - 1];
                      const len = last ? ((parseHM(last.end) - parseHM(last.start) + 1440) % 1440 || 1440) : 480;
                      const st = last ? last.end : '08:00';
                      const en = `${String(Math.floor(((parseHM(st) + len) % 1440) / 60)).padStart(2, '0')}:${String((parseHM(st) + len) % 60).padStart(2, '0')}`;
                      return { ...x, shifts: [...x.shifts, { id: uid(), start: st, end: en, need: last?.need ?? 2 }] };
                    })}><Icon n="plus" size={18} /> הוסף משמרת</button>
                    <p className="hint">שעת סיום מוקדמת מההתחלה = נגמרת למחרת. התחלה וסיום זהים (12:00–12:00) = 24 שעות.</p>
                  </div>
                )}
                {!p.allDay ? (
                  <>
                    <label className="check"><input type="checkbox" checked={p.rest} onChange={e => upd(p.id, x => ({ ...x, rest: e.target.checked }))} /><span className="grow"><b>דורשת מנוחה</b><small>התרעה אם יש פחות מ־{s.settings.minRest} ש׳ מנוחה לפני או אחרי. לכוננות בדרך כלל לא.</small></span></label>
                    <label className="check"><input type="checkbox" checked={p.blocks} onChange={e => upd(p.id, x => ({ ...x, blocks: e.target.checked }))} /><span className="grow"><b>תופסת את החייל</b><small>אי אפשר לשבץ אותו במקביל למשמרת אחרת.</small></span></label>
                  </>
                ) : <p className="hint">תפקיד לכל היום לא חוסם משמרות אחרות ולא נספר במנוחה.</p>}
                <Field label="כשירות נדרשת (לא חובה)"><input className="inp" value={p.qual} onChange={e => upd(p.id, x => ({ ...x, qual: e.target.value }))} placeholder="למשל: נהג" /></Field>
                <div className="row" style={{ marginTop: 14 }}>
                  <button type="button" className="btn btn-sm" disabled={i === 0} onClick={() => setPosts(ps => { const a = [...ps]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a; })}><Icon n="up" size={18} /> למעלה</button>
                  <button type="button" className="btn btn-sm" disabled={i === posts.length - 1} onClick={() => setPosts(ps => { const a = [...ps]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; return a; })}><Icon n="down" size={18} /> למטה</button>
                  <button type="button" className="btn btn-sm danger-t" onClick={() => setPosts(ps => ps.filter(x => x.id !== p.id))}><Icon n="trash" size={18} /> מחק עמדה</button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
      <h4 className="grp">הוספת עמדה</h4>
      <div className="row">
        {TEMPLATES.map(t => <button key={t.label} className="pill" onClick={() => { const p = t.make(); p.color = posts.length % POST_COLORS.length; setPosts(ps => [...ps, p]); setOpen(p.id); }}><Icon n="plus" size={16} /> {t.label}</button>)}
        <button className="pill" onClick={() => { const p: Post = { id: uid(), name: '', color: posts.length % POST_COLORS.length, allDay: false, blocks: true, rest: true, qual: '', shifts: [{ id: uid(), start: '08:00', end: '16:00', need: 2 }] }; setPosts(ps => [...ps, p]); setOpen(p.id); }}><Icon n="plus" size={16} /> עמדה ריקה</button>
      </div>
    </Sheet>
  );
}

function ShiftRow({ sh, onChange, onDelete }: { sh: ShiftDef; onChange: (s: ShiftDef) => void; onDelete: () => void }) {
  const cross = parseHM(sh.end) <= parseHM(sh.start);
  return (
    <div className="shift-row">
      <input className="inp" type="time" value={sh.start} onChange={e => onChange({ ...sh, start: e.target.value })} aria-label="התחלה" />
      <span className="muted">עד</span>
      <input className="inp" type="time" value={sh.end} onChange={e => onChange({ ...sh, end: e.target.value })} aria-label="סיום" />
      {cross ? <span className="tag-mini">{sh.start === sh.end ? '24 ש׳' : '+1'}</span> : <span className="tag-mini ghost" />}
      <Stepper label="חיילים" value={sh.need} min={0} onChange={v => onChange({ ...sh, need: v })} />
      <button type="button" className="ibtn sm" onClick={onDelete} aria-label="מחק משמרת"><Icon n="trash" size={18} /></button>
    </div>
  );
}

export function PeriodSheet() {
  const s = useAppState();
  const [start, setStart] = useState(s.board.start);
  const [days, setDays] = useState(s.board.days);
  const d = new Date(fromKey(todayKey())).getDay();
  const lastSat = addDaysKey(todayKey(), -((d + 1) % 7));
  const lastSun = addDaysKey(todayKey(), -d);
  const apply = () => {
    commit(st => { st.board = { start, days }; });
    closeSheet();
  };
  return (
    <Sheet title="תקופת הלוח" sub="אילו ימים מוצגים בלוח ובתמונה לווטסאפ." footer={<button className="btn btn-primary" onClick={apply}>הצג</button>}>
      <Field label="מתחיל ב־"><input className="inp" type="date" value={start} onChange={e => e.target.value && setStart(e.target.value)} /></Field>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="pill" onClick={() => setStart(todayKey())}>מהיום</button>
        <button className="pill" onClick={() => setStart(lastSat)}>משבת ({dayName(lastSat)})</button>
        <button className="pill" onClick={() => setStart(lastSun)}>מראשון ({dayName(lastSun)})</button>
      </div>
      <div className="fld"><span className="fld-l">כמה ימים</span><Stepper label="ימים" value={days} min={1} max={14} onChange={setDays} /></div>
      <p className="hint">הלוח יציג {weekday(start)} {start.split('-').reverse().slice(0, 2).map(Number).join('.')} עד {weekday(addDaysKey(start, days - 1))}. שיבוצים של ימים אחרים נשמרים ולא נמחקים.</p>
      <p className="hint">קיצור: החצים בראש המסך מזיזים את הלוח תקופה קדימה או אחורה.</p>
    </Sheet>
  );
}
