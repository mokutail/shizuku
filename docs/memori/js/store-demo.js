// デモモード:この端末の中だけで動く(サンプル入り)
import { addDays, todayIn } from '../../js/cycle.js';
import { mergeProfile } from './store-firebase.js';

const KEY = 'memori-demo-v1';

function sample() {
  const today = todayIn();
  const weights = {};
  let kg = 56.8;
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let i = 120; i >= 0; i--) {
    if (rnd() < 0.18 && i > 0) continue;
    kg += -0.022 + (rnd() - 0.5) * 0.5;
    kg = Math.max(53.5, kg);
    const d = addDays(today, -i);
    weights[d] = { kg: Math.round(kg * 10) / 10, waist: i % 14 === 0 ? Math.round((71.5 - (120 - i) * 0.015) * 10) / 10 : null,
      thigh: i < 30 ? Math.round((51.6 + i * 0.03 + Math.sin(i) * 0.2) * 10) / 10 : null,
      arm: i < 30 ? Math.round((26.2 + i * 0.015 + Math.cos(i) * 0.15) * 10) / 10 : null };
  }
  const y = Number(today.slice(0, 4));
  const ck = (year, v, extra = {}) => ({
    id: 'ck' + year,
    date: `${year}-06-${year % 2 ? '12' : '18'}`,
    place: 'みなと健診センター',
    overall: v.overall,
    values: v.values,
    custom: extra.custom || [],
  });
  const val = (v, j = 'A') => ({ v: String(v), j });
  const checkups = [
    ck(y - 2, { overall: 'B', values: {
      height: val(158.2, ''), weight: val(57.9, ''), bmi: val(23.1), waist: val(73.5), sbp: val(118), dbp: val(76), pulse: val(70, ''),
      eyeR: val(0.4, 'B'), eyeL: val(0.5, 'B'), eyeRc: val(1.2), eyeLc: val(1.2),
      tc: val(212, 'B'), hdl: val(62), ldl: val(128, 'B'), tg: val(96), ast: val(19), alt: val(16), ggt: val(18),
      cre: val(0.62), egfr: val(88.4), ua: val(4.6), fbs: val(88), hba1c: val(5.3),
      rbc: val(428), hb: val(12.1, 'B'), ht: val(37.6), wbc: val(5600), plt: val(24.1),
      uPro: val('−'), uGlu: val('−'), uBld: val('±', 'B'), xray: val('異常なし'), ecg: val('異常なし'),
    } }),
    ck(y - 1, { overall: 'C', values: {
      height: val(158.3, ''), weight: val(57.2, ''), bmi: val(22.8), waist: val(72.6), sbp: val(121), dbp: val(78), pulse: val(68, ''),
      eyeR: val(0.4, 'B'), eyeL: val(0.4, 'B'), eyeRc: val(1.2), eyeLc: val(1.0),
      tc: val(221, 'B'), hdl: val(60), ldl: val(141, 'C'), tg: val(104), ast: val(21), alt: val(18), ggt: val(17),
      cre: val(0.64), egfr: val(85.1), ua: val(4.8), fbs: val(91), hba1c: val(5.4),
      rbc: val(415), hb: val(11.6, 'C'), ht: val(36.2, 'B'), wbc: val(5900), plt: val(25.3), fe: val(48, 'C'),
      uPro: val('−'), uGlu: val('−'), uBld: val('−'), xray: val('異常なし'), ecg: val('異常なし'),
    } }),
    ck(y, { overall: 'B', values: {
      height: val(158.2, ''), weight: val(55.9, ''), bmi: val(22.3), waist: val(71.0), sbp: val(116), dbp: val(74), pulse: val(66, ''),
      eyeR: val(0.3, 'C'), eyeL: val(0.4, 'B'), eyeRc: val(1.2), eyeLc: val(1.2),
      tc: val(205, 'B'), hdl: val(65), ldl: val(124, 'B'), tg: val(82), ast: val(18), alt: val(14), ggt: val(15),
      cre: val(0.61), egfr: val(89.0), ua: val(4.5), fbs: val(86), hba1c: val(5.3),
      rbc: val(432), hb: val(12.4, 'B'), ht: val(38.0), wbc: val(5200), plt: val(23.8), fe: val(72),
      uPro: val('−'), uGlu: val('−'), uBld: val('−'), xray: val('異常なし'), ecg: val('異常なし'), echo: val('異常なし'),
    } }, { custom: [{ name: 'ビタミンD', unit: 'ng/mL', v: '18.2', j: 'C' }] }),
  ];
  return {
    profile: mergeProfile({ name: 'わたし', height: 158.2, goal: 54, remind: { on: true, time: '07:30' } }),
    weights,
    checkups,
    photos: [],
    shared: null,
    viewers: [{ uid: 'demo-partner', name: 'かれし' }],
  };
}

