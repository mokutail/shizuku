// このアプリ用に描いたアイコン(24×24、線はすべて丸め)

const P = {
  drop: '<path d="M12 3.2c3.4 4.3 6 7.6 6 10.9a6 6 0 0 1-12 0c0-3.3 2.6-6.6 6-10.9z"/>',
  leaf: '<path d="M5.5 18.5C5.5 11 10.5 6 18.5 5.5 18 13.5 13 18.5 5.5 18.5z"/><path d="M5.5 18.5l6.5-6.5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="4.5"/><path d="M8 3v3.6M16 3v3.6M3.5 10.2h17"/><path d="M12 12.6c1.3 1.6 2.1 2.6 2.1 3.6a2.1 2.1 0 0 1-4.2 0c0-1 .8-2 2.1-3.6z" fill="currentColor" stroke="none"/>',
  notebook: '<path d="M6.5 3.5h10a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3h-10z"/><path d="M6.5 3.5v17M4.5 7.5h4M4.5 12h4M4.5 16.5h4M11 8.5h5M11 12h5"/>',
  share: '<path d="M9 19.5s-5.5-3.4-5.5-7.6A3 3 0 0 1 9 10.3a3 3 0 0 1 5.5 1.6c0 4.2-5.5 7.6-5.5 7.6z"/><path d="M14.6 8.6A2.6 2.6 0 0 1 19.4 10c0 1.9-1.2 3.6-2.6 4.9"/>',
  sliders: '<path d="M4 7.5h9M17.5 7.5H20M4 16.5h2.5M11 16.5h9"/><circle cx="15.2" cy="7.5" r="2.3"/><circle cx="8.8" cy="16.5" r="2.3"/>',
  chevL: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  chevR: '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  send: '<path d="M4 11.5l15.5-7-5 15.5-3.2-6.3z"/><path d="M11.3 13.7L19.5 4.5"/>',
  print: '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="2.5"/><path d="M7 14h10v6.5H7z"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  paste: '<rect x="5" y="4.5" width="14" height="16" rx="3"/><path d="M9 3.5h6v3H9zM8.5 11h7M8.5 14.5h7M8.5 18h4"/>',
  person: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.8-4 3.8-6 7.5-6s6.7 2 7.5 6"/>',
  swap: '<path d="M5 8.5h13l-3.5-3.5M19 15.5H6l3.5 3.5"/>',
  door: '<path d="M14 4.5H6.5v15H14"/><path d="M11 12h9.5M17.5 9l3 3-3 3"/>',

  // 症状
  cramp: '<path d="M6.5 5C4.3 7 3.4 9.8 4 12.8c.8 4 4 6.7 8 6.7s7.2-2.7 8-6.7c.6-3-.3-5.8-2.5-7.8"/><path d="M8 12.5l1.6-1.6 1.6 1.9 1.6-1.9 1.6 1.9 1.6-1.6"/>',
  headache: '<circle cx="10" cy="14" r="6.5"/><path d="M18.5 2.8L16 7.3h3.2L16.8 12"/>',
  backache: '<path d="M10 2.8c-2.4 3-2.4 6.2 0 9.2s2.4 6.2 0 9.2"/><path d="M14.8 8.6l2.4-1.4M15.3 12h2.9M14.8 15.4l2.4 1.4"/>',
  tired: '<rect x="3" y="8" width="15.5" height="9" rx="2.8"/><path d="M21 11v3"/><path d="M6.2 11v3" stroke-width="2.6"/>',
  sleepy: '<path d="M18.5 14.6A7.6 7.6 0 0 1 9.4 5.5a7.6 7.6 0 1 0 9.1 9.1z"/><path d="M14.5 3.5h4l-4 4h4"/>',
  chest: '<path d="M12 19s-6.3-3.9-6.3-8.5A3.3 3.3 0 0 1 12 8.9a3.3 3.3 0 0 1 6.3 1.6C18.3 15.1 12 19 12 19z"/><path d="M3.2 8.8L1.6 7.8M3 12.6H1.2M20.8 8.8l1.6-1M21 12.6h1.8"/>',
  skin: '<circle cx="12" cy="12" r="8.5"/><circle cx="8.8" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="14.8" cy="9.2" r="1" fill="currentColor" stroke="none"/><circle cx="13.2" cy="14.8" r="1" fill="currentColor" stroke="none"/><circle cx="8.6" cy="15.2" r=".7" fill="currentColor" stroke="none"/>',
  irritated: '<path d="M3.5 13.5c1.4-3.6 2.8-3.6 4.2 0s2.8 3.6 4.2 0 2.8-3.6 4.2 0 2.8 3.6 4.2 0"/><path d="M6 5.5l2 2.2M18 5.5l-2 2.2M12 4v2.6"/>',
  down: '<path d="M7.6 14h8.9a3.4 3.4 0 0 0 .2-6.8 5 5 0 0 0-9.5.7A3.1 3.1 0 0 0 7.6 14z"/><path d="M9 17l-.9 2.6M12.6 17l-.9 2.6M16.2 17l-.9 2.6"/>',
  swelling: '<path d="M8.4 5.6a3.8 3.8 0 0 1 7.2 0 3.8 3.8 0 0 1 3 6.4 3.8 3.8 0 0 1-3 6.4 3.8 3.8 0 0 1-7.2 0A3.8 3.8 0 0 1 5.4 12a3.8 3.8 0 0 1 3-6.4z"/><path d="M12 9.6c1 1.2 1.6 2 1.6 2.7a1.6 1.6 0 0 1-3.2 0c0-.7.6-1.5 1.6-2.7z"/>',
  nausea: '<circle cx="12" cy="12" r="8.5"/><path d="M9 9.8v.4M15 9.8v.4"/><path d="M7.8 15.3c.9-.9 1.8-.9 2.7 0s1.8.9 2.7 0 1.8-.9 2.7 0"/>',
  appetite: '<path d="M3.5 12.5h17a8.5 8 0 0 1-17 0z"/><path d="M9.3 3.6c-1 1.2 1 2.4 0 3.6s1 2.4 0 3.6M14.7 3.6c-1 1.2 1 2.4 0 3.6s1 2.4 0 3.6"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

/** カレンダーの日付の下に敷く、しずく形 */
export function dropShape(kind) {
  const d = 'M20 3C27 11.5 33 18.2 33 25.4a13 13 0 0 1-26 0C7 18.2 13 11.5 20 3z';
  if (kind === 'actual') return `<svg class="mark" viewBox="0 0 40 42" aria-hidden="true"><path d="${d}" fill="var(--rose)"/></svg>`;
  return `<svg class="mark" viewBox="0 0 40 42" aria-hidden="true"><path d="${d}" fill="var(--rose-wash)" stroke="var(--rose)" stroke-width="1.6" stroke-dasharray="3.2 3"/></svg>`;
}

export function leafMark(filled) {
  return `<svg class="leaf" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 18.5C5.5 11 10.5 6 18.5 5.5 18 13.5 13 18.5 5.5 18.5z" fill="${filled ? 'var(--sage)' : 'none'}" stroke="var(--sage)" stroke-width="2.4" stroke-linejoin="round"/></svg>`;
}

export const SYMPTOMS = [
  { key: 'cramp', label: '腹痛' },
  { key: 'backache', label: '腰痛' },
  { key: 'headache', label: '頭痛' },
  { key: 'tired', label: 'だるい' },
  { key: 'sleepy', label: '眠い' },
  { key: 'chest', label: '胸のはり' },
  { key: 'skin', label: '肌あれ' },
  { key: 'swelling', label: 'むくみ' },
  { key: 'nausea', label: '吐き気' },
  { key: 'appetite', label: '食欲' },
  { key: 'irritated', label: 'イライラ' },
  { key: 'down', label: '落ちこみ' },
];
export const SYMPTOM_LABEL = Object.fromEntries(SYMPTOMS.map((s) => [s.key, s.label]));
