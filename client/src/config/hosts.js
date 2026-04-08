export const HOSTS = [
  'MICHAEL',
  'PETER',
  'ANDREW',
  'HUNTER',
  'AVAILABLE TO CLAIM',
];

export const HOST_COLORS = {
  michael: '#c41e3a',
  peter:   '#4f87f7',
  andrew:  '#a78bfa',
  hunter:  '#4ade80',
};

export function getHostColor(name) {
  if (!name) return null;
  return HOST_COLORS[name.toLowerCase().split("'")[0].trim()] || null;
}
