import { firebaseConfig, vapidKey } from './config.js';
import {
  addDays, diffDays, todayIn, sortPeriods, stats, buildView, statusOf, infoFor,
  buildShared, viewFromShared, parseBulk, SHARE_DEFAULTS, OPEN_MAX,
} from './cycle.js';
import { icon, dropShape, leafMark, SYMPTOMS, SYMPTOM_LABEL } from './icons.js';
import {
  PILL_TYPES, pillConf, isPillOn, pillDay, needsPill, restWindows, sheetDates, missedCount,
} from './pill.js';

const $app = document.getElementById('app');
const WD = ['日', '月', '火', '水', '木', '金', '土'];

const S = {
  backend: null,
  loading: true,
  fatal: null,
  user: null,
  profile: null,
  periods: [],
  days: {},
  pills: {},
  appts: [],
  sheetAnchor: null,
  dataReady: false,
  viewers: [],
  shared: null,
  sharedReady: false,
  today: todayIn(),
  tab: 'calendar',
  month: todayIn().slice(0, 7),
  selected: todayIn(),
  invite: null,
  inviteInfo: undefined,
  inviteLink: null,
  modal: null,
  bulkText: '',
  toast: null,
  demoPartner: false,
  busy: false,
  push: 'default',
  unsubs: [],
};

/* ---------- 小さな道具 ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const wd = (s) => WD[new Date(s + 'T00:00:00Z').getUTCDay()];
const md = (s) => `${Number(s.slice(5, 7))}月${Number(s.slice(8, 10))}日`;
const fmtLong = (s) => `${md(s)}(${wd(s)})`;
const fmtShort = (s) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}(${wd(s)})`;
const fmtYMD = (s) => `${s.slice(0, 4)}/${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;
const isPartnerMode = () => S.demoPartner || (S.profile && S.profile.mode === 'partner' && S.profile.following);
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
  try {
    await fn();
    if (okText) toast(okText);
  } catch (e) {
    console.error(e);
    toast('保存できませんでした。通信を確認して、もう一度ためしてください。');
  } finally {
    S.busy = false;
    render();
  }
}

function ownView() {
  const pc = pillConf(S.profile && S.profile.pill);
  return buildView(S.periods, S.days, S.today, isPillOn(pc) ? restWindows(pc, S.today, 3) : null);
}
const ownPillOn = () => !!S.profile && isPillOn(S.profile.pill);

/** 画面で使うピルの情報(本人は自分の設定、相手は共有された分) */
function pillCtx(view, editable) {
  if (editable) return ownPillOn() ? { conf: pillConf(S.profile.pill), taken: S.pills } : null;
  return view.pill && isPillOn(view.pill.conf) ? { conf: pillConf(view.pill.conf), taken: view.pill.taken } : null;
}
const pillKindLabel = (info) => {
  if (!info) return '';
  if (info.kind === 'active') return info.continuous ? `連続 ${info.day}日目` : `実薬 ${info.day}日目`;
  if (info.kind === 'placebo') return '偽薬の日';
  return '休薬の日';
};

/* ---------- 起動 ---------- */
async function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

  const params = new URLSearchParams(location.search);
  const code = params.get('invite');
  if (code) {
    sessionStorage.setItem('shizuku-invite', code);
    history.replaceState(null, '', location.pathname);
  }
  S.invite = sessionStorage.getItem('shizuku-invite');

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
      if (t !== S.today) { S.today = t; S.selected = t; S.month = t.slice(0, 7); render(); }
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
  S.unsubs.push(b.watchOwnData(({ periods, days, pills, appts }) => {
    S.periods = periods;
    S.days = days;
    S.pills = pills || {};
    S.appts = appts || [];
    S.dataReady = true;
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
    const pc = pillConf(S.profile.pill);
    const pillShare = isPillOn(pc)
      ? { enabled: true, type: pc.type, startDate: pc.startDate, cycleStart: pc.cycleStart, restStart: pc.restStart, restDays: pc.restDays }
      : null;
    const obj = buildShared(ownView(), { ...SHARE_DEFAULTS, ...S.profile.share }, S.profile.name || '', S.today, { pill: pillShare, taken: S.pills });
    const json = JSON.stringify(obj);
    if (json === lastShared) return;
    lastShared = json;
    S.backend.writeShared(obj).catch((e) => { console.error(e); lastShared = ''; });
  }, 700);
}

/* ---------- 画面 ---------- */
function render() {
  const active = document.activeElement;
  const keep = active && active.dataset && active.dataset.keep;
  const caret = keep && active.selectionStart;

  let body;
  if (S.fatal) body = screenMessage('読みこめませんでした', S.fatal);
  else if (S.loading) body = screenLoading();
  else if (!S.user) body = screenLogin();
  else if (S.invite && S.inviteInfo !== undefined) body = screenInvite();
  else if (isPartnerMode()) body = shell(partnerScreen(), partnerTabs());
  else body = shell(ownerScreen(), ownerTabs());

  $app.innerHTML = body + modalHTML() + (S.toast ? `<div class="toast" role="status">${esc(S.toast)}</div>` : '');

  if (keep) {
    const el = $app.querySelector(`[data-keep="${keep}"]`);
    if (el) { el.focus(); try { el.setSelectionRange(caret, caret); } catch { /* 選択できない入力 */ } }
  }
}

function shell(main, tabs) {
  return `<div class="shell">${S.backend && S.backend.isDemo ? '<p class="demo-band">デモモード:データはこの端末の中だけに保存されます</p>' : ''}<main class="screen">${main}</main>${tabs}</div>`;
}

function screenLoading() {
  return `<div class="center-screen"><div class="logo-drop pulse">${dropShape('actual')}</div></div>`;
}

function screenMessage(title, text, actions = '') {
  return `<div class="center-screen"><div class="logo-drop">${dropShape('pred')}</div><h1 class="center-title">${esc(title)}</h1><p class="center-text">${esc(text)}</p>${actions}</div>`;
}

function screenLogin() {
  const inviteNote = S.invite ? '<p class="note-soft">招待リンクから開きました。ログインすると、共有された内容を見られます。</p>' : '';
  return `<div class="center-screen login">
    <div class="logo-drop big">${dropShape('actual')}</div>
    <h1 class="wordmark">しずく</h1>
    <p class="center-text">生理の記録と予測を、自分のスマホに。</p>
    ${inviteNote}
    <button class="btn primary wide" data-act="signin">${icon('person')}Googleでログイン</button>
  </div>`;
}

function screenInvite() {
  const i = S.inviteInfo;
  const close = '<button class="btn soft wide" data-act="invite-dismiss">とじる</button>';
  if (!i) return screenMessage('この招待リンクは使えません', 'リンクがまちがっているか、取り消されています。新しいリンクをもらってください。', close);
  if (i.mine) return screenMessage('自分の招待リンクです', 'このリンクは、見てほしい相手に送ってください。', close);
  if (i.expired) return screenMessage('招待リンクの期限が切れています', '招待リンクは24時間だけ使えます。新しいリンクをもらってください。', close);
  if (i.used) return screenMessage('この招待リンクはもう使われています', '招待リンクは1人だけ使えます。新しいリンクをもらってください。', close);
  const name = i.ownerName || 'お相手';
  return `<div class="center-screen">
    <div class="logo-drop">${dropShape('actual')}</div>
    <h1 class="center-title">${esc(name)}さんのカレンダーを見られるようにしますか?</h1>
    <p class="center-text">見られるのは、${esc(name)}さんが選んだ項目だけです。こちらから書きこむことはできません。</p>
    <button class="btn primary wide" data-act="invite-accept">見られるようにする</button>
    <button class="btn ghost wide" data-act="invite-dismiss">やめておく</button>
  </div>`;
}

