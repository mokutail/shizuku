export const VERSION = '10/22 写真読み取り';

// 「生理・ピル」と「体重・健診」を切りかえるボタン(どちらの画面でも同じ見た目)
const DROP = '<path d="M12 3.2c3.4 4.3 6 7.6 6 10.9a6 6 0 0 1-12 0c0-3.3 2.6-6.6 6-10.9z"/>';
const SCALE = '<rect x="3.5" y="4.5" width="17" height="16" rx="5"/><path d="M8 9.5a5 5 0 0 1 8 0"/><path d="M12 9.8l1.6-2.3"/>';
const svg = (p) => `<svg class="sw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;

/** active: 'cycle' か 'body'。base: その画面から見たトップのパス */
export function appSwitch(active, base) {
  const item = (key, href, ic, label) => key === active
    ? `<span class="sw-item on sw-${key}" aria-current="page">${svg(ic)}${label}</span>`
    : `<a class="sw-item sw-${key}" href="${href}">${svg(ic)}${label}</a>`;
  return `<nav class="app-switch" aria-label="記録の切りかえ">
    ${item('cycle', base, DROP, '生理・ピル')}${item('body', base + 'memori/', SCALE, '体重・健診')}</nav>`;
}
