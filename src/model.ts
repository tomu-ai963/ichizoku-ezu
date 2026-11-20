// 一族の土地 絵図 — データモデル
// 座標・寸法はすべてメートル。原点は土地の左上(北西)、x は東向き、y は南向き。

export type ZoneType =
  | 'house'
  | 'garden'
  | 'orchard'
  | 'forest'
  | 'pond'
  | 'hedge'
  | 'path'
  | 'other';

export interface Zone {
  id: string;
  type: ZoneType;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Land {
  name: string;
  width: number; // 東西 m
  height: number; // 南北 m
}

export interface Plan {
  version: 1;
  land: Land;
  zones: Zone[];
}

export interface ZoneStyle {
  label: string;
  fill: string;
  stroke: string;
}

export const ZONE_TYPES: Record<ZoneType, ZoneStyle> = {
  house: { label: '家', fill: '#e7c9a0', stroke: '#8a5a2b' },
  garden: { label: '菜園', fill: '#f3d9a4', stroke: '#b7791f' },
  orchard: { label: '果樹園', fill: '#f4c7c3', stroke: '#b4534b' },
  forest: { label: '森', fill: '#9fc89a', stroke: '#2f6b2a' },
  pond: { label: '池', fill: '#a9d1ec', stroke: '#2b6c9e' },
  hedge: { label: '生きた垣根', fill: '#6fa368', stroke: '#22541d' },
  path: { label: '道', fill: '#e3ddd2', stroke: '#8c8172' },
  other: { label: 'その他', fill: '#dcd6e8', stroke: '#6b5f88' },
};

export const ZONE_ORDER: ZoneType[] = [
  'house',
  'garden',
  'orchard',
  'forest',
  'pond',
  'hedge',
  'path',
  'other',
];

export const DEFAULT_LAND: Land = { name: '一族の土地', width: 100, height: 100 };

export const LAND_MIN = 1;
export const LAND_MAX = 2000;

export const M2_PER_TSUBO = 3.305785;

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function area(z: Pick<Zone, 'w' | 'h'>): number {
  return z.w * z.h;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function formatArea(m2: number): string {
  return `${round1(m2).toLocaleString('ja-JP')} m²`;
}

export function formatTsubo(m2: number): string {
  return `${round1(m2 / M2_PER_TSUBO).toLocaleString('ja-JP')} 坪`;
}

/** 外周に幅 width の垣根を 4 本引く(角は南北の帯が持つ) */
export function perimeterHedges(land: Land, width: number): Zone[] {
  const t = Math.min(width, land.width / 2, land.height / 2);
  const mk = (name: string, x: number, y: number, w: number, h: number): Zone => ({
    id: newId(),
    type: 'hedge',
    name,
    x,
    y,
    w,
    h,
  });
  return [
    mk('北の垣根', 0, 0, land.width, t),
    mk('南の垣根', 0, land.height - t, land.width, t),
    mk('西の垣根', 0, t, t, land.height - 2 * t),
    mk('東の垣根', land.width - t, t, t, land.height - 2 * t),
  ];
}
