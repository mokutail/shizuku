// 健康診断の項目(よくある結果用紙の並び)
// kind: num=数値 / qual=−〜3+ / find=所見なし・あり / text=自由記述
export const GROUPS = [
  {
    key: 'body', label: '身体計測', items: [
      { key: 'height', label: '身長', unit: 'cm', kind: 'num' },
      { key: 'weight', label: '体重', unit: 'kg', kind: 'num' },
      { key: 'bmi', label: 'BMI', unit: '', kind: 'num' },
      { key: 'waist', label: '腹囲', unit: 'cm', kind: 'num' },
      { key: 'fat', label: '体脂肪率', unit: '%', kind: 'num' },
    ],
  },
  {
    key: 'bp', label: '血圧', items: [
      { key: 'sbp', label: '血圧(上)', unit: 'mmHg', kind: 'num' },
      { key: 'dbp', label: '血圧(下)', unit: 'mmHg', kind: 'num' },
      { key: 'pulse', label: '脈拍', unit: '回/分', kind: 'num' },
    ],
  },
  {
    key: 'eye', label: '視力・聴力', items: [
      { key: 'eyeR', label: '視力 右(裸眼)', unit: '', kind: 'num' },
      { key: 'eyeL', label: '視力 左(裸眼)', unit: '', kind: 'num' },
      { key: 'eyeRc', label: '視力 右(矯正)', unit: '', kind: 'num' },
      { key: 'eyeLc', label: '視力 左(矯正)', unit: '', kind: 'num' },
      { key: 'earR1', label: '聴力 右 1000Hz', kind: 'find' },
      { key: 'earR4', label: '聴力 右 4000Hz', kind: 'find' },
      { key: 'earL1', label: '聴力 左 1000Hz', kind: 'find' },
      { key: 'earL4', label: '聴力 左 4000Hz', kind: 'find' },
    ],
  },
  {
    key: 'lipid', label: '脂質', items: [
      { key: 'tc', label: '総コレステロール', unit: 'mg/dL', kind: 'num' },
      { key: 'hdl', label: 'HDLコレステロール', unit: 'mg/dL', kind: 'num' },
      { key: 'ldl', label: 'LDLコレステロール', unit: 'mg/dL', kind: 'num' },
      { key: 'nonhdl', label: 'non-HDLコレステロール', unit: 'mg/dL', kind: 'num' },
      { key: 'tg', label: '中性脂肪', unit: 'mg/dL', kind: 'num' },
    ],
  },
  {
    key: 'liver', label: '肝機能', items: [
      { key: 'ast', label: 'AST(GOT)', unit: 'U/L', kind: 'num' },
      { key: 'alt', label: 'ALT(GPT)', unit: 'U/L', kind: 'num' },
      { key: 'ggt', label: 'γ-GTP', unit: 'U/L', kind: 'num' },
      { key: 'alp', label: 'ALP', unit: 'U/L', kind: 'num' },
      { key: 'tbil', label: '総ビリルビン', unit: 'mg/dL', kind: 'num' },
      { key: 'tp', label: '総蛋白', unit: 'g/dL', kind: 'num' },
      { key: 'alb', label: 'アルブミン', unit: 'g/dL', kind: 'num' },
    ],
  },
  {
    key: 'kidney', label: '腎機能・尿酸', items: [
      { key: 'cre', label: 'クレアチニン', unit: 'mg/dL', kind: 'num' },
      { key: 'egfr', label: 'eGFR', unit: 'mL/分/1.73㎡', kind: 'num' },
      { key: 'bun', label: '尿素窒素', unit: 'mg/dL', kind: 'num' },
      { key: 'ua', label: '尿酸', unit: 'mg/dL', kind: 'num' },
    ],
  },
  {
    key: 'sugar', label: '糖代謝', items: [
      { key: 'fbs', label: '空腹時血糖', unit: 'mg/dL', kind: 'num' },
      { key: 'hba1c', label: 'HbA1c', unit: '%', kind: 'num' },
    ],
  },
  {
    key: 'blood', label: '血液一般', items: [
      { key: 'rbc', label: '赤血球', unit: '万/μL', kind: 'num' },
      { key: 'hb', label: '血色素量(ヘモグロビン)', unit: 'g/dL', kind: 'num' },
      { key: 'ht', label: 'ヘマトクリット', unit: '%', kind: 'num' },
      { key: 'mcv', label: 'MCV', unit: 'fL', kind: 'num' },
      { key: 'wbc', label: '白血球', unit: '/μL', kind: 'num' },
      { key: 'plt', label: '血小板', unit: '万/μL', kind: 'num' },
      { key: 'fe', label: '血清鉄', unit: 'μg/dL', kind: 'num' },
    ],
  },
  {
    key: 'urine', label: '尿検査', items: [
      { key: 'uPro', label: '尿蛋白', kind: 'qual' },
      { key: 'uGlu', label: '尿糖', kind: 'qual' },
      { key: 'uBld', label: '尿潜血', kind: 'qual' },
      { key: 'uUro', label: 'ウロビリノーゲン', kind: 'qual' },
    ],
  },
  {
    key: 'exam', label: '画像・その他の検査', items: [
      { key: 'xray', label: '胸部X線', kind: 'text' },
      { key: 'ecg', label: '心電図', kind: 'text' },
      { key: 'echo', label: '腹部超音波', kind: 'text' },
      { key: 'fundus', label: '眼底', kind: 'text' },
      { key: 'stomach', label: '胃の検査', kind: 'text' },
      { key: 'breast', label: '乳がん検診', kind: 'text' },
      { key: 'uterus', label: '子宮頸がん検診', kind: 'text' },
      { key: 'stool', label: '便潜血', kind: 'text' },
    ],
  },
];

export const ITEMS = Object.fromEntries(GROUPS.flatMap((g) => g.items.map((i) => [i.key, { ...i, group: g.key }])));

export const QUAL = ['−', '±', '+', '2+', '3+'];
export const FIND = ['所見なし', '所見あり'];
export const JUDGES = ['A', 'B', 'C', 'D', 'E', 'F'];

/** 判定の重さ(A=0)。色分けに使う */
export const judgeLevel = (j) => {
  if (!j) return -1;
  const i = JUDGES.indexOf(String(j).charAt(0));
  return i < 0 ? -1 : i;
};

/** カスタム項目のキー */
export const customKey = (name) => 'c:' + String(name).trim();

/** その健診の全項目(カタログ+カスタム)を、値があるものだけ並べる */
export function filledItems(ck) {
  const out = [];
  for (const g of GROUPS) {
    for (const it of g.items) {
      const v = ck.values && ck.values[it.key];
      if (v && (v.v !== '' && v.v != null || v.j)) out.push({ ...it, group: g.key, groupLabel: g.label, val: v });
    }
  }
  for (const c of ck.custom || []) {
    if (!c.name) continue;
    out.push({ key: customKey(c.name), label: c.name, unit: c.unit || '', kind: 'num', group: 'custom', groupLabel: 'その他', val: { v: c.v ?? '', j: c.j || '' } });
  }
  return out;
}

export function valueOf(ck, key) {
  if (key.startsWith('c:')) {
    const c = (ck.custom || []).find((x) => customKey(x.name) === key);
    return c ? { v: c.v ?? '', j: c.j || '' } : null;
  }
  return (ck.values && ck.values[key]) || null;
}

export const toNumber = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
};
