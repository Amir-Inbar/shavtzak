// Example board shown on first open, shaped like a real company roster.
import type { Person, Post, State } from './types';
import { defaults } from './defaults';
import { addDaysKey, fromKey, todayKey, uid } from './time';
import { autoAssign, boardDays, cellKey } from './slots';

const NAMES = ['כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'דהן', 'אברהם', 'פרידמן', 'אזולאי', 'מלכה', 'חדד', 'עמר',
  'גבאי', 'יוסף', 'שושן', 'אוחנה', 'סויסה', 'אלמוג', 'ברק', 'רוזן', 'שגיא', 'נחום', 'טל', 'זילבר'];

export function sampleState(): State {
  const s = defaults();
  s.sample = true;
  s.settings.title = 'פלוגה ב׳ – מחלקה 2';
  s.board = { start: todayKey(), days: 4 };
  s.people = NAMES.map((name, i): Person => ({
    id: uid() + i, name, rank: '', piece: '', team: i < 8 ? 'כיתה 1' : i < 16 ? 'כיתה 2' : 'כיתה 3',
    quals: i % 6 === 0 ? ['נהג'] : i % 7 === 3 ? ['חובש'] : [], unavail: [], note: '',
  }));
  const guard: Post = {
    id: 'p-guard', name: 'שמירה', color: 0, allDay: false, blocks: true, rest: true, qual: '', roles: [], dayStart: '00:00', within: null,
    shifts: [
      { id: 's1', start: '05:00', end: '13:00', need: 4 },
      { id: 's2', start: '13:00', end: '21:00', need: 4 },
      { id: 's3', start: '21:00', end: '05:00', need: 4 },
    ],
  };
  const standby: Post = {
    id: 'p-standby', name: 'כוננות', color: 1, allDay: false, blocks: true, rest: false, qual: '', roles: [], dayStart: '00:00', within: null,
    shifts: [{ id: 's1', start: '12:00', end: '12:00', need: 7 }],
  };
  const duty: Post = {
    id: 'p-duty', name: 'תורן', color: 2, allDay: true, blocks: false, rest: false, qual: '', roles: [], dayStart: '00:00', within: null,
    shifts: [{ id: 's1', start: '00:00', end: '00:00', need: 1 }],
  };
  s.posts = [guard, standby, duty];
  // someone on leave from tomorrow afternoon, for two days
  const leave = s.people[9];
  leave.unavail.push({ id: uid(), start: fromKey(addDaysKey(s.board.start, 1), '14:00'), end: fromKey(addDaysKey(s.board.start, 3), '10:00'), reason: 'חופשה' });
  // fill the first three days, leave the last one open – like a board in progress
  const days = boardDays(s).slice(0, 3);
  const keys = days.flatMap(d => s.posts.flatMap(p => p.shifts.map(sh => cellKey(p.id, d, sh.id))));
  autoAssign(s, keys);
  return s;
}