/* ----- 下のタブ ----- */
function tabsHTML(items) {
  return `<nav class="tabs" aria-label="画面のきりかえ">${items.map(([key, ic, label]) => `
    <button class="tab ${S.tab === key ? 'on' : ''}" data-act="tab" data-tab="${key}" ${S.tab === key ? 'aria-current="page"' : ''}>
      <span class="tab-ic">${icon(ic)}</span><span class="tab-label">${label}</span>
    </button>`).join('')}</nav>`;
}
const ownerTabs = () => tabsHTML([
  ['calendar', 'calendar', 'カレンダー'],
  ...(ownPillOn() ? [['pill', 'pill', 'ピル']] : []),
  ['records', 'notebook', 'きろく'], ['share', 'share', '共有'], ['settings', 'sliders', '設定'],
]);
const partnerTabs = () => tabsHTML([['calendar', 'calendar', 'カレンダー'], ['settings', 'sliders', '設定']]);

function ownerScreen() {
  if (!['calendar', 'pill', 'records', 'share', 'settings'].includes(S.tab)) S.tab = 'calendar';
  if (S.tab === 'pill' && !ownPillOn()) S.tab = 'calendar';
  if (!S.dataReady) return screenLoading();
  if (S.tab === 'pill') return pillScreen();
  if (S.tab === 'records') return recordsScreen();
  if (S.tab === 'share') return shareScreen();
  if (S.tab === 'settings') return settingsScreen();
  return calendarScreen(ownView(), { editable: true });
}

function partnerScreen() {
  if (!['calendar', 'settings'].includes(S.tab)) S.tab = 'calendar';
  if (S.tab === 'settings') return partnerSettings();
  if (!S.sharedReady) return screenLoading();
  if (!S.shared) {
    return `<header class="topbar"><span class="brand">しずく</span></header>
      <div class="empty-block">${dropShape('pred')}<p>まだ共有された内容がありません。お相手がアプリを開くと、ここに表示されます。</p></div>`;
  }
  return calendarScreen(viewFromShared(S.shared, S.today), { editable: false });
}

/* ----- カレンダー ----- */
function pillHeroHTML(view, editable, ctx, onPillTab = false) {
  const who = editable ? '' : `<p class="hero-who">${esc(ownerName())}さん</p>`;
  const { conf } = ctx;
  const t = PILL_TYPES[conf.type];
  const info = pillDay(conf, S.today);
  const takenToday = !!ctx.taken[S.today];
  const todayView = infoFor(view, S.today);
  const periodChip = todayView.actual
    ? `<p class="chip rose">${dropShape('actual')}生理 ${diffDays(todayView.actual.start, S.today) + 1}日目</p>` : '';
  if (!info) {
    const from = t.continuous ? conf.cycleStart : conf.startDate;
    return `<section class="hero"><div class="hero-text">${who}<p class="hero-lead">ピル</p>
      <p class="hero-sub">${fmtLong(from)}から飲みはじめ</p></div>
      <div class="hero-drop pred">${dropShape('pred')}<span class="hero-num">${icon('pill')}</span></div></section>`;
  }
  let lead; let num; let unit = '日目'; let sub;
  if (info.kind === 'active') {
    lead = onPillTab ? (t.continuous ? '連続服用' : '実薬') : (t.continuous ? 'ピル(連続)' : 'ピル');
    num = info.day;
    if (t.continuous) sub = '休薬するときは「ピル」画面から';
    else if (info.activeLeft === 0) sub = `今日が実薬の最後の日です`;
    else sub = `${t.placebo ? '偽薬' : '休薬'}まであと${info.activeLeft}日`;
  } else if (info.kind === 'placebo') {
    lead = '偽薬';
    num = info.day - t.active;
    sub = `次のシートは${fmtLong(info.nextSheet)}から`;
  } else {
    lead = '休薬';
    num = info.day;
    if (info.continuous) sub = info.restLeft === 0 ? '明日から飲みはじめ' : `あと${info.restLeft}日で飲みはじめ`;
    else num = info.day - t.active, sub = `次のシートは${fmtLong(info.nextSheet)}から`;
  }
  let check = '';
  if (needsPill(info)) {
    if (editable) {
      check = takenToday
        ? `<button class="taken-btn on" data-act="pill-today" aria-pressed="true">${icon('check')}今日のぶんは飲みました</button>`
        : `<button class="btn primary taken-btn" data-act="pill-today" aria-pressed="false">${icon('pill')}今日のピルを飲んだ</button>`;
    } else {
      check = `<p class="chip ${takenToday ? 'rose' : 'plain'}">${icon(takenToday ? 'check' : 'clock')}${takenToday ? '今日のぶんは飲みました' : '今日はまだ飲んでいません'}</p>`;
    }
  }
  const drop = needsPill(info) && takenToday ? 'actual' : 'pred';
  return `<section class="hero">
    <div class="hero-text">${who}<p class="hero-lead">${esc(lead)}</p><p class="hero-sub">${esc(sub)}</p>${periodChip}${check}</div>
    <div class="hero-drop ${drop}">${dropShape(drop)}<span class="hero-num ${String(num).length > 2 ? 'small' : ''}">${num}<small>${unit}</small></span></div>
  </section>`;
}

