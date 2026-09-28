// Rank (לוחם / נהג / מפקד …) and the chess piece shown next to each name.
import type { Person, Piece } from './types';

export const PIECES: { id: Piece; glyph: string; name: string }[] = [
  { id: 'pawn', glyph: '♟', name: 'פיון' },
  { id: 'knight', glyph: '♞', name: 'פרש' },
  { id: 'bishop', glyph: '♝', name: 'רץ' },
  { id: 'rook', glyph: '♜', name: 'צריח' },
  { id: 'queen', glyph: '♛', name: 'מלכה' },
  { id: 'king', glyph: '♚', name: 'מלך' },
];
/** default piece for a rank: the higher the rank, the stronger the piece */
export const RANKS: { name: string; piece: Piece }[] = [
  { name: 'לוחם', piece: 'pawn' },
  { name: 'נהג', piece: 'knight' },
  { name: 'מפקד', piece: 'bishop' },
  { name: 'סמל', piece: 'rook' },
  { name: 'קצין', piece: 'queen' },
  { name: 'מ״פ', piece: 'king' },
];

export function rankOf(p: Person): string {
  if (p.rank) return p.rank;
  if (p.quals.includes('מפקד')) return 'מפקד';
  if (p.quals.includes('נהג')) return 'נהג';
  return 'לוחם';
}
export function pieceOf(p: Person): Piece {
  if (p.piece) return p.piece;
  return RANKS.find(r => r.name === rankOf(p))?.piece ?? 'pawn';
}
/** text-style glyph (U+FE0E keeps phones from drawing it as an emoji) */
export const glyphOf = (p: Person) => `${PIECES.find(x => x.id === pieceOf(p))!.glyph}︎`;
