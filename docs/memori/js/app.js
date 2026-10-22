import { firebaseConfig, vapidKey } from '../../js/config.js';
import { addDays, diffDays, todayIn, toNum } from '../../js/cycle.js';
import { icon } from './icons.js';
import { GROUPS, ITEMS, QUAL, FIND, JUDGES, judgeLevel, customKey, filledItems, valueOf, toNumber } from './items.js';
import { round1, bmiOf, bmiLabel, sortEntries, rollingAvg, latest, niceRange } from './calc.js';
import { compressPhoto } from './photo.js';
import { appSwitch, VERSION } from '../../js/switch.js';
import { readSheets } from './ocr.js';

const $app = document.getElementById('app');
const WD = ['日', '月', '火', '水', '木', '金', '土'];

const S = {
  backend: null, loading: true, fatal: null, user: null, profile: null,
  weights: {}, checkups: [], dataReady: false, viewers: [], shared: null, sharedReady: false,
  today: todayIn(), tab: 'weight', range: '3m', metric: 'kg', view: null, modal: null,
  toast: null, busy: false, push: 'default', invite: null, inviteInfo: undefined, inviteLink: null,
  demoPartner: false, histMore: false, photos: {}, openGroups: new Set(['body']), compare: true,
  wantRecord: false, unsubs: [],
};

/* ---------- 道具 ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const wd = (s) => WD[new Date(s + 'T00:00:00Z').getUTCDay()];
const md = (s) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;
const mdj = (s) => `${Number(s.slice(5, 7))}月${Number(s.slice(8, 10))}日`;
const ymd = (s) => `${s.slice(0, 4)}/${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;
const f1 = (n) => (n == null ? '—' : (Math.round(n * 10) / 10).toFixed(1));
const signed = (n, digits = 1) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n).toFixed(digits);
const isPartner = () => S.demoPartner || (S.profile && S.profile.mode === 'partner' && S.profile.following);
const ownerName = () => (S.shared && S.shared.ownerName) || 'お相手';

function toast(text) {
  S.toast = text;
  render();
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { S.toast = null; render(); }, 2600);
}

async function run(fn, okText) {
  if (S.busy) return;
  S.busy = true;
  render();
  try {
    await fn();
    if (okText) toast(okText);
  } catch (e) {
    console.error(e);
    toast(e && e.message && /写真/.test(e.message) ? e.message : '保存できませんでした。通信を確認して、もう一度ためしてください。');
  } finally {
    S.busy = false;
    render();
  }
}

/** 画面に出すデータ(本人は自分の記録、相手は共有された分) */
function model() {
  if (!isPartner()) {
    return {
      editable: true,
      entries: sortEntries(S.weights),
      goal: S.profile.goal, height: S.profile.height,
      checkups: S.checkups,
      show: { weight: true, waist: true, goal: true, checkups: true },
    };
  }
  const d = (S.shared && S.shared.data) || {};
  const items = (S.shared && S.shared.items) || {};
  const map = {};
  (d.weights || []).forEach(([date, kg]) => { map[date] = { kg, waist: null }; });
  (d.waists || []).forEach(([date, w]) => { map[date] = { ...(map[date] || { kg: null }), waist: w }; });
  return {
    editable: false,
    entries: sortEntries(map),
    goal: d.goal ?? null, height: d.height ?? null,
    checkups: d.checkups || [],
    show: { weight: !!items.weight, waist: !!items.waist, goal: !!items.goal, checkups: !!items.checkups },
  };
}

const sortedCheckups = (list) => [...list].sort((a, b) => (a.date < b.date ? 1 : -1));

/* ---------- 起動 ---------- */
async function init() {
  if ('serviceWorker' in navigator) {
    // 通知とオフライン表示は「しずく」と同じしくみを使う(以前のめもり専用のものは外す)
    navigator.serviceWorker.getRegistrations()
      .then((regs) => Promise.all(regs.filter((r) => /\/memori\/$/.test(r.scope)).map((r) => r.unregister())))
      .catch(() => {})
      .finally(() => navigator.serviceWorker.register('../sw.js', { scope: '../' }).catch(() => {}));
  }
  const params = new URLSearchParams(location.search);
  const code = params.get('invite');
  if (code) sessionStorage.setItem('memori-invite', code);
  if (params.get('record')) S.wantRecord = true;
  if (code || params.get('record')) history.replaceState(null, '', location.pathname);
  S.invite = sessionStorage.getItem('memori-invite');

  render();
  try {
    if (firebaseConfig) {
      const { createFirebaseBackend } = await import('./store-firebase.js');
      S.backend = await createFirebaseBackend(firebaseConfig, vapidKey);
    } else {
      const { createDemoBackend } = await import('./store-demo.js');
      S.backend = createDemoBackend();
      S.invite = null;
    }
  } catch (e) {
    console.error(e);
    S.fatal = 'アプリを読みこめませんでした。インターネットにつながっているか確認して、開きなおしてください。';
    S.loading = false;
    render();
    return;
  }

  S.backend.onAuth(async (user) => {
    S.unsubs.forEach((u) => u && u());
    S.unsubs = [];
    S.user = user;
    S.dataReady = false;
    S.sharedReady = false;
    if (!user) { S.loading = false; render(); return; }
    try {
      S.profile = await S.backend.loadProfile();
      if (!S.profile.name && user.name) S.profile.name = user.name;
      if (S.invite) {
        try { S.inviteInfo = await S.backend.getInvite(S.invite); } catch { S.inviteInfo = null; }
      }
    } catch (e) {
      console.error(e);
      S.fatal = 'データを読みこめませんでした。通信を確認して、開きなおしてください。';
    }
    S.push = S.backend.pushState();
    startWatching();
    S.backend.refreshPush();
    S.loading = false;
    render();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const t = todayIn();
      if (t !== S.today) { S.today = t; render(); }
    }
  });
}

function startWatching() {
  const b = S.backend;
  S.unsubs.forEach((u) => u && u());
  S.unsubs = [];
  if (S.profile.mode === 'partner' && S.profile.following) {
    S.unsubs.push(b.watchShared(S.profile.following, (doc) => { S.shared = doc; S.sharedReady = true; render(); }));
    return;
  }
  S.unsubs.push(b.watchOwnData(({ weights, checkups }) => {
    S.weights = weights;
    S.checkups = checkups;
    S.dataReady = true;
    if (S.wantRecord) { S.wantRecord = false; S.tab = 'weight'; openEntry(S.today); }
    syncShared();
    render();
  }));
  S.unsubs.push(b.watchViewers((list) => { S.viewers = list; render(); }));
  if (b.isDemo) S.unsubs.push(b.watchShared('demo', (doc) => { S.shared = doc; S.sharedReady = true; render(); }));
}

let lastShared = '';
function syncShared() {
  clearTimeout(syncShared.t);
  syncShared.t = setTimeout(() => {
    if (!S.profile || S.profile.mode === 'partner' || !S.dataReady) return;
    const f = S.profile.share;
    const from = addDays(S.today, -400);
    const list = sortEntries(S.weights).filter((e) => e.date >= from);
    const data = {};
    if (f.weight) data.weights = list.filter((e) => e.kg != null).map((e) => [e.date, e.kg]);
    if (f.waist) data.waists = list.filter((e) => e.waist != null).map((e) => [e.date, e.waist]);
    if (f.goal) { data.goal = S.profile.goal ?? null; data.height = S.profile.height ?? null; }
    if (f.checkups) data.checkups = S.checkups.map(({ id, date, place, overall, values, custom }) => ({ id, date, place: place || '', overall: overall || '', values: values || {}, custom: custom || [] }));
    const obj = { ownerName: S.profile.name || '', items: { ...f }, data };
    const json = JSON.stringify(obj);
    if (json === lastShared) return;
    lastShared = json;
    S.backend.writeShared(obj).catch((e) => { console.error(e); lastShared = ''; });
  }, 700);
}

/* ---------- 描画 ---------- */
function render() {
  const active = document.activeElement;
  const keep = active && active.dataset && active.dataset.keep;
  const caret = keep && active.selectionStart;
  let body;
  if (S.fatal) body = centerMsg('読みこめませんでした', S.fatal);
  else if (S.loading) body = loadingScreen();
  else if (!S.user) body = loginScreen();
  else if (S.invite && S.inviteInfo !== undefined) body = inviteScreen();
  else if (S.view) body = `<div class="shell"><main class="screen page">${pageHTML()}</main></div>`;
  else body = shell(isPartner() ? partnerMain() : ownerMain(), isPartner() ? partnerTabs() : ownerTabs());

  $app.innerHTML = body + modalHTML() + (S.toast ? `<div class="toast" role="status">${esc(S.toast)}</div>` : '');
  if (keep) {
    const el = $app.querySelector(`[data-keep="${CSS.escape(keep)}"]`);
    if (el) { el.focus(); try { el.setSelectionRange(caret, caret); } catch { /* 数値欄など */ } }
  }
  bindCharts();
}

