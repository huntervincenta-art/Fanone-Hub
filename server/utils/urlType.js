const UNSUPPORTED_DOMAINS = [
  'twitter.com', 'x.com', 'tiktok.com', 'instagram.com', 'facebook.com',
  'www.twitter.com', 'www.x.com', 'www.tiktok.com', 'www.instagram.com', 'www.facebook.com',
];

const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'];

function classifyUrl(url) {
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) return 'unsupported';

    const host = u.hostname.toLowerCase();

    if (UNSUPPORTED_DOMAINS.includes(host)) return 'unsupported';
    if (YOUTUBE_HOSTS.includes(host)) return 'youtube';
    return 'article';
  } catch {
    return 'unsupported';
  }
}

function extractYouTubeId(url) {
  if (!url) return null;
  const trimmed = url.trim();

  // Raw 11-char video ID (no URL structure)
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;

  try {
    const u = new URL(trimmed);
    const host = u.hostname.toLowerCase();

    // youtu.be/VIDEO_ID
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;

    if (YOUTUBE_HOSTS.includes(host)) {
      // /watch?v=VIDEO_ID
      const v = u.searchParams.get('v');
      if (v) return v;

      // /shorts/VIDEO_ID, /embed/VIDEO_ID, /live/VIDEO_ID, /v/VIDEO_ID
      const pathMatch = u.pathname.match(/^\/(shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/);
      if (pathMatch) return pathMatch[2];
    }

    return null;
  } catch {
    return null;
  }
}

module.exports = { classifyUrl, extractYouTubeId };
