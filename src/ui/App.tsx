import { useEffect, useState } from 'react';
import { canUndo, commit, isStorageOk, undo, useAppState } from '../lib/store';
import { boardDays, boardStats } from '../lib/slots';
import { addDaysKey, daysBetween, dm, fromKey, todayKey, weekday } from '../lib/time';
import { Icon } from './icons';
import { DialogHost, MenuItem, Sheet, SheetHost, ToastHost } from './primitives';
import { closeSheet, openSheet, replaceSheet, toast } from './uiStore';
import { DndProvider } from './Dnd';
import { BoardView } from './BoardView';
import { FoundCard, PeopleSheet } from './People';
import { autoFill } from './actions';
import { ShareSheet } from './sheets/Share';
import { SettingsSheet } from './sheets/Settings';
import { PeriodSheet, PostsEditor } from './sheets/Posts';
import { ExtraForm } from './sheets/Extra';

function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    const v = () => { if (!document.hidden) setNow(Date.now()); };
    document.addEventListener('visibilitychange', v);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', v); };
  }, []);
  return now;
}

export function App() {
  const s = useAppState();
  const now = useNow();
  const [search, setSearch] = useState('');
  const days = boardDays(s);
  const stats = boardStats(s);
  const first = days[0], last = days[days.length - 1];
  const today = todayKey();
  const containsToday = daysBetween(first, today) >= 0 && daysBetween(today, last) >= 0;
  const shift = (dir: number) => commit(d => { d.board.start = addDaysKey(d.board.start, dir * d.board.days); });

  return (
    <DndProvider>
      <header className="appbar">
        <div className="bar">
          <div className="brand"><b>{s.settings.title}</b></div>
          {canUndo() ? <button className="ibtn" onClick={() => { undo(); toast('הפעולה בוטלה'); }} aria-label="ביטול הפעולה האחרונה" title="בטל"><Icon n="undo" /></button> : null}
          <button className="btn btn-sm" onClick={() => openSheet(() => <ManageMenu />)}><Icon n="gear" size={18} /> ניהול</button>
          <button className="share-btn" onClick={() => openSheet(() => <ShareSheet />)}><Icon n="share" size={18} /> שתף</button>
        </div>
        <div className="period">
          <button className="ibtn bordered" onClick={() => shift(-1)} aria-label="התקופה הקודמת"><Icon n="chevR" /></button>
          <button className="period-btn" onClick={() => openSheet(() => <PeriodSheet />)}>
            {weekday(first)} {dm(fromKey(first))}{first !== last ? <> – {weekday(last)} {dm(fromKey(last))}</> : null}
          </button>
          <button className="ibtn bordered" onClick={() => shift(1)} aria-label="התקופה הבאה"><Icon n="chevL" /></button>
          {!containsToday ? <button className="today-btn" onClick={() => commit(d => { d.board.start = today; })}>היום</button> : null}
        </div>
        <label className="search">
          <Icon n="search" size={18} />
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש חייל" aria-label="חיפוש חייל" />
          {search ? <button className="ibtn sm" onClick={() => setSearch('')} aria-label="ניקוי חיפוש"><Icon n="x" size={16} /></button> : null}
        </label>
      </header>

      <main className="main">
        {s.settings.handedTo ? (
          <div className="banner warn"><p>הניהול הועבר ל{s.settings.handedTo.name}. שינויים כאן לא יגיעו אליו.</p>
            <button className="btn btn-sm" onClick={() => commit(d => { d.settings.handedTo = null; })}>החזר אליי</button></div>
        ) : null}
        {s.sample ? (
          <div className="banner"><p>אלה נתוני דוגמה.</p>
            <button className="btn btn-sm" onClick={() => openSheet(() => <StartFresh />)}>התחל לוח משלי</button></div>
        ) : null}
        {!isStorageOk() ? <div className="banner warn"><p>הדפדפן חוסם שמירה במכשיר. שמרו גיבוי לפני שסוגרים.</p></div> : null}

        {stats.missing ? (
          <div className="fillbar">
            <span><b>{stats.missing}</b> מקומות פנויים</span>
            <button className="btn btn-sm btn-accent" onClick={() => void autoFill()}><Icon n="sparkle" size={18} /> מלא אוטומטית</button>
          </div>
        ) : null}

        <FoundCard search={search} />
        <BoardView search={search} now={now} />
      </main>

      <SheetHost />
      <DialogHost />
      <ToastHost />
    </DndProvider>
  );
}

function ManageMenu() {
  const s = useAppState();
  return (
    <Sheet title="ניהול">
      <div className="menu">
        <MenuItem icon="users" label={`חיילים (${s.people.length})`} sub="הוספה, הדבקת רשימה, זמינות" onClick={() => replaceSheet(() => <PeopleSheet />)} />
        <MenuItem icon="post" label="עמדות ומשמרות" sub={s.posts.map(p => p.name).join(' · ') || 'עוד אין עמדות'} onClick={() => replaceSheet(() => <PostsEditor />)} />
        <MenuItem icon="cal" label="ימים בלוח" sub={`${s.board.days} ימים`} onClick={() => replaceSheet(() => <PeriodSheet />)} />
        <MenuItem icon="bolt" label="משימה בהפתעה" sub="מתחילה עכשיו" onClick={() => replaceSheet(() => <ExtraForm surprise />)} />
        <MenuItem icon="plus" label="משימה נוספת" sub="חד־פעמית" onClick={() => replaceSheet(() => <ExtraForm />)} />
        <MenuItem icon="gear" label="הגדרות וגיבוי" onClick={() => replaceSheet(() => <SettingsSheet />)} />
      </div>
    </Sheet>
  );
}

function StartFresh() {
  const [keepPosts, setKeepPosts] = useState(true);
  return (
    <Sheet title="לוח משלי" footer={<button className="btn btn-primary" onClick={() => {
      commit(d => {
        d.sample = false; d.people = []; d.cells = {}; d.extras = []; d.shareMeta = {}; d.settings.title = 'לוח שיבוץ';
        d.board = { start: todayKey(), days: 4 };
        if (!keepPosts) d.posts = [];
      });
      closeSheet();
      openSheet(() => <PeopleSheet />);
    }}>התחל</button>}>
      <p>נתוני הדוגמה יימחקו. בשלב הבא מדביקים את רשימת החיילים.</p>
      <label className="check"><input type="checkbox" checked={keepPosts} onChange={e => setKeepPosts(e.target.checked)} />
        <span className="grow"><b>להשאיר את העמדות</b><small>שמירה 05:00–13:00 / 13:00–21:00 / 21:00–05:00, כוננות 12:00–12:00, תורן</small></span></label>
    </Sheet>
  );
}
