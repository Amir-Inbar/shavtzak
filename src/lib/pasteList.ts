// Understands a pasted list of people, the way it's usually written in a sheet:
//   מפקדים                ← a heading sets the rank of the lines below it
//   סאפר (מחלקה 1)         ← "(מחלקה N)" / "(מסופח)" sets the team, other brackets become a note
//   נהגים / לוחמים / חיילים / מסופחים
// Also "name - team", "name, team" and several comma-separated names on one line.
// People already on the board are updated, not duplicated – even if written longer or shorter
// ("ישי ניסים" updates "ישי", "נועם בנלואיד" updates "בנלואיד").
import type { Person } from './types';

const HEADINGS: Record<string, { rank: string; team?: string }> = {
  'מפקדים': { rank: 'מפקד' }, 'מפקד': { rank: 'מפקד' },
  'נהגים': { rank: 'נהג' }, 'נהג': { rank: 'נהג' },
  'לוחמים': { rank: 'לוחם' }, 'חיילים': { rank: 'לוחם' },
  'מסופחים': { rank: 'לוחם', team: 'מסופח' },
  'סמלים': { rank: 'סמל' }, 'קצינים': { rank: 'קצין' },
};
const TEAM = /^(מחלקה\s*\d+|כיתה\s*\d+|מסופח|מפקדה|פלוגה.*)$/;

export interface ParsedPerson { name: string; team: string; rank: string; notes: string[] }
export interface PasteResult { add: ParsedPerson[]; update: { p: Person; from: ParsedPerson }[]; dup: string[] }

export function parsePeople(txt: string, people: Person[], defaultTeam = ''): PasteResult {
  const rows: ParsedPerson[] = [];
  let cur: { rank: string; team?: string } = { rank: '' };
  for (let line of txt.split(/\r?\n/)) {
    line = line.replace(/^[\s\d.)\-•*]+/, '').trim();
    if (!line) continue;
    const head = line.replace(/[:：]\s*$/, '').trim();
    if (HEADINGS[head]) { cur = HEADINGS[head]; continue; }
    const one = (raw: string, team0: string): ParsedPerson | null => {
      let team = team0; const notes: string[] = [];
      const name = raw.replace(/\(([^)]*)\)/g, (_, inner: string) => {
        const t = inner.replace(/\s+/g, ' ').trim();
        if (TEAM.test(t)) team = t; else if (t) notes.push(t);
        return ' ';
      }).replace(/\s+/g, ' ').trim();
      return name ? { name, team, rank: cur.rank, notes } : null;
    };
    const team0 = cur.team ?? defaultTeam;
    const m = line.match(/^(.+?)\s*(?:\t|\s-\s|\s–\s)\s*(.+)$/);
    const list = m ? [one(m[1], m[2].trim())]
      : line.split(',').length > 2 ? line.split(',').map(x => one(x, team0))
      : [one(line.split(',')[0], (line.split(',')[1] ?? team0).trim())];
    for (const x of list) if (x) rows.push(x);
  }

  // match to people already on the board: same name, else same last word, else same first word (only if unique)
  const words = (n: string) => n.split(' ').filter(Boolean);
  const findExisting = (n: string, taken: Set<string>): Person | undefined => {
    const free = people.filter(p => !taken.has(p.id));
    const exact = free.find(p => p.name === n); if (exact) return exact;
    const w = words(n); if (w.length < 2) return undefined;
    const byLast = free.filter(p => p.name === w[w.length - 1]); if (byLast.length === 1) return byLast[0];
    const byFirst = free.filter(p => p.name === w[0]); if (byFirst.length === 1) return byFirst[0];
    return undefined;
  };
  const res: PasteResult = { add: [], update: [], dup: [] };
  const taken = new Set<string>(); const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.name)) { res.dup.push(r.name); continue; }
    seen.add(r.name);
    const p = findExisting(r.name, taken);
    if (p) { taken.add(p.id); res.update.push({ p, from: r }); } else res.add.push(r);
  }
  return res;
}

/** qualifications that come with a rank */
export const qualsFor = (rank: string, quals: string[]) =>
  [...new Set([...quals, ...(rank === 'מפקד' ? ['מפקד'] : rank === 'נהג' ? ['נהג'] : [])])];
