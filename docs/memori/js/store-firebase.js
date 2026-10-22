// めもり の保存先(Firebase)。ログインとプロジェクトは「しずく」と共通
const V = '11.0.2';
const CDN = `https://www.gstatic.com/firebasejs/${V}/`;

export const PROFILE_DEFAULTS = {
  name: '',
  height: null,
  goal: null,
  remind: { on: false, time: '07:30', skipIfRecorded: false },
  share: { weight: true, waist: false, goal: false, checkups: false },
  mode: 'owner',
  following: null,
};

export function mergeProfile(d) {
  const b = PROFILE_DEFAULTS;
  return { ...b, ...(d || {}), remind: { ...b.remind, ...((d && d.remind) || {}) }, share: { ...b.share, ...((d && d.share) || {}) } };
}

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
  const { doc, collection, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, serverTimestamp, Timestamp, writeBatch } = fs;
  let uid = null;
  let current = null;
  const me = () => { if (!uid) throw new Error('ログインしていません'); return uid; };
  const metaRef = () => doc(db, 'users', me(), 'meta', 'memori');

  async function pushSupported() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return false;
    try { return await msgMod.isSupported(); } catch { return false; }
  }
  async function registerToken() {
    const reg = await navigator.serviceWorker.ready;
    const token = await msgMod.getToken(msgMod.getMessaging(app), { vapidKey, serviceWorkerRegistration: reg });
    if (token) await setDoc(doc(db, 'users', me(), 'memoriTokens', token), { token, createdAt: serverTimestamp() });
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
      // 通知の確認で見つけられるように、ユーザーの入れ物を用意しておく
      await setDoc(doc(db, 'users', me()), {}, { merge: true });
      const snap = await getDoc(metaRef());
      if (!snap.exists()) {
        const base = mergeProfile({ name: (current && current.name) || '' });
        await setDoc(metaRef(), base);
        return base;
      }
      return mergeProfile(snap.data());
    },
    async saveProfile(patch) { await setDoc(metaRef(), patch, { merge: true }); },

    watchOwnData(cb) {
      const parts = { weights: null, checkups: null };
      const emit = () => { if (parts.weights && parts.checkups) cb({ ...parts }); };
      const u1 = onSnapshot(collection(db, 'users', me(), 'weights'), (s) => {
        parts.weights = Object.fromEntries(s.docs.map((d) => [d.id, d.data()]));
        emit();
      });
      const u2 = onSnapshot(collection(db, 'users', me(), 'checkups'), (s) => {
        parts.checkups = s.docs.map((d) => ({ id: d.id, ...d.data() }));
        emit();
      });
      return () => { u1(); u2(); };
    },
    async setWeight(date, data) {
      const ref = doc(db, 'users', me(), 'weights', date);
      if (data.kg == null && data.waist == null) await deleteDoc(ref);
      else await setDoc(ref, { kg: data.kg ?? null, waist: data.waist ?? null });
    },
    async saveCheckup(ck) {
      const { id, ...data } = ck;
      if (id) { await setDoc(doc(db, 'users', me(), 'checkups', id), data); return id; }
      const r = await addDoc(collection(db, 'users', me(), 'checkups'), data);
      return r.id;
    },
    async deleteCheckup(id) {
      const photos = await getDocs(query(collection(db, 'users', me(), 'photos'), where('checkupId', '==', id)));
      const batch = writeBatch(db);
      photos.docs.forEach((d) => batch.delete(d.ref));
      batch.delete(doc(db, 'users', me(), 'checkups', id));
      await batch.commit();
    },
    async loadPhotos(checkupId) {
      const s = await getDocs(query(collection(db, 'users', me(), 'photos'), where('checkupId', '==', checkupId)));
      return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
    },
    async addPhoto(checkupId, photo) {
      const r = await addDoc(collection(db, 'users', me(), 'photos'), { checkupId, data: photo.data, w: photo.w, h: photo.h, order: Date.now() });
      return r.id;
    },
    async deletePhoto(id) { await deleteDoc(doc(db, 'users', me(), 'photos', id)); },

    async writeShared(obj) { await setDoc(doc(db, 'sharedBody', me()), { ...obj, updatedAt: serverTimestamp() }); },
    async createInvite(ownerName) {
      const code = randomCode();
      await setDoc(doc(db, 'invites', code), {
        owner: me(), ownerName: ownerName || '', app: 'memori',
        expiresAt: Timestamp.fromMillis(Date.now() + 24 * 3600 * 1000),
      });
      return code;
    },
    watchViewers(cb) {
      return onSnapshot(collection(db, 'sharedBody', me(), 'viewers'), (s) => cb(s.docs.map((d) => ({ uid: d.id, ...d.data() }))));
    },
    async removeViewer(viewer) { await deleteDoc(doc(db, 'sharedBody', me(), 'viewers', viewer)); },
    async getInvite(code) {
      const snap = await getDoc(doc(db, 'invites', code));
      if (!snap.exists()) return null;
      const d = snap.data();
      if (d.app !== 'memori') return null;
      return {
        owner: d.owner, ownerName: d.ownerName || '',
        expired: d.expiresAt.toMillis() < Date.now(),
        used: !!d.usedBy && d.usedBy !== uid,
        mine: d.owner === uid,
        usedBy: d.usedBy || null,
      };
    },
    async acceptInvite(code, info, myName) {
      if (!info.usedBy) await updateDoc(doc(db, 'invites', code), { usedBy: me() });
      await setDoc(doc(db, 'sharedBody', info.owner, 'viewers', me()), { code, name: myName || '', addedAt: serverTimestamp() });
      await setDoc(metaRef(), { mode: 'partner', following: info.owner }, { merge: true });
    },
    watchShared(owner, cb) {
      return onSnapshot(doc(db, 'sharedBody', owner), (s) => cb(s.exists() ? s.data() : null), () => cb(null));
    },
    async leaveShare(owner) {
      try { await deleteDoc(doc(db, 'sharedBody', owner, 'viewers', me())); } catch { /* すでに解除されている */ }
      await setDoc(metaRef(), { mode: 'owner', following: null }, { merge: true });
    },

    pushState() { return 'Notification' in window ? Notification.permission : 'unsupported'; },
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
