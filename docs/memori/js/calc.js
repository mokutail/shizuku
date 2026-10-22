// 体重の計算(BMI、7日平均、差分)
import { addDays, diffDays } from '../../js/cycle.js';

export const round1 = (n) => Math.round(n * 10) / 10;

export function bmiOf(kg, heightCm) {
  if (!kg || !heightCm) return null;
  const m = heightCm / 100;
  return round1(kg / (m * m));
}

/** 日本肥満学会の区分 */
export function bmiLabel(b) {
  if (b == null) return '';
  if (b < 18.5) return '低体重';
  if (b < 25) return '普通体重';
  if (b < 30) return '肥満(1度)';
  if (b < 35) return '肥満(2度)';
  if (b < 40) return '肥満(3度)';
  return '肥満(4度)';
}

/** entries: [{date, kg, waist}] を日付順に */
export function sortEntries(map) {
  return Object.entries(map || {})
    .map(([date, v]) => ({ date, kg: v.kg ?? null, waist: v.waist ?? null }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** その日までの7日間(記録がある日)の平均 */
export function rollingAvg(list, field = 'kg', days = 7) {
  const pts = list.filter((e) => e[field] != null);
  const out = [];
  let i0 = 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    sum += pts[i][field];
    while (diffDays(pts[i0].date, pts[i].date) >= days) { sum -= pts[i0][field]; i0++; }
    out.push({ date: pts[i].date, v: Math.round((sum / (i - i0 + 1)) * 100) / 100 });
  }
  return out;
}

/** 何日か前の時点の7日平均との差 */
export function changeOver(avg, today, days) {
  if (!avg.length) return null;
  const last = avg[avg.length - 1];
  const target = addDays(today, -days);
  let base = null;
  for (const p of avg) { if (p.date <= target) base = p; else break; }
  if (!base || base === last) return null;
  return round1(last.v - base.v);
}

export function latest(list, field = 'kg') {
  for (let i = list.length - 1; i >= 0; i--) if (list[i][field] != null) return list[i];
  return null;
}

/** グラフの縦軸を、きりのよい数字にそろえる */
export function niceRange(min, max, ticks = 4) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const raw = span / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const vals = [];
  for (let v = lo; v <= hi + step / 2; v += step) vals.push(Math.round(v * 100) / 100);
  return { lo, hi, step, vals };
}