function shell(main, tabs) {
  return `<div class="shell">${S.backend && S.backend.isDemo ? '<p class="demo-band">デモモード:データはこの端末の中だけに保存されます</p>' : ''}<main class="screen">${appSwitch('body', '../')}${main}</main>${tabs}</div>`;
}
function loadingScreen() { return `<div class="center-screen"><div class="logo-rule pulse">${miniRule()}</div></div>`; }
function centerMsg(title, text, actions = '') {
  return `<div class="center-screen"><div class="logo-rule">${miniRule()}</div><h1 class="center-title">${esc(title)}</h1><p class="center-text">${esc(text)}</p>${actions}</div>`;
}
function miniRule() {
  const ticks = Array.from({ length: 11 }, (_, i) => `<path d="M${6 + i * 8} 30V${i % 5 === 0 ? 8 : 18}"/>`).join('');
  return `<svg viewBox="0 0 92 40" aria-hidden="true"><g stroke="var(--teal)" stroke-width="3" stroke-linecap="round">${ticks}</g><path d="M46 38l-5 -6h10z" fill="var(--apricot)"/></svg>`;
}
function loginScreen() {
  return `<div class="center-screen login">
    <div class="logo-rule big">${miniRule()}</div>
    <h1 class="wordmark">めもり</h1>
    <p class="center-text">体重と健康診断の記録を、自分のスマホに。</p>
    ${S.invite ? '<p class="note">招待リンクから開きました。ログインすると、共有された内容を見られます。</p>' : ''}
    <button class="btn primary wide" data-act="signin">${icon('person')}Googleでログイン</button>
    <p class="fine">「しずく」と同じGoogleアカウントで使えます。</p>
  </div>`;
}
function inviteScreen() {
  const i = S.inviteInfo;
  const close = '<button class="btn soft wide" data-act="invite-dismiss">とじる</button>';
  if (!i) return centerMsg('この招待リンクは使えません', 'リンクがまちがっているか、取り消されています。新しいリンクをもらってください。', close);
  if (i.mine) return centerMsg('自分の招待リンクです', 'このリンクは、見てほしい相手に送ってください。', close);
  if (i.expired) return centerMsg('招待リンクの期限が切れています', '招待リンクは24時間だけ使えます。新しいリンクをもらってください。', close);
  if (i.used) return centerMsg('この招待リンクはもう使われています', '招待リンクは1人だけ使えます。新しいリンクをもらってください。', close);
  const name = i.ownerName || 'お相手';
  return `<div class="center-screen"><div class="logo-rule">${miniRule()}</div>
    <h1 class="center-title">${esc(name)}さんの記録を見られるようにしますか?</h1>
    <p class="center-text">見られるのは、${esc(name)}さんが選んだ項目だけです。こちらから書きこむことはできません。</p>
    <button class="btn primary wide" data-act="invite-accept">見られるようにする</button>
    <button class="btn ghost wide" data-act="invite-dismiss">やめておく</button></div>`;
}

function tabsHTML(items) {
  return `<nav class="tabs" aria-label="画面のきりかえ">${items.map(([key, ic, label]) => `
    <button class="tab ${S.tab === key ? 'on' : ''}" data-act="tab" data-tab="${key}" ${S.tab === key ? 'aria-current="page"' : ''}>
      <span class="tab-ic">${icon(ic)}</span><span class="tab-label">${label}</span></button>`).join('')}</nav>`;
}
const ownerTabs = () => tabsHTML([['weight', 'scale', '体重'], ['checkups', 'sheet', '健診'], ['share', 'share', '共有'], ['settings', 'sliders', '設定']]);
function partnerTabs() {
  const m = S.sharedReady ? model() : null;
  const t = [['weight', 'scale', '体重']];
  if (m && m.show.checkups) t.push(['checkups', 'sheet', '健診']);
  t.push(['settings', 'sliders', '設定']);
  return tabsHTML(t);
}

function ownerMain() {
  if (!S.dataReady) return loadingScreen();
  if (S.tab === 'checkups') return checkupsScreen(model());
  if (S.tab === 'share') return shareScreen();
  if (S.tab === 'settings') return settingsScreen();
  S.tab = 'weight';
  return weightScreen(model());
}
function partnerMain() {
  if (S.tab === 'settings') return partnerSettings();
  if (!S.sharedReady) return loadingScreen();
  if (!S.shared) return `<div class="empty">${miniRule()}<p>まだ共有された内容がありません。お相手がアプリを開くと、ここに表示されます。</p></div>`;
  const m = model();
  if (S.tab === 'checkups' && m.show.checkups) return checkupsScreen(m);
  S.tab = 'weight';
  return weightScreen(m);
}

/* ---------- 目盛り ---------- */
const PX = 9; // 0.1kg あたりの幅
function rulerSVG(value, goal, { W = 340 } = {}) {
  const H = 78;
  const cx = W / 2;
  const span = cx / PX;
  const center = Math.round(value * 10);
  const out = [];
  for (let t = Math.floor(center - span) - 1; t <= Math.ceil(center + span) + 1; t++) {
    const x = cx + (t - value * 10) * PX;
    if (x < -2 || x > W + 2) continue;
    const major = t % 10 === 0;
    const mid = t % 5 === 0;
    const h = major ? 26 : mid ? 18 : 10;
    out.push(`<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="14" y2="${14 + h}" class="${major ? 'tk-major' : mid ? 'tk-mid' : 'tk'}"/>`);
    if (major) out.push(`<text x="${x.toFixed(1)}" y="${14 + 26 + 18}" class="tk-num">${t / 10}</text>`);
  }
  let g = '';
  if (goal) {
    const gx = cx + (goal - value) * 10 * PX;
    if (gx >= 10 && gx <= W - 10) {
      g = `<g class="goal-flag" transform="translate(${gx.toFixed(1)} 0)"><line y1="6" y2="40"/><path d="M0 6h11l-3 4 3 4H0z"/></g>`;
    } else {
      const left = gx < 10;
      g = `<g class="goal-edge"><path d="${left ? 'M6 26l7-6v12z' : `M${W - 6} 26l-7-6v12z`}"/></g>`;
    }
  }
  return `<svg class="ruler-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <defs><linearGradient id="fade" x1="0" x2="1"><stop offset="0" stop-color="var(--card)" stop-opacity="1"/><stop offset=".14" stop-color="var(--card)" stop-opacity="0"/><stop offset=".86" stop-color="var(--card)" stop-opacity="0"/><stop offset="1" stop-color="var(--card)" stop-opacity="1"/></linearGradient></defs>
    <g>${out.join('')}</g>${g}
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#fade)"/>
    <g class="needle"><path d="M${cx - 7} 3h14l-7 9z"/><line x1="${cx}" x2="${cx}" y1="10" y2="46"/></g>
  </svg>`;
}

/* ---------- 体重 ---------- */
function weightScreen(m) {
  const who = m.editable ? '' : `<p class="hero-who">${esc(ownerName())}さん</p>`;
  if (!m.editable && !m.show.weight && !m.show.waist && !m.show.goal) {
    return `<div class="empty">${miniRule()}<p>体重は共有されていません。</p></div>`;
  }
  const e = m.entries;
  const last = latest(e, 'kg');
  const avg = rollingAvg(e, 'kg');
  const lastAvg = avg.length ? avg[avg.length - 1] : null;
  const bmi = last && m.height ? bmiOf(last.kg, m.height) : null;
  const todayRec = S.weights[S.today];

  let hero;
  if (last && (m.editable || m.show.weight)) {
    const when = last.date === S.today ? '今日' : `${mdj(last.date)}(${wd(last.date)})`;
    const left = m.goal ? round1(last.kg - m.goal) : null;
    const goalText = m.goal == null ? '' : Math.abs(left) < 0.05 ? '目標の体重です' : left > 0 ? `目標まであと ${f1(left)}kg` : `目標より ${f1(-left)}kg 少ない`;
    hero = `<section class="hero">
      ${who}<p class="hero-when">${esc(when)}の体重</p>
      <p class="hero-num">${f1(last.kg)}<small>kg</small></p>
      <div class="hero-meta">
        ${lastAvg ? `<span>7日平均 <b>${f1(lastAvg.v)}</b>kg</span>` : ''}
        ${bmi ? `<span>BMI <b>${bmi.toFixed(1)}</b> ${bmiLabel(bmi)}</span>` : ''}
      </div>
      <div class="ruler" role="img" aria-label="目盛り:${f1(last.kg)}kg${m.goal ? `、目標${f1(m.goal)}kg` : ''}">${rulerSVG(last.kg, m.goal)}</div>
      ${goalText ? `<p class="goal-line">${icon('flag')}${esc(goalText)}<span class="muted">(目標 ${f1(m.goal)}kg)</span></p>` : ''}
      ${m.editable ? `<button class="btn primary wide" data-act="entry" data-date="${S.today}">${icon(todayRec ? 'edit' : 'plus')}${todayRec ? '今日の記録を直す' : '今日の体重を記録'}</button>` : ''}
    </section>`;
  } else if (m.editable) {
    hero = `<section class="hero empty-hero">
      <div class="ruler">${rulerSVG(50, null)}</div>
      <p class="hero-when">まだ記録がありません</p>
      <p class="note">体重計にのったら、ここから記録します。目盛りを左右に動かして入力できます。</p>
      <button class="btn primary wide" data-act="entry" data-date="${S.today}">${icon('plus')}今日の体重を記録</button>
    </section>`;
  } else {
    hero = `<section class="hero">${who}<p class="hero-when">体重の記録はまだありません</p>
      ${m.goal ? `<p class="goal-line">${icon('flag')}目標 ${f1(m.goal)}kg</p>` : ''}</section>`;
  }

  const hasWaist = e.some((x) => x.waist != null) && (m.editable || m.show.waist);
  const showKg = m.editable || m.show.weight;
  if (!showKg) S.metric = 'waist';
  if (!hasWaist) S.metric = 'kg';
  const chart = (showKg || hasWaist) && e.length ? chartCard(m, hasWaist, showKg) : '';
  return `${hero}${chart}${historyHTML(m)}`;
}

