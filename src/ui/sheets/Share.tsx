// Build the WhatsApp images and share them from the phone's share menu.
import { useEffect, useMemo, useRef, useState } from 'react';
import { silentUpdate, useAppState } from '../../lib/store';
import { boardDays } from '../../lib/slots';
import { buildImages, periodKey, shareText, signature, type ShareMode, type ShareOptions } from '../../lib/share';
import { dm, fromKey, weekday } from '../../lib/time';
import { Icon } from '../icons';
import { Seg, Sheet } from '../primitives';
import { toast } from '../uiStore';
import { canShareFiles, copyText, downloadFile } from '../io';

export function ShareSheet() {
  const s = useAppState();
  const all = boardDays(s);
  const [mode, setMode] = useState<ShareMode>(() => (localStorage.getItem('shavtzak.shareMode') as ShareMode) || 'table');
  const [days, setDays] = useState<string[]>(all);
  const [posts, setPosts] = useState<string[]>(s.posts.map(p => p.id));
  const [notes, setNotes] = useState(false);
  const [out, setOut] = useState<{ files: File[]; urls: string[] } | null>(null);
  const busy = useRef(0);

  // version number per period: goes up whenever the shared content changes
  const sig = signature(s);
  const pk = periodKey(s);
  useEffect(() => {
    const m = s.shareMeta[pk];
    if (!m || m.sig !== sig) silentUpdate(d => { d.shareMeta[pk] = { v: (m?.v ?? 0) + 1, sig, at: Date.now() }; });
  }, [sig, pk]); // eslint-disable-line react-hooks/exhaustive-deps
  const meta = s.shareMeta[pk] ?? { v: 1, at: Date.now() };

  const opts: ShareOptions = useMemo(() => ({ mode, days: all.filter(d => days.includes(d)), postIds: posts, notes }), [mode, days, posts, notes, all.join()]);
  useEffect(() => {
    const my = ++busy.current;
    setOut(null);
    if (!opts.days.length) return;
    buildImages(s, opts, meta).then(r => { if (my === busy.current) setOut(r); else r.urls.forEach(u => URL.revokeObjectURL(u)); });
  }, [opts, meta.v, s]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => out?.urls.forEach(u => URL.revokeObjectURL(u)), [out]);

  const share = async () => {
    if (!out?.files.length) return;
    if (canShareFiles(out.files)) {
      try { await navigator.share({ files: out.files, title: s.settings.title }); } catch (e) { if ((e as Error).name !== 'AbortError') toast('השיתוף לא הצליח – נסו ״שמור״'); }
    } else { out.files.forEach((f, i) => setTimeout(() => downloadFile(f), i * 350)); toast('התמונות נשמרו – שלחו אותן מהגלריה'); }
  };

  const toggle = (arr: string[], set: (v: string[]) => void, id: string) => set(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);
  return (
    <Sheet title="שיתוף לווטסאפ" sub={`גרסה ${meta.v} · הנמענים מקבלים תמונה בלבד`} wide
      footer={<>
        <button className="btn btn-accent" onClick={share} disabled={!out?.files.length}><Icon n="share" /> {out && out.files.length > 1 ? `שתף ${out.files.length} תמונות` : 'שתף'}</button>
        <button className="btn" onClick={() => out?.files.forEach((f, i) => setTimeout(() => downloadFile(f), i * 350))} disabled={!out?.files.length}><Icon n="dl" /> שמור</button>
        <button className="btn" onClick={() => void copyText(shareText(s, opts, meta), 'הטקסט הועתק – הדביקו בקבוצה')}><Icon n="text" /> טקסט</button>
      </>}>
      <Seg full value={mode} onChange={v => { setMode(v); try { localStorage.setItem('shavtzak.shareMode', v); } catch { /* ignore */ } }}
        options={[['table', <><Icon n="table" size={18} /> טבלה</>], ['people', <><Icon n="users" size={18} /> לפי חיילים</>]]} />
      <p className="hint">{mode === 'table' ? 'כמו הלוח: לכל עמדה – ימים, שעות ושמות.' : 'שורה לכל חייל לפי א–ב, עמודה לכל יום. כל אחד מוצא את השם שלו ורואה מה הוא עושה בכל יום.'}</p>
      <div className="fld"><span className="fld-l">ימים</span>
        <div className="row">{all.map(d => <button key={d} className={`pill${days.includes(d) ? ' on' : ''}`} onClick={() => toggle(days, setDays, d)}>{weekday(d)} {dm(fromKey(d))}</button>)}</div>
      </div>
      {s.posts.length > 1 ? (
        <div className="fld"><span className="fld-l">עמדות</span>
          <div className="row">{s.posts.map(p => <button key={p.id} className={`pill${posts.includes(p.id) ? ' on' : ''}`} onClick={() => toggle(posts, setPosts, p.id)}>{p.name}</button>)}</div>
        </div>
      ) : null}
      {mode === 'table' ? <label className="check"><input type="checkbox" checked={notes} onChange={e => setNotes(e.target.checked)} /><span className="grow">להציג הערות למשמרות</span></label> : null}
      <div className="previews">
        {!opts.days.length ? <p className="hint">בחרו לפחות יום אחד.</p> : out ? out.urls.map((u, i) => <img key={u} src={u} alt={`תמונת שיבוץ ${i + 1}`} />) : <div className="skeleton" />}
      </div>
      {out && out.files.length > 1 ? <p className="hint">הלוח ארוך, אז הוא פוצל ל־{out.files.length} תמונות כדי שיישאר קריא.</p> : null}
    </Sheet>
  );
}
