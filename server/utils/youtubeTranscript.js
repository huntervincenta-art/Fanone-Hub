const https = require('https');

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36';
const INNERTUBE_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const ANDROID_UA = 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)';
const ANDROID_CONTEXT = { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } };

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search,
      method: 'GET', headers: { 'User-Agent': USER_AGENT, ...headers }, timeout: 15000,
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => resolve(raw));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

function httpPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const bodyStr = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': ANDROID_UA, 'Content-Length': Buffer.byteLength(bodyStr), ...headers },
      timeout: 15000,
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: raw }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function parseTranscriptXml(xml) {
  // Try new format first: <p t="offset" d="duration">...<s>text</s>...</p>
  const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  const results = [];
  let match;
  while ((match = pRegex.exec(xml)) !== null) {
    const inner = match[3];
    let text = '';
    const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
    let sm;
    while ((sm = sRegex.exec(inner)) !== null) text += sm[1];
    if (!text) text = inner.replace(/<[^>]+>/g, '');
    text = decodeEntities(text).trim();
    if (text) results.push({ text, offset: parseInt(match[1], 10), duration: parseInt(match[2], 10) });
  }
  if (results.length > 0) return results;

  // Fallback: old format <text start="..." dur="...">...</text>
  const textRegex = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
  while ((match = textRegex.exec(xml)) !== null) {
    const text = decodeEntities(match[3]).trim();
    if (text) results.push({ text, offset: parseFloat(match[1]), duration: parseFloat(match[2]) });
  }
  return results;
}

async function fetchTranscript(videoId) {
  // Method 1: InnerTube API (Android client)
  try {
    const res = await httpPost(INNERTUBE_URL, { context: ANDROID_CONTEXT, videoId });
    if (res.status === 200) {
      const data = JSON.parse(res.body);
      const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (Array.isArray(tracks) && tracks.length > 0) {
        const track = tracks.find(t => t.languageCode === 'en') || tracks[0];
        const trackUrl = track.baseUrl;
        if (trackUrl && new URL(trackUrl).hostname.endsWith('.youtube.com')) {
          const xml = await httpGet(trackUrl);
          const chunks = parseTranscriptXml(xml);
          if (chunks.length > 0) return chunks;
        }
      }
    }
  } catch { /* fall through to method 2 */ }

  // Method 2: Web page scraping
  const html = await httpGet(`https://www.youtube.com/watch?v=${videoId}`);
  if (html.includes('class="g-recaptcha"')) throw new Error('YouTube captcha required');
  if (!html.includes('"playabilityStatus":')) throw new Error('Video unavailable');

  const varPrefix = 'var ytInitialPlayerResponse = ';
  const idx = html.indexOf(varPrefix);
  if (idx === -1) throw new Error('Could not find player response');
  const start = idx + varPrefix.length;
  let depth = 0;
  for (let i = start; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) {
      try {
        const data = JSON.parse(html.slice(start, i + 1));
        const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (!Array.isArray(tracks) || tracks.length === 0) throw new Error('No captions available');
        const track = tracks.find(t => t.languageCode === 'en') || tracks[0];
        const xml = await httpGet(track.baseUrl);
        const chunks = parseTranscriptXml(xml);
        if (chunks.length > 0) return chunks;
        throw new Error('Empty transcript');
      } catch (e) { throw e; }
    }}
  }
  throw new Error('No captions available for this video');
}

module.exports = { fetchTranscript };
