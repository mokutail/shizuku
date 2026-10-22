// 結果用紙の写真から文字を読み取り、検査項目に当てはめる(読み取りはスマホの中だけで行う)
import { ITEMS } from './items.js';

const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

/* ---------- 項目名のよみかた ---------- */
// 長い名前・特別な名前を先に判定する(例:ヘモグロビンA1c は ヘモグロビン より先)
const ALIASES = [
  ['hba1c', /hba1c|hbalc|hba1|ヘモグロビンa1c|ヘモグロビンエーワンシー/],
  ['nonhdl', /non-?hdl|ノンhdl/],
  ['hdl', /hdl/],
  ['ldl', /ldl/],
  ['tc', /総コレステ/],
  ['tg', /中性脂肪|トリグリセ/],
  ['ast', /ast|got/],
  ['alt', /alt|gpt/],
  ['ggt', /[γyr]-?gt|ggt|ガンマ/],
  ['alp', /alp/],
  ['tbil', /ビリルビン/],
  ['tp', /総蛋白|総たんぱく|総タンパク/],
  ['alb', /アルブミン/],
  ['cre', /クレアチニン/],
  ['egfr', /egfr/],
  ['bun', /尿素窒素|bun/],
  ['ua', /尿酸/],
  ['uPro', /尿蛋白|尿たんぱく|尿タンパク|蛋白\(尿\)/],
  ['uGlu', /尿糖|糖\(尿\)/],
  ['uBld', /尿潜血|潜血\(尿\)/],
  ['uUro', /ウロビリ/],
  ['stool', /便潜血/],
  ['fbs', /空腹時血糖|血糖|グルコース/],
  ['rbc', /赤血球/],
  ['hb', /血色素|ヘモグロビン/],
  ['ht', /ヘマトクリット/],
  ['mcv', /mcv/],
  ['wbc', /白血球/],
  ['plt', /血小板/],
  ['fe', /血清鉄/],
  ['height', /身長/],
  ['bmi', /bmi/],
  ['waist', /腹囲|ウエスト/],
  ['fat', /体脂肪/],
  ['weight', /体重/],
  ['sbp', /収縮期|最高血圧|血圧\(?上/],
  ['dbp', /拡張期|最低血圧|血圧\(?下/],
  ['pulse', /脈拍/],
  ['eye', /視力/],
  ['ear', /聴力/],
  ['xray', /胸部(x|エックス|レントゲン)/],
  ['ecg', /心電図/],
  ['echo', /腹部(超音波|エコー)/],
  ['fundus', /眼底/],
  ['breast', /乳がん|乳房|マンモ/],
  ['uterus', /子宮/],
  ['stomach', /胃(の|部|内視鏡|透視|x|バリウム)|バリウム/],
];

// ありえる値のはば(小数点の読み落としを直すのに使う)
const RANGE = {
  height: [120, 200], weight: [30, 150], bmi: [12, 45], waist: [50, 130], fat: [5, 60],
  sbp: [70, 220], dbp: [40, 140], pulse: [35, 150], eyeR: [0.01, 2.5], eyeL: [0.01, 2.5], eyeRc: [0.01, 2.5], eyeLc: [0.01, 2.5],
  tc: [80, 400], hdl: [15, 150], ldl: [20, 300], nonhdl: [40, 330], tg: [20, 1500],
  ast: [5, 500], alt: [3, 500], ggt: [5, 1000], alp: [20, 1000], tbil: [0.1, 5], tp: [4, 10], alb: [2, 6],
  cre: [0.2, 5], egfr: [5, 150], bun: [3, 60], ua: [1, 12], fbs: [50, 400], hba1c: [3.5, 15],
  rbc: [250, 700], hb: [6, 20], ht: [20, 60], mcv: [60, 120], wbc: [1500, 20000], plt: [5, 80], fe: [10, 300],
};

/* ---------- 文字のととのえ ---------- */
function normalize(line) {
  return line.normalize('NFKC')
    .replace(/[‐‑‒–—―−﹣－]/g, '-')
    .replace(/[〜～]/g, '~');
}
/** 空白をぬいた文字列と、もとの位置の対応 */
function strip(line) {
  let s = '';
  const map = [];
  for (let i = 0; i < line.length; i++) {
    if (/\s/.test(line[i])) continue;
    s += line[i];
    map.push(i);
  }
  return { s: s.toLowerCase(), map };
}

const JUDGE_AFTER = /^[\s|\[\]()「」:.,_'`]*([A-F])(?![A-Za-z])/;

function numberAfter(rest) {
  const cleaned = rest
    .replace(/ml\/分\/1\.73\s*(㎡|m2|m\^?2)?/gi, ' ')
    .replace(/分\/?1?\.?73\s*(㎡|m2|m)?/gi, ' ')
    .replace(/(?<![A-Za-z])[oO](?=[\d.])/g, '0')
    .replace(/1\.73\s*(㎡|m2)/gi, ' ')
    .replace(/[14]000\s*hz/gi, ' ')
    .replace(/10\^?[0-9]/g, ' ');
  const m = cleaned.match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const after = cleaned.slice(m.index + m[0].length);
  const j = after.match(JUDGE_AFTER);
  return { v: m[1].replace(',', '.'), j: j ? j[1] : '' };
}

function qualAfter(rest) {
  const r = rest.replace(/\s/g, '');
  const pats = [
    ['3+', /3\+|\+\+\+/], ['2+', /2\+|\+\+/], ['±', /±|\+-|\(\+-\)/],
    ['+', /\(\+\)|1\+|陽性|\+/], ['−', /\(-\)|陰性|^[|\[]*-|\(ー\)|ー|\([0oO〇]?\)/],
    ['±?', /\(は\)/],
  ];
  let best = null;
  for (const [v, re] of pats) {
    const m = r.match(re);
    if (m && (!best || m.index < best.index)) best = { v, index: m.index, len: m[0].length };
  }
  if (!best) return null;
  const j = r.slice(best.index + best.len).match(JUDGE_AFTER);
  const unsure = best.v === '±?' || /\([0oO〇]?\)/.test(r.slice(best.index, best.index + best.len));
  return { v: best.v.replace('?', ''), j: j ? j[1] : '', check: unsure };
}

function findingAfter(rest, kind) {
  const r = rest.replace(/\s/g, '');
  let v = null;
  const ok = r.search(/異常なし|所見なし|異常を?認めず|異常無|所見無/);
  const ng = r.search(/所見あり|異常あり|要精検|要精密|要再検|要経過|要治療|要医療/);
  if (ok >= 0 && (ng < 0 || ok < ng)) v = kind === 'find' ? '所見なし' : '異常なし';
  else if (ng >= 0) v = kind === 'find' ? '所見あり' : r.slice(ng).match(/^(所見あり|異常あり|要精検|要精密検査?|要再検査?|要経過観察|要治療|要医療)/)[0];
  if (!v) return null;
  const idx = ok >= 0 && v.includes('なし') ? ok : ng;
  const j = r.slice(idx).replace(/^[^|A-F]*/, '').match(JUDGE_AFTER);
  return { v, j: j ? j[1] : '' };
}

function fixRange(key, v) {
  const range = RANGE[key];
  const n = Number(v);
  if (!range || !Number.isFinite(n)) return { v, check: false };
  if (n >= range[0] && n <= range[1]) return { v, check: false };
  for (const d of [10, 100]) {
    const x = n / d;
    if (x >= range[0] && x <= range[1] && !String(v).includes('.')) {
      return { v: String(Math.round(x * 100) / 100), check: true };
    }
  }
  return { v, check: true };
}

/* ---------- 読み取った文字を、項目に当てはめる ---------- */
export function parseSheet(text, today) {
  const values = {};
  let date = null;
  let overall = '';
  const lines = String(text || '').split(/\r?\n/).map(normalize).filter((l) => l.trim());

  for (const line of lines) {
    const { s, map } = strip(line);
    // 受診日
    if (!date) {
      const d = s.match(/(20\d{2})[年/.-](\d{1,2})[月/.-](\d{1,2})/);
      const r = s.match(/(令和|r)(\d{1,2})[年/.-](\d{1,2})[月/.-](\d{1,2})/);
      let y; let m; let dd;
      if (d) [, y, m, dd] = d.map(Number);
      else if (r) { y = 2018 + Number(r[2]); m = Number(r[3]); dd = Number(r[4]); }
      if (y && m >= 1 && m <= 12 && dd >= 1 && dd <= 31) {
        const iso = `${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
        if (!today || iso <= today) date = iso;
      }
    }
    if (!overall) {
      const o = line.normalize('NFKC').replace(/\s/g, '').match(/総合判定[:：]?\(?([A-F])(?![a-z])/i);
      if (o) overall = o[1].toUpperCase();
    }

    // いちばん合う項目名をさがす
    let hit = null;
    for (const [key, re] of ALIASES) {
      const m = s.match(re);
      if (m && (!hit || m.index < hit.index)) hit = { key, index: m.index, len: m[0].length };
    }
    if (!hit) continue;
    let { key } = hit;
    const endStripped = hit.index + hit.len;
    let restStart = endStripped < map.length ? map[endStripped] : line.length;
    // 視力・聴力は、右・左・矯正・周波数も見て決める
    if (key === 'eye' || key === 'ear') {
      const head = s.slice(hit.index, hit.index + 14);
      const right = /右|r(?![a-z])/.test(head);
      const left = /左|l(?![a-z])/.test(head);
      if (!right && !left) continue;
      if (key === 'eye') key = (right ? 'eyeR' : 'eyeL') + (/矯正/.test(head) ? 'c' : '');
      else key = `ear${right ? 'R' : 'L'}${/4000|4k/.test(head) ? '4' : '1'}`;
      const label = s.slice(hit.index).match(/^.*?(裸眼\)?|矯正\)?|hz|右\)?|左\)?)/);
      const skip = label ? hit.index + label[0].length : endStripped;
      restStart = skip < map.length ? map[skip] : line.length;
    }
    if (values[key] || !ITEMS[key]) continue;
    const it = ITEMS[key];
    const rest = line.slice(restStart);
    let got = null;
    if (it.kind === 'num') got = numberAfter(rest);
    else if (it.kind === 'qual') got = qualAfter(rest);
    else got = findingAfter(rest, it.kind);
    if (!got) continue;
    let check = !!got.check;
    if (it.kind === 'num') ({ v: got.v, check } = fixRange(key, got.v));
    values[key] = { v: got.v, j: got.j, check };
  }
  return { date, overall, values };
}

/* ---------- 写真の下ごしらえ(白黒・拡大・コントラスト) ---------- */
function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
async function prepare(src) {
  const img = await loadImg(src);
  const w = Math.min(2400, Math.max(1600, img.naturalWidth));
  const h = Math.round(img.naturalHeight * (w / img.naturalWidth));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h);
  const px = d.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 4) {
    const g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
    px[i] = g;
    hist[g]++;
  }
  const total = w * h;
  let lo = 0; let hi = 255; let acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > total * 0.01) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > total * 0.01) { hi = v; break; } }
  const span = Math.max(hi - lo, 1);
  for (let i = 0; i < px.length; i += 4) {
    const g = Math.max(0, Math.min(255, ((px[i] - lo) * 255) / span));
    px[i] = px[i + 1] = px[i + 2] = g;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

function loadScript() {
  if (window.Tesseract) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = TESSERACT;
    s.onload = res;
    s.onerror = () => rej(new Error('読み取りの準備ができませんでした。インターネットにつながっているか確認してください。'));
    document.head.appendChild(s);
  });
}

/**
 * 写真(dataURL の配列)を読み取る。onProgress(文, 0〜1)
 * 戻り値:{ date, overall, values }(先に見つかった値を優先)
 */
export async function readSheets(images, today, onProgress = () => {}) {
  onProgress('読み取りの準備をしています(初回だけ少し時間がかかります)', 0);
  await loadScript();
  let page = 0;
  const worker = await window.Tesseract.createWorker('jpn', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress(`読み取り中${images.length > 1 ? `(${page + 1}/${images.length}枚目)` : ''}`, (page + m.progress) / images.length);
      else if (/load|init/.test(m.status)) onProgress('読み取りの準備をしています(初回だけ少し時間がかかります)', 0);
    },
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: '4', preserve_interword_spaces: '1' });
    const merged = { date: null, overall: '', values: {} };
    for (page = 0; page < images.length; page++) {
      const canvas = await prepare(images[page]);
      const { data } = await worker.recognize(canvas);
      const r = parseSheet(data.text, today);
      merged.date = merged.date || r.date;
      merged.overall = merged.overall || r.overall;
      for (const [k, v] of Object.entries(r.values)) if (!merged.values[k]) merged.values[k] = v;
    }
    return merged;
  } finally {
    await worker.terminate();
  }
}