function heroHTML(view, editable, onPillTab = false) {
  const ctx = pillCtx(view, editable);
  if (ctx) return pillHeroHTML(view, editable, ctx, onPillTab);
  const st = statusOf(view.core, S.today);
  const who = editable ? '' : `<p class="hero-who">${esc(ownerName())}さん</p>`;
  const todayInfo = infoFor(view, S.today);
  const fertileChip = todayInfo.fertile && st.kind !== 'period'
    ? `<p class="chip sage">${leafMark(todayInfo.ovulation)}${todayInfo.ovulation ? '今日は排卵日(目安)' : '今日は妊娠しやすい時期(目安)'}</p>` : '';

  if (st.kind === 'empty') {
    const text = editable ? '生理がはじまった日を、下のカレンダーでえらんでください。' : '次の予定日は共有されていません。';
    return `<section class="hero">
      <div class="hero-text">${who}<p class="hero-lead">${editable ? 'はじめての記録' : '予定日'}</p><p class="hero-sub">${text}</p></div>
      <div class="hero-drop pred">${dropShape('pred')}<span class="hero-num">?</span></div></section>`;
  }
  let drop; let num; let unit; let lead; let sub;
  if (st.kind === 'inrest') {
    return `<section class="hero"><div class="hero-text">${who}<p class="hero-lead">休薬・偽薬の期間</p>
      <p class="hero-sub">${fmtLong(st.end)}まで(出血の予定)</p></div>
      <div class="hero-drop pred">${dropShape('pred')}<span class="hero-num">${icon('pause')}</span></div></section>`;
  }
  if (st.kind === 'period') {
    drop = 'actual'; lead = '生理'; num = st.day; unit = '日目';
    sub = view.stats ? `いつもは${view.stats.avgLen}日間くらい` : '';
  } else if (st.kind === 'late') {
    drop = 'pred'; lead = '予定日から'; num = st.days; unit = '日おくれ';
    sub = `予定日は${fmtLong(st.next)}でした`;
  } else if (st.days === 0) {
    drop = 'pred'; lead = '今日は'; num = '今日'; unit = ''; lead = '生理の予定日';
    sub = fmtLong(st.next);
  } else if (st.pill) {
    drop = 'pred'; lead = '次の休薬・偽薬まで'; num = st.days; unit = '日';
    sub = `${fmtLong(st.next)}から(出血の予定)`;
  } else {
    drop = 'pred'; lead = '次の生理まで'; num = st.days; unit = '日';
    sub = `予定日 ${fmtLong(st.next)}`;
  }
  const numCls = String(num).length > 2 ? 'small' : '';
  return `<section class="hero">
    <div class="hero-text">${who}<p class="hero-lead">${esc(lead)}</p><p class="hero-sub">${esc(sub)}</p>${fertileChip}</div>
    <div class="hero-drop ${drop}">${dropShape(drop)}<span class="hero-num ${numCls}">${esc(num)}${unit ? `<small>${esc(unit)}</small>` : ''}</span></div>
  </section>`;
}

function monthHTML(view, ctx = null) {
  const [y, m] = S.month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push('<span class="cell blank" aria-hidden="true"></span>');
  for (let d = 1; d <= daysIn; d++) {
    const date = `${S.month}-${String(d).padStart(2, '0')}`;
    const info = infoFor(view, date);
    const dow = (first + d - 1) % 7;
    const cls = ['cell'];
    if (info.actual) cls.push('is-actual');
    else if (info.pred) cls.push('is-pred');
    if (date === S.today) cls.push('is-today');
    if (date === S.selected) cls.push('is-sel');
    if (date > S.today) cls.push('is-future');
    if (dow === 0) cls.push('is-sun');
    if (dow === 6) cls.push('is-sat');
    const labels = [fmtLong(date)];
    if (info.actual) labels.push('生理');
    else if (info.pred) labels.push('生理の予定');
    if (info.ovulation) labels.push('排卵日の目安'); else if (info.fertile) labels.push('妊娠しやすい時期の目安');
    if (info.symptoms.length) labels.push('体調の記録あり');
    const pinfo = ctx ? pillDay(ctx.conf, date) : null;
    const took = ctx && needsPill(pinfo) && ctx.taken[date];
    const missed = ctx && needsPill(pinfo) && !ctx.taken[date] && date < S.today;
    if (took) labels.push('ピルを飲んだ');
    if (missed) labels.push('ピルの記録なし');
    cells.push(`<button class="${cls.join(' ')}" data-act="pick" data-date="${date}" aria-label="${labels.join('、')}" ${date === S.selected ? 'aria-pressed="true"' : ''}>
      ${info.actual ? dropShape('actual') : info.pred ? dropShape('pred') : ''}
      <span class="num">${d}</span>
      ${info.fertile ? leafMark(info.ovulation) : ''}
      ${info.symptoms.length ? '<span class="sym-dot"></span>' : ''}
      ${took ? `<span class="pill-dot">${icon('check')}</span>` : missed ? '<span class="pill-dot miss"></span>' : ''}
    </button>`);
  }
  const isThisMonth = S.month === S.today.slice(0, 7);
  return `<section class="month">
    <div class="month-head">
      <button class="icon-btn" data-act="month" data-step="-1" aria-label="前の月">${icon('chevL')}</button>
      <h2 class="month-title"><span class="yr">${y}年</span>${m}月</h2>
      <button class="icon-btn" data-act="month" data-step="1" aria-label="次の月">${icon('chevR')}</button>
    </div>
    ${isThisMonth ? '' : '<button class="back-today" data-act="go-today">今日にもどる</button>'}
    <div class="wd-row" aria-hidden="true">${WD.map((w, i) => `<span class="${i === 0 ? 'is-sun' : i === 6 ? 'is-sat' : ''}">${w}</span>`).join('')}</div>
    <div class="grid">${cells.join('')}</div>
    <div class="legend">
      <span>${dropShape('actual')}生理</span>
      <span>${dropShape('pred')}${view.pillMode ? '休薬・偽薬(出血の予定)' : '予定'}</span>
      ${ctx ? `<span><span class="pill-dot inline">${icon('check')}</span>ピルを飲んだ</span>` : ''}
      ${view.fertile.length ? `<span>${leafMark(false)}妊娠しやすい時期</span><span>${leafMark(true)}排卵日</span>` : ''}
    </div>
  </section>`;
}

function dayHTML(view, editable) {
  const date = S.selected;
  const info = infoFor(view, date);
  const future = date > S.today;
  const notes = [];
  if (info.actual) notes.push(`生理 ${diffDays(info.actual.start, date) + 1}日目`);
  else if (info.pred) notes.push(view.pillMode ? '休薬・偽薬(出血の予定)' : '生理の予定(目安)');
  if (info.ovulation) notes.push('排卵日(目安)');
  else if (info.fertile) notes.push('妊娠しやすい時期(目安)');

  let actions = '';
  let symptoms = '';
  const ctx = pillCtx(view, editable);
  const pinfo = ctx ? pillDay(ctx.conf, date) : null;
  let pillRow = '';
  if (pinfo) {
    const took = !!ctx.taken[date];
    let control;
    if (!needsPill(pinfo)) control = '<span class="pill-state">飲まない日</span>';
    else if (editable && !future) {
      control = `<button class="pill-toggle ${took ? 'on' : ''}" data-act="pill-day" data-date="${date}" aria-pressed="${took}">${icon(took ? 'check' : 'pill')}${took ? '飲みました' : '飲んだ'}</button>`;
    } else if (future) control = '<span class="pill-state">これから</span>';
    else control = `<span class="pill-state ${took ? 'ok' : ''}">${took ? '飲みました' : '記録なし'}</span>`;
    pillRow = `<div class="pill-row"><span class="pill-row-label">${icon('pill')}${esc(pillKindLabel(pinfo))}</span>${control}</div>`;
  }
  if (editable) {
    if (future) {
      actions = '<p class="note-soft">先の日付には、まだ記録できません。</p>';
    } else {
      actions = `<div class="actions">${dayActions(view, date, info)}</div>`;
      symptoms = `<h3 class="sub-title">体調</h3>
        <div class="sym-grid">${SYMPTOMS.map((s) => {
          const on = info.symptoms.includes(s.key);
          return `<button class="sym ${on ? 'on' : ''}" data-act="sym" data-key="${s.key}" aria-pressed="${on}">${icon(s.key)}<span>${s.label}</span></button>`;
        }).join('')}</div>`;
    }
  } else if (info.symptoms.length) {
    symptoms = `<h3 class="sub-title">体調</h3><div class="sym-list">${info.symptoms.map((k) => `<span class="sym-chip">${icon(k)}${SYMPTOM_LABEL[k] || ''}</span>`).join('')}</div>`;
  }
  return `<section class="day" aria-live="polite">
    <div class="day-head"><h2 class="day-title">${fmtLong(date)}${date === S.today ? '<span class="today-tag">今日</span>' : ''}</h2>
    ${notes.length ? `<p class="day-note">${notes.map(esc).join('/')}</p>` : ''}</div>
    ${pillRow}${actions}${symptoms}
    ${!editable && !info.symptoms.length && !notes.length && !pillRow ? '<p class="note-soft">この日に共有されている記録はありません。</p>' : ''}
  </section>`;
}

