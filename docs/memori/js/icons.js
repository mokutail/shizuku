// めもり 用に描いたアイコン(24×24、線は丸め)
const P = {
  scale: '<rect x="3.5" y="4.5" width="17" height="16" rx="5"/><path d="M8 9.5a5 5 0 0 1 8 0"/><path d="M12 9.8l1.6-2.3"/><path d="M8.5 16.5h7"/>',
  sheet: '<rect x="5" y="4" width="14" height="17" rx="3"/><path d="M9.5 2.8h5v2.6h-5z"/><path d="M8.5 10h7M8.5 13.5h7M8.5 17h4"/>',
  share: '<circle cx="8.5" cy="9" r="3"/><circle cx="16.5" cy="10.5" r="2.4"/><path d="M3.5 19c.6-3 2.6-4.6 5-4.6s4.4 1.6 5 4.6"/><path d="M14.6 14.6c2.6-.4 4.9.9 5.6 4"/>',
  sliders: '<path d="M4 7.5h9M17.5 7.5H20M4 16.5h2.5M11 16.5h9"/><circle cx="15.2" cy="7.5" r="2.3"/><circle cx="8.8" cy="16.5" r="2.3"/>',
  chevL: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  chevR: '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
  chevD: '<path d="M6 9.5l6 6 6-6"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  camera: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.4"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  edit: '<path d="M5 19l1-4.2 9.6-9.6a2 2 0 0 1 2.9 0l.3.3a2 2 0 0 1 0 2.9L9.2 18z"/><path d="M13.8 7l3.2 3.2"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  person: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.8-4 3.8-6 7.5-6s6.7 2 7.5 6"/>',
  door: '<path d="M14 4.5H6.5v15H14"/><path d="M11 12h9.5M17.5 9l3 3-3 3"/>',
  swap: '<path d="M5 8.5h13l-3.5-3.5M19 15.5H6l3.5 3.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  send: '<path d="M4 11.5l15.5-7-5 15.5-3.2-6.3z"/><path d="M11.3 13.7L19.5 4.5"/>',
  flag: '<path d="M6 21V4"/><path d="M6 4.5h11l-2.6 3.8L17 12H6"/>',
  trend: '<path d="M3.5 17.5l5-5 3.5 3.5 8-8"/><path d="M15 8h5v5"/>',
  compare: '<path d="M8 4v16M16 4v16"/><path d="M4 8h4M16 12h4M4 15h4"/>',
  scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M8 9h8M8 12h8M8 15h5"/>',
  photo: '<rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="9" cy="10" r="1.7"/><path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}