const RANGES = [['1m', '1か月', 31], ['3m', '3か月', 92], ['1y', '1年', 366], ['all', 'すべて', null]];

function chartCard(m, hasWaist, showKg) {
  const field = S.metric;
  const unit = 'kg' === field ? 'kg' : 'cm';
  const range = RANGES.find((r) => r[0] === S.range) || RANGES[1];
  const all = m.entries.filter((x) => x[field] != null);
  const first = all.length ? all[0].date : S.today;
  const from = range[2] ? addDays(S.today, -(range[2] - 1)) : first;
  const pts = all.filter((x) => x.date >= from).map((x) => ({ date: x.date, v: x[field] }));
  const avg = field === 'kg' ? rollingAvg(m.entries, 'kg').filter((x) => x.date >= from) : [];
  const goal = field === 'kg' && (m.editable || m.show.goal) ? m.goal : null;
  CHARTS.main = { pts, avg, goal, from, to: S.today, unit, field };
  const label = field === 'kg' ? '体重' : 'ウエスト';
  const segs = RANGES.map(([k, l]) => `<button class="seg-btn ${S.range === k ? 'on' : ''}" role="radio" aria-checked="${S.range === k}" data-act="range" data-v="${k}">${l}</button>`).join('');
  const metricSeg = hasWaist && showKg ? `<div class="seg small" role="radiogroup" aria-label="グラフの項目">
      <button class="seg-btn ${field === 'kg' ? 'on' : ''}" role="radio" aria-checked="${field === 'kg'}" data-act="metric" data-v="kg">体重</button>
      <button class="seg-btn ${field === 'waist' ? 'on' : ''}" role="radio" aria-checked="${field === 'waist'}" data-act="metric" data-v="waist">ウエスト</button></div>` : `<h2 class="card-title">${label}の変化</h2>`;
  const legend = pts.length ? `<div class="legend">
      <span><i class="lg-dot"></i>${field === 'kg' ? '毎日の記録' : '記録'}</span>
      ${avg.length ? '<span><i class="lg-line"></i>7日平均</span>' : ''}
      ${goal ? '<span><i class="lg-goal"></i>目標</span>' : ''}</div>` : '';
  return `<section class="card chart-card">
    <div class="card-head">${metricSeg}</div>
    <div class="seg" role="radiogroup" aria-label="期間">${segs}</div>
    ${pts.length ? `<div class="chart" data-chart="main">
        <div class="chart-tip" aria-hidden="true"></div>
        ${lineChartSVG(CHARTS.main)}
      </div>${legend}` : `<p class="note pad">この期間の記録はありません。</p>`}
  </section>`;
}

/* 折れ線グラフ(1系列+7日平均+目標) */
const CHARTS = {};
const CW = 340; const CH = 200; const ML = 34; const MR = 10; const MT = 12; const MB = 24;
function chartScales(c) {
  const vals = c.pts.map((p) => p.v).concat(c.avg.map((p) => p.v));
  let min = Math.min(...vals); let max = Math.max(...vals);
  if (c.goal != null && c.goal > min - 4 && c.goal < max + 4) { min = Math.min(min, c.goal); max = Math.max(max, c.goal); }
  const pad = Math.max((max - min) * 0.08, 0.3);
  const nr = niceRange(min - pad, max + pad, 4);
  const d0 = toNum(c.from); const d1 = Math.max(toNum(c.to), d0 + 1);
  const x = (date) => ML + ((toNum(date) - d0) / (d1 - d0)) * (CW - ML - MR);
  const y = (v) => MT + (1 - (v - nr.lo) / (nr.hi - nr.lo)) * (CH - MT - MB);
  return { x, y, nr, d0, d1 };
}
function xTicks(c, sc) {
  const days = sc.d1 - sc.d0;
  const out = [];
  if (days <= 40) {
    for (let d = c.to; d >= c.from; d = addDays(d, -7)) out.push([d, md(d)]);
  } else {
    const step = days <= 120 ? 1 : days <= 400 ? 2 : 6;
    let [yy, mm] = [Number(c.to.slice(0, 4)), Number(c.to.slice(5, 7))];
    for (let i = 0; i < 40; i++) {
      const d = `${yy}-${String(mm).padStart(2, '0')}-01`;
      if (d < c.from) break;
      if (((yy * 12 + mm) % step) === 0) out.push([d, mm === 1 || step >= 6 ? `${String(yy).slice(2)}年${mm}月` : `${mm}月`]);
      mm -= 1; if (mm === 0) { mm = 12; yy -= 1; }
    }
  }
  return out;
}
function lineChartSVG(c) {
  const sc = chartScales(c);
  const grid = sc.nr.vals.map((v) => `<line class="grid" x1="${ML}" x2="${CW - MR}" y1="${sc.y(v).toFixed(1)}" y2="${sc.y(v).toFixed(1)}"/><text class="ax" x="${ML - 6}" y="${(sc.y(v) + 4).toFixed(1)}" text-anchor="end">${Number.isInteger(v) ? v : v.toFixed(1)}</text>`).join('');
  const xt = xTicks(c, sc).map(([d, l]) => `<text class="ax" x="${sc.x(d).toFixed(1)}" y="${CH - 6}" text-anchor="middle">${l}</text>`).join('');
  const r = c.pts.length > 120 ? 1.8 : 2.8;
  const dots = c.pts.map((p) => `<circle class="pt" cx="${sc.x(p.date).toFixed(1)}" cy="${sc.y(p.v).toFixed(1)}" r="${r}"/>`).join('');
  const line = c.avg.length > 1 ? `<path class="avg" d="${c.avg.map((p, i) => `${i ? 'L' : 'M'}${sc.x(p.date).toFixed(1)} ${sc.y(p.v).toFixed(1)}`).join('')}"/>` : '';
  const goal = c.goal != null && c.goal >= sc.nr.lo && c.goal <= sc.nr.hi
    ? `<line class="goal" x1="${ML}" x2="${CW - MR}" y1="${sc.y(c.goal).toFixed(1)}" y2="${sc.y(c.goal).toFixed(1)}"/>` : '';
  const first = c.pts[0]; const lastP = c.pts[c.pts.length - 1];
  const aria = `${md(first.date)}から${md(lastP.date)}まで、${f1(first.v)}${c.unit}から${f1(lastP.v)}${c.unit}`;
  return `<svg class="chart-svg" viewBox="0 0 ${CW} ${CH}" role="img" aria-label="${aria}">
    ${grid}${xt}${goal}${dots}${line}
    <g class="cross" style="display:none"><line class="cross-line" y1="${MT}" y2="${CH - MB}"/><circle class="cross-dot" r="5"/></g>
    <rect class="hit" x="${ML}" y="0" width="${CW - ML - MR}" height="${CH}" fill="transparent"/>
  </svg>`;
}

function bindCharts() {
  $app.querySelectorAll('[data-chart]').forEach((el) => {
    const c = CHARTS[el.dataset.chart];
    if (!c || !c.pts.length) return;
    const svg = el.querySelector('svg');
    const tip = el.querySelector('.chart-tip');
    const cross = svg.querySelector('.cross');
    const sc = chartScales(c);
    const avgMap = Object.fromEntries(c.avg.map((p) => [p.date, p.v]));
    const show = (ev) => {
      const rect = svg.getBoundingClientRect();
      const vx = ((ev.clientX - rect.left) / rect.width) * CW;
      let best = null; let bd = Infinity;
      for (const p of c.pts) { const d = Math.abs(sc.x(p.date) - vx); if (d < bd) { bd = d; best = p; } }
      if (!best) return;
      const px = sc.x(best.date); const py = sc.y(best.v);
      cross.style.display = '';
      cross.querySelector('.cross-line').setAttribute('x1', px); cross.querySelector('.cross-line').setAttribute('x2', px);
      cross.querySelector('.cross-dot').setAttribute('cx', px); cross.querySelector('.cross-dot').setAttribute('cy', py);
      const a = avgMap[best.date];
      tip.innerHTML = `<b>${md(best.date)}(${wd(best.date)})</b> ${f1(best.v)}${c.unit}${a != null ? `<span>7日平均 ${f1(a)}</span>` : ''}`;
      tip.style.display = 'block';
      const left = (px / CW) * rect.width;
      tip.style.left = `${Math.min(Math.max(left, 70), rect.width - 70)}px`;
    };
    const hide = () => { cross.style.display = 'none'; tip.style.display = 'none'; };
    svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointermove', show);
    svg.addEventListener('pointerleave', hide);
  });
}