function dayActions(view, date, info) {
  const ps = sortPeriods(S.periods);
  const out = [];
  if (info.actual) {
    const p = ps.find((x) => x.id === info.actual.id);
    if (!p) return '';
    if (p.end !== date) out.push(`<button class="btn primary" data-act="end" data-id="${p.id}">${icon('check')}この日でおわった</button>`);
    out.push(`<button class="btn ghost" data-act="del-period" data-id="${p.id}">${icon('trash')}この生理の記録を消す</button>`);
    return out.join('');
  }
  const prev = ps.filter((p) => p.start < date && diffDays(p.start, date) <= 13).pop();
  if (prev) out.push(`<button class="btn primary" data-act="end" data-id="${prev.id}">${icon('check')}この日に生理がおわった</button>`);
  out.push(`<button class="btn ${prev ? 'soft' : 'primary'}" data-act="start">${icon('drop')}この日に生理がはじまった</button>`);
  return out.join('');
}

function calendarScreen(view, { editable }) {
  return `<header class="topbar"><span class="brand">しずく</span></header>
    ${heroHTML(view, editable)}
    ${monthHTML(view, pillCtx(view, editable))}
    ${dayHTML(view, editable)}
    ${view.fertile.length ? '<p class="fine">排卵日と妊娠しやすい時期は、平均周期から計算した目安です。避妊には使えません。</p>' : ''}`;
}

/* ----- きろく ----- */
function recordsScreen() {
  const ps = sortPeriods(S.periods);
  const st = stats(ps);
  const view = ownView();
  const rows = [...ps].reverse().map((p, idx, arr) => {
    const next = idx > 0 ? arr[idx - 1] : null;
    const len = p.end ? diffDays(p.start, p.end) + 1 : null;
    const cyc = next ? diffDays(p.start, next.start) : null;
    return `<tr>
      <td>${fmtYMD(p.start)}</td>
      <td>${len ? `${len}日` : '<span class="muted">記録中</span>'}</td>
      <td>${cyc ? `${cyc}日` : '<span class="muted">—</span>'}</td>
    </tr>`;
  }).join('');

  const counts = {};
  ps.slice(-3).forEach((p) => {
    const from = addDays(p.start, -3);
    const to = addDays(p.end || addDays(p.start, st.avgLen - 1), 2);
    Object.entries(view.symptoms).forEach(([d, list]) => { if (d >= from && d <= to) list.forEach((k) => { counts[k] = (counts[k] || 0) + 1; }); });
  });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  const range = st.minCycle ? `${st.minCycle}〜${st.maxCycle}日` : '—';
  return `<header class="topbar"><h1 class="page-title">きろく</h1>
      <button class="icon-btn" data-act="print" aria-label="印刷・PDFにする">${icon('print')}</button></header>
    <p class="lead">病院で見せるときは、この画面を見せるか、右上から印刷してPDFにできます。</p>
    <dl class="figures">
      <div><dt>平均の周期</dt><dd>${st.cycleSamples ? st.avgCycle : '—'}<small>日</small></dd></div>
      <div><dt>生理の長さ</dt><dd>${ps.some((p) => p.end) ? st.avgLen : '—'}<small>日</small></dd></div>
      <div><dt>最近6回の周期のはば</dt><dd class="range">${range}</dd></div>
      <div><dt>記録した回数</dt><dd>${ps.length}<small>回</small></dd></div>
    </dl>
    ${top.length ? `<h2 class="sub-title">生理の前後に多い体調(最近3回)</h2>
      <div class="sym-list">${top.map(([k, n]) => `<span class="sym-chip">${icon(k)}${SYMPTOM_LABEL[k] || k}<b>${n}</b></span>`).join('')}</div>` : ''}
    <h2 class="sub-title">これまでの生理</h2>
    ${ps.length ? `<table class="history"><thead><tr><th>はじまった日</th><th>日数</th><th>次までの周期</th></tr></thead><tbody>${rows}</tbody></table>`
      : '<p class="note-soft">まだ記録がありません。カレンダーで日付をえらんで記録するか、下からまとめて入力できます。</p>'}
    <button class="btn soft wide no-print" data-act="bulk-open">${icon('paste')}過去の記録をまとめて入力</button>
    ${ownPillOn() ? pillSummaryHTML() : apptsHTML()}
    <p class="fine print-only">しずく で記録 ${fmtYMD(S.today)} 時点</p>`;
}

/* ----- 共有 ----- */
const SHARE_ITEMS = [
  ['status', '生理中かどうかと次の予定日'],
  ['fertile', '排卵日と妊娠しやすい時期(目安)'],
  ['history', 'これまでの記録と平均'],
  ['symptoms', '体調(症状)'],
  ['pill', 'ピルを飲んだかどうか', () => ownPillOn()],
  ['startNotify', '生理がはじまったら相手に通知'],
];

function shareScreen() {
  const flags = { ...SHARE_DEFAULTS, ...S.profile.share };
  const toggles = SHARE_ITEMS.filter(([, , show]) => !show || show()).map(([k, label]) => `
    <button class="switch-row" data-act="share-toggle" data-key="${k}" role="switch" aria-checked="${!!flags[k]}">
      <span>${label}</span><span class="switch ${flags[k] ? 'on' : ''}"><span class="knob"></span></span>
    </button>`).join('');
  const viewers = S.viewers.length
    ? S.viewers.map((v) => `<li class="viewer"><span class="avatar">${icon('person')}</span><span class="viewer-name">${esc(v.name || '名前なし')}</span>
        <button class="btn ghost small" data-act="remove-viewer" data-uid="${esc(v.uid)}">解除</button></li>`).join('')
    : '<li class="note-soft">まだだれもいません。</li>';
  const link = S.inviteLink ? `<div class="invite-box">
      <p class="invite-url">${esc(S.inviteLink)}</p>
      <div class="actions row">
        <button class="btn soft" data-act="copy-invite">${icon('link')}コピー</button>
        <button class="btn primary" data-act="send-invite">${icon('send')}送る</button>
      </div>
      <p class="fine">24時間だけ有効で、1人だけ使えます。</p>
    </div>` : '';
  return `<header class="topbar"><h1 class="page-title">共有</h1></header>
    <p class="lead">招待した人だけが、ここで選んだ項目を見られます。相手は見るだけで、書きこみはできません。</p>
    <div class="switch-list">${toggles}</div>
    ${flags.fertile ? '<p class="fine">排卵日の予測は目安です。避妊には使えません。</p>' : ''}
    <h2 class="sub-title">見ている人</h2>
    <ul class="viewers">${viewers}</ul>
    <button class="btn primary wide" data-act="invite">${icon('plus')}招待リンクをつくる</button>
    ${link}
    ${S.backend.isDemo ? '<p class="fine">デモモードでは招待リンクは使えません。「設定」から相手の画面を見てみることができます。</p>' : ''}`;
}

