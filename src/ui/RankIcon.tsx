import { RANK_COLORS, RANK_PATHS, rankKind, type RankKind } from '../lib/rank';
import type { Person } from '../lib/types';

/** helmet for a soldier, steering wheel for a driver, chevrons for a commander… */
export function RankIcon({ p, kind, size = 16 }: { p?: Person; kind?: RankKind; size?: number }) {
  const k = kind ?? (p ? rankKind(p) : 'soldier');
  const solid = k === 'officer' || k === 'captain';
  return (
    <svg className={`rk rk-${k}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      style={{ color: RANK_COLORS[k] }} fill={solid ? 'currentColor' : 'none'} stroke={solid ? 'none' : 'currentColor'}
      strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
      {RANK_PATHS[k].map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
