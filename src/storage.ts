import { DEFAULT_LAND, LAND_MAX, LAND_MIN, Plan, Zone, ZONE_TYPES, ZoneType } from './model';

const STORAGE_KEY = 'ichizoku-ezu:plan';

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 外から来た JSON を検証して Plan にする。形が合わなければエラーを投げる */
export function parsePlan(raw: unknown): Plan {
  if (Array.isArray(raw)) {
    throw new Error('旧版(点で置く形式)のファイルです。面で描く新しい形式には読み込めません。');
  }
  if (!raw || typeof raw !== 'object') throw new Error('ファイルの形式が違います。');
  const r = raw as Record<string, unknown>;
  if (r.version !== 1) throw new Error('対応していない版のファイルです。');

  const l = r.land as Record<string, unknown> | undefined;
  if (!l || !isNum(l.width) || !isNum(l.height)) throw new Error('土地の寸法がありません。');
  const land = {
    name: typeof l.name === 'string' ? l.name : DEFAULT_LAND.name,
    width: Math.min(LAND_MAX, Math.max(LAND_MIN, l.width)),
    height: Math.min(LAND_MAX, Math.max(LAND_MIN, l.height)),
  };

  if (!Array.isArray(r.zones)) throw new Error('区画の一覧がありません。');
  const zones: Zone[] = [];
  for (const zr of r.zones) {
    const z = zr as Record<string, unknown>;
    if (
      !z ||
      typeof z.type !== 'string' ||
      !(z.type in ZONE_TYPES) ||
      !isNum(z.x) ||
      !isNum(z.y) ||
      !isNum(z.w) ||
      !isNum(z.h) ||
      z.w <= 0 ||
      z.h <= 0
    ) {
      continue; // 壊れた区画は飛ばす
    }
    zones.push({
      id: typeof z.id === 'string' ? z.id : Math.random().toString(36).slice(2, 10),
      type: z.type as ZoneType,
      name: typeof z.name === 'string' ? z.name : '',
      x: z.x,
      y: z.y,
      w: z.w,
      h: z.h,
    });
  }
  return { version: 1, land, zones };
}

export function loadPlan(): Plan | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return null;
    return parsePlan(JSON.parse(s));
  } catch {
    return null;
  }
}

export function savePlan(plan: Plan): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
  } catch {
    // 保存できない環境(プライベートモード等)では黙って諦める
  }
}

export function downloadPlan(plan: Plan): void {
  const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safe = plan.land.name.replace(/[\\/:*?"<>|]/g, '_') || 'ichizoku-ezu';
  a.download = `${safe}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