/* ----- 設定 ----- */
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
  const nd = S.profile.settings.notifyDaysBefore ?? 3;
  const opts = [[0, 'なし'], [1, '1日前'], [2, '2日前'], [3, '3日前'], [5, '5日前'], [7, '7日前']];
  return `<header class="topbar"><h1 class="page-title">設定</h1></header>
    <div class="group">
      <h2 class="group-title"><label for="name">表示する名前</label></h2>
      <p class="group-text">共有した相手の画面に出ます。</p>
      <input id="name" class="field" data-keep="name" maxlength="20" value="${esc(S.profile.name)}" autocomplete="nickname">
    </div>
    ${pillSettingsHTML()}
    ${ownPillOn() ? '' : `<div class="group">
      <h2 class="group-title">生理予定の通知</h2>
      <p class="group-text">予定日の何日前に知らせるか。</p>
      <div class="seg" role="radiogroup" aria-label="通知のタイミング">${opts.map(([v, l]) => `<button class="seg-btn ${nd === v ? 'on' : ''}" role="radio" aria-checked="${nd === v}" data-act="notify-days" data-v="${v}">${l}</button>`).join('')}</div>
    </div>`}
    ${pushBlock()}
    ${S.backend.isDemo ? `<div class="group">
      <h2 class="group-title">デモ</h2>
      <div class="actions"><button class="btn soft" data-act="demo-partner">${icon('swap')}相手の画面を見てみる</button>
      <button class="btn ghost" data-act="demo-reset">サンプルの記録にもどす</button></div></div>` : ''}
    <div class="group">
      <h2 class="group-title">アカウント</h2>
      <p class="group-text">${esc(S.user.email || 'デモ')}</p>
      <button class="btn ghost" data-act="signout">${icon('door')}ログアウト</button>
    </div>
    <p class="fine">予定日は、最近6回の周期の平均から計算しています。体のことで気になることがあれば、婦人科で相談してください。</p>`;
}

function partnerSettings() {
  const name = ownerName();
  return `<header class="topbar"><h1 class="page-title">設定</h1></header>
    ${pushBlock()}
    <div class="group">
      <h2 class="group-title">共有</h2>
      <p class="group-text">${esc(name)}さんのカレンダーを見ています。</p>
      ${S.demoPartner ? `<button class="btn soft" data-act="demo-back">${icon('swap')}もとの画面にもどる</button>`
        : `<button class="btn ghost" data-act="leave">見るのをやめる</button>`}
    </div>
    ${S.demoPartner ? '' : `<div class="group"><h2 class="group-title">アカウント</h2><p class="group-text">${esc(S.user.email)}</p>
      <button class="btn ghost" data-act="signout">${icon('door')}ログアウト</button></div>`}`;
}

/* ----- ピル ----- */
function pillSummaryHTML() {
  const pc = pillConf(S.profile.pill);
  const t = PILL_TYPES[pc.type];
  const begin = t.continuous ? pc.cycleStart : pc.startDate;
  const yesterday = addDays(S.today, -1);
  let from = addDays(S.today, -28);
  if (from < begin) from = begin;
  const miss = from <= yesterday ? missedCount(pc, S.pills, from, yesterday) : 0;
  const days = from <= yesterday ? diffDays(from, yesterday) + 1 : 0;
  return `<h2 class="sub-title">ピル</h2>
    <dl class="figures">
      <div><dt>飲んでいるピル</dt><dd class="range">${esc(t.long)}</dd></div>
      <div><dt>最近${days}日の飲みわすれ</dt><dd>${miss}<small>日</small></dd></div>
    </dl>`;
}

function pillSheetHTML() {
  const pc = pillConf(S.profile.pill);
  const t = PILL_TYPES[pc.type];
  const anchor = S.sheetAnchor || S.today;
  const dates = sheetDates(pc, anchor, S.today);
  if (!dates.length) return '';
  const first = dates[0];
  const last = dates[dates.length - 1];
  const cells = dates.map((d) => {
    const info = pillDay(pc, d);
    const took = !!S.pills[d];
    const cls = ['pc'];
    let mark = '';
    let label = fmtLong(d);
    if (!info) { cls.push('none'); }
    else if (info.kind === 'rest') { cls.push('rest'); mark = '<span class="pc-word">休</span>'; label += '、休薬'; }
    else {
      if (info.kind === 'placebo') cls.push('placebo');
      if (took) { cls.push('took'); mark = icon('check'); label += '、飲んだ'; }
      else if (d < S.today) { cls.push('miss'); mark = `<span class="pc-n">${info.kind === 'placebo' ? '偽' : info.day}</span>`; label += '、記録なし'; }
      else if (d === S.today) { cls.push('now'); mark = `<span class="pc-n">${info.kind === 'placebo' ? '偽' : info.day}</span>`; label += '、今日'; }
      else { cls.push('later'); mark = `<span class="pc-n">${info.kind === 'placebo' ? '偽' : info.day}</span>`; }
    }
    const can = info && needsPill(info) && d <= S.today;
    const tag = can ? 'button' : 'span';
    return `<${tag} class="${cls.join(' ')}" ${can ? `data-act="pill-day" data-date="${d}" aria-pressed="${took}"` : ''} aria-label="${label}">
      <span class="pc-date">${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}</span><span class="pc-dot">${mark}</span></${tag}>`;
  }).join('');
  const yesterday = addDays(S.today, -1);
  const missTo = last < yesterday ? last : yesterday;
  const miss = first <= missTo ? missedCount(pc, S.pills, first, missTo) : 0;
  const canPrev = !t.continuous && first > pc.startDate;
  const canNext = !t.continuous && last < S.today;
  const info = pillDay(pc, S.today);
  let contCtl = '';
  if (t.continuous && info) {
    contCtl = info.kind === 'rest'
      ? `<p class="note-soft">休薬中です(${info.day}日目)。${pc.restDays}日たつと自動で次の周期になります。</p>
         <button class="btn ghost" data-act="pill-rest-cancel">${icon('close')}休薬を取り消す</button>`
      : `<button class="btn soft" data-act="pill-rest-start">${icon('pause')}今日から休薬をはじめる</button>`;
  }
  return `<section class="sheet-card">
    <div class="sheet-card-head">
      ${t.continuous ? '' : `<button class="icon-btn" data-act="sheet-nav" data-step="-1" aria-label="前のシート" ${canPrev ? '' : 'disabled'}>${icon('chevL')}</button>`}
      <h2 class="sheet-card-title">${t.continuous ? '今の周期' : 'シート'}<span>${fmtShort(first)}〜${fmtShort(last)}</span></h2>
      ${t.continuous ? '' : `<button class="icon-btn" data-act="sheet-nav" data-step="1" aria-label="次のシート" ${canNext ? '' : 'disabled'}>${icon('chevR')}</button>`}
    </div>
    <div class="pc-grid">${cells}</div>
    <div class="legend pc-legend">
      <span><span class="pc-mini took">${icon('check')}</span>飲んだ</span>
      <span><span class="pc-mini miss"></span>記録なし</span>
      ${t.placebo ? '<span><span class="pc-mini placebo"></span>偽薬</span>' : ''}
      ${t.rest || t.continuous ? '<span><span class="pc-mini rest">休</span>休薬</span>' : ''}
    </div>
    <p class="sheet-card-foot">${t.continuous ? 'この周期' : 'このシート'}の飲みわすれ <b>${miss}日</b></p>
    ${contCtl ? `<div class="actions">${contCtl}</div>` : ''}
    <p class="fine">日付をタップすると、飲んだ記録をつけたり消したりできます。</p>
  </section>`;
}

