// Shows when the site holds a newer board than this device: enter the code once, then one tap per update.
import { useEffect, useState } from 'react';
import { commit, normalize } from '../lib/store';
import { appliedAt, decryptRemote, fetchRemote, markApplied, saveCode, savedCode, type RemoteBoard } from '../lib/remote';
import { dm, hm } from '../lib/time';
import { Icon } from './icons';
import { toast } from './uiStore';

export function RemoteBanner() {
  const [remote, setRemote] = useState<RemoteBoard | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => { fetchRemote().then(r => { if (r && r.updatedAt > appliedAt()) setRemote(r); }); }, []);
  if (!remote || hidden) return null;
  const known = savedCode();

  const load = async (c: string) => {
    setBusy(true); setBad(false);
    try {
      const j = await decryptRemote(remote, c) as { state?: unknown };
      const st = normalize(j.state ?? j);
      commit(d => { Object.assign(d, st); d.sample = false; d.settings.handedTo = null; d.settings.receivedFrom = { name: 'האתר', at: remote.updatedAt }; });
      saveCode(c); markApplied(remote.updatedAt); setRemote(null);
      toast(`הלוח נטען מהאתר · ${st.people.length} חיילים`, { undo: true });
    } catch { setBad(true); } finally { setBusy(false); }
  };

  return (
    <div className="banner remote">
      <p><b>יש לוח מעודכן באתר</b> · {dm(remote.updatedAt)} {hm(remote.updatedAt)}{known ? '. טעינה תחליף את הלוח שבמכשיר (אפשר לבטל).' : '. הזינו את קוד הלוח כדי לטעון אותו. הקוד נשמר במכשיר, ובפעם הבאה מספיקה לחיצה אחת.'}</p>
      {known ? (
        <div className="row">
          <button className="btn btn-sm btn-accent" disabled={busy} onClick={() => void load(known)}><Icon n="dl" size={18} /> טען</button>
          <button className="btn btn-sm" onClick={() => setHidden(true)}>לא עכשיו</button>
          {bad ? <span className="bad-t">הקוד השתנה – <button className="link" onClick={() => { try { localStorage.removeItem('shavtzak.remoteKey'); } catch { /* ignore */ } setBad(false); setHidden(false); setCode(''); }}>הזן מחדש</button></span> : null}
        </div>
      ) : (
        <form className="row nowrap" onSubmit={e => { e.preventDefault(); if (code.trim()) void load(code); }}>
          <input className="inp sm" value={code} onChange={e => { setCode(e.target.value); setBad(false); }} placeholder="קוד הלוח" aria-label="קוד הלוח" autoComplete="off" autoCapitalize="none" spellCheck={false} dir="ltr" />
          <button className="btn btn-sm btn-accent" disabled={busy || !code.trim()}>{busy ? '...' : 'טען'}</button>
          <button type="button" className="btn btn-sm" onClick={() => setHidden(true)}>לא עכשיו</button>
        </form>
      )}
      {bad && !known ? <p className="bad-t" style={{ flexBasis: '100%' }}>הקוד לא נכון. בדקו ונסו שוב.</p> : null}
    </div>
  );
}