export function createDemoBackend() {
  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)) || sample(); } catch { db = sample(); }
  const subs = { own: new Set(), viewers: new Set(), shared: new Set() };
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify({ ...db, photos: [] })); } catch { /* 保存できなくても動かす */ }
  };
  const snap = () => ({ weights: JSON.parse(JSON.stringify(db.weights)), checkups: JSON.parse(JSON.stringify(db.checkups)) });
  const emitOwn = () => subs.own.forEach((cb) => cb(snap()));
  const later = (fn) => setTimeout(fn, 0);
  const user = { uid: 'demo-me', name: 'わたし', email: '' };

  return {
    isDemo: true,
    onAuth(cb) { later(() => cb(user)); },
    async signIn() {},
    async signOut() { localStorage.removeItem(KEY); location.reload(); },
    async loadProfile() { return mergeProfile(JSON.parse(JSON.stringify(db.profile))); },
    async saveProfile(patch) { db.profile = mergeProfile({ ...db.profile, ...patch, remind: { ...db.profile.remind, ...(patch.remind || {}) }, share: { ...db.profile.share, ...(patch.share || {}) } }); save(); },
    watchOwnData(cb) { subs.own.add(cb); later(() => cb(snap())); return () => subs.own.delete(cb); },
    async setWeight(date, data) {
      const rec = { kg: data.kg ?? null, waist: data.waist ?? null, thigh: data.thigh ?? null, arm: data.arm ?? null };
      if (Object.values(rec).every((v) => v == null)) delete db.weights[date];
      else db.weights[date] = rec;
      save(); emitOwn();
    },
    async saveCheckup(ck) {
      const id = ck.id || 'ck' + Date.now();
      const rec = { ...ck, id };
      db.checkups = db.checkups.filter((c) => c.id !== id).concat([rec]);
      save(); emitOwn();
      return id;
    },
    async deleteCheckup(id) { db.checkups = db.checkups.filter((c) => c.id !== id); db.photos = db.photos.filter((p) => p.checkupId !== id); save(); emitOwn(); },
    async loadPhotos(checkupId) { return db.photos.filter((p) => p.checkupId === checkupId); },
    async addPhoto(checkupId, photo) { const id = 'ph' + Date.now() + Math.random().toString(36).slice(2, 6); db.photos.push({ id, checkupId, ...photo }); return id; },
    async deletePhoto(id) { db.photos = db.photos.filter((p) => p.id !== id); },
    async writeShared(obj) { db.shared = JSON.parse(JSON.stringify(obj)); save(); subs.shared.forEach((cb) => cb(db.shared)); },
    async createInvite() { return 'demo' + Math.random().toString(36).slice(2, 12); },
    watchViewers(cb) { subs.viewers.add(cb); later(() => cb(db.viewers.slice())); return () => subs.viewers.delete(cb); },
    async removeViewer(v) { db.viewers = db.viewers.filter((x) => x.uid !== v); save(); subs.viewers.forEach((cb) => cb(db.viewers.slice())); },
    async getInvite() { return null; },
    async acceptInvite() {},
    watchShared(_o, cb) { subs.shared.add(cb); later(() => cb(db.shared)); return () => subs.shared.delete(cb); },
    async leaveShare() {},
    pushState() { return 'demo'; },
    async enablePush() { return 'demo'; },
    async refreshPush() {},
    reset() { db = sample(); save(); emitOwn(); },
  };
}
