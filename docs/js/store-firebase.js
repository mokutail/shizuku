// Firebase版:Googleログイン、Firestoreへの保存、通知の受け取り登録
import { SHARE_DEFAULTS } from './cycle.js';
import { PILL_DEFAULTS } from './pill.js';

const V = '11.0.2';
const CDN = `https://www.gstatic.com/firebasejs/${V}/`;

function randomCode(len = 24) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join('');
}

export async function createFirebaseBackend(config, vapidKey) {
  const [appMod, authMod, fs, msgMod] = await Promise.all([
    import(CDN + 'firebase-app.js'),
    import(CDN + 'firebase-auth.js'),
    import(CDN + 'firebase-firestore.js'),
    import(CDN + 'firebase-messaging.js'),
  ]);
  const app = appMod.initializeApp(config);
  const auth = authMod.getAuth(app);
  let db;
  try {
    db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
  } catch {
    db = fs.getFirestore(app);
  }
  const { doc, collection, getDoc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, Timestamp } = fs;
  let uid = null;
  let current = null;

  const me = () => {
    if (!uid) throw new Error('ログインしていません');
    return uid;
  };

  async function pushSupported() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return false;
    try { return await msgMod.isSupported(); } catch { return false; }
  }

  async function registerToken() {
    const reg = await navigator.serviceWorker.ready;
    const messaging = msgMod.getMessaging(app);
    const token = await msgMod.getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
    if (token) {
      await setDoc(doc(db, 'users', me(), 'tokens', token), {
        token,
        createdAt: serverTimestamp(),
        device: navigator.userAgent.slice(0, 120),
      });
    }
    return token;
  }

  return {
    isDemo: false,
    onAuth(cb) {
      authMod.getRedirectResult(auth).catch(() => {});
      authMod.onAuthStateChanged(auth, (u) => {
        uid = u ? u.uid : null;
        current = u ? { uid: u.uid, name: u.displayName || '', email: u.email || '' } : null;
        cb(current);
      });
    },
    async signIn() {
      const provider = new authMod.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        await authMod.signInWithPopup(auth, provider);
      } catch (e) {
        const fallback = ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'];
        if (fallback.includes(e.code)) await authMod.signInWithRedirect(auth, provider);
        else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') throw e;
      }
    },
    async signOut() { await authMod.signOut(auth); },

    async loadProfile() {
      const ref = doc(db, 'users', me());
      const snap = await getDoc(ref);
      const base = { name: (current && current.name) || '', mode: 'owner', following: null, settings: { notifyDaysBefore: 3 }, share: { ...SHARE_DEFAULTS }, pill: { ...PILL_DEFAULTS } };
      if (!snap.exists()) {
        await setDoc(ref, base);
        return base;
      }
      const d = snap.data();
      return { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}) }, share: { ...base.share, ...(d.share || {}) }, pill: { ...base.pill, ...(d.pill || {}) } };
    },
    async saveProfile(patch) { await setDoc(doc(db, 'users', me()), patch, { merge: true }); },

    watchOwnData(cb) {
      const parts = { periods: null, days: null, pills: null, appts: null };
      const emit = () => { if (Object.values(parts).every((v) => v !== null)) cb({ ...parts }); };
      const col = (name) => collection(db, 'users', me(), name);
      const subs = [
        onSnapshot(col('periods'), (s) => { parts.periods = s.docs.map((d) => ({ id: d.id, ...d.data() })); emit(); }),
        onSnapshot(col('days'), (s) => { parts.days = Object.fromEntries(s.docs.map((d) => [d.id, d.data().symptoms || []])); emit(); }),
        onSnapshot(col('pills'), (s) => { parts.pills = Object.fromEntries(s.docs.map((d) => [d.id, true])); emit(); }),
        onSnapshot(col('appointments'), (s) => { parts.appts = s.docs.map((d) => ({ id: d.id, ...d.data() })); emit(); }),
      ];
      return () => subs.forEach((u) => u());
    },
    async setPill(date, taken) {
      const ref = doc(db, 'users', me(), 'pills', date);
      if (taken) await setDoc(ref, { takenAt: serverTimestamp() });
      else await deleteDoc(ref);
    },
    async saveAppointment(a) {
      const { id, ...data } = a;
      if (id) await setDoc(doc(db, 'users', me(), 'appointments', id), data);
      else await addDoc(collection(db, 'users', me(), 'appointments'), data);
    },
    async deleteAppointment(id) { await deleteDoc(doc(db, 'users', me(), 'appointments', id)); },
    async addPeriod(p) {
      const r = await addDoc(collection(db, 'users', me(), 'periods'), { start: p.start, end: p.end || null });
      return r.id;
    },
    async updatePeriod(id, patch) { await updateDoc(doc(db, 'users', me(), 'periods', id), patch); },
    async deletePeriod(id) { await deleteDoc(doc(db, 'users', me(), 'periods', id)); },
    async setSymptoms(date, list) {
      const ref = doc(db, 'users', me(), 'days', date);
      if (list.length) await setDoc(ref, { symptoms: list });
      else await deleteDoc(ref);
    },

    async writeShared(obj) { await setDoc(doc(db, 'shared', me()), { ...obj, updatedAt: serverTimestamp() }); },
    async createInvite(ownerName) {
      const code = randomCode();
      await setDoc(doc(db, 'invites', code), {
        owner: me(),
        ownerName: ownerName || '',
        expiresAt: Timestamp.fromMillis(Date.now() + 24 * 3600 * 1000),
      });
      return code;
    },
    watchViewers(cb) {
      return onSnapshot(collection(db, 'shared', me(), 'viewers'), (s) => cb(s.docs.map((d) => ({ uid: d.id, ...d.data() }))));
    },
    async removeViewer(viewer) { await deleteDoc(doc(db, 'shared', me(), 'viewers', viewer)); },

    async getInvite(code) {
      const snap = await getDoc(doc(db, 'invites', code));
      if (!snap.exists()) return null;
      const d = snap.data();
      if (d.app && d.app !== 'shizuku') return null;
      return {
        owner: d.owner,
        ownerName: d.ownerName || '',
        expired: d.expiresAt.toMillis() < Date.now(),
        used: !!d.usedBy && d.usedBy !== uid,
        mine: d.owner === uid,
        usedBy: d.usedBy || null,
      };
    },
    async acceptInvite(code, info, myName) {
      if (!info.usedBy) await updateDoc(doc(db, 'invites', code), { usedBy: me() });
      await setDoc(doc(db, 'shared', info.owner, 'viewers', me()), { code, name: myName || '', addedAt: serverTimestamp() });
      await setDoc(doc(db, 'users', me()), { mode: 'partner', following: info.owner }, { merge: true });
    },
    watchShared(owner, cb) {
      return onSnapshot(doc(db, 'shared', owner), (s) => cb(s.exists() ? s.data() : null), () => cb(null, true));
    },
    async leaveShare(owner) {
      try { await deleteDoc(doc(db, 'shared', owner, 'viewers', me())); } catch { /* すでに解除されている */ }
      await setDoc(doc(db, 'users', me()), { mode: 'owner', following: null }, { merge: true });
    },

    pushState() {
      if (!('Notification' in window)) return 'unsupported';
      return Notification.permission;
    },
    async enablePush() {
      if (!(await pushSupported())) return 'unsupported';
      const perm = await Notification.requestPermission();
      if (perm === 'granted') await registerToken();
      return perm;
    },
    async refreshPush() {
      if ((await pushSupported()) && Notification.permission === 'granted') {
        try { await registerToken(); } catch { /* 次に開いたときにまた試す */ }
      }
    },
  };
}
