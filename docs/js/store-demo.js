// デモモード:Firebaseの設定がまだ無いときに、この端末の中だけで動く
import { addDays, todayIn, SHARE_DEFAULTS } from './cycle.js';
import { PILL_DEFAULTS } from './pill.js';

const KEY = 'shizuku-demo-v2';

function sample() {
  const today = todayIn();
  const cycles = [29, 27, 30, 28, 31, 28];
  const lens = [5, 6, 5, 5, 6, 5, 5];
  let start = addDays(today, -17);
  const starts = [start];
  for (let i = cycles.length - 1; i >= 0; i--) {
    start = addDays(start, -cycles[i]);
    starts.unshift(start);
  }
  const periods = starts.map((s, i) => ({ id: 'p' + i, start: s, end: addDays(s, lens[i] - 1) }));
  const days = {};
  const pick = [['cramp', 'tired'], ['cramp', 'backache', 'sleepy'], ['backache'], ['skin'], []];
  for (const p of periods.slice(-3)) {
    pick.forEach((list, i) => { if (list.length) days[addDays(p.start, i)] = list; });
    days[addDays(p.start, -2)] = ['irritated', 'chest'];
  }
  const pills = {};
  const pillStart = addDays(today, -15);
  for (let i = 0; i <= 15; i++) if (i !== 9) pills[addDays(pillStart, i)] = true;
  delete pills[today];
  return {
    profile: {
      name: 'わたし', mode: 'owner', settings: { notifyDaysBefore: 3 }, share: { ...SHARE_DEFAULTS },
      pill: { ...PILL_DEFAULTS, startDate: pillStart, cycleStart: pillStart },
    },
    periods,
    days,
    pills,
    appts: [{ id: 'a1', date: addDays(today, 9), time: '10:30', place: 'さくらレディースクリニック', memo: 'ピルの処方', remind: [1, 0] }],
    shared: null,
    viewers: [{ uid: 'demo-partner', name: 'かれし' }],
  };
}

export function createDemoBackend() {
  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)) || sample(); } catch { db = sample(); }
  const subs = { own: new Set(), viewers: new Set(), shared: new Set() };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* 保存できなくても動かす */ } };
  const snapshot = () => ({ periods: db.periods.map((p) => ({ ...p })), days: { ...db.days }, pills: { ...db.pills }, appts: db.appts.map((a) => ({ ...a })) });
  const emitOwn = () => subs.own.forEach((cb) => cb(snapshot()));
  const emitViewers = () => subs.viewers.forEach((cb) => cb(db.viewers.slice()));
  const emitShared = () => subs.shared.forEach((cb) => cb(db.shared));
  const later = (fn) => setTimeout(fn, 0);
  const user = { uid: 'demo-me', name: 'わたし', email: '' };

  return {
    isDemo: true,
    onAuth(cb) { later(() => cb(user)); },
    async signIn() {},
    async signOut() { localStorage.removeItem(KEY); location.reload(); },
    async loadProfile() { return JSON.parse(JSON.stringify(db.profile)); },
    async saveProfile(patch) {
      db.profile = { ...db.profile, ...patch, settings: { ...db.profile.settings, ...(patch.settings || {}) }, share: { ...db.profile.share, ...(patch.share || {}) }, pill: { ...db.profile.pill, ...(patch.pill || {}) } };
      save();
    },
    watchOwnData(cb) { subs.own.add(cb); later(() => cb(snapshot())); return () => subs.own.delete(cb); },
    async setPill(date, taken) { if (taken) db.pills[date] = true; else delete db.pills[date]; save(); emitOwn(); },
    async saveAppointment(a) {
      if (a.id) db.appts = db.appts.map((x) => (x.id === a.id ? { ...a } : x));
      else db.appts.push({ ...a, id: 'a' + Date.now() });
      save(); emitOwn();
    },
    async deleteAppointment(id) { db.appts = db.appts.filter((a) => a.id !== id); save(); emitOwn(); },
    async addPeriod(p) { const id = 'p' + Date.now() + Math.random().toString(36).slice(2, 6); db.periods.push({ id, start: p.start, end: p.end || null }); save(); emitOwn(); return id; },
    async updatePeriod(id, patch) { db.periods = db.periods.map((p) => (p.id === id ? { ...p, ...patch } : p)); save(); emitOwn(); },
    async deletePeriod(id) { db.periods = db.periods.filter((p) => p.id !== id); save(); emitOwn(); },
    async setSymptoms(date, list) { if (list.length) db.days[date] = list; else delete db.days[date]; save(); emitOwn(); },
    async writeShared(obj) { db.shared = JSON.parse(JSON.stringify(obj)); save(); emitShared(); },
    async createInvite() { return 'demo' + Math.random().toString(36).slice(2, 12); },
    watchViewers(cb) { subs.viewers.add(cb); later(() => cb(db.viewers.slice())); return () => subs.viewers.delete(cb); },
    async removeViewer(uid) { db.viewers = db.viewers.filter((v) => v.uid !== uid); save(); emitViewers(); },
    async getInvite() { return null; },
    async acceptInvite() {},
    watchShared(_owner, cb) { subs.shared.add(cb); later(() => cb(db.shared)); return () => subs.shared.delete(cb); },
    async leaveShare() {},
    pushState() { return 'demo'; },
    async enablePush() { return 'demo'; },
    async refreshPush() {},
    reset() { db = sample(); save(); emitOwn(); emitViewers(); },
  };
}
