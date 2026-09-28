// Drag names onto shifts: from the soldiers panel (adds – can be repeated), or from a shift (moves).
// Touch: long-press first. Mouse: just drag.
import { createContext, useContext, useState, type ReactNode } from 'react';
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { getState } from '../lib/store';
import { boardSlots, evaluate, personOf } from '../lib/slots';
import { dur } from '../lib/time';
import { dropPerson, moveGroup, removeFrom } from './actions';
import { Icon } from './icons';

export type Verdict = { st: 'ok' | 'warn' | 'block' | 'src'; text: string };
/** key is the shift the name was dragged out of; null when it comes from the soldiers panel */
interface DragState { key: string | null; pid: string; name: string; verdict: Map<string, Verdict> }
export interface DragData { pid: string; key?: string }
const Ctx = createContext<DragState | null>(null);
export const useDrag = () => useContext(Ctx);

export function DndProvider({ children }: { children: ReactNode }) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 280, tolerance: 8 } }),
  );
  const [drag, setDrag] = useState<DragState | null>(null);

  const onStart = (e: DragStartEvent) => {
    const { key = null, pid } = e.active.data.current as DragData;
    const s = getState();
    const verdict = new Map<string, Verdict>();
    for (const sl of boardSlots(s)) {
      if (sl.key === key) { verdict.set(sl.key, { st: 'src', text: 'מכאן' }); continue; }
      if (sl.assigned.includes(pid)) { verdict.set(sl.key, { st: 'block', text: 'כבר כאן' }); continue; }
      const ev = evaluate(s, pid, sl, key ? [key] : []);
      verdict.set(sl.key, { st: ev.status, text: ev.status === 'ok' ? (ev.restBefore != null ? `נח ${dur(ev.restBefore)}` : 'אפשר') : ev.reasons[0] });
    }
    try { navigator.vibrate?.(12); } catch { /* ignore */ }
    setDrag({ key, pid, name: personOf(s, pid)?.name ?? '', verdict });
  };
  const onEnd = (e: DragEndEvent) => {
    const d = drag; setDrag(null);
    if (!d || !e.over) return;
    const target = String(e.over.id);
    if (!d.key) { if (target !== 'trash') void dropPerson(target, d.pid); return; }
    if (target === 'trash') { removeFrom(d.key, d.pid); return; }
    if (target !== d.key) void moveGroup([{ key: d.key, pid: d.pid }], target);
  };

  return (
    <DndContext sensors={sensors} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setDrag(null)} autoScroll={{ threshold: { x: 0.1, y: 0.18 } }}>
      <Ctx.Provider value={drag}>{children}</Ctx.Provider>
      <DragOverlay dropAnimation={null}>{drag ? <div className="ghost">{drag.name}</div> : null}</DragOverlay>
      {drag?.key ? <Trash /> : null}
    </DndContext>
  );
}

function Trash() {
  const { setNodeRef, isOver } = useDroppable({ id: 'trash' });
  return <div ref={setNodeRef} className={`trash${isOver ? ' over' : ''}`}><Icon n="trash" /> שחררו כאן כדי להסיר מהמשמרת</div>;
}
