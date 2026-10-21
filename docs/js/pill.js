// ピルの予定の計算(画面と通知スクリプトの両方で使う)
import { addDays, diffDays } from './cycle.js';

export const PILL_TYPES = {
  '21': { label: '21錠', long: '21錠タイプ(7日休薬)', active: 21, placebo: 0, rest: 7 },
  '28': { label: '28錠', long: '28錠タイプ(偽薬7錠)', active: 21, placebo: 7, rest: 0 },
  '24+4': { label: '24+4錠', long: '24錠+偽薬4錠タイプ', active: 24, placebo: 4, rest: 0 },
  cont: { label: '連続', long: '連続して飲むタイプ', continuous: true },
};

export const PILL_DEFAULTS = {
  enabled: false,
  type: '28',
  startDate: null,
  time: '21:00',
  remindAfter: 60,
  restDays: 4,
  cycleStart: null,
  restStart: null,
};

export function pillConf(p) {
  return { ...PILL_DEFAULTS, ...(p || {}) };
}

export function isPillOn(p) {
  const c = pillConf(p);
  if (!c.enabled) return false;
  return PILL_TYPES[c.type]?.continuous ? !!c.cycleStart : !!c.startDate;
}

/**
 * その日のピルの状態
 * kind: active(実薬) / placebo(偽薬) / rest(休薬)、day: そのシート(周期)の何日目か
 */
export function pillDay(p, date) {
  const c = pillConf(p);
  const t = PILL_TYPES[c.type];
  if (!c.enabled || !t) return null;

  if (t.continuous) {
    if (!c.cycleStart || date < c.cycleStart) return null;
    if (c.restStart && date >= c.restStart) {
      const r = diffDays(c.restStart, date);
      if (r < c.restDays) return { kind: 'rest', day: r + 1, restLeft: c.restDays - r - 1, cycleStart: c.cycleStart, continuous: true };
      const ns = addDays(c.restStart, c.restDays);
      return { kind: 'active', day: diffDays(ns, date) + 1, cycleStart: ns, continuous: true };
    }
    return { kind: 'active', day: diffDays(c.cycleStart, date) + 1, cycleStart: c.cycleStart, continuous: true };
  }

  if (!c.startDate || date < c.startDate) return null;
  const idx = diffDays(c.startDate, date) % 28;
  const day = idx + 1;
  const cycleStart = addDays(date, -idx);
  const kind = day <= t.active ? 'active' : t.placebo ? 'placebo' : 'rest';
  return {
    kind,
    day,
    cycleStart,
    nextSheet: addDays(cycleStart, 28),
    activeLeft: kind === 'active' ? t.active - day : 0,
  };
}

/** 飲むべき日か(実薬と偽薬) */
export const needsPill = (info) => !!info && (info.kind === 'active' || info.kind === 'placebo');

/** 休薬・偽薬の期間(出血が来やすい期間)を、今日以降の分だけ */
export function restWindows(p, today, n = 3) {
  const c = pillConf(p);
  const t = PILL_TYPES[c.type];
  if (!isPillOn(c) || !t) return [];
  if (t.continuous) {
    if (!c.restStart) return [];
    const end = addDays(c.restStart, c.restDays - 1);
    return end >= today ? [{ start: c.restStart, end }] : [];
  }
  const base = pillDay(c, today < c.startDate ? c.startDate : today);
  if (!base) return [];
  const out = [];
  for (let i = 0; i <= n && out.length < n; i++) {
    const cs = addDays(base.cycleStart, 28 * i);
    const w = { start: addDays(cs, t.active), end: addDays(cs, 27) };
    if (w.end >= today) out.push(w);
  }
  return out;
}

/** チェック表に並べる日付(固定タイプは1シート28日、連続タイプは今の周期) */
export function sheetDates(p, anchor, today) {
  const c = pillConf(p);
  const t = PILL_TYPES[c.type];
  if (!isPillOn(c)) return [];
  if (t.continuous) {
    const info = pillDay(c, today);
    const start = info ? info.cycleStart : c.cycleStart;
    let end = today;
    if (info && info.kind === 'rest') end = addDays(c.restStart, c.restDays - 1);
    const n = Math.max(diffDays(start, end) + 1, 1);
    const len = Math.ceil(n / 7) * 7;
    return Array.from({ length: len }, (_, i) => addDays(start, i));
  }
  const info = pillDay(c, anchor < c.startDate ? c.startDate : anchor);
  return Array.from({ length: 28 }, (_, i) => addDays(info.cycleStart, i));
}

/** 指定の期間で、飲むべき日なのに記録がない日数 */
export function missedCount(p, taken, from, to) {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (needsPill(pillDay(p, d)) && !taken[d]) n++;
  }
  return n;
}