function historyHTML(m) {
  const list = [...m.entries].reverse().filter((x) => (m.editable || m.show.weight ? x.kg != null : false) || (x.waist != null && (m.editable || m.show.waist)));
  if (!list.length) return '';
  const shown = S.histMore ? list.slice(0, 120) : list.slice(0, 10);
  const rows = shown.map((x, i) => {
    const prev = list[i + 1];
    const diff = x.kg != null && prev && prev.kg != null ? round1(x.kg - prev.kg) : null;
    const inner = `<span class="h-date">${md(x.date)}<small>${wd(x.date)}</small></span>
      <span class="h-kg">${x.kg != null && (m.editable || m.show.weight) ? `${f1(x.kg)}<small>kg</small>` : '<span class="muted">—</span>'}</span>
      <span class="h-diff">${diff != null && diff !== 0 ? signed(diff) : ''}</span>
      <span class="h-waist">${x.waist != null && (m.editable || m.show.waist) ? `ウエスト ${f1(x.waist)}` : ''}</span>`;
    return m.editable
      ? `<li><button class="h-row" data-act="entry" data-date="${x.date}" aria-label="${mdj(x.date)}の記録を直す">${inner}${icon('chevR')}</button></li>`
      : `<li><div class="h-row">${inner}</div></li>`;
  }).join('');
  return `<section class="history"><h2 class="sub-title">記録</h2><ul>${rows}</ul>
    ${list.length > 10 ? `<button class="btn ghost small" data-act="hist-more">${S.histMore ? 'とじる' : 'もっと見る'}</button>` : ''}
    ${m.editable ? `<button class="btn soft wide" data-act="entry" data-date="">${icon('plus')}ほかの日の記録を追加</button>` : ''}</section>`;
}

/* ---------- 健診 ---------- */
const judge = (j) => (j ? `<span class="jd j${Math.min(judgeLevel(j), 3)}">${esc(j)}</span>` : '');

function checkupsScreen(m) {
  const list = sortedCheckups(m.checkups);
  const cards = list.map((ck) => {
    const items = filledItems(ck);
    const attention = items.filter((it) => judgeLevel(it.val.j) >= 2).length;
    return `<li><button class="ck-card" data-act="ck-open" data-id="${esc(ck.id)}">
      <span class="ck-year">${ck.date.slice(0, 4)}<small>${md(ck.date)}</small></span>
      <span class="ck-body"><span class="ck-place">${esc(ck.place || '健康診断')}</span>
      <span class="ck-meta">${items.length}項目${attention ? `/判定C以上 ${attention}項目` : ''}</span></span>
      ${ck.overall ? `<span class="ck-overall"><small>総合</small>${judge(ck.overall)}</span>` : ''}
      ${icon('chevR')}</button></li>`;
  }).join('');
  return `<header class="topbar"><h1 class="page-title">健康診断</h1></header>
    ${m.editable ? '' : `<p class="lead">${esc(ownerName())}さんの健康診断の結果です。</p>`}
    ${list.length ? `<ul class="ck-list">${cards}</ul>` : `<div class="empty">${icon('sheet')}<p>${m.editable ? 'まだ結果がありません。結果用紙を見ながら入力するか、写真だけ先に保存しておけます。' : '結果はまだありません。'}</p></div>`}
    ${m.editable ? `<button class="btn primary wide" data-act="ck-new">${icon('plus')}健康診断の結果を追加</button>` : ''}`;
}

function pageHTML() {
  const v = S.view;
  if (v.kind === 'ck') return checkupDetail(v.id);
  if (v.kind === 'ck-edit') return checkupEdit(v.draft);
  return '';
}

function checkupDetail(id) {
  const m = model();
  const list = sortedCheckups(m.checkups);
  const idx = list.findIndex((c) => c.id === id);
  const ck = list[idx];
  if (!ck) { S.view = null; return ''; }
  const prev = list[idx + 1] || null;
  const items = filledItems(ck);
  const keys = new Set(items.map((i) => i.key));
  const prevOnly = prev ? filledItems(prev).filter((i) => !keys.has(i.key)) : [];
  const comp = S.compare && prev;
  const groups = [];
  for (const it of items.concat(prevOnly)) {
    let g = groups.find((x) => x.key === it.group);
    if (!g) { g = { key: it.group, label: it.groupLabel, rows: [] }; groups.push(g); }
    g.rows.push(it);
  }
  const cell = (val, it) => {
    if (!val || (val.v === '' && !val.j)) return '<span class="muted">—</span>';
    return `<span class="val">${esc(val.v)}${it.unit && val.v !== '' && it.kind === 'num' ? `<small>${esc(it.unit)}</small>` : ''}</span>${judge(val.j)}`;
  };
  const body = groups.map((g) => `<h3 class="grp-title">${esc(g.label)}</h3>
    <div class="rows ${comp ? 'with-prev' : ''}">${g.rows.map((it) => {
      const cur = valueOf(ck, it.key);
      const pv = prev ? valueOf(prev, it.key) : null;
      let diff = '';
      if (comp && it.kind === 'num') {
        const a = toNumber(cur && cur.v); const b = toNumber(pv && pv.v);
        if (a != null && b != null) { const d = a - b; const dg = Math.max(decimals(cur.v), decimals(pv.v)); diff = d === 0 ? '±0' : signed(d, dg); }
      }
      return `<button class="row" data-act="trend" data-key="${esc(it.key)}">
        <span class="row-label">${esc(it.label)}</span>
        <span class="row-cur">${cell(cur, it)}</span>
        ${comp ? `<span class="row-prev">${cell(pv, it)}</span><span class="row-diff">${diff}</span>` : ''}
      </button>`;
    }).join('')}</div>`).join('');
  const photos = m.editable ? photoStrip(ck.id) : '';
  return `<header class="topbar"><button class="icon-btn" data-act="back" aria-label="もどる">${icon('chevL')}</button>
      ${m.editable ? `<button class="btn ghost small" data-act="ck-edit" data-id="${esc(ck.id)}">${icon('edit')}編集</button>` : ''}</header>
    <section class="ck-head">
      <p class="ck-head-date">${ymd(ck.date)}(${wd(ck.date)})</p>
      <h1 class="ck-head-place">${esc(ck.place || '健康診断')}</h1>
      ${ck.overall ? `<p class="ck-head-overall">総合判定 ${judge(ck.overall)}</p>` : ''}
    </section>
    ${photos}
    ${prev ? `<button class="switch-row" data-act="compare" role="switch" aria-checked="${!!S.compare}">
        <span>前回(${ymd(prev.date)})とくらべる</span><span class="switch ${S.compare ? 'on' : ''}"><span class="knob"></span></span></button>` : ''}
    ${comp ? '<div class="rows-head"><span></span><span>今回</span><span>前回</span><span>差</span></div>' : ''}
    ${body || '<p class="note">入力された項目がありません。</p>'}
    <p class="fine">項目をタップすると、これまでの推移を見られます。判定は結果用紙のものです。</p>`;
}
const decimals = (s) => { const m = String(s).match(/\.(\d+)/); return m ? m[1].length : 0; };

function photoStrip(ckId) {
  const ph = S.photos[ckId];
  if (ph === undefined) loadPhotos(ckId);
  if (ph == null) return '<div class="photos"><p class="note">写真を読みこみ中…</p></div>';
  if (!ph.length) return '';
  return `<div class="photos">${ph.map((p, i) => `<button class="thumb" data-act="photo-view" data-ck="${esc(ckId)}" data-i="${i}" aria-label="結果用紙の写真 ${i + 1}枚目"><img src="${p.data}" alt=""></button>`).join('')}</div>`;
}
async function loadPhotos(ckId) {
  S.photos[ckId] = null;
  try { S.photos[ckId] = await S.backend.loadPhotos(ckId); } catch { S.photos[ckId] = []; }
  render();
}

