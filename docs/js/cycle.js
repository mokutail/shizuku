// 周期の計算(画面と通知スクリプトの両方で使う。ブラウザ専用の機能は使わない)

export const DEFAULT_CYCLE = 28;
export const DEFAULT_LEN = 5;
/** 終わった日が未入力でも「生理中」とみなす最長の日数 - 1 */
export const OPEN_MAX = 9;
const MS = 86400000;

export function toNum(s) {
  const [y, m, d] = s.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS);
}
export function fromNum(n) {
  const d = new Date(n * MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
export const addDays = (s, n) => fromNum(toNum(s) + n);
/** b - a を日数で */
export const diffDays = (a, b) => toNum(b) - toNum(a);

export function todayIn(tz = 'Asia/Tokyo', date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function sortPeriods(list) {
  return [...(list || [])].filter((p) => p && p.start).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

/** 終了日が入っていない期間で、まだ続いているとみなすもの */
export function isOpen(p, today) {
  if (!p || p.end) return false;
  const d = diffDays(p.start, today);
  return d >= 0 && d <= OPEN_MAX;
}

export function stats(periods) {
  const ps = sortPeriods(periods);
  const cycles = [];
  for (let i = 1; i < ps.length; i++) {
    const c = diffDays(ps[i - 1].start, ps[i].start);
    if (c >= 15 && c <= 60) cycles.push(c);
  }
  const lens = ps.filter((p) => p.end).map((p) => diffDays(p.start, p.end) + 1).filter((l) => l >= 1 && l <= 14);
  const rc = cycles.slice(-6);
  const rl = lens.slice(-6);
  return {
    avgCycle: rc.length ? Math.round(mean(rc)) : DEFAULT_CYCLE,
    avgLen: rl.length ? Math.round(mean(rl)) : DEFAULT_LEN,
    minCycle: rc.length ? Math.min(...rc) : null,
    maxCycle: rc.length ? Math.max(...rc) : null,
    cycleSamples: rc.length,
    count: ps.length,
  };
}

/** 次の生理・排卵日の予測 */
export function predict(periods, today, st = stats(periods), n = 3) {
  const ps = sortPeriods(periods);
  if (!ps.length) return null;
  const last = ps[ps.length - 1];
  const nextOriginal = addDays(last.start, st.avgCycle);
  let base = nextOriginal;
  if (!isOpen(last, today) && nextOriginal < today) base = addDays(today, 1);

  const upcoming = [];
  for (let i = 0; i < n; i++) {
    const s = addDays(base, i * st.avgCycle);
    upcoming.push({ start: s, end: addDays(s, st.avgLen - 1) });
  }
  const fertile = [];
  const cycleStarts = [last.start, ...upcoming.map((u) => u.start)];
  for (const cs of cycleStarts) {
    const ov = addDays(cs, st.avgCycle - 14);
    if (ov <= cs) continue;
    fertile.push({ ov, fStart: addDays(ov, -5), fEnd: addDays(ov, 1) });
  }
  return { nextOriginal, next: base, upcoming, fertile };
}

/** 画面に必要なものをまとめて作る */
export function buildView(periods, days, today) {
  const ps = sortPeriods(periods);
  const st = stats(ps);
  const pr = predict(ps, today, st);
  const actual = [];
  const preds = [];
  for (const p of ps) {
    if (p.end) {
      actual.push({ id: p.id, start: p.start, end: p.end });
    } else if (isOpen(p, today)) {
      actual.push({ id: p.id, start: p.start, end: today, open: true });
      const pe = addDays(p.start, st.avgLen - 1);
      if (pe > today) preds.push({ start: addDays(today, 1), end: pe });
    } else {
      actual.push({ id: p.id, start: p.start, end: addDays(p.start, st.avgLen - 1), guessed: true });
    }
  }
  if (pr) preds.push(...pr.upcoming);
  const symptoms = {};
  for (const [d, v] of Object.entries(days || {})) if (v && v.length) symptoms[d] = v;
  const last = ps[ps.length - 1];
  const core = pr
    ? { openStart: last && isOpen(last, today) ? last.start : null, next: pr.next, nextOriginal: pr.nextOriginal }
    : null;
  return { stats: st, actual, preds, fertile: pr ? pr.fertile : [], symptoms, core };
}

export function statusOf(core, today) {
  if (!core) return { kind: 'empty' };
  if (core.openStart) {
    const d = diffDays(core.openStart, today);
    if (d >= 0 && d <= OPEN_MAX) return { kind: 'period', day: d + 1 };
  }
  const d = diffDays(today, core.nextOriginal);
  if (d < 0) return { kind: 'late', days: -d, next: core.nextOriginal };
  return { kind: 'wait', days: d, next: core.nextOriginal };
}

export function infoFor(view, date) {
  const actual = view.actual.find((a) => date >= a.start && date <= a.end) || null;
  const pred = !actual && view.preds.some((p) => date >= p.start && date <= p.end);
  const fertile = view.fertile.some((f) => date >= f.fStart && date <= f.fEnd);
  const ovulation = view.fertile.some((f) => f.ov === date);
  return { actual, pred, fertile, ovulation, symptoms: view.symptoms[date] || [] };
}

export const SHARE_DEFAULTS = { status: true, fertile: false, history: false, symptoms: false, startNotify: true };

/** 彼氏さんに見せる分だけを取り出す */
export function buildShared(view, flags, ownerName, today) {
  const data = {};
  if (flags.status) {
    data.core = view.core;
    data.preds = view.preds;
  }
  if (flags.fertile) data.fertile = view.fertile;
  if (flags.history) {
    data.actual = view.actual.slice(-24).filter((a) => !a.open).map(({ start, end }) => ({ start, end }));
    const s = view.stats;
    data.stats = { avgCycle: s.avgCycle, avgLen: s.avgLen, minCycle: s.minCycle, maxCycle: s.maxCycle, count: s.count };
  }
  if (flags.symptoms) {
    const from = addDays(today, -120);
    data.symptoms = Object.fromEntries(Object.entries(view.symptoms).filter(([d]) => d >= from));
  }
  return { ownerName, items: { ...SHARE_DEFAULTS, ...flags }, data, sharedOn: today };
}

/** 受け取った共有データを画面用に戻す */
export function viewFromShared(doc, today) {
  const d = (doc && doc.data) || {};
  let actual = d.actual || [];
  if (d.core && d.core.openStart) {
    const os = d.core.openStart;
    const n = diffDays(os, today);
    if (n >= 0 && n <= OPEN_MAX) actual = actual.filter((a) => a.start !== os).concat([{ start: os, end: today, open: true }]);
  }
  return {
    stats: d.stats || null,
    actual,
    preds: (d.preds || []).filter((p) => p.end >= today),
    fertile: d.fertile || [],
    symptoms: d.symptoms || {},
    core: d.core || null,
    items: { ...SHARE_DEFAULTS, ...((doc && doc.items) || {}) },
  };
}

/** 貼り付けた日付のリストを期間に変換する */
export function parseBulk(text, today) {
  const refYear = Number(today.slice(0, 4));
  const re = /(?:(\d{4})\s*[\/\-.年]\s*)?(\d{1,2})\s*[\/\-.月]\s*(\d{1,2})\s*日?/g;
  const out = [];
  const errors = [];
  const lines = String(text || '').split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const toks = [...line.matchAll(re)];
    if (!toks.length) { errors.push(i + 1); return; }
    const mk = (t, fallbackYear) => {
      const y = t[1] ? Number(t[1]) : fallbackYear;
      const m = Number(t[2]);
      const d = Number(t[3]);
      if (m < 1 || m > 12 || d < 1 || d > 31) return null;
      const s = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      return fromNum(toNum(s)) === s ? s : null;
    };
    let start = mk(toks[0], refYear);
    if (start && !toks[0][1] && start > today) start = mk(toks[0], refYear - 1);
    if (!start || start > today) { errors.push(i + 1); return; }
    let end = null;
    if (toks[1]) {
      end = mk(toks[1], Number(start.slice(0, 4)));
      if (end && !toks[1][1] && end < start) end = mk(toks[1], Number(start.slice(0, 4)) + 1);
      if (!end || end < start || diffDays(start, end) > 13) { errors.push(i + 1); return; }
    }
    out.push({ start, end });
  });
  const periods = [];
  for (const p of sortPeriods(out)) {
    const prev = periods[periods.length - 1];
    if (prev && (p.start === prev.start || (prev.end && p.start <= prev.end))) continue;
    periods.push(p);
  }
  return { periods, errors };
}
