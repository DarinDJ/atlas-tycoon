/**
 * Board geometry for an N-tile square board (N multiple of 4).
 * Tile 0 is the bottom-right corner; tiles run counter-clockwise (bottom row right-to-left, up the left side, ...).
 */
export type Side = 'bottom' | 'left' | 'top' | 'right';

export interface TileGeom {
  side: Side;
  corner: boolean;
  /** CSS grid placement (1-based). */
  col: number;
  row: number;
  /** Centre as a fraction (0..1) of the board width/height. */
  cx: number;
  cy: number;
}

/** Corner size as a fraction of a side tile (matches `.board` grid template). */
export const CORNER_RATIO = 1.55;

export function boardGeometry(tileCount: number): { side: number; tiles: TileGeom[] } {
  const perSide = tileCount / 4; // tiles per side excluding one corner => 10 for 40
  const inner = perSide - 1; // non-corner tiles per side => 9
  const total = inner + 2 * CORNER_RATIO; // in "side tile" units
  const c = CORNER_RATIO / total; // corner fraction
  const s = 1 / total; // side tile fraction
  const tiles: TileGeom[] = [];
  for (let i = 0; i < tileCount; i++) {
    const seg = Math.floor(i / perSide);
    const k = i % perSide; // 0 = corner
    const corner = k === 0;
    let side: Side;
    let col: number;
    let row: number;
    let cx: number;
    let cy: number;
    const along = corner ? c / 2 : c + (k - 1) * s + s / 2; // distance from the corner at the start of the segment
    switch (seg) {
      case 0: // bottom row, right -> left
        side = 'bottom';
        row = inner + 2;
        col = corner ? inner + 2 : inner + 2 - k;
        cx = 1 - along;
        cy = 1 - c / 2;
        break;
      case 1: // left column, bottom -> top
        side = 'left';
        col = 1;
        row = corner ? inner + 2 : inner + 2 - k;
        cx = c / 2;
        cy = 1 - along;
        break;
      case 2: // top row, left -> right
        side = 'top';
        row = 1;
        col = corner ? 1 : 1 + k;
        cx = along;
        cy = c / 2;
        break;
      default: // right column, top -> bottom
        side = 'right';
        col = inner + 2;
        row = corner ? 1 : 1 + k;
        cx = 1 - c / 2;
        cy = along;
    }
    tiles.push({ side, corner, col, row, cx, cy });
  }
  return { side: inner, tiles };
}

/** Forward path from a to b (inclusive of b, exclusive of a). */
export function pathBetween(from: number, to: number, n: number): number[] {
  const out: number[] = [];
  let i = from;
  let guard = 0;
  while (i !== to && guard++ < n) {
    i = (i + 1) % n;
    out.push(i);
  }
  return out;
}

/** Offsets so multiple tokens on one tile fan out instead of stacking. */
export function tokenOffset(indexOnTile: number, countOnTile: number): { dx: number; dy: number } {
  if (countOnTile <= 1) return { dx: 0, dy: 0 };
  const r = 0.022;
  const angle = (indexOnTile / countOnTile) * Math.PI * 2 - Math.PI / 2;
  return { dx: Math.cos(angle) * r, dy: Math.sin(angle) * r };
}