/* 入力フォーム */
function blankDraft() {
  return { id: null, date: S.today, place: '', overall: '', values: {}, custom: [], photos: [], removed: [] };
}
function checkupEdit(d) {
  const groups = GROUPS.map((g) => {
    const open = S.openGroups.has(g.key);
    const count = g.items.filter((it) => { const v = d.values[it.key]; return v && (v.v !== '' || v.j); }).length;
    const rows = open ? g.items.map((it) => itemRow(it, d.values[it.key] || { v: '', j: '' })).join('') : '';
    return `<section class="grp ${open ? 'open' : ''}">
      <button class="grp-toggle" data-act="grp" data-g="${g.key}" aria-expanded="${open}">
        <span>${esc(g.label)}</span>${count ? `<span class="grp-count">${count}</span>` : ''}${icon('chevD')}</button>
      ${open ? `<div class="grp-body">${rows}</div>` : ''}
    </section>`;
  }).join('');
  const custom = d.custom.map((c, i) => `<div class="item custom">
      <div class="custom-fields">
        <input class="field" data-keep="cn${i}" data-cust="${i}" data-f="name" placeholder="項目名" value="${esc(c.name)}" maxlength="30">
        <input class="field num" data-keep="cv${i}" data-cust="${i}" data-f="v" placeholder="値" inputmode="decimal" value="${esc(c.v)}">
        <input class="field unit" data-keep="cu${i}" data-cust="${i}" data-f="unit" placeholder="単位" value="${esc(c.unit)}" maxlength="12">
      </div>
      <button class="jbtn ${c.j ? 'set' : ''}" data-act="judge" data-key="cust:${i}" aria-label="判定">${c.j ? judge(c.j) : '判定'}</button>
      <button class="icon-btn" data-act="cust-del" data-i="${i}" aria-label="この項目を消す">${icon('trash')}</button>
    </div>`).join('');
  const photos = d.photos.map((p, i) => `<div class="thumb-wrap"><img src="${p.data}" alt="結果用紙の写真 ${i + 1}枚目">
      <button class="thumb-del" data-act="photo-del" data-i="${i}" aria-label="この写真を消す">${icon('close')}</button></div>`).join('');
  return `<header class="topbar"><button class="icon-btn" data-act="edit-cancel" aria-label="やめる">${icon('close')}</button>
      <h1 class="page-title small">${d.id ? '結果を編集' : '結果を追加'}</h1><span></span></header>
    <div class="two">
      <div><label class="field-label" for="ck-date">受けた日</label><input id="ck-date" class="field" type="date" data-ck="date" value="${esc(d.date)}" max="${S.today}"></div>
      <div><p class="field-label">総合判定</p><button class="jbtn wide ${d.overall ? 'set' : ''}" data-act="judge" data-key="overall">${d.overall ? judge(d.overall) : 'えらぶ'}</button></div>
    </div>
    <label class="field-label" for="ck-place">健診を受けたところ</label>
    <input id="ck-place" class="field" data-keep="place" data-ck="place" value="${esc(d.place)}" maxlength="40" placeholder="例:みなと健診センター">

    <h2 class="sub-title">結果用紙の写真</h2>
    <div class="photo-edit">${photos}
      <label class="add-photo">${icon('camera')}<span>写真を追加</span><input type="file" accept="image/*" data-photo hidden></label></div>
    ${d.photos.length ? `<button class="btn soft wide ocr-btn" data-act="ocr">${icon('scan')}写真から結果を読み取る</button>` : ''}
    <p class="fine">写真は自分だけが見られます(共有されません)。読み取りもスマホの中だけで行います。用紙がまっすぐ・明るく写っていると、読み取りやすくなります。</p>

    <h2 class="sub-title">検査の結果</h2>
    <p class="fine tight">結果用紙にある項目だけ入れれば大丈夫です。判定(A〜F)はボタンからえらびます。</p>
    ${groups}
    <section class="grp open">
      <div class="grp-toggle static"><span>その他の項目</span></div>
      <div class="grp-body">${custom}<button class="btn ghost small" data-act="cust-add">${icon('plus')}項目を追加</button></div>
    </section>
    ${d.id ? `<button class="btn danger-ghost wide" data-act="ck-del">${icon('trash')}この健診の結果を消す</button>` : ''}
    <div class="save-bar"><button class="btn primary wide" data-act="ck-save" ${S.busy ? 'disabled' : ''}>${S.busy ? '保存中…' : '保存する'}</button></div>`;
}

function itemRow(it, val) {
  let input;
  if (it.kind === 'qual' || it.kind === 'find') {
    const opts = it.kind === 'qual' ? QUAL : FIND;
    input = `<div class="chips">${opts.map((o) => `<button class="chip ${val.v === o ? 'on' : ''}" data-act="pick-val" data-key="${it.key}" data-v="${esc(o)}" aria-pressed="${val.v === o}">${esc(o)}</button>`).join('')}</div>`;
  } else if (it.kind === 'text') {
    input = `<input class="field" data-keep="v-${it.key}" data-val="${it.key}" value="${esc(val.v)}" placeholder="例:異常なし" maxlength="60">`;
  } else {
    input = `<div class="num-wrap"><input class="field num" data-keep="v-${it.key}" data-val="${it.key}" inputmode="decimal" value="${esc(val.v)}" aria-label="${esc(it.label)}">${it.unit ? `<span class="unit-label">${esc(it.unit)}</span>` : ''}</div>`;
  }
  return `<div class="item ${it.kind}">
    <span class="item-label">${esc(it.label)}</span>
    ${input}
    <button class="jbtn ${val.j ? 'set' : ''}" data-act="judge" data-key="${it.key}" aria-label="${esc(it.label)}の判定">${val.j ? judge(val.j) : '判定'}</button>
  </div>`;
}

/* ---------- 共有 ---------- */
const SHARE_ITEMS = [
  ['weight', '体重の記録'],
  ['waist', 'ウエストの記録'],
  ['goal', '目標体重とBMI'],
  ['checkups', '健康診断の結果(数値と判定)'],
];
function shareScreen() {
  const f = S.profile.share;
  const toggles = SHARE_ITEMS.map(([k, l]) => `<button class="switch-row" data-act="share-toggle" data-key="${k}" role="switch" aria-checked="${!!f[k]}">
      <span>${l}</span><span class="switch ${f[k] ? 'on' : ''}"><span class="knob"></span></span></button>`).join('');
  const viewers = S.viewers.length
    ? S.viewers.map((v) => `<li class="viewer"><span class="avatar">${icon('person')}</span><span class="viewer-name">${esc(v.name || '名前なし')}</span>
        <button class="btn ghost small" data-act="remove-viewer" data-uid="${esc(v.uid)}">解除</button></li>`).join('')
    : '<li class="note">まだだれもいません。</li>';
  const link = S.inviteLink ? `<div class="invite-box"><p class="invite-url">${esc(S.inviteLink)}</p>
      <div class="actions row"><button class="btn soft" data-act="copy-invite">${icon('link')}コピー</button>
      <button class="btn primary" data-act="send-invite">${icon('send')}送る</button></div>
      <p class="fine">24時間だけ有効で、1人だけ使えます。</p></div>` : '';
  return `<header class="topbar"><h1 class="page-title">共有</h1></header>
    <p class="lead">招待した人だけが、ここで選んだ項目を見られます。相手は見るだけで、書きこみはできません。</p>
    <div class="switch-list">${toggles}</div>
    <p class="fine">結果用紙の写真は共有されません。「しずく」の共有とは別に設定します。</p>
    <h2 class="sub-title">見ている人</h2>
    <ul class="viewers">${viewers}</ul>
    <button class="btn primary wide" data-act="invite">${icon('plus')}招待リンクをつくる</button>${link}
    ${S.backend.isDemo ? '<p class="fine">デモモードでは招待リンクは使えません。「設定」から相手の画面を見てみることができます。</p>' : ''}`;
}

/* ---------- 設定 ---------- */
function pushBlock() {
  const p = S.push;
  let text; let btn = '';
  if (p === 'demo') text = 'デモモードでは通知は届きません。';
  else if (p === 'granted') text = 'この端末で通知を受け取ります。';
  else if (p === 'denied') text = '通知がブロックされています。Chromeのアドレスバー左のマークから、通知を「許可」にしてください。';
  else if (p === 'unsupported') text = 'このままでは通知を受け取れません。ホーム画面に追加したアプリから開いてください。';
  else { text = 'まだ通知はオフです。'; btn = `<button class="btn primary" data-act="push">${icon('bell')}通知をオンにする</button>`; }
  return `<div class="group"><h2 class="group-title">この端末の通知</h2><p class="group-text">${text}</p>${btn}</div>`;
}
function settingsScreen() {
  const p = S.profile;
  const r = p.remind;
  return `<header class="topbar"><h1 class="page-title">設定</h1></header>
    <div class="group">
      <label class="group-title" for="name">表示する名前</label>
      <p class="group-text">共有した相手の画面に出ます。</p>
      <input id="name" class="field" data-keep="name" data-prof="name" maxlength="20" value="${esc(p.name)}">
    </div>
    <div class="group two">
      <div><label class="field-label" for="height">身長</label>
        <div class="num-wrap"><input id="height" class="field num" data-keep="height" data-prof="height" inputmode="decimal" value="${p.height ?? ''}"><span class="unit-label">cm</span></div></div>
      <div><label class="field-label" for="goal">目標体重</label>
        <div class="num-wrap"><input id="goal" class="field num" data-keep="goal" data-prof="goal" inputmode="decimal" value="${p.goal ?? ''}"><span class="unit-label">kg</span></div></div>
    </div>
    <p class="fine">身長はBMIの計算に使います。目標体重は空欄でもかまいません。</p>
    <div class="group">
      <button class="switch-row bare" data-act="remind-toggle" role="switch" aria-checked="${r.on}">
        <span class="group-title">体重をはかる通知</span><span class="switch ${r.on ? 'on' : ''}"><span class="knob"></span></span></button>
      ${r.on ? `<label class="field-label" for="rtime">毎日の時刻</label>
        <input id="rtime" class="field time" type="time" data-remind="time" value="${esc(r.time)}">
        <button class="switch-row bare sub" data-act="remind-skip" role="switch" aria-checked="${!!r.skipIfRecorded}">
          <span>その日すでに記録していたら送らない</span><span class="switch ${r.skipIfRecorded ? 'on' : ''}"><span class="knob"></span></span></button>
        <p class="fine">通知は数分〜十数分おくれて届くことがあります。</p>` : ''}
    </div>
    ${pushBlock()}
    ${S.backend.isDemo ? `<div class="group"><h2 class="group-title">デモ</h2>
      <div class="actions"><button class="btn soft" data-act="demo-partner">${icon('swap')}相手の画面を見てみる</button>
      <button class="btn ghost" data-act="demo-reset">サンプルの記録にもどす</button></div></div>` : ''}
    <div class="group"><h2 class="group-title">アカウント</h2><p class="group-text">${esc(S.user.email || 'デモ')}</p>
      <button class="btn ghost" data-act="signout">${icon('door')}ログアウト</button></div>
    <p class="fine">アプリの版:${VERSION}<br>数値や判定について気になることがあれば、健診を受けたところや、かかりつけの医療機関に相談してください。</p>`;
}
function partnerSettings() {
  return `<header class="topbar"><h1 class="page-title">設定</h1></header>
    <div class="group"><h2 class="group-title">共有</h2><p class="group-text">${esc(ownerName())}さんの記録を見ています。</p>
      ${S.demoPartner ? `<button class="btn soft" data-act="demo-back">${icon('swap')}もとの画面にもどる</button>` : '<button class="btn ghost" data-act="leave">見るのをやめる</button>'}</div>
    ${S.demoPartner ? '' : `<div class="group"><h2 class="group-title">アカウント</h2><p class="group-text">${esc(S.user.email)}</p>
      <button class="btn ghost" data-act="signout">${icon('door')}ログアウト</button></div>`}`;
}

