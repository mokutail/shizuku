// 10分ごとに GitHub Actions で動き、必要な通知を送る
//  ・本人へ:生理予定日の◯日前(ピルを使っていないとき)
//  ・本人へ:ピルを飲む時刻/飲んだ記録がないときの再通知
//  ・本人へ:病院の予約
//  ・共有相手へ:生理がはじまったとき
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { predict, stats, sortPeriods, diffDays, addDays, toNum, todayIn, OPEN_MAX } from '../docs/js/cycle.js';
import { pillConf, isPillOn, pillDay, needsPill } from '../docs/js/pill.js';

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

const now = new Date();
const today = todayIn(TZ, now);
const hm = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
const [hour, minute] = hm.split(':').map(Number);
const nowMin = toNum(today) * 1440 + hour * 60 + minute;
const daytime = hour >= 8 && hour < 23;

const md = (s) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;

async function tokensOf(uid) {
  const snap = await db.collection('users').doc(uid).collection('tokens').get();
  return snap.docs.map((d) => d.id);
}

async function send(uid, body, tag, extra = {}) {
  const tokens = await tokensOf(uid);
  if (!tokens.length) return 0;
  if (DRY_RUN) {
    console.log(`[dry-run] ${uid}: ${body}`);
    return tokens.length;
  }
  const res = await messaging.sendEachForMulticast({
    tokens,
    data: { title: 'しずく', body, url: APP_URL, tag, ...extra },
    webpush: { headers: { Urgency: 'high', TTL: '21600' } },
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

  const stateRef = db.collection('notifyState').doc(u.id);
  const state = (await stateRef.get()).data() || {};
  const patch = {};
  const pc = pillConf(profile.pill);
  const pillOn = isPillOn(pc);

  // ---- ピル:飲む時刻と再通知(夜でも送る)
  if (pillOn) {
    const [ph, pm] = String(pc.time || '21:00').split(':').map(Number);
    for (const d of [addDays(today, -1), today]) {
      const due = toNum(d) * 1440 + ph * 60 + pm;
      if (nowMin < due || nowMin >= due + 360) continue;
      if (!needsPill(pillDay(pc, d))) continue;
      const taken = (await u.ref.collection('pills').doc(d).get()).exists;
      if (taken) continue;
      if (state.pill1 !== d && !patch.pill1) {
        sent += await send(u.id, 'ピルを飲む時間です。飲んだら「飲んだ」を押してください。', 'pill', { date: d });
        patch.pill1 = d;
      } else if (pc.remindAfter > 0 && nowMin >= due + pc.remindAfter && state.pill2 !== d) {
        sent += await send(u.id, `${d === today ? '今日' : '昨日'}のピルの記録がまだありません。飲んだら「飲んだ」を押してください。`, 'pill', { date: d });
        patch.pill2 = d;
      }
    }
  }

  if (daytime) {
    // ---- 生理の予定(ピルを使っていないとき)
    const ps = sortPeriods((await u.ref.collection('periods').get()).docs.map((d) => d.data()));
    if (ps.length && !pillOn) {
      const nd = profile.settings && typeof profile.settings.notifyDaysBefore === 'number' ? profile.settings.notifyDaysBefore : 3;
      const last = ps[ps.length - 1];
      const pr = predict(ps, today, stats(ps));
      const left = diffDays(today, pr.nextOriginal);
      const inPeriod = !last.end && diffDays(last.start, today) <= OPEN_MAX;
      if (nd > 0 && !inPeriod && left >= 0 && left <= nd && state.reminderFor !== pr.nextOriginal) {
        const body = left === 0 ? '今日は生理の予定日です。' : `生理の予定日まで、あと${left}日です。`;
        sent += await send(u.id, body, 'reminder');
        patch.reminderFor = pr.nextOriginal;
      }
    }

    // ---- 相手へ:生理がはじまった
    if (ps.length) {
      const last = ps[ps.length - 1];
      const startedAgo = diffDays(last.start, today);
      const fresh = startedAgo >= 0 && startedAgo <= 2 && (!state.startNotified || state.startNotified < last.start);
      if (fresh) {
        const sharedSnap = await db.collection('shared').doc(u.id).get();
        const shared = sharedSnap.exists ? sharedSnap.data() : null;
        if (shared && shared.items && shared.items.startNotify) {
          const viewers = await db.collection('shared').doc(u.id).collection('viewers').get();
          const name = shared.ownerName || profile.name || 'お相手';
          for (const v of viewers.docs) sent += await send(v.id, `${name}さんの生理がはじまりました。`, 'started');
        }
        patch.startNotified = last.start;
      }
    }

    // ---- 病院の予約
    const appts = (await u.ref.collection('appointments').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
    const sentKeys = (state.apptSent || []).filter((k) => k.split('|')[1] >= addDays(today, -1));
    let changed = sentKeys.length !== (state.apptSent || []).length;
    for (const a of appts) {
      if (!a.date || a.date < today) continue;
      const left = diffDays(today, a.date);
      if (!(a.remind || []).includes(left)) continue;
      const key = `${a.id}|${a.date}|${left}`;
      if (sentKeys.includes(key)) continue;
      const when = left === 0 ? '今日' : left === 1 ? '明日' : `${left}日後(${md(a.date)})`;
      const place = a.place || '病院';
      sent += await send(u.id, `${when}${a.time ? ` ${a.time}から` : ''}、${place}の予約があります。${a.memo ? `(${a.memo})` : ''}`, `appt-${a.id}`);
      sentKeys.push(key);
      changed = true;
    }
    if (changed) patch.apptSent = sentKeys;
  }

  if (Object.keys(patch).length && !DRY_RUN) {
    await stateRef.set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
}

console.log(`${today} ${hm}:${sent}件送りました`);