const REMIND_OPTS = [[7, '1週間前'], [3, '3日前'], [1, '前日'], [0, '当日の朝']];
const remindText = (list) => {
  const l = REMIND_OPTS.filter(([v]) => (list || []).includes(v)).map(([, t]) => t);
  return l.length ? `${l.join('と')}に通知` : '通知なし';
};

function apptsHTML() {
  const all = [...S.appts].sort((a, b) => ((a.date + (a.time || '')) < (b.date + (b.time || '')) ? -1 : 1));
  const next = all.filter((a) => a.date >= S.today);
  const past = all.filter((a) => a.date < S.today).slice(-3).reverse();
  const row = (a, old) => `<li class="appt ${old ? 'old' : ''}">
      <div class="appt-date"><span class="appt-md">${Number(a.date.slice(5, 7))}/${Number(a.date.slice(8, 10))}</span><span class="appt-wd">${wd(a.date)}</span></div>
      <div class="appt-body">
        <p class="appt-place">${esc(a.place || '病院')}</p>
        <p class="appt-meta">${a.time ? `${esc(a.time)}〜` : '時間未定'}${old ? '' : `<br>${remindText(a.remind)}`}</p>
        ${a.memo ? `<p class="appt-memo">${esc(a.memo)}</p>` : ''}
      </div>
      ${old ? '' : `<button class="icon-btn" data-act="appt-edit" data-id="${esc(a.id)}" aria-label="予約を編集">${icon('edit')}</button>`}
    </li>`;
  return `<h2 class="sub-title">病院の予約</h2>
    ${next.length ? `<ul class="appts">${next.map((a) => row(a, false)).join('')}</ul>` : '<p class="note-soft">これからの予約はありません。</p>'}
    <button class="btn soft wide no-print" data-act="appt-new">${icon('plus')}予約を追加</button>
    ${past.length ? `<h3 class="sub-title small">過去の予約</h3><ul class="appts">${past.map((a) => row(a, true)).join('')}</ul>` : ''}`;
}

function pillScreen() {
  const pc = pillConf(S.profile.pill);
  const t = PILL_TYPES[pc.type];
  return `<header class="topbar"><h1 class="page-title">ピル</h1><span class="type-tag">${esc(t.long)}</span></header>
    ${heroHTML(ownView(), true, true)}
    ${pillSheetHTML()}
    ${apptsHTML()}`;
}

function pillSettingsHTML() {
  const pc = pillConf(S.profile.pill);
  const t = PILL_TYPES[pc.type];
  const head = `<button class="switch-row bare" data-act="pill-enable" role="switch" aria-checked="${pc.enabled}">
      <span class="group-title">ピルを飲んでいる</span><span class="switch ${pc.enabled ? 'on' : ''}"><span class="knob"></span></span></button>`;
  if (!pc.enabled) return `<div class="group">${head}<p class="group-text">オンにすると、飲んだかどうかのチェック表と飲みわすれの通知が使えます。</p></div>`;
  const types = Object.entries(PILL_TYPES).map(([k, v]) => `<button class="seg-btn ${pc.type === k ? 'on' : ''}" role="radio" aria-checked="${pc.type === k}" data-act="pill-type" data-v="${k}">${v.label}</button>`).join('');
  const again = [[0, 'なし'], [30, '30分後'], [60, '1時間後'], [120, '2時間後'], [180, '3時間後']];
  const startField = t.continuous
    ? `<label class="field-label" for="pill-cycle">いまの連続服用をはじめた日</label>
       <input id="pill-cycle" class="field" type="date" data-pill="cycleStart" value="${esc(pc.cycleStart || '')}" max="${S.today}">
       <p class="field-label">休薬の日数</p>
       <div class="seg">${[3, 4, 5, 7].map((v) => `<button class="seg-btn ${pc.restDays === v ? 'on' : ''}" role="radio" aria-checked="${pc.restDays === v}" data-act="pill-restdays" data-v="${v}">${v}日</button>`).join('')}</div>`
    : `<label class="field-label" for="pill-start">いまのシートの1錠目を飲んだ日</label>
       <input id="pill-start" class="field" type="date" data-pill="startDate" value="${esc(pc.startDate || '')}" max="${S.today}">`;
  return `<div class="group">${head}
    <p class="field-label">ピルの種類</p>
    <div class="seg" role="radiogroup" aria-label="ピルの種類">${types}</div>
    <p class="group-text type-note">${esc(t.long)}</p>
    ${startField}
    ${isPillOn(pc) ? '' : '<p class="note-warn">日付を入れると、ピルの表示がはじまります。</p>'}
    <label class="field-label" for="pill-time">飲む時刻</label>
    <input id="pill-time" class="field time" type="time" data-pill="time" value="${esc(pc.time)}">
    <p class="field-label">飲んだ記録がなければ、もう一度知らせる</p>
    <div class="seg">${again.map(([v, l]) => `<button class="seg-btn ${pc.remindAfter === v ? 'on' : ''}" role="radio" aria-checked="${pc.remindAfter === v}" data-act="pill-again" data-v="${v}">${l}</button>`).join('')}</div>
    <p class="fine">通知は数分〜十数分おくれて届くことがあります。ピルの飲み方は、処方された病院の説明にしたがってください。</p>
  </div>`;
}

