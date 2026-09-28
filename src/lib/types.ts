import type { DateKey } from './time';

/** One shift inside a post, e.g. 05:00–13:00. end <= start means it ends the next day (12:00–12:00 = 24h). */
export interface ShiftDef {
  id: string;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  need: number;
}

/** A position inside every shift of a post, e.g. מפקד ×1, נהג ×1, חיילים ×2. Shown as its own column. */
export interface Role { id: string; name: string; qual: string; count: number }

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
  /** columns inside each shift; empty = one "names" column with the shift's need */
  roles: Role[];
  /** shifts that start before this time belong to the night after the date (e.g. 13:00 → a 00:00 shift is the next day) */
  dayStart: string;
  /** only people already in this post (and role) at the same time can take it, e.g. a listener from the Carmel team */
  within: { postId: string; roleId: string | null } | null;
}

export interface Unavail { id: string; start: number; end: number; reason: string }

export type Piece = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

export interface Person {
  id: string;
  name: string;
  /** what they are: לוחם, נהג, מפקד… (empty = worked out from qualifications) */
  rank: string;
  /** chess piece shown next to the name (empty = worked out from the rank) */
  piece: Piece | '';
  team: string;
  quals: string[];
  unavail: Unavail[];
  note: string;
}

/** Assignment for one post × day × shift. Stored only once someone touches it. */
export interface Cell { assigned: string[]; need?: number; note?: string; roleOf?: Record<string, string> }

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
  roles: Role[];
  /** person id → role id, for posts with roles */
  roleOf: Record<string, string>;
  within: { postId: string; roleId: string | null } | null;
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
