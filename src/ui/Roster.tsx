// The soldiers panel: drag a name onto any shift. The name stays here, so it can go into several shifts.
import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useAppState } from '../lib/store';
import { boardDays, slotsOfPerson } from '../lib/slots';
import type { Person } from '../lib/types';
import { DAY, fromKey } from '../lib/time';
import { Icon } from './icons';
import { openSheet } from './uiStore';
import { PasteList, SoldierSheet } from './sheets/Soldier';
import type { DragData } from './Dnd';

export function Roster({ tray, active, onPick }: { tray?: boolean; active: string; onPick: (name: string) => void }) {
  const s = useAppState();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(true);
  const days = boardDays(s);
  const from = fromKey(days[0]), to = fromKey(days[days.length - 1]) + DAY;
  const list = s.people.filter(p => !q.trim() || p.name.includes(q.trim())).sort((a, b) => a.name.localeCompare(b.name, 'he'));
  const count = (p: Person) => slotsOfPerson(s, p.id).filter(sl => days.includes(sl.date)).length;
  const off = (p: Person) => p.unavail.find(u => u.start < to && u.end > from);

  if (!s.people.length) {
    if (tray) return null;
    return (
      <aside className="roster">
        <div className="ro-head"><b>חיילים</b></div>
        <p className="ro-empty">עוד אין חיילים.</p>
        <div className="ro-actions"><button className="btn btn-sm btn-primary" onClick={() => openSheet(() => <PasteList />)}><Icon n="clip" size={18} /> הדבקת רשימה</button></div>
      </aside>
    );
  }
  const items = list.map(p => <Item key={p.id} p={p} n={count(p)} off={off(p)?.reason} on={active === p.name} onPick={onPick} />);

  if (tray) {
    return (
      <aside className={`tray${open ? '' : ' closed'}`} aria-label="חיילים לגרירה">
        <button className="tray-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          <Icon n="users" size={16} /> חיילים · לחיצה ארוכה וגרירה למשמרת <Icon n={open ? 'down' : 'up'} size={16} />
        </button>
        {open ? <div className="ro-list">{items}</div> : null}
      </aside>
    );
  }
  return (
    <aside className="roster" aria-label="חיילים לגרירה">
      <div className="ro-head">
        <b>חיילים</b><span className="muted">{s.people.length}</span>
        <button className="ibtn sm" onClick={() => openSheet(() => <PasteList />)} aria-label="הדבקת רשימה" title="הדבקת רשימה"><Icon n="clip" size={18} /></button>
        <button className="ibtn sm" onClick={() => openSheet(() => <SoldierSheet id={null} />)} aria-label="חייל חדש" title="חייל חדש"><Icon n="plus" size={18} /></button>
      </div>
      <label className="search ro-filter"><Icon n="search" size={16} /><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="סינון" aria-label="סינון חיילים" /></label>
      <p className="ro-hint">גררו שם למשמרת. אותו חייל אפשר לגרור לכמה משמרות. המספר = משמרות בתקופה.</p>
      <div className="ro-list">{items}</div>
    </aside>
  );
}

function Item({ p, n, off, on, onPick }: { p: Person; n: number; off?: string; on: boolean; onPick: (name: string) => void }) {
  const data: DragData = { pid: p.id };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `roster#${p.id}`, data });
  return (
    <button ref={setNodeRef} {...listeners} {...attributes}
      className={`ro-item${on ? ' on' : ''}${isDragging ? ' dragging' : ''}${off ? ' off' : ''}`}
      onClick={() => onPick(on ? '' : p.name)} title={off ? `לא זמין: ${off}` : 'גררו למשמרת · הקשה מסמנת את המשמרות שלו'}>
      <span className="grow">{p.name}</span>
      {off ? <span className="ro-off">{off || 'לא זמין'}</span> : null}
      <span className={`ro-n${n ? '' : ' zero'}`}>{n}</span>
    </button>
  );
}