/* ----- 重ねて出す画面 ----- */
function modalHTML() {
  const m = S.modal;
  if (!m) return '';
  if (m.kind === 'confirm') {
    return `<div class="scrim" data-act="modal-close"></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mt">
        <h2 id="mt" class="sheet-title">${esc(m.title)}</h2>
        <p class="sheet-text">${esc(m.text)}</p>
        <div class="actions"><button class="btn danger" data-act="modal-ok">${esc(m.ok)}</button>
        <button class="btn ghost" data-act="modal-close">やめる</button></div>
      </div>`;
  }
  if (m.kind === 'appt') {
    const a = m.draft;
    return `<div class="scrim" data-act="modal-close"></div>
      <div class="sheet tall" role="dialog" aria-modal="true" aria-labelledby="at">
        <div class="sheet-head"><h2 id="at" class="sheet-title">${a.id ? '予約を編集' : '予約を追加'}</h2>
          <button class="icon-btn" data-act="modal-close" aria-label="とじる">${icon('close')}</button></div>
        <div class="two">
          <div><label class="field-label" for="a-date">日付</label><input id="a-date" class="field" type="date" data-appt="date" value="${esc(a.date || '')}"></div>
          <div><label class="field-label" for="a-time">時刻</label><input id="a-time" class="field time" type="time" data-appt="time" value="${esc(a.time || '')}"></div>
        </div>
        <label class="field-label" for="a-place">病院の名前</label>
        <input id="a-place" class="field" data-appt="place" maxlength="40" value="${esc(a.place || '')}" placeholder="例:さくらレディースクリニック">
        <label class="field-label" for="a-memo">メモ</label>
        <input id="a-memo" class="field" data-appt="memo" maxlength="80" value="${esc(a.memo || '')}" placeholder="例:ピルの処方、保険証">
        <p class="field-label">知らせるタイミング</p>
        <div class="seg">${REMIND_OPTS.map(([v, l]) => { const on = (a.remind || []).includes(v); return `<button class="seg-btn ${on ? 'on' : ''}" aria-pressed="${on}" data-act="appt-remind" data-v="${v}">${on ? icon('check') : ''}${l}</button>`; }).join('')}</div>
        <p class="fine">「当日の朝」は8時ごろ、それ以外はその日の8時ごろに届きます。</p>
        <button class="btn primary wide" data-act="appt-save">${a.id ? '保存する' : '追加する'}</button>
        ${a.id ? `<button class="btn ghost wide" data-act="appt-del">${icon('trash')}この予約を消す</button>` : ''}
      </div>`;
  }
  if (m.kind === 'bulk') {
    const parsed = parseBulk(S.bulkText, S.today);
    const have = new Set(S.periods.map((p) => p.start));
    const fresh = parsed.periods.filter((p) => !have.has(p.start));
    const dup = parsed.periods.length - fresh.length;
    let status = '';
    if (S.bulkText.trim()) {
      status = `${fresh.length}件を読みとりました${dup ? `(${dup}件はすでにあります)` : ''}`;
      if (parsed.errors.length) status += `。${parsed.errors.join('・')}行目は読みとれませんでした`;
    }
    return `<div class="scrim" data-act="modal-close"></div>
      <div class="sheet tall" role="dialog" aria-modal="true" aria-labelledby="bt">
        <div class="sheet-head"><h2 id="bt" class="sheet-title">過去の記録をまとめて入力</h2>
          <button class="icon-btn" data-act="modal-close" aria-label="とじる">${icon('close')}</button></div>
        <p class="sheet-text">ルナルナなどの履歴を見ながら、1行に1回分ずつ書いてください。終わった日はなくてもかまいません。</p>
        <textarea class="field area" data-keep="bulk" data-input="bulk" rows="7" placeholder="2026/9/12〜9/17&#10;2026/8/15〜8/20&#10;7/18〜7/22">${esc(S.bulkText)}</textarea>
        <p class="bulk-status" aria-live="polite">${esc(status)}</p>
        <button class="btn primary wide" data-act="bulk-save" ${fresh.length ? '' : 'disabled'}>${fresh.length ? `${fresh.length}件を追加する` : '追加する'}</button>
      </div>`;
  }
  return '';
}

