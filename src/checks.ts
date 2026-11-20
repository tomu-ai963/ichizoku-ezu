// 原則チェック — 決まったルールで判定する(AI ではない)
import { area, Land, Zone } from './model';

export type CheckStatus = 'good' | 'warn' | 'info';

export interface CheckResult {
  label: string;
  status: CheckStatus;
  detail: string;
}

/** 区間の和集合の長さ */
function unionLength(intervals: [number, number][]): number {
  const s = intervals.filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
  let total = 0;
  let curA = -Infinity;
  let curB = -Infinity;
  for (const [a, b] of s) {
    if (a > curB) {
      if (curB > curA) total += curB - curA;
      curA = a;
      curB = b;
    } else {
      curB = Math.max(curB, b);
    }
  }
  if (curB > curA) total += curB - curA;
  return total;
}

const EDGE_TOL = 0.5; // 外周から 0.5m 以内なら「接している」とみなす

export function perimeterCoverage(land: Land, zones: Zone[]): number {
  const hedges = zones.filter((z) => z.type === 'hedge');
  const clampX = (v: number) => Math.min(land.width, Math.max(0, v));
  const clampY = (v: number) => Math.min(land.height, Math.max(0, v));
  const north = hedges.filter((z) => z.y <= EDGE_TOL).map((z): [number, number] => [clampX(z.x), clampX(z.x + z.w)]);
  const south = hedges
    .filter((z) => z.y + z.h >= land.height - EDGE_TOL)
    .map((z): [number, number] => [clampX(z.x), clampX(z.x + z.w)]);
  const west = hedges.filter((z) => z.x <= EDGE_TOL).map((z): [number, number] => [clampY(z.y), clampY(z.y + z.h)]);
  const east = hedges
    .filter((z) => z.x + z.w >= land.width - EDGE_TOL)
    .map((z): [number, number] => [clampY(z.y), clampY(z.y + z.h)]);
  const covered = unionLength(north) + unionLength(south) + unionLength(west) + unionLength(east);
  const perimeter = 2 * (land.width + land.height);
  return perimeter > 0 ? covered / perimeter : 0;
}

function overlaps(a: Zone, b: Zone): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function runChecks(land: Land, zones: Zone[]): CheckResult[] {
  const results: CheckResult[] = [];
  const landArea = land.width * land.height;

  // 1. 外周の垣根
  const cov = perimeterCoverage(land, zones);
  results.push({
    label: '外周の生きた垣根',
    status: cov >= 0.9 ? 'good' : 'warn',
    detail:
      cov >= 0.9
        ? `外周の ${Math.round(cov * 100)}% を垣根が囲んでいます。`
        : `外周のうち垣根があるのは ${Math.round(cov * 100)}% です。境界を垣根で囲むと、風と人目から土地を守れます。`,
  });

  // 2. 森の割合
  const forest = zones.filter((z) => z.type === 'forest').reduce((s, z) => s + area(z), 0);
  const fr = landArea > 0 ? forest / landArea : 0;
  const frPct = Math.round(fr * 100);
  results.push({
    label: '森の割合',
    status: fr >= 0.25 && fr <= 0.75 ? 'good' : 'warn',
    detail:
      fr >= 0.25 && fr <= 0.75
        ? `森は土地の ${frPct}% です(目安 25〜75%)。`
        : `森は土地の ${frPct}% です。目安は 25〜75% です。`,
  });

  // 3. 池
  const hasPond = zones.some((z) => z.type === 'pond');
  results.push({
    label: '池',
    status: hasPond ? 'good' : 'warn',
    detail: hasPond ? '池があります。' : '池がありません。小さな池でも湿り気を保ち、生きものを呼びます。',
  });

  // 4. 家
  const hasHouse = zones.some((z) => z.type === 'house');
  results.push({
    label: '家',
    status: hasHouse ? 'good' : 'info',
    detail: hasHouse ? '家の場所が決まっています。' : '家の場所はまだ描かれていません。',
  });

  // 5. 多様さ
  const kinds = new Set(zones.filter((z) => z.type !== 'path' && z.type !== 'other').map((z) => z.type)).size;
  results.push({
    label: '使い方の多様さ',
    status: kinds >= 5 ? 'good' : 'warn',
    detail: `区画の種類は ${kinds} 種類です(道・その他を除く)。目安は 5 種類以上です。`,
  });

  // 6. 重なり(垣根どうし・道は除く)
  const solid = zones.filter((z) => z.type !== 'path');
  let pairs = 0;
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      if (solid[i].type === 'hedge' && solid[j].type === 'hedge') continue;
      if (overlaps(solid[i], solid[j])) pairs++;
    }
  }
  if (pairs > 0) {
    results.push({
      label: '区画の重なり',
      status: 'warn',
      detail: `重なっている区画が ${pairs} 組あります。面積の集計が実際より多くなります。`,
    });
  }

  // 7. はみ出し
  const outside = zones.filter(
    (z) => z.x < 0 || z.y < 0 || z.x + z.w > land.width + 1e-9 || z.y + z.h > land.height + 1e-9,
  ).length;
  if (outside > 0) {
    results.push({
      label: '土地からのはみ出し',
      status: 'warn',
      detail: `土地の外にはみ出している区画が ${outside} 個あります。`,
    });
  }

  return results;
}
