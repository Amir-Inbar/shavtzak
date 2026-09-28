// General settings, backup / handoff to another manager, and data reset.
import { useRef, useState } from 'react';
import { commit, defaults, normalize, useAppState } from '../../lib/store';
import { sampleState } from '../../lib/sample';
import { hm, toKey, whenShort } from '../../lib/time';
import type { Theme } from '../../lib/types';
import { Icon } from '../icons';
import { Field, Seg, Sheet, Stepper } from '../primitives';
import { closeAllSheets, confirmDialog, openSheet, toast } from '../uiStore';
import { downloadFile, canShareFiles, copyText } from '../io';

export function SettingsSheet() {
  const s = useAppState();
  const [title, setTitle] = useState(s.settings.title);
  const [to, setTo] = useState('');
  const [handoff, setHandoff] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const setSetting = (f: (st: typeof s.settings) => void) => commit(d => f(d.settings));
  const backup = () => JSON.stringify({ app: 'shavtzak', format: 3, exportedAt: Date.now(), to: handoff ? to.trim() : '', state: s });
  const fname = () => `shavtzak-${toKey(Date.now())}-${hm(Date.now()).replace(':', '')}.json`;
  const afterExport = () => {
    if (handoff && to.trim()) { commit(d => { d.settings.handedTo = { name: to.trim(), at: Date.now() }; }); toast(`הניהול סומן כמועבר ל${to.trim()}`, { undo: true }); }
  };
  const exportShare = async () => {
    const f = new File([backup()], fname(), { type: 'application/json' });
    if (!canShareFiles([f])) { toast('המכשיר לא יודע לשלוח קבצים מכאן – השתמשו ב״שמור קובץ״'); return; }
    try { await navigator.share({ files: [f], title: 'גיבוי שבצ״ק' }); afterExport(); } catch (e) { if ((e as Error).name !== 'AbortError') toast('השליחה לא הצליחה – נסו ״שמור קובץ״'); }
  };

  return (
    <Sheet title="הגדרות" wide>
      <Field label="שם הלוח (מופיע בתמונה)"><input className="inp" value={title} onChange={e => setTitle(e.target.value)} onBlur={() => title.trim() && title !== s.settings.title && setSetting(st => { st.title = title.trim(); })} /></Field>
      <div className="fld"><span className="fld-l">מנוחה מינימלית בין משמרות</span>
        <div className="row"><Stepper label="שעות מנוחה" value={s.settings.minRest} min={0} max={24} step={0.5} onChange={v => setSetting(st => { st.minRest = v; })} /><span className="muted">שעות · פחות מזה מסומן בצהוב. 0 מבטל.</span></div>
      </div>
      <div className="fld"><span className="fld-l">תצוגה</span>
        <Seg full value={s.settings.theme} onChange={(v: Theme) => setSetting(st => { st.theme = v; })} options={[['system', 'לפי המכשיר'], ['light', 'בהיר'], ['dark', 'כהה']]} />
      </div>

      <div className="card">
        <h3>גיבוי והעברת ניהול</h3>
        <p>קובץ אחד עם כל החיילים, העמדות והשיבוצים. מנהל אחר טוען אותו אצלו וממשיך משם. אין סנכרון בין מכשירים – רק מנהל אחד עובד על הלוח בכל רגע.</p>
        <label className="check"><input type="checkbox" checked={handoff} onChange={e => setHandoff(e.target.checked)} /><span className="grow"><b>אני מעביר את הניהול</b><small>הלוח אצלך יסומן כ״הועבר״ כדי שלא תמשיך לערוך עותק ישן</small></span></label>
        {handoff ? <Field label="למי?"><input className="inp" value={to} onChange={e => setTo(e.target.value)} placeholder="שם המנהל הבא" /></Field> : null}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={exportShare}><Icon n="share" /> שלח קובץ</button>
          <button className="btn" onClick={() => { downloadFile(new File([backup()], fname(), { type: 'application/json' })); afterExport(); }}><Icon n="dl" /> שמור קובץ</button>
          <button className="btn" onClick={() => void copyText(backup(), 'הגיבוי הועתק').then(ok => ok && afterExport())}><Icon n="copy" /> העתק</button>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn" onClick={() => fileRef.current?.click()}><Icon n="ul" /> טען מקובץ</button>
          <input ref={fileRef} type="file" accept=".json,application/json,text/plain" hidden onChange={e => { const f = e.target.files?.[0]; if (f) f.text().then(importText); e.target.value = ''; }} />
          <button className="btn" onClick={() => openSheet(() => <PasteBackup />)}><Icon n="clip" /> הדבק גיבוי</button>
        </div>
        {s.settings.receivedFrom ? <p className="hint">הלוח נטען מקובץ{s.settings.receivedFrom.name ? ` של ${s.settings.receivedFrom.name}` : ''} ב־{whenShort(s.settings.receivedFrom.at)}.</p> : null}
      </div>

      <div className="card">
        <h3>מקרא</h3>
        <div className="legend">
          <div><span className="sw ok" />מאויש במלואו</div>
          <div><span className="sw bad" />מקום פנוי, חפיפה או חייל לא זמין</div>
          <div><span className="sw warn" />מנוחה קצרה מ־{s.settings.minRest} ש׳ – השעה על השם היא המנוחה בפועל</div>
          <div><span className="sw live" />משמרת שמתקיימת עכשיו</div>
        </div>
      </div>

      <div className="card">
        <h3>התקנה בטלפון</h3>
        <p>הנתונים נשמרים רק במכשיר הזה ולא נשלחים לשום מקום. אחרי ההתקנה האפליקציה נפתחת גם בלי קליטה.</p>
        <ol className="steps"><li><b>אייפון:</b> Safari ← שיתוף ← ״הוסף למסך הבית״</li><li><b>אנדרואיד:</b> Chrome ← ⋮ ← ״התקנת אפליקציה״</li></ol>
      </div>

      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn btn-sm" onClick={async () => { if (await confirmDialog({ title: 'לטעון נתוני דוגמה?', text: 'הלוח הנוכחי יוחלף. אפשר לבטל מיד אחרי.', ok: 'טען', danger: true })) { commit(d => { const th = d.settings.theme; Object.assign(d, sampleState()); d.settings.theme = th; }); closeAllSheets(); toast('נטענו נתוני דוגמה', { undo: true }); } }}>נתוני דוגמה</button>
        <button className="btn btn-sm danger-t" onClick={async () => { if (await confirmDialog({ title: 'למחוק את כל הנתונים?', text: 'כל החיילים, העמדות והשיבוצים יימחקו מהמכשיר. כדאי לשמור גיבוי קודם.', ok: 'מחק הכל', danger: true })) { commit(d => { const th = d.settings.theme; Object.assign(d, defaults()); d.settings.theme = th; }); closeAllSheets(); toast('כל הנתונים נמחקו', { undo: true }); } }}><Icon n="trash" size={18} /> מחק הכל</button>
      </div>
    </Sheet>
  );
}