/* ---------- 操作 ---------- */
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const b = S.backend;
  switch (act) {
    case 'signin':
      b.signIn().catch((e) => { console.error(e); toast('ログインできませんでした。もう一度ためしてください。'); });
      break;
    case 'tab': S.tab = el.dataset.tab; S.inviteLink = S.tab === 'share' ? S.inviteLink : null; render(); window.scrollTo(0, 0); break;
    case 'pick': S.selected = el.dataset.date; render(); break;
    case 'month': {
      const [y, m] = S.month.split('-').map(Number);
      const d = new Date(Date.UTC(y, m - 1 + Number(el.dataset.step), 1));
      S.month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      render();
      break;
    }
    case 'go-today': S.month = S.today.slice(0, 7); S.selected = S.today; render(); break;
    case 'start': startPeriod(S.selected); break;
    case 'end': run(() => b.updatePeriod(el.dataset.id, { end: S.selected }), `${md(S.selected)}でおわりにしました`); break;
    case 'del-period':
      S.modal = { kind: 'confirm', title: 'この生理の記録を消しますか?', text: 'はじまった日と終わった日の記録が消えます。体調の記録は残ります。', ok: '消す', onOk: () => run(() => b.deletePeriod(el.dataset.id), '消しました') };
      render();
      break;
    case 'sym': {
      const k = el.dataset.key;
      const cur = S.days[S.selected] || [];
      const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
      S.days = { ...S.days, [S.selected]: next };
      render();
      run(() => b.setSymptoms(S.selected, next));
      break;
    }
    case 'print': window.print(); break;
    case 'bulk-open': S.modal = { kind: 'bulk' }; render(); break;
    case 'bulk-save': saveBulk(); break;
    case 'share-toggle': {
      const k = el.dataset.key;
      const share = { ...SHARE_DEFAULTS, ...S.profile.share, [k]: !({ ...SHARE_DEFAULTS, ...S.profile.share })[k] };
      S.profile.share = share;
      render();
      run(async () => { await b.saveProfile({ share }); syncShared(); });
      break;
    }
    case 'invite':
      run(async () => {
        const code = await b.createInvite(S.profile.name);
        S.inviteLink = `${location.origin}${location.pathname}?invite=${code}`;
      });
      break;
    case 'copy-invite':
      navigator.clipboard.writeText(S.inviteLink).then(() => toast('リンクをコピーしました'), () => toast('コピーできませんでした。リンクを長押ししてコピーしてください。'));
      break;
    case 'send-invite':
      if (navigator.share) navigator.share({ title: 'しずく', text: 'カレンダーを共有します。このリンクを開いてログインしてください。', url: S.inviteLink }).catch(() => {});
      else navigator.clipboard.writeText(S.inviteLink).then(() => toast('リンクをコピーしました'));
      break;
    case 'remove-viewer':
      S.modal = { kind: 'confirm', title: '共有を解除しますか?', text: 'この人は、あなたのカレンダーを見られなくなります。', ok: '解除する', onOk: () => run(() => b.removeViewer(el.dataset.uid), '解除しました') };
      render();
      break;
    case 'notify-days': {
      const v = Number(el.dataset.v);
      S.profile.settings = { ...S.profile.settings, notifyDaysBefore: v };
      render();
      run(() => b.saveProfile({ settings: { notifyDaysBefore: v } }));
      break;
    }
    case 'push':
      run(async () => {
        S.push = await b.enablePush();
        if (S.push === 'granted') toast('通知をオンにしました');
      });
      break;
    case 'demo-partner': S.demoPartner = true; S.tab = 'calendar'; S.selected = S.today; S.month = S.today.slice(0, 7); render(); window.scrollTo(0, 0); break;
    case 'demo-back': S.demoPartner = false; S.tab = 'settings'; render(); break;
    case 'demo-reset': b.reset(); toast('サンプルの記録にもどしました'); break;
    case 'signout': b.signOut(); break;
    case 'leave':
      S.modal = {
        kind: 'confirm', title: '見るのをやめますか?', text: 'もう一度見るには、新しい招待リンクが必要です。', ok: 'やめる',
        onOk: () => run(async () => {
          await b.leaveShare(S.profile.following);
          S.profile = await b.loadProfile();
          S.shared = null;
          S.tab = 'calendar';
          startWatching();
        }),
      };
      render();
      break;
    case 'invite-accept':
      run(async () => {
        await b.acceptInvite(S.invite, S.inviteInfo, S.profile.name);
        sessionStorage.removeItem('shizuku-invite');
        S.invite = null;
        S.inviteInfo = undefined;
        S.profile = await b.loadProfile();
        S.tab = 'calendar';
        startWatching();
      }, '見られるようになりました');
      break;
    case 'invite-dismiss':
      sessionStorage.removeItem('shizuku-invite');
      S.invite = null;
      S.inviteInfo = undefined;
      render();
      break;
    case 'pill-today': togglePill(S.today); break;
    case 'pill-day': togglePill(el.dataset.date); break;
    case 'sheet-nav': {
      const base = S.sheetAnchor || S.today;
      S.sheetAnchor = addDays(base, 28 * Number(el.dataset.step));
      if (S.sheetAnchor > S.today) S.sheetAnchor = null;
      render();
      break;
    }
    case 'pill-enable': {
      const pc = pillConf(S.profile.pill);
      savePill({ enabled: !pc.enabled });
      break;
    }
    case 'pill-type': {
      const v = el.dataset.v;
      const pc = pillConf(S.profile.pill);
      const patch = { type: v };
      if (PILL_TYPES[v].continuous && !pc.cycleStart && pc.startDate) patch.cycleStart = pc.startDate;
      if (!PILL_TYPES[v].continuous && !pc.startDate && pc.cycleStart) patch.startDate = pc.cycleStart;
      savePill(patch);
      break;
    }
    case 'pill-again': savePill({ remindAfter: Number(el.dataset.v) }); break;
    case 'pill-restdays': savePill({ restDays: Number(el.dataset.v) }); break;
    case 'pill-rest-start':
      S.modal = {
        kind: 'confirm', title: '今日から休薬をはじめますか?', text: `${pillConf(S.profile.pill).restDays}日間は飲まない日になり、そのあと自動で次の周期になります。`, ok: '休薬をはじめる',
        onOk: () => {
          const pc = pillConf(S.profile.pill);
          const cur = pillDay(pc, S.today);
          savePill({ cycleStart: cur ? cur.cycleStart : pc.cycleStart, restStart: S.today }, '休薬をはじめました');
        },
      };
      render();
      break;
    case 'pill-rest-cancel': {
      const pc = pillConf(S.profile.pill);
      savePill({ restStart: null, cycleStart: pc.cycleStart }, '休薬を取り消しました');
      break;
    }
    case 'appt-new': S.modal = { kind: 'appt', draft: { date: '', time: '', place: '', memo: '', remind: [1, 0] } }; render(); break;
    case 'appt-edit': {
      const a = S.appts.find((x) => x.id === el.dataset.id);
      if (a) { S.modal = { kind: 'appt', draft: { ...a, remind: [...(a.remind || [])] } }; render(); }
      break;
    }
    case 'appt-remind': {
      const v = Number(el.dataset.v);
      const d = S.modal.draft;
      d.remind = d.remind.includes(v) ? d.remind.filter((x) => x !== v) : [...d.remind, v].sort((x, y) => y - x);
      render();
      break;
    }
    case 'appt-save': {
      const d = S.modal.draft;
      if (!d.date) { toast('日付を入れてください'); break; }
      const data = { date: d.date, time: d.time || '', place: (d.place || '').trim(), memo: (d.memo || '').trim(), remind: d.remind || [] };
      if (d.id) data.id = d.id;
      S.modal = null;
      run(() => b.saveAppointment(data), d.id ? '予約を保存しました' : '予約を追加しました');
      break;
    }
    case 'appt-del': {
      const id = S.modal.draft.id;
      S.modal = { kind: 'confirm', title: 'この予約を消しますか?', text: '通知も届かなくなります。', ok: '消す', onOk: () => run(() => b.deleteAppointment(id), '予約を消しました') };
      render();
      break;
    }
    case 'modal-close': S.modal = null; render(); break;
    case 'modal-ok': {
      const fn = S.modal && S.modal.onOk;
      S.modal = null;
      render();
      if (fn) fn();
      break;
    }
    default: break;
  }
});

document.addEventListener('input', (ev) => {
  if (ev.target.dataset.input === 'bulk') { S.bulkText = ev.target.value; render(); }
  if (ev.target.dataset.appt && S.modal && S.modal.kind === 'appt') S.modal.draft[ev.target.dataset.appt] = ev.target.value;
});

document.addEventListener('change', (ev) => {
  const f = ev.target.dataset.pill;
  if (f) {
    const v = ev.target.value;
    if (!v && f !== 'time') return;
    const patch = { [f]: v || '21:00' };
    if (f === 'cycleStart') patch.restStart = null;
    savePill(patch);
    return;
  }
  if (ev.target.id === 'name') {
    const name = ev.target.value.trim().slice(0, 20);
    S.profile.name = name;
    run(async () => { await S.backend.saveProfile({ name }); syncShared(); }, '名前を保存しました');
  }
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && S.modal) { S.modal = null; render(); }
});

function savePill(patch, okText) {
  S.profile.pill = { ...pillConf(S.profile.pill), ...patch };
  S.sheetAnchor = null;
  render();
  run(async () => { await S.backend.saveProfile({ pill: patch }); syncShared(); }, okText);
}

function togglePill(date) {
  const now = !S.pills[date];
  S.pills = { ...S.pills };
  if (now) S.pills[date] = true; else delete S.pills[date];
  render();
  run(async () => { await S.backend.setPill(date, now); syncShared(); }, date === S.today && now ? '飲んだ記録をつけました' : null);
}

function startPeriod(date) {
  const ps = sortPeriods(S.periods);
  const st = stats(ps);
  const later = ps.find((p) => p.start > date);
  let end = null;
  if (later || diffDays(date, S.today) > OPEN_MAX) {
    end = addDays(date, st.avgLen - 1);
    if (later && end >= later.start) end = addDays(later.start, -1);
    if (end > S.today) end = S.today;
  }
  run(() => S.backend.addPeriod({ start: date, end }), end ? `${md(date)}〜${md(end)}を記録しました` : `${md(date)}からの生理を記録しました`);
}

function saveBulk() {
  const parsed = parseBulk(S.bulkText, S.today);
  const have = new Set(S.periods.map((p) => p.start));
  const fresh = parsed.periods.filter((p) => !have.has(p.start));
  const st = stats([...S.periods, ...fresh]);
  const all = sortPeriods([...S.periods, ...fresh]);
  run(async () => {
    for (const p of fresh) {
      let { end } = p;
      if (!end) {
        const later = all.find((x) => x.start > p.start);
        end = addDays(p.start, st.avgLen - 1);
        if (later && end >= later.start) end = addDays(later.start, -1);
        if (end > S.today) end = null;
      }
      await S.backend.addPeriod({ start: p.start, end });
    }
    S.modal = null;
    S.bulkText = '';
  }, `${fresh.length}件を追加しました`);
}

init();
