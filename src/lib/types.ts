import type { DateKey } from './time';

/** One shift inside a post, e.g. 05:00–13:00. end <= start means it ends the next day (12:00–12:00 = 24h). */
export interface ShiftDef {
  id: string;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  need: number;
}

/** A post / role that repeats every day of the board, e.g. "שמירה", "כוננות", "תורן". */
export interface Post {
  id: string;
  name: string;
  color: number; // index into POST_COLORS
  shifts: ShiftDef[];
  /** all-day role (like תורן): shown without hours */
  allDay: boolean;
  /** occupies the soldier – can't be in another blocking shift at the same time */
  blocks: boolean;
  /** tiring – needs the minimum rest before and after */
  rest: boolean;
  qual: string;
}

export interface Unavail { id: string; start: number; end: number; reason: string }

export interface Person {
  id: string;
  name: string;
  team: string;
  quals: string[];
  unavail: Unavail[];
  note: string;
}

/** Assignment for one post × day × shift. Stored only once someone touches it. */
export interface Cell { assigned: string[]; need?: number; note?: string }

/** One-off task that isn't part of a post (e.g. a surprise task). */
export interface Extra {
  id: string;
  name: string;
  start: number;
  end: number;
  need: number;
  qual: string;
  note: string;
  assigned: string[];
}

export interface Settings {
  title: string;
  minRest: number; // hours
  handedTo: { name: string; at: number } | null;
  receivedFrom: { name: string; at: number } | null;
}

export interface State {
  v: 3;
  settings: Settings;
  board: { start: DateKey; days: number };
  posts: Post[];
  people: Person[];
  cells: Record<string, Cell>;
  extras: Extra[];
  shareMeta: Record<string, { v: number; sig: string; at: number }>;
  sample: boolean;
}

/** A concrete, dated shift – derived from a post cell or an extra task. */
export interface Slot {
  key: string;
  kind: 'cell' | 'extra';
  postId: string | null;
  shiftId: string | null;
  date: DateKey;
  name: string;
  color: number;
  start: number;
  end: number;
  need: number;
  assigned: string[];
  blocks: boolean;
  rest: boolean;
  allDay: boolean;
  qual: string;
  note: string;
}

export type Status = 'ok' | 'warn' | 'block';

export interface Evaluation {
  status: Status;
  kind: '' | 'unavail' | 'conflict';
  reasons: string[];
  conflict: Slot | null;
  prev: Slot | null;
  next: Slot | null;
  restBefore: number | null;
  restAfter: number | null;
  shortest: number | null;
}