function PasteBackup() {
  const [t, setT] = useState('');
  return (
    <Sheet title="הדבקת גיבוי" footer={<button className="btn btn-primary" onClick={() => importText(t)} disabled={!t.trim()}>טען</button>}>
      <textarea className="inp tall mono" value={t} onChange={e => setT(e.target.value)} placeholder='{"app":"shavtzak",…}' autoFocus />
    </Sheet>
  );
}

export async function importText(txt: string) {
  let o: any;
  try { o = JSON.parse(String(txt).trim()); } catch { toast('לא הצלחתי לקרוא את הקובץ – ודאו שזה גיבוי של שבצ״ק'); return; }
  const st = o?.app === 'shavtzak' ? o.state : o;
  if (!st || !Array.isArray(st.people)) { toast('זה לא קובץ גיבוי של שבצ״ק'); return; }
  const ok = await confirmDialog({
    title: 'לטעון את הלוח מהקובץ?',
    text: `${st.people.length} חיילים ו־${(st.posts ?? []).length} עמדות${o.exportedAt ? `, נשמר ${whenShort(o.exportedAt)}` : ''}. הלוח שבמכשיר יוחלף – אפשר לבטל מיד אחרי.`,
    ok: 'טען והחלף', danger: true,
  });
  if (!ok) return;
  commit(d => {
    const theme = d.settings.theme;
    const n = normalize(st);
    Object.assign(d, n);
    d.sample = false; d.settings.theme = theme; d.settings.handedTo = null;
    d.settings.receivedFrom = { name: '', at: o.exportedAt ?? Date.now() };
  });
  closeAllSheets();
  toast('הלוח נטען', { undo: true });
}
