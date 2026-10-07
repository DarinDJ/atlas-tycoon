import type { MapDefinition, Tile } from '@bt/engine';
import { seedFromString } from '@bt/engine';

/**
 * Procedural "city art" placeholder: a gradient sky + skyline silhouette, deterministic per tile id.
 * When `tile.image` is set, the real artwork is used instead.
 */
export function tileArtStyle(tile: Tile, map: MapDefinition): { background: string } {
  if (tile.image) return { background: `center/cover url(${tile.image})` };
  const seed = seedFromString(tile.id);
  const hue = seed % 360;
  const group = tile.type === 'property' ? map.groups.find((g) => g.id === tile.group) : undefined;
  const base = group?.color ?? map.theme.primary;
  const svg = skylineSvg(seed, base);
  return {
    background: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") bottom/100% auto no-repeat, linear-gradient(160deg, hsl(${hue} 70% 85%), hsl(${(hue + 50) % 360} 60% 60%))`,
  };
}

function skylineSvg(seed: number, color: string): string {
  let s = seed;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const W = 200;
  const H = 80;
  let rects = '';
  let x = 0;
  while (x < W) {
    const w = 10 + rnd() * 26;
    const h = 15 + rnd() * 55;
    const dome = rnd() > 0.72;
    rects += `<rect x="${x.toFixed(1)}" y="${(H - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="1"/>`;
    if (dome)
      rects += `<circle cx="${(x + w / 2).toFixed(1)}" cy="${(H - h).toFixed(1)}" r="${(w / 2).toFixed(1)}"/>`;
    // windows
    for (let wy = H - h + 4; wy < H - 4; wy += 6) {
      for (let wx = x + 3; wx < x + w - 3; wx += 5)
        if (rnd() > 0.5)
          rects += `<rect x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="2" height="3" fill="rgba(255,255,255,0.55)"/>`;
    }
    x += w + 2 + rnd() * 4;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><g fill="${color}" opacity="0.85">${rects}</g></svg>`;
}

export function groupColor(map: MapDefinition, tile: Tile): string | null {
  if (tile.type === 'property') return map.groups.find((g) => g.id === tile.group)?.color ?? null;
  if (tile.type === 'transport') return '#334155';
  if (tile.type === 'utility') return '#0ea5e9';
  return null;
}

export function groupMarker(map: MapDefinition, tile: Tile): string | null {
  if (tile.type !== 'property') return null;
  const g = map.groups.find((x) => x.id === tile.group);
  return g?.marker ?? g?.name.slice(0, 1) ?? null;
}

export function tileGlyph(tile: Tile): string {
  if (tile.emoji) return tile.emoji;
  switch (tile.type) {
    case 'start':
      return '🚩';
    case 'jail':
      return '🚔';
    case 'gotojail':
      return '🚨';
    case 'freeparking':
      return '🅿️';
    case 'luck':
      return '🎲';
    case 'treasure':
      return '💰';
    case 'tax':
      return '🧾';
    case 'transport':
      return '🚂';
    case 'utility':
      return '⚡';
    case 'special':
      return '✨';
    default:
      return '🏙️';
  }
}
