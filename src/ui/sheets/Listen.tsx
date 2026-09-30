// Who listens at each hour of the night, chosen from the people in the parent shift (e.g. the Carmel soldiers).
import { commit, useAppState } from '../../lib/store';
import { autoAssign, peopleInRole, slotOf } from '../../lib/slots';
import { childSlots } from '../../lib/combined';
import { hm, weekday } from '../../lib/time';
import { Icon } from '../icons';
import { Sheet } from '../primitives';
import { toast } from '../uiStore';

export function ListenSheet({ parentKey }: { parentKey: string }) {
  const s = useAppState();
  const parent = slotOf(s, parentKey);
  if (!parent) return <Sheet title="המשמרת לא נמצאה"><p className="hint">ייתכן שהיא נמחקה.</p></Sheet>;
  const kids = childSlots(s, parent);
  if (!kids.length) return <Sheet title="אין שעות האזנה"><p className="hint">לעמדה הזו אין עמדה ״מתוך צוות״.</p></Sheet>;
  const w = kids[0].post.within;
  const role = w?.roleId ? parent.roles.find(r => r.id === w.roleId) : null;
  const team = (role ? peopleInRole(parent, role) : parent.assigned).map(id => s.people.find(p => p.id === id)).filter(Boolean) as { id: string; name: string }[];
  const count = (pid: string) => kids.filter(k => k.slot.assigned.includes(pid)).length;

  const set = (key: string, pid: string) => commit(d => {
    const c = d.cells[key] ?? (d.cells[key] = { assigned: [] });
    c.assigned = pid ? [pid] : [];
  });
  const auto = () => {
    let r = { added: 0, left: 0 };
    commit(d => { r = autoAssign(d, kids.map(k => k.slot.key)); if (!r.added) return false; });
    toast(r.added ? `חולקו ${r.added} שעות` : 'כל השעות כבר מאוישות', { undo: !!r.added });
  };
  return (
    <Sheet title={`${kids[0].post.name} · ${parent.name} ${weekday(parent.date)}`} sub={`מתוך ${role ? role.name : 'הצוות'} של ${parent.name} – ${team.length} אנשים`}
      footer={<button className="btn" onClick={auto}><Icon n="sparkle" /> חלק שעה לכל אחד</button>}>
      <div className="listen-list">
        {kids.map(k => (
          <label key={k.slot.key} className="listen-row">
            <b className="tm">{hm(k.slot.start)}</b>
            <select className="inp" value={k.slot.assigned[0] ?? ''} onChange={e => set(k.slot.key, e.target.value)}>
              <option value="">—</option>
              {team.map(p => <option key={p.id} value={p.id}>{p.name}{count(p.id) && !k.slot.assigned.includes(p.id) ? ` (כבר ${count(p.id)})` : ''}</option>)}
            </select>
          </label>
        ))}
      </div>
      {team.length < kids.length ? <p className="hint">יש פחות אנשים בצוות משעות – מישהו יאזין פעמיים.</p> : null}
    </Sheet>
  );
}
