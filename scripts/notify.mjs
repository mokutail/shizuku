// 30分ごとに GitHub Actions で動き、必要な通知を送る
//  ・本人へ:生理予定日の◯日前
//  ・共有相手へ:生理がはじまったとき
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { predict, stats, sortPeriods, diffDays, todayIn, OPEN_MAX } from '../docs/js/cycle.js';

const TZ = 'Asia/Tokyo';
const APP_URL = process.env.APP_URL || './';
const DRY_RUN = process.env.DRY_RUN === '1';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT が設定されていません');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();
const messaging = getMessaging();

const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
if (hour < 8 || hour >= 23) {
  console.log(`夜間(${hour}時)なので送りません`);
  process.exit(0);
}
const today = todayIn(TZ);

async function tokensOf(uid) {
  const snap = await db.collection('users').doc(uid).collection('tokens').get();
  return snap.docs.map((d) => d.id);
}

async function send(uid, title, body, tag) {
  const tokens = await tokensOf(uid);
  if (!tokens.length) return 0;
  if (DRY_RUN) {
    console.log(`[dry-run] ${uid}: ${title} / ${body}`);
    return tokens.length;
  }
  const res = await messaging.sendEachForMulticast({
    tokens,
    data: { title, body, url: APP_URL, tag },
    webpush: { headers: { Urgency: 'high', TTL: '86400' } },
  });
  const dead = [];
  res.responses.forEach((r, i) => {
    const code = r.error && r.error.code;
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') dead.push(tokens[i]);
  });
  await Promise.all(dead.map((t) => db.collection('users').doc(uid).collection('tokens').doc(t).delete()));
  return res.successCount;
}

const users = await db.collection('users').get();
let sent = 0;

for (const u of users.docs) {
  const profile = u.data();
  if (profile.mode === 'partner') continue;
  const ps = sortPeriods((await u.ref.collection('periods').get()).docs.map((d) => d.data()));
  if (!ps.length) continue;

  const stateRef = db.collection('notifyState').doc(u.id);
  const state = (await stateRef.get()).data() || {};
  const patch = {};

  // 本人へ:予定日の◯日前
  const nd = profile.settings && typeof profile.settings.notifyDaysBefore === 'number' ? profile.settings.notifyDaysBefore : 3;
  const last = ps[ps.length - 1];
  const pr = predict(ps, today, stats(ps));
  const left = diffDays(today, pr.nextOriginal);
  const inPeriod = !last.end && diffDays(last.start, today) <= OPEN_MAX;
  if (nd > 0 && !inPeriod && left >= 0 && left <= nd && state.reminderFor !== pr.nextOriginal) {
    const body = left === 0 ? '今日は生理の予定日です。' : `生理の予定日まで、あと${left}日です。`;
    sent += await send(u.id, 'しずく', body, 'reminder');
    patch.reminderFor = pr.nextOriginal;
  }

  // 相手へ:生理がはじまった
  const sharedSnap = await db.collection('shared').doc(u.id).get();
  const shared = sharedSnap.exists ? sharedSnap.data() : null;
  const startedAgo = diffDays(last.start, today);
  const fresh = startedAgo >= 0 && startedAgo <= 2 && (!state.startNotified || state.startNotified < last.start);
  if (fresh) {
    if (shared && shared.items && shared.items.startNotify) {
      const viewers = await db.collection('shared').doc(u.id).collection('viewers').get();
      const name = shared.ownerName || profile.name || 'お相手';
      for (const v of viewers.docs) {
        sent += await send(v.id, 'しずく', `${name}さんの生理がはじまりました。`, 'started');
      }
    }
    patch.startNotified = last.start;
  }

  if (Object.keys(patch).length && !DRY_RUN) {
    await stateRef.set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
}

console.log(`${today} ${hour}時:${sent}件送りました`);
