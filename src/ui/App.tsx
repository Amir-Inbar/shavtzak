import { useEffect, useState } from 'react';
import { canUndo, commit, isStorageOk, undo, useAppState } from '../lib/store';
import { boardDays, boardStats } from '../lib/slots';
import { addDaysKey, dm, fromKey, todayKey, weekday, daysBetween } from '../lib/time';
import { Icon } from './icons';
import { DialogHost, MenuItem, Seg, Sheet, SheetHost, ToastHost } from './primitives';
import { closeSheet, openSheet, replaceSheet, toast } from './uiStore';
import { DndProvider } from './Dnd';
import { BoardView } from './BoardView';
import { FoundCard, PeopleView } from './PeopleView';
import { autoFill } from './actions';
import { ShareSheet } from './sheets/Share';
import { SettingsSheet } from './sheets/Settings';
import { PeriodSheet, PostsEditor } from './sheets/Posts';
import { ExtraForm } from './sheets/Extra';
import { PasteList, SoldierSheet } from './sheets/Soldier';

type View = 'board' | 'people';

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

function useTheme(theme: string) {
  useEffect(() => {
    const r = document.documentElement;
    const apply = () => {
      if (theme === 'light' || theme === 'dark') r.dataset.theme = theme; else delete r.dataset.theme;
      const dark = theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0B0E0D' : '#F1F3F0');
    };
    apply();
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

export function App() {
  const s = useAppState();
  const now = useNow();
  useTheme(s.settings.theme);
  const [view, setView] = useState<View>(() => (localStorage.getItem('shavtzak.view') as View) || 'board');
  const [search, setSearch] = useState('');
  const days = boardDays(s);
  const stats = boardStats(s);
  const first = days[0], last = days[days.length - 1];
  const today = todayKey();
  const containsToday = daysBetween(first, today) >= 0 && daysBetween(today, last) >= 0;
  const shift = (dir: number) => commit(d => { d.board.start = addDaysKey(d.board.start, dir * d.board.days); });
  const goToday = () => commit(d => { d.board.start = today; });
  const setV = (v: View) => { setView(v); try { localStorage.setItem('shavtzak.view', v); } catch { /* ignore */ } };
  const pct = stats.slots ? Math.round((stats.filled / stats.slots) * 100) : 100;

  return (
    <DndProvider>
      <header className="appbar">
        <div className="bar">
          <div className="brand">
            <span className="mark"><Icon n="table" /></span>
            <span className="brand-t"><b>שבצ״ק</b><small>{s.settings.title}</small></span>
          </div>
          {canUndo() ? <button className="ibtn" onClick={() => { undo(); toast('הפעולה בוטלה'); }} aria-label="ביטול הפעולה האחרונה" title="בטל"><Icon n="undo" /></button> : null}
          <button className="ibtn" onClick={() => openSheet(() => <SettingsSheet />)} aria-label="הגדרות" title="הגדרות"><Icon n="gear" /></button>
          <button className="share-btn" onClick={() => openSheet(() => <ShareSheet />)}><Icon n="share" /><span>שתף</span></button>
        </div>
        <div className="period">
          <button className="ibtn bordered" onClick={() => shift(-1)} aria-label="התקופה הקודמת"><Icon n="chevR" /></button>
          <button className="period-btn" onClick={() => openSheet(() => <PeriodSheet />)}>
            <b>{weekday(first)} {dm(fromKey(first))}{first !== last ? <> – {weekday(last)} {dm(fromKey(last))}</> : null}</b>
            <small>{days.length} ימים{containsToday ? ' · כולל היום' : ''}</small>
          </button>
          <button className="ibtn bordered" onClick={() => shift(1)} aria-label="התקופה הבאה"><Icon n="chevL" /></button>
          {!containsToday ? <button className="today-btn" onClick={goToday}>היום</button> : null}
        </div>
        <div className="viewbar">
          <Seg value={view} onChange={setV} options={[['board', <><Icon n="table" size={18} /> לוח</>], ['people', <><Icon n="users" size={18} /> לפי חיילים</>]]} />
          <label className="search">
            <Icon n="search" size={18} />
            <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש חייל" aria-label="חיפוש חייל" />
            {search ? <button className="ibtn sm" onClick={() => setSearch('')} aria-label="ניקוי חיפוש"><Icon n="x" size={16} /></button> : null}
          </label>
        </div>
      </header>

      <main className="main">
        {s.settings.handedTo ? (
          <div className="banner warn"><p><b>הניהול הועבר ל{s.settings.handedTo.name}</b> ({dm(s.settings.handedTo.at)}). שינויים כאן לא יגיעו אליו.</p>
            <button className="btn btn-sm" onClick={() => commit(d => { d.settings.handedTo = null; })}>החזר ניהול אליי</button></div>
        ) : null}
        {s.sample ? (
          <div className="banner"><p>אלה נתוני דוגמה. כשמוכנים – מתחילים לוח משלכם: עמדות, חיילים ושיבוץ.</p>
            <button className="btn btn-sm" onClick={() => openSheet(() => <StartFresh />)}>התחל לוח משלי</button></div>
        ) : null}
        {!isStorageOk() ? <div className="banner warn"><p>הדפדפן חוסם שמירה במכשיר. שמרו גיבוי לפני שסוגרים.</p></div> : null}

        {s.posts.length ? (
          <section className="summary" aria-label="סיכום">
            <div className="sum-main">
              <div className="sum-num" dir="ltr"><b>{stats.filled}</b><span>/{stats.slots}</span></div>
              <div className="sum-l"><b>מקומות מאוישים</b><small>{pct}% בתקופה</small></div>
            </div>
            <div className="sum-tags">
              {stats.missing ? <span className="tag bad"><i />{stats.missing} פנויים</span> : <span className="tag ok"><Icon n="check" size={14} /> הכל מאויש</span>}
              {stats.warn + stats.block ? <span className="tag warn"><i />{stats.warn + stats.block} התרעות</span> : null}
            </div>
            <div className="meter"><i style={{ width: `${pct}%` }} className={stats.missing ? 'part' : ''} /></div>
            {stats.missing ? <button className="btn btn-accent auto" onClick={() => void autoFill()}><Icon n="sparkle" /> מלא {stats.missing} פנויים אוטומטית</button> : null}
          </section>
        ) : null}

        <FoundCard search={search} />
        {view === 'board' ? <BoardView search={search} now={now} /> : <PeopleView search={search} now={now} />}
      </main>

      <button className="fab" onClick={() => openSheet(() => <AddMenu />)} aria-label="הוספה"><Icon n="plus" size={28} /></button>
      <SheetHost />
      <DialogHost />
      <ToastHost />
    </DndProvider>
  );
}

function AddMenu() {
  return (
    <Sheet title="הוספה">
      <div className="menu">
        <MenuItem hero icon="bolt" label="משימה בהפתעה" sub="מתחילה עכשיו – רואים מיד מי פנוי ונח" onClick={() => replaceSheet(() => <ExtraForm surprise />)} />
        <MenuItem icon="plus" label="משימה נוספת" sub="חד־פעמית, בתאריך ושעה שתבחרו" onClick={() => replaceSheet(() => <ExtraForm />)} />
        <MenuItem icon="userplus" label="חייל" onClick={() => replaceSheet(() => <SoldierSheet id={null} />)} />
        <MenuItem icon="clip" label="הדבקת רשימת חיילים" sub="שם בכל שורה" onClick={() => replaceSheet(() => <PasteList />)} />
        <MenuItem icon="post" label="עמדות ומשמרות" sub="שמירה, כוננות, תורן…" onClick={() => replaceSheet(() => <PostsEditor />)} />
        <MenuItem icon="cal" label="תקופת הלוח" sub="מאיזה יום וכמה ימים" onClick={() => replaceSheet(() => <PeriodSheet />)} />
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
      closeSheet(); toast('הלוח מוכן. הוסיפו חיילים בלשונית ״לפי חיילים״', { undo: true });
    }}>התחל</button>}>
      <p>נתוני הדוגמה (חיילים ושיבוצים) יימחקו.</p>
      <label className="check"><input type="checkbox" checked={keepPosts} onChange={e => setKeepPosts(e.target.checked)} />
        <span className="grow"><b>להשאיר את העמדות מהדוגמה</b><small>שמירה 05–13 / 13–21 / 21–05, כוננות 12:00–12:00, תורן. אפשר לשנות אחר כך.</small></span></label>
    </Sheet>
  );
}
