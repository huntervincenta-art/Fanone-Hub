export const HOSTS = [
  'DAN',
  'KEVIN',
  'JOHN',
  'DAVID',
  "DAVID'S SHOW",
  'VINCENT',
  'HUNTER',
  'OMAR',
  'FANONE',
  'AVAILABLE TO CLAIM',
];

export const HOST_COLORS = {
  kevin:   '#4f87f7',
  vincent: '#a78bfa',
  hunter:  '#4ade80',
  fanone:  '#f87171',
  david:   '#fb923c',
  john:    '#34d399',
  dan:     '#fbbf24',
  omar:    '#f472b6',
};

export function getHostColor(name) {
  if (!name) return null;
  return HOST_COLORS[name.toLowerCase().split("'")[0].trim()] || null;
}
