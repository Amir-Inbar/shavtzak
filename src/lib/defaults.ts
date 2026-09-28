import type { State } from './types';
import { todayKey } from './time';

export function defaults(): State {
  return {
    v: 3,
    settings: { title: 'לוח שיבוץ', minRest: 6, theme: 'system', handedTo: null, receivedFrom: null },
    board: { start: todayKey(), days: 4 },
    posts: [],
    people: [],
    cells: {},
    extras: [],
    shareMeta: {},
    sample: false,
  };
}