/* ---------- 重ねて出す画面 ---------- */
function modalHTML() {
  const m = S.modal;
  if (!m) return '';
  const head = (title) => `<div class="sheet-head"><h2 id="mt" class="sheet-title">${title}</h2><button class="icon-btn" data-act="modal-close" aria-label="とじる">${icon('close')}</button></div>`;
  const wrap = (inner, cls = '') => `<div class="scrim" data-act="modal-close"></div><div class="sheet ${cls}" role="dialog" aria-modal="true" aria-labelledby="mt">${inner}</div>`;

  if (m.kind === 'confirm') {
    return wrap(`<h2 id="mt" class="sheet-title">${esc(m.title)}</h2><p class="sheet-text">${esc(m.text)}</p>
      <div class="actions"><button class="btn danger" data-act="modal-ok">${esc(m.ok)}</button><button class="btn ghost" data-act="modal-close">やめる</button></div>`);
  }
  if (m.kind === 'entry') {
    const has = S.weights[m.date];
    return wrap(`${head(m.dateEditable ? '体重を記録' : `${mdj(m.date)}(${wd(m.date)})の記録`)}
      ${m.dateEditable ? `<label class="field-label" for="e-date">日付</label><input id="e-date" class="field" type="date" data-entry="date" value="${m.date}" max="${S.today}">` : ''}
      <div class="ruler big" data-ruler>${rulerSVG(m.kg ?? 50, S.profile.goal)}</div>
      <p class="ruler-hint">目盛りを左右に動かすか、数字を入れてください</p>
      <div class="kg-row">
        <button class="round-btn" data-act="kg-step" data-v="-1" aria-label="0.1kg へらす">${icon('minus')}</button>
        <div class="num-wrap big"><input class="field num big" data-keep="kg" data-entry="kg" inputmode="decimal" value="${m.kg != null ? m.kg.toFixed(1) : ''}" aria-label="体重"><span class="unit-label">kg</span></div>
        <button class="round-btn" data-act="kg-step" data-v="1" aria-label="0.1kg ふやす">${icon('plus')}</button>
      </div>
      <label class="field-label" for="e-waist">ウエスト(はかった日だけ)</label>
      <div class="num-wrap"><input id="e-waist" class="field num" data-keep="waist" data-entry="waist" inputmode="decimal" value="${m.waist ?? ''}"><span class="unit-label">cm</span></div>
      <button class="btn primary wide" data-act="entry-save">保存する</button>
      ${has && !m.dateEditable ? `<button class="btn ghost wide" data-act="entry-del">${icon('trash')}この日の記録を消す</button>` : ''}`, 'tall');
  }
  if (m.kind === 'judge') {
    return wrap(`${head('判定をえらぶ')}<p class="sheet-text">結果用紙に書いてある判定をえらんでください。</p>
      <div class="judge-grid">${JUDGES.map((j) => `<button class="judge-pick ${m.cur === j ? 'on' : ''}" data-act="judge-set" data-v="${j}"><span class="jd big j${Math.min(judgeLevel(j), 3)}">${j}</span></button>`).join('')}</div>
      <button class="btn ghost wide" data-act="judge-set" data-v="">判定なし</button>`);
  }
  if (m.kind === 'trend') return wrap(trendHTML(m.key), 'tall');
  if (m.kind === 'ocr') return wrap(ocrHTML(m), 'tall');
  if (m.kind === 'photo') {
    const ph = (S.photos[m.ck] || [])[m.i];
    if (!ph) return '';
    return `<div class="viewer-full" role="dialog" aria-modal="true" aria-label="結果用紙の写真">
      <div class="viewer-bar"><span>${m.i + 1} / ${S.photos[m.ck].length}</span><button class="icon-btn light" data-act="modal-close" aria-label="とじる">${icon('close')}</button></div>
      <div class="viewer-scroll"><img src="${ph.data}" alt="結果用紙の写真" class="${m.zoom ? 'zoom' : ''}" data-act="photo-zoom"></div>
      <p class="viewer-hint">写真をタップすると拡大します</p></div>`;
  }
  return '';
}

