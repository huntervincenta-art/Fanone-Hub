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
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (YOUTUBE_HOSTS.includes(host)) return u.searchParams.get('v') || null;
    return null;
  } catch {
    return null;
  }
}

module.exports = { classifyUrl, extractYouTubeId };
