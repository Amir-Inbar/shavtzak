// Rank (לוחם / נהג / מפקד …) and the icon shown next to each name.
import type { Person } from './types';

export type RankKind = 'soldier' | 'driver' | 'commander' | 'sergeant' | 'officer' | 'captain';

export const RANKS: { name: string; kind: RankKind }[] = [
  { name: 'לוחם', kind: 'soldier' },
  { name: 'נהג', kind: 'driver' },
  { name: 'מפקד', kind: 'commander' },
  { name: 'סמל', kind: 'sergeant' },
  { name: 'קצין', kind: 'officer' },
  { name: 'מ״פ', kind: 'captain' },
];

export function rankOf(p: Person): string {
  if (p.rank) return p.rank;
  if (p.quals.includes('מפקד')) return 'מפקד';
  if (p.quals.includes('נהג')) return 'נהג';
  return 'לוחם';
}
export const rankKind = (p: Person): RankKind => RANKS.find(r => r.name === rankOf(p))?.kind ?? 'soldier';

/** 24×24 stroke icons (same paths on screen and in the shared image) */
const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
export const RANK_PATHS: Record<RankKind, string[]> = {
  // combat helmet
  soldier: ['M4.5 16a7.5 7.5 0 0 1 15 0', 'M2.5 16h19', 'M5.6 12.2h12.8', 'M9 16v2.5M15 16v2.5'],
  // steering wheel
  driver: [circle(12, 12, 8.5), circle(12, 12, 2.2), 'M12 14.2v6.3', 'M9.9 11.4L3.7 9.8', 'M14.1 11.4l6.2-1.6'],
  // three chevrons
  commander: ['M5 9.5l7-4 7 4', 'M5 14l7-4 7 4', 'M5 18.5l7-4 7 4'],
  // chevrons over a bar
  sergeant: ['M5 8l7-4 7 4', 'M5 12.5l7-4 7 4', 'M5 17l7-4 7 4', 'M5 20.5h14'],
  // two officer bars
  officer: ['M6 8.5h12v2.5H6z', 'M6 13.5h12V16H6z'],
  // three officer bars
  captain: ['M6 6h12v2.4H6z', 'M6 10.8h12v2.4H6z', 'M6 15.6h12V18H6z'],
};
/** color per kind, readable on white */
export const RANK_COLORS: Record<RankKind, string> = {
  soldier: '#5B6B55', driver: '#2563EB', commander: '#B45309', sergeant: '#B45309', officer: '#7C3AED', captain: '#7C3AED',
};