function trendHTML(key) {
  const m = model();
  const it = ITEMS[key] || { key, label: key.replace(/^c:/, ''), kind: 'num', unit: (m.checkups.flatMap((c) => c.custom || []).find((c) => customKey(c.name) === key) || {}).unit || '' };
  const list = [...m.checkups].sort((a, b) => (a.date < b.date ? -1 : 1)).map((ck) => ({ ck, val: valueOf(ck, key) })).filter((x) => x.val && (x.val.v !== '' || x.val.j));
  const nums = list.map((x) => ({ date: x.ck.date, v: toNumber(x.val.v) })).filter((x) => x.v != null);
  let chart = '';
  if (it.kind === 'num' && nums.length >= 2) {
    const W = 340; const H = 170; const L = 40; const R = 16; const T = 16; const B = 26;
    const vals = nums.map((p) => p.v);
    const nr = niceRange(Math.min(...vals), Math.max(...vals), 3);
    const x = (i) => L + (nums.length === 1 ? 0.5 : i / (nums.length - 1)) * (W - L - R);
    const y = (v) => T + (1 - (v - nr.lo) / (nr.hi - nr.lo || 1)) * (H - T - B);
    const grid = nr.vals.map((v) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
    const path = nums.map((p, i) => `${i ? 'L' : 'M'}${x(i)} ${y(p.v)}`).join('');
    const xl = nums.map((p, i) => `<text class="ax" x="${x(i)}" y="${H - 6}" text-anchor="middle">${p.date.slice(0, 4)}</text>`).join('');
    const dots = nums.map((p, i) => `<circle class="tr-pt" cx="${x(i)}" cy="${y(p.v)}" r="4.5"/>`).join('');
    const lastI = nums.length - 1;
    chart = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(it.label)}の推移">${grid}<path class="avg" d="${path}"/>${dots}${xl}
      <text class="tr-label" x="${x(lastI) - 10}" y="${y(nums[lastI].v) - 12}" text-anchor="end">${nums[lastI].v}</text></svg>`;
  }
  const rows = [...list].reverse().map(({ ck, val }) => `<li class="tr-row"><span>${ymd(ck.date)}</span><span class="val">${esc(val.v || '—')}${it.unit && val.v ? `<small>${esc(it.unit)}</small>` : ''}</span>${judge(val.j) || '<span></span>'}</li>`).join('');
  return `<div class="sheet-head"><h2 id="mt" class="sheet-title">${esc(it.label)}<small>${it.unit ? `(${esc(it.unit)})` : ''}</small></h2>
      <button class="icon-btn" data-act="modal-close" aria-label="とじる">${icon('close')}</button></div>
    ${chart}${!chart && it.kind === 'num' ? '<p class="note">2回分以上の結果があると、グラフが出ます。</p>' : ''}
    <ul class="tr-list">${rows}</ul>`;
}

/* ---------- 操作 ---------- */
function openEntry(date) {
  const dateEditable = !date;
  const d = date || S.today;
  const rec = S.weights[d];
  const last = latest(sortEntries(S.weights), 'kg');
  S.modal = { kind: 'entry', date: d, dateEditable, kg: rec && rec.kg != null ? rec.kg : last ? last.kg : null, waist: rec ? rec.waist : null, touched: !!(rec && rec.kg != null) };
  render();
}

function setKg(v) {
  const m = S.modal;
  if (!m || m.kind !== 'entry') return;
  m.kg = Math.max(20, Math.min(250, Math.round(v * 10) / 10));
  m.touched = true;
  const r = $app.querySelector('[data-ruler]');
  if (r) r.innerHTML = rulerSVG(m.kg, S.profile.goal);
  const f = $app.querySelector('[data-entry="kg"]');
  if (f && document.activeElement !== f) f.value = m.kg.toFixed(1);
}

// 目盛りのドラッグ
let drag = null;
document.addEventListener('pointerdown', (ev) => {
  const r = ev.target.closest('[data-ruler]');
  if (!r || !S.modal || S.modal.kind !== 'entry') return;
  if (S.modal.kg == null) S.modal.kg = 50;
  const svg = r.querySelector('svg');
  drag = { x: ev.clientX, start: S.modal.kg, scale: 340 / svg.getBoundingClientRect().width };
  r.setPointerCapture(ev.pointerId);
  r.classList.add('dragging');
  document.activeElement && document.activeElement.blur && document.activeElement.blur();
});
document.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const dx = (ev.clientX - drag.x) * drag.scale;
  setKg(drag.start - (dx / PX) * 0.1);
});
const endDrag = () => {
  if (!drag) return;
  drag = null;
  const r = $app.querySelector('[data-ruler]');
  if (r) r.classList.remove('dragging');
  if (navigator.vibrate) try { navigator.vibrate(8); } catch { /* なし */ }
};
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);

document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const b = S.backend;
  const draft = S.view && S.view.kind === 'ck-edit' ? S.view.draft : null;
  switch (act) {
    case 'signin': b.signIn().catch(() => toast('ログインできませんでした。もう一度ためしてください。')); break;
    case 'tab': S.tab = el.dataset.tab; S.inviteLink = null; render(); window.scrollTo(0, 0); break;
    case 'range': S.range = el.dataset.v; render(); break;
    case 'metric': S.metric = el.dataset.v; render(); break;
    case 'hist-more': S.histMore = !S.histMore; render(); break;
    case 'entry': openEntry(el.dataset.date); break;
    case 'kg-step': setKg((S.modal.kg ?? 50) + Number(el.dataset.v) * 0.1); { const f = $app.querySelector('[data-entry="kg"]'); if (f) f.value = S.modal.kg.toFixed(1); } break;
    case 'entry-save': {
      const m = S.modal;
      const waist = toNumber(m.waist);
      // ウエストだけ入れた日は、前回の体重をそのまま記録しない
      const kg = m.kg != null && (m.touched || waist == null) ? m.kg : null;
      if (kg == null && waist == null) { toast('体重かウエストを入れてください'); break; }
      if (m.date > S.today) { toast('先の日付には記録できません'); break; }
      S.modal = null;
      run(async () => { await b.setWeight(m.date, { kg, waist: waist != null ? round1(waist) : null }); }, `${mdj(m.date)}の記録を保存しました`);
      break;
    }
    case 'entry-del': {
      const date = S.modal.date;
      S.modal = { kind: 'confirm', title: 'この日の記録を消しますか?', text: `${mdj(date)}の体重とウエストが消えます。`, ok: '消す', onOk: () => run(() => b.setWeight(date, {}), '消しました') };
      render();
      break;
    }
    case 'ck-new': S.view = { kind: 'ck-edit', draft: blankDraft() }; S.openGroups = new Set(['body']); render(); window.scrollTo(0, 0); break;
    case 'ck-open': S.view = { kind: 'ck', id: el.dataset.id }; render(); window.scrollTo(0, 0); break;
    case 'back': S.view = null; render(); break;
    case 'compare': S.compare = !S.compare; render(); break;
    case 'trend': S.modal = { kind: 'trend', key: el.dataset.key }; render(); break;
    case 'ck-edit': {
      const ck = S.checkups.find((c) => c.id === el.dataset.id);
      if (!ck) break;
      let photos = S.photos[ck.id];
      if (!photos) { try { photos = await b.loadPhotos(ck.id); S.photos[ck.id] = photos; } catch { photos = []; } }
      S.view = { kind: 'ck-edit', draft: { id: ck.id, date: ck.date, place: ck.place || '', overall: ck.overall || '', values: JSON.parse(JSON.stringify(ck.values || {})), custom: JSON.parse(JSON.stringify(ck.custom || [])), photos: photos.map((p) => ({ ...p })), removed: [] } };
      S.openGroups = new Set(GROUPS.filter((g) => g.items.some((it) => ck.values && ck.values[it.key])).map((g) => g.key));
      render(); window.scrollTo(0, 0);
      break;
    }
    case 'edit-cancel': S.view = draft && draft.id ? { kind: 'ck', id: draft.id } : null; render(); break;
    case 'grp': { const g = el.dataset.g; if (S.openGroups.has(g)) S.openGroups.delete(g); else S.openGroups.add(g); render(); break; }
    case 'pick-val': {
      const k = el.dataset.key;
      const cur = draft.values[k] || { v: '', j: '' };
      draft.values[k] = { ...cur, v: cur.v === el.dataset.v ? '' : el.dataset.v };
      render();
      break;
    }
    case 'judge': {
      const key = el.dataset.key;
      let cur = '';
      if (key === 'overall') cur = draft.overall;
      else if (key.startsWith('cust:')) cur = draft.custom[Number(key.slice(5))].j;
      else cur = (draft.values[key] || {}).j || '';
      S.modal = { kind: 'judge', key, cur };
      render();
      break;
    }
    case 'judge-set': {
      const { key } = S.modal;
      const v = el.dataset.v;
      if (key === 'overall') draft.overall = v;
      else if (key.startsWith('cust:')) draft.custom[Number(key.slice(5))].j = v;
      else draft.values[key] = { ...(draft.values[key] || { v: '' }), j: v };
      S.modal = null;
      render();
      break;
    }
    case 'cust-add': draft.custom.push({ name: '', unit: '', v: '', j: '' }); render(); break;
    case 'cust-del': draft.custom.splice(Number(el.dataset.i), 1); render(); break;
    case 'photo-del': {
      const [p] = draft.photos.splice(Number(el.dataset.i), 1);
      if (p && p.id) draft.removed.push(p.id);
      render();
      break;
    }
    case 'ck-save': saveCheckup(); break;
    case 'ocr': runOcr(); break;
    case 'ocr-pick': { const k = el.dataset.key; S.modal.picks[k] = !S.modal.picks[k]; render(); break; }
    case 'ocr-apply': applyOcr(); break;
    case 'ck-del': {
      const id = draft.id;
      S.modal = { kind: 'confirm', title: 'この健診の結果を消しますか?', text: '入力した数値と写真がすべて消えます。', ok: '消す',
        onOk: () => run(async () => { await b.deleteCheckup(id); delete S.photos[id]; S.view = null; }, '消しました') };
      render();
      break;
    }
    case 'photo-view': S.modal = { kind: 'photo', ck: el.dataset.ck, i: Number(el.dataset.i), zoom: false }; render(); break;
    case 'photo-zoom': S.modal.zoom = !S.modal.zoom; render(); break;
    case 'share-toggle': {
      const k = el.dataset.key;
      const share = { ...S.profile.share, [k]: !S.profile.share[k] };
      S.profile.share = share;
      render();
      run(async () => { await b.saveProfile({ share }); syncShared(); });
      break;
    }
    case 'invite': run(async () => { const code = await b.createInvite(S.profile.name); S.inviteLink = `${location.origin}${location.pathname}?invite=${code}`; }); break;
    case 'copy-invite': navigator.clipboard.writeText(S.inviteLink).then(() => toast('リンクをコピーしました'), () => toast('コピーできませんでした。リンクを長押ししてコピーしてください。')); break;
    case 'send-invite':
      if (navigator.share) navigator.share({ title: 'めもり', text: '体重の記録を共有します。このリンクを開いてログインしてください。', url: S.inviteLink }).catch(() => {});
      else navigator.clipboard.writeText(S.inviteLink).then(() => toast('リンクをコピーしました'));
      break;
    case 'remove-viewer':
      S.modal = { kind: 'confirm', title: '共有を解除しますか?', text: 'この人は、あなたの記録を見られなくなります。', ok: '解除する', onOk: () => run(() => b.removeViewer(el.dataset.uid), '解除しました') };
      render();
      break;
    case 'remind-toggle': saveRemind({ on: !S.profile.remind.on }); break;
    case 'remind-skip': saveRemind({ skipIfRecorded: !S.profile.remind.skipIfRecorded }); break;
    case 'push': run(async () => { S.push = await b.enablePush(); if (S.push === 'granted') toast('通知をオンにしました'); }); break;
    case 'demo-partner': S.demoPartner = true; S.tab = 'weight'; render(); window.scrollTo(0, 0); break;
    case 'demo-back': S.demoPartner = false; S.tab = 'settings'; render(); break;
    case 'demo-reset': b.reset(); toast('サンプルの記録にもどしました'); break;
    case 'signout': b.signOut(); break;
    case 'leave':
      S.modal = { kind: 'confirm', title: '見るのをやめますか?', text: 'もう一度見るには、新しい招待リンクが必要です。', ok: 'やめる',
        onOk: () => run(async () => { await b.leaveShare(S.profile.following); S.profile = await b.loadProfile(); S.shared = null; S.tab = 'weight'; startWatching(); }) };
      render();
      break;
    case 'invite-accept':
      run(async () => {
        await b.acceptInvite(S.invite, S.inviteInfo, S.profile.name);
        sessionStorage.removeItem('memori-invite');
        S.invite = null; S.inviteInfo = undefined;
        S.profile = await b.loadProfile();
        S.tab = 'weight';
        startWatching();
      }, '見られるようになりました');
      break;
    case 'invite-dismiss': sessionStorage.removeItem('memori-invite'); S.invite = null; S.inviteInfo = undefined; render(); break;
    case 'modal-close': S.modal = null; render(); break;
    case 'modal-ok': { const fn = S.modal && S.modal.onOk; S.modal = null; render(); if (fn) fn(); break; }
    default: break;
  }
});

document.addEventListener('input', (ev) => {
  const t = ev.target;
  const draft = S.view && S.view.kind === 'ck-edit' ? S.view.draft : null;
  if (t.dataset.val && draft) { const k = t.dataset.val; draft.values[k] = { ...(draft.values[k] || { j: '' }), v: t.value.trim() }; return; }
  if (t.dataset.ck && draft) { draft[t.dataset.ck] = t.value; return; }
  if (t.dataset.cust && draft) { draft.custom[Number(t.dataset.cust)][t.dataset.f] = t.value; return; }
  if (t.dataset.ocr && S.modal && S.modal.kind === 'ocr' && S.modal.result) { S.modal.result.values[t.dataset.ocr].v = t.value.trim(); return; }
  if (t.dataset.entry && S.modal && S.modal.kind === 'entry') {
    const f = t.dataset.entry;
    if (f === 'kg') {
      const n = toNumber(t.value);
      if (n != null && n >= 20 && n <= 250) setKg(n);
    } else if (f === 'waist') S.modal.waist = t.value;
    else if (f === 'date' && t.value) {
      S.modal.date = t.value;
      const rec = S.weights[t.value];
      if (rec) { S.modal.kg = rec.kg; S.modal.waist = rec.waist; S.modal.touched = rec.kg != null; render(); }
    }
  }
});

document.addEventListener('change', async (ev) => {
  const t = ev.target;
  if (t.dataset.photo !== undefined && t.files && t.files.length) {
    const draft = S.view && S.view.draft;
    const files = [...t.files];
    t.value = '';
    toast('写真を準備しています…');
    for (const f of files) {
      try { draft.photos.push(await compressPhoto(f)); } catch (e) { toast(e.message || '写真を読みこめませんでした'); }
    }
    S.toast = null;
    render();
    return;
  }
  if (t.dataset.prof) {
    const k = t.dataset.prof;
    let v = t.value.trim();
    if (k !== 'name') { const n = toNumber(v); v = n != null && n > 0 ? round1(n) : null; }
    S.profile[k] = v;
    run(async () => { await S.backend.saveProfile({ [k]: v }); syncShared(); }, '保存しました');
    return;
  }
  if (t.dataset.remind) { saveRemind({ time: t.value || '07:30' }); }
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && S.modal) { S.modal = null; render(); }
});

/* ---------- 写真から読み取る ---------- */
async function runOcr() {
  const d = S.view.draft;
  if (!d.photos.length) return;
  S.modal = { kind: 'ocr', msg: '読み取りの準備をしています', p: 0 };
  render();
  let last = 0;
  try {
    const result = await readSheets(d.photos.map((p) => p.data), S.today, (msg, p) => {
      if (!S.modal || S.modal.kind !== 'ocr') return;
      S.modal.msg = msg; S.modal.p = p;
      const now = Date.now();
      if (now - last > 250) { last = now; const bar = $app.querySelector('.ocr-bar i'); const txt = $app.querySelector('.ocr-msg'); if (bar) bar.style.width = `${Math.round(p * 100)}%`; if (txt) txt.textContent = msg; }
    });
    if (!S.modal || S.modal.kind !== 'ocr') return;
    const picks = {};
    for (const [k, v] of Object.entries(result.values)) {
      const cur = d.values[k];
      picks[k] = !cur || !cur.v || cur.v === v.v;
    }
    if (result.date) picks._date = result.date !== d.date && !d.id;
    if (result.overall) picks._overall = !d.overall;
    S.modal = { kind: 'ocr', result, picks };
  } catch (e) {
    console.error(e);
    S.modal = { kind: 'ocr', error: (e && e.message) || '読み取れませんでした。' };
  }
  render();
}

function ocrHTML(m) {
  const head = `<div class="sheet-head"><h2 id="mt" class="sheet-title">写真から読み取り</h2><button class="icon-btn" data-act="modal-close" aria-label="とじる">${icon('close')}</button></div>`;
  if (m.error) return `${head}<p class="sheet-text">${esc(m.error)}</p><button class="btn ghost wide" data-act="modal-close">とじる</button>`;
  if (!m.result) {
    return `${head}<p class="ocr-msg sheet-text">${esc(m.msg)}</p><div class="ocr-bar"><i style="width:${Math.round((m.p || 0) * 100)}%"></i></div>
      <p class="fine">写真はスマホの外に送っていません。1枚あたり数十秒かかることがあります。</p>`;
  }
  const r = m.result;
  const keys = Object.keys(r.values);
  if (!keys.length && !r.date) {
    return `${head}<p class="sheet-text">項目を読み取れませんでした。明るい場所で、用紙が画面いっぱいにまっすぐ写るように撮りなおすと、読み取れることがあります。</p>
      <button class="btn ghost wide" data-act="modal-close">とじる</button>`;
  }
  const draft = S.view.draft;
  const order = Object.keys(ITEMS);
  keys.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const pick = (k, on, inner) => `<div class="ocr-row ${on ? 'on' : ''}">
      <button class="ocr-check" data-act="ocr-pick" data-key="${k}" role="checkbox" aria-checked="${on}" aria-label="反映する">${on ? icon('check') : ''}</button>${inner}</div>`;
  const rows = keys.map((k) => {
    const it = ITEMS[k]; const v = r.values[k]; const cur = draft.values[k];
    return pick(k, m.picks[k], `<span class="ocr-label">${esc(it.label)}${v.check ? '<span class="unsure">要確認</span>' : ''}
        ${cur && cur.v && cur.v !== v.v ? `<small>いまの値 ${esc(cur.v)}</small>` : ''}</span>
      <input class="field num ocr-val" data-keep="ocr-${k}" data-ocr="${k}" value="${esc(v.v)}" aria-label="${esc(it.label)}の値">
      <span class="ocr-j">${v.j ? judge(v.j) : ''}</span>`);
  }).join('');
  const n = Object.entries(m.picks).filter(([, on]) => on).length;
  return `${head}
    <p class="sheet-text">写真と見くらべて、合っているものにチェックを入れてください。数字はここで直せます。「要確認」は読み取りがあやしいものです。</p>
    ${r.date ? pick('_date', m.picks._date, `<span class="ocr-label">受けた日</span><span class="ocr-plain">${ymd(r.date)}</span><span></span>`) : ''}
    ${r.overall ? pick('_overall', m.picks._overall, `<span class="ocr-label">総合判定</span><span class="ocr-plain"></span><span class="ocr-j">${judge(r.overall)}</span>`) : ''}
    <div class="ocr-list">${rows}</div>
    <p class="fine">読み取れなかった項目は、このあと手で入れてください。</p>
    <button class="btn primary wide" data-act="ocr-apply" ${n ? '' : 'disabled'}>チェックした${n}件を入れる</button>`;
}

function applyOcr() {
  const { result: r, picks } = S.modal;
  const d = S.view.draft;
  let n = 0;
  for (const [k, v] of Object.entries(r.values)) {
    if (!picks[k] || !v.v) continue;
    const cur = d.values[k] || { v: '', j: '' };
    d.values[k] = { v: v.v, j: v.j || cur.j || '' };
    S.openGroups.add(ITEMS[k].group);
    n++;
  }
  if (picks._date && r.date) { d.date = r.date; n++; }
  if (picks._overall && r.overall) { d.overall = r.overall; n++; }
  S.modal = null;
  toast(`${n}件を入れました。保存する前に、写真と見くらべてください`);
}

function saveRemind(patch) {
  S.profile.remind = { ...S.profile.remind, ...patch };
  render();
  run(() => S.backend.saveProfile({ remind: S.profile.remind }));
}

function saveCheckup() {
  const d = S.view.draft;
  if (!d.date) { toast('受けた日を入れてください'); return; }
  const values = {};
  for (const [k, v] of Object.entries(d.values)) {
    if (!ITEMS[k]) continue;
    const vv = String(v.v ?? '').trim();
    if (vv !== '' || v.j) values[k] = { v: vv, j: v.j || '' };
  }
  // 身長と体重があってBMIが空なら計算する
  if (!values.bmi && values.height && values.weight) {
    const bmi = bmiOf(toNumber(values.weight.v), toNumber(values.height.v));
    if (bmi) values.bmi = { v: bmi.toFixed(1), j: '' };
  }
  const custom = d.custom.filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim(), unit: (c.unit || '').trim(), v: String(c.v || '').trim(), j: c.j || '' }));
  const rec = { date: d.date, place: d.place.trim(), overall: d.overall || '', values, custom };
  if (d.id) rec.id = d.id;
  const newPhotos = d.photos.filter((p) => !p.id);
  run(async () => {
    const id = await S.backend.saveCheckup(rec);
    for (const p of newPhotos) await S.backend.addPhoto(id, p);
    for (const pid of d.removed) await S.backend.deletePhoto(pid);
    delete S.photos[id];
    // 体重の記録にも、その日の体重がなければ入れておく
    const w = toNumber(values.weight && values.weight.v);
    if (w && !S.weights[d.date]) await S.backend.setWeight(d.date, { kg: round1(w), waist: toNumber(values.waist && values.waist.v) });
    if (!S.profile.height && values.height) { const h = toNumber(values.height.v); if (h) { S.profile.height = h; await S.backend.saveProfile({ height: h }); } }
    S.view = { kind: 'ck', id };
    window.scrollTo(0, 0);
  }, '保存しました');
}

init();
