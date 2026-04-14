process.on('uncaughtException', (err) => {
  console.error('[CRASH] uncaughtException:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[CRASH] unhandledRejection:', reason);
  process.exit(1);
});

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const https = require('https');
const fs = require('fs');
const mongoose = require('mongoose');
const { XMLParser } = require('fast-xml-parser');
const topicPulseRouter = require('./routes/topicPulse');
const { analyzeSubject: tpAnalyzeSubject } = require('./routes/topicPulse');
const MFS_SYSTEM_PROMPT = require('./mfs-system-prompt');

// Shared HTTPS agent with connection pooling to prevent ENOBUFS from too many open sockets
const pooledAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 6,
  maxFreeSockets: 2,
});

const app = express();
app.use(cors());
app.use(express.json());

const PASSPHRASE = (process.env.PASSPHRASE || '').trim();
const SHEET_ID = process.env.SHEET_ID;
const NTFY_TOPIC        = process.env.NTFY_TOPIC;
const HUNTER_NTFY_TOPIC = process.env.HUNTER_NTFY_TOPIC;

const PERSONAL_NTFY_TOPICS = {
  kevin:          'OD-Kevin',
  john:           'OD-John',
  dan:            'OD-Dan',
  vincent:        'OD-Vincent',
  david:          'OD-David',
  "david's show": 'OD-David',
  hunter:         'OD-Hunter',
};

function getPersonalTopic(name) {
  return PERSONAL_NTFY_TOPICS[(name || '').toLowerCase()] || null;
}
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const YOUTUBE_API_KEY   = process.env.YOUTUBE_API_KEY;
const DATA_START_ROW = 3;
const TAB = 'Stories';
const TRAINING_SHEET_ID = '1HlMZzmbAqIFjpqy9Hhp2TKBu_3vDIRqkxxeKGBmSRVQ';
const USERS_FILE = path.join(__dirname, 'users.json');
const ADMIN_USER = 'Hunter';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const loginAttempts = new Map(); // ip -> { count, lockedUntil }

const FIND_STORIES_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const findStoriesCache = new Map(); // cacheKey -> { data, expiresAt }
const findVideosCache  = new Map(); // queryKey -> { data, expiresAt }
const twitterSearchCache = new Map(); // queryKey -> { data, expiresAt }

const YOUTUBE_STATS_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MFS_CHANNEL_ID = 'UCihIswdXcJjiqSZ3nKss6ww';
let youtubeStatsCache = null; // { data, expiresAt }

const RECOMMENDED_STORY_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
let recommendedStoryCache = null; // { data, expiresAt }
let recommendedStoryInflight = null; // shared promise during cold builds

const APPROVED_SOURCE_NEEDLES = [
  { name: 'TIME',            needles: ['time.com', 'time magazine'] },
  { name: 'Reuters',         needles: ['reuters'] },
  { name: 'Politico',        needles: ['politico'] },
  { name: 'AP',              needles: ['apnews', 'associated press', 'ap news'] },
  { name: 'NPR',             needles: ['npr.org', 'npr'] },
  { name: 'The Daily Beast', needles: ['thedailybeast', 'daily beast'] },
  { name: 'New York Times',  needles: ['nytimes', 'new york times', 'nyt'] },
  { name: 'Washington Post', needles: ['washingtonpost', 'washington post'] },
  { name: 'CNN',             needles: ['cnn.com', 'cnn'] },
  { name: 'NBC News',        needles: ['nbcnews', 'nbc news'] },
  { name: 'CBS News',        needles: ['cbsnews', 'cbs news'] },
  { name: 'ABC News',        needles: ['abcnews.go.com', 'abcnews', 'abc news'] },
  { name: 'The Guardian',    needles: ['theguardian', 'the guardian', 'guardian'] },
  { name: 'The Hill',        needles: ['thehill.com', 'thehill', 'the hill'] },
  { name: 'ProPublica',      needles: ['propublica'] },
  { name: 'The Atlantic',    needles: ['theatlantic', 'the atlantic', 'atlantic'] },
  { name: 'Bloomberg',       needles: ['bloomberg'] },
  { name: 'Axios',           needles: ['axios'] },
  { name: 'BBC',             needles: ['bbc.com', 'bbc.co.uk', 'bbc'] },
  { name: 'PBS',             needles: ['pbs.org', 'pbs'] },
  { name: 'MSNBC',           needles: ['msnbc'] },
  { name: 'The Intercept',   needles: ['theintercept', 'the intercept', 'intercept'] },
  { name: 'Lawfare',         needles: ['lawfaremedia', 'lawfare'] },
  { name: 'USA Today',       needles: ['usatoday', 'usa today'] },
  { name: 'The New Yorker',  needles: ['newyorker', 'new yorker'] },
  { name: 'Vox',             needles: ['vox.com', 'vox'] },
  { name: 'Slate',           needles: ['slate.com', 'slate'] },
  { name: 'Mother Jones',    needles: ['motherjones', 'mother jones'] },
  { name: 'The Nation',      needles: ['thenation', 'the nation'] },
  { name: 'HuffPost',        needles: ['huffpost', 'huffington'] },
  { name: 'Al Jazeera',      needles: ['aljazeera', 'al jazeera'] },
  { name: 'Foreign Policy',  needles: ['foreignpolicy', 'foreign policy'] },
  { name: 'The Economist',   needles: ['economist.com', 'the economist'] },
  { name: 'Newsweek',        needles: ['newsweek'] },
  { name: 'The Wall Street Journal', needles: ['wsj.com', 'wsj', 'wall street journal'] },
  { name: 'MarketWatch',     needles: ['marketwatch'] },
  { name: 'Business Insider', needles: ['businessinsider', 'business insider'] },
  { name: 'CNBC',            needles: ['cnbc.com', 'cnbc'] },
  { name: 'Salon',           needles: ['salon.com'] },
  { name: 'Raw Story',       needles: ['rawstory', 'raw story'] },
  { name: 'Rolling Stone',   needles: ['rollingstone', 'rolling stone'] },
  { name: 'Vice News',       needles: ['vice.com', 'vice news'] },
  { name: 'Stars and Stripes', needles: ['stripes.com', 'stars and stripes'] },
  { name: 'Military Times',  needles: ['militarytimes', 'military times'] },
  { name: 'The Marshall Project', needles: ['themarshallproject', 'marshall project'] },
];

// Tabloid / gossip sources to block — filter these OUT of results
const TABLOID_BLOCKLIST = [
  'tmz', 'pagesix', 'page six', 'dailymail', 'daily mail', 'mail online',
  'nypost.com/pagesix', 'thesun.co.uk', 'the sun', 'mirror.co.uk',
  'radaronline', 'radar online', 'star magazine', 'us weekly', 'usmagazine',
  'people.com', 'eonline', 'e! online', 'enews', 'justjared',
  'perezhilton', 'dlisted', 'egotastic', 'bossip', 'mediatakeout',
  'nationalenquirer', 'national enquirer', 'infowars', 'breitbart',
  'oann', 'newsmax', 'gateway pundit', 'thegatewaypundit',
];

function matchApprovedOutlet(article) {
  const parts = [];
  if (article.url || article.link) {
    try {
      const u = new URL(article.url || article.link);
      parts.push(u.hostname.toLowerCase().replace(/^www\./, ''));
      parts.push(u.pathname.toLowerCase());
    } catch {}
  }
  const src = article.source || article.sourceName || '';
  if (src) parts.push(String(src).toLowerCase());
  const hay = parts.join(' ');
  if (!hay) return null;
  for (const outlet of APPROVED_SOURCE_NEEDLES) {
    for (const needle of outlet.needles) {
      if (hay.includes(needle)) return outlet.name;
    }
  }
  return null;
}

function isTabloidSource(article) {
  const parts = [];
  if (article.url || article.link) {
    try {
      const u = new URL(article.url || article.link);
      parts.push(u.hostname.toLowerCase().replace(/^www\./, ''));
    } catch {}
  }
  const src = article.source || article.sourceName || '';
  if (src) parts.push(String(src).toLowerCase());
  const hay = parts.join(' ');
  if (!hay) return false;
  return TABLOID_BLOCKLIST.some(needle => hay.includes(needle));
}

// Extract a short, YouTube-searchable topic keyword from a headline.
// Strips stopwords and outlet boilerplate, takes the most distinctive 2–3 words.
const TOPIC_STOPWORDS = new Set([
  'a','an','the','of','for','with','to','in','on','at','by','from','as','and','or','but',
  'is','are','was','were','be','been','being','has','have','had','do','does','did','will',
  'would','could','should','can','may','might','must','this','that','these','those','it',
  'its','his','her','their','our','your','my','about','after','before','over','under','than',
  'then','so','up','down','out','off','new','says','said','say','asks','tells','told','goes',
  'now','still','more','most','less','least','very','just','only','also','here','there',
  'how','why','what','who','whom','when','where','which','one','two','amid','despite','vs',
]);

function extractTopicKeyword(headline) {
  if (!headline) return '';
  // Drop publication suffix like " - The New York Times" / " | CNN"
  const cleaned = String(headline).split(/\s[-|–—]\s/)[0];
  const tokens = cleaned
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  // Prefer Capitalized terms (proper nouns / entities)
  const proper = [];
  for (const t of tokens) {
    if (proper.length >= 3) break;
    if (TOPIC_STOPWORDS.has(t.toLowerCase())) continue;
    if (/^[A-Z][a-zA-Z]+$/.test(t)) proper.push(t);
  }
  if (proper.length >= 2) return proper.slice(0, 3).join(' ');

  // Otherwise pick the first 2–3 non-stopword tokens
  const words = [];
  for (const t of tokens) {
    if (words.length >= 3) break;
    if (TOPIC_STOPWORDS.has(t.toLowerCase())) continue;
    if (t.length < 3) continue;
    words.push(t);
  }
  return words.join(' ') || cleaned.split(/\s+/).slice(0, 3).join(' ');
}

function opportunityBucket(saturationScore) {
  // saturation_score is 0–100; opportunity = 100 - saturation
  if (saturationScore == null || isNaN(saturationScore)) {
    return { level: 'unknown', label: 'Unknown', color: '#9ca3af' };
  }
  if (saturationScore <= 35) {
    return { level: 'high', label: 'High Opportunity', color: '#22c55e' };
  }
  if (saturationScore <= 65) {
    return { level: 'moderate', label: 'Moderate', color: '#fbbf24' };
  }
  return { level: 'low', label: 'Low Opportunity', color: '#c41e3a' };
}

// ── Fanone-lane relevance scoring ─────────────────────────────────────────────
// Scores a news headline 0–100 based on how well it fits The Michael Fanone
// Show's beat: a progressive, former-cop hosted political channel.
//
// The score is "how good is this story for MFS to cover", not "how uncovered".

const FANONE_HIGH_KEYWORDS = [
  // Government corruption & accountability (HIGH lane)
  'corruption', 'corrupt', 'bribe', 'bribery', 'kickback', 'pay-to-play',
  'whistleblower', 'leak', 'leaked', 'cover up', 'cover-up', 'coverup',
  'oversight', 'accountability', 'abuse of power', 'misconduct',
  'inspector general', 'ethics violation', 'conflict of interest',
  // Law enforcement / policing / criminal justice (HIGH lane)
  'police', 'cop ', 'cops', 'law enforcement', 'sheriff', 'officer', 'officers',
  'doj', 'justice department', 'fbi', 'attorney general', 'prosecutor',
  'indict', 'indicted', 'indictment', 'charges', 'sentenc',
  'prison', 'incarcerat', 'bail reform', 'policing', 'use of force',
  'body cam', 'bodycam', 'internal affairs', 'police reform',
  // Constitutional law / rule of law (HIGH lane)
  'court', 'judge', 'judges', 'ruling', 'supreme court', 'scotus',
  'constitution', 'unconstitutional', 'first amendment', 'fourth amendment',
  'due process', 'civil rights', 'voting rights', 'rule of law',
  'democracy', 'authoritarian', 'autocrat', 'dictator', 'fascis',
  'pardon', 'commutation', 'martial law', 'emergency powers',
  // FBI / ATF / DEA / federal law enforcement (HIGH lane)
  'fbi', 'atf', 'dea', 'task force', 'federal agent', 'undercover',
  'narcotics', 'drug trafficking', 'trafficking', 'cartel',
  // Missed angles / underreported (HIGH lane — boost signals)
  'buried', 'underreported', 'overlooked', 'nobody is talking about',
  'quietly', 'slipped through', 'under the radar',
  // Immigration enforcement
  'ice ', 'i.c.e.', 'deport', 'detain', 'detention', 'border patrol',
  'immigration enforcement', 'raid',
];

const FANONE_MEDIUM_KEYWORDS = [
  // Political extremism (MEDIUM lane)
  'extremis', 'radical', 'militia', 'proud boys', 'oath keeper',
  'domestic terror', 'white nationalist', 'white supremac',
  'capitol', 'january 6', 'jan. 6', 'jan 6',
  // Foreign affairs / national security (MEDIUM lane)
  'national security', 'foreign policy', 'intelligence', 'cia', 'nsa',
  'sanctions', 'nato', 'ally', 'allies', 'diplomacy', 'diplomat',
  'pentagon', 'military', 'troops', 'veteran', 'veterans', 'service member',
  // Financial crimes / fraud (MEDIUM lane)
  'fraud', 'embezzl', 'money laundering', 'ponzi', 'wire fraud',
  'tax evasion', 'financial crime', 'securities fraud',
  // General political (MEDIUM)
  'trump administration', 'white house', 'congress', 'senate', 'house of representatives',
  'policy', 'legislation', 'bill', 'vote', 'hearing', 'subpoena',
  'federal agency', 'agency', 'cabinet', 'secretary',
  'government spending', 'budget', 'funding cut', 'shutdown',
  'executive order', 'directive', 'memo',
];

const FANONE_LOW_KEYWORDS = [
  // Generic partisan commentary with no unique angle (LOW — deprioritize)
  'slams', 'blasts', 'claps back', 'destroys', 'owned',
  'hot take', 'opinion poll', 'approval rating',
  'gop', 'maga', 'democrat', 'republican',
  // Celebrity / entertainment / sports
  'celebrity', 'oscars', 'grammy', 'hollywood',
  'kardashian', 'taylor swift', 'kanye',
  'nfl', 'nba', 'mlb', 'soccer', 'olympic',
  'box office', 'movie', 'tv show', 'streaming series',
  'earnings', 'stock split', 'ipo', 'product launch', 'iphone', 'gadget',
  'recipe', 'lifestyle', 'fashion', 'red carpet',
];

const FANONE_IMPACT_KEYWORDS = [
  'killed', 'died', 'death', 'dying', 'fatal',
  'family', 'families', 'children', 'kids', 'mother', 'father',
  'fired', 'forced out', 'resign',
  'crisis', 'scandal', 'cover up', 'cover-up',
  'arrested', 'detained', 'raid',
  'overturned', 'blocked', 'struck down', 'guilty', 'convicted',
];

// Keywords that signal a story is time-sensitive (BREAKING vs EVERGREEN)
const BREAKING_KEYWORDS = [
  'breaking', 'just in', 'developing', 'happening now',
  'arrested today', 'just arrested', 'just indicted', 'just ruled',
  'emergency', 'shooting', 'active', 'unfolding',
  'hours ago', 'minutes ago', 'just announced',
];

function scoreHeadlineForFanone(article) {
  const headline = String(article.headline || '').toLowerCase();
  const description = String(article.description || '').toLowerCase();
  const text = `${headline} ${headline} ${description}`; // headline weighted 2x

  let score = 50;
  const matched = { high: [], medium: [], low: [], impact: [] };

  // HIGH relevance: +12 each, capped at +40
  let highBonus = 0;
  for (const kw of FANONE_HIGH_KEYWORDS) {
    if (text.includes(kw)) {
      highBonus += 12;
      matched.high.push(kw.trim());
    }
  }
  score += Math.min(highBonus, 40);

  // MEDIUM relevance: +5 each, capped at +15
  let medBonus = 0;
  for (const kw of FANONE_MEDIUM_KEYWORDS) {
    if (text.includes(kw)) {
      medBonus += 5;
      matched.medium.push(kw.trim());
    }
  }
  score += Math.min(medBonus, 15);

  // LOW relevance: -8 each (no cap, can sink the score hard)
  for (const kw of FANONE_LOW_KEYWORDS) {
    if (text.includes(kw)) {
      score -= 8;
      matched.low.push(kw.trim());
    }
  }

  // Impact bonus: +5 each, capped at +10
  let impactBonus = 0;
  for (const kw of FANONE_IMPACT_KEYWORDS) {
    if (text.includes(kw)) {
      impactBonus += 5;
      matched.impact.push(kw.trim());
    }
  }
  score += Math.min(impactBonus, 10);

  // Recency bonus: <6h +10, 6–12h +5, 12–24h 0, >24h -10
  const pubMs = article.publishedAt ? new Date(article.publishedAt).getTime() : 0;
  let ageHours = Infinity;
  if (pubMs) {
    ageHours = (Date.now() - pubMs) / (1000 * 60 * 60);
    if (ageHours <= 6) score += 10;
    else if (ageHours <= 12) score += 5;
    else if (ageHours > 24) score -= 10;
  }

  // Clamp to 0–100
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Urgency classification: BREAKING vs EVERGREEN
  // Default to EVERGREEN — Fanone does commentary, not breaking news
  let urgency = 'EVERGREEN';
  const breakingMatches = BREAKING_KEYWORDS.filter(kw => text.includes(kw));
  if (breakingMatches.length >= 2 && ageHours <= 6) {
    urgency = 'BREAKING';
  } else if (breakingMatches.length >= 1 && ageHours <= 3) {
    urgency = 'BREAKING';
  }

  return { score, matched, urgency };
}

function fanoneOpportunityBucket(score) {
  if (score == null || isNaN(score)) {
    return { level: 'unknown', label: 'Unknown', color: '#9ca3af' };
  }
  if (score >= 70) {
    return { level: 'high', label: "Strong pick — right in Fanone's lane", color: '#22c55e' };
  }
  if (score >= 40) {
    return { level: 'moderate', label: 'Solid option — needs a sharp angle', color: '#fbbf24' };
  }
  return { level: 'low', label: 'Off-lane — but could work with the right framing', color: '#c41e3a' };
}

// Self-contained headline fetcher — independent of /api/find-stories cache.
// Pulls Google News RSS, applies the same political-keyword + junk filter as
// find-stories, returns a normalized array of { headline, url, source, publishedAt }.
async function fetchHeadlinePool() {
  const rssUrl = 'https://news.google.com/rss/search?q=Trump+OR+Democrats+OR+Republicans+OR+Congress+OR+MAGA&hl=en-US&gl=US&ceid=US:en';
  const rssRes = await httpsRequest(rssUrl, { headers: { 'User-Agent': 'Mozilla/5.0 TeamHub/1.0' } });
  if (rssRes.status !== 200 || typeof rssRes.body !== 'string') {
    throw new Error(`Google News RSS fetch failed (status ${rssRes.status})`);
  }
  const rssParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const parsed = rssParser.parse(rssRes.body);
  const rawItems = [].concat(parsed?.rss?.channel?.item || []);
  if (rawItems.length === 0) throw new Error('Google News RSS returned no items');

  const POLITICAL_KEYWORDS = /trump|white house|congress|senate|maga|democrat|republican|biden|political/i;
  const JUNK_TITLE_WORDS   = /\bnfl\b|\bnba\b|\bmlb\b|\bmovie\b|\bcelebrity\b|\bsports?\b|\bgame\b|\bscore\b|\bactor\b/i;

  const seen = new Set();
  const pool = [];
  for (const item of rawItems) {
    const title = typeof item.title === 'string' ? item.title
      : (item.title?.['#text'] || String(item.title || ''));
    const link = typeof item.link === 'string' ? item.link : '';
    const pubDate = item.pubDate ? String(item.pubDate) : '';
    const pubMs = pubDate ? new Date(pubDate).getTime() : 0;
    const sourceName = typeof item.source === 'string' ? item.source
      : (item.source?.['#text'] || '');
    const description = typeof item.description === 'string' ? item.description : '';
    if (!title || !link || seen.has(link)) continue;
    seen.add(link);
    pool.push({ title, link, pubDate, pubMs, sourceName, description });
  }

  // Apply 24h time window then political keyword + junk filter, with graceful
  // fallbacks if too few pass each step.
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const timeFiltered = pool.filter(a => !a.pubMs || a.pubMs >= cutoff);
  const workingPool  = timeFiltered.length >= 3 ? timeFiltered : pool;
  const keywordFiltered = workingPool.filter(a =>
    POLITICAL_KEYWORDS.test(a.title) || POLITICAL_KEYWORDS.test(a.description)
  );
  const junkFiltered = keywordFiltered.filter(a => !JUNK_TITLE_WORDS.test(a.title));
  // Filter out tabloid/gossip sources
  const fullFiltered = junkFiltered.filter(a => !isTabloidSource(a));
  const filteredPool = fullFiltered.length >= 3 ? fullFiltered
    : junkFiltered.length >= 3 ? junkFiltered
    : keywordFiltered.length >= 3 ? keywordFiltered : workingPool;

  filteredPool.sort((a, b) => (b.pubMs || 0) - (a.pubMs || 0));

  return filteredPool.slice(0, 30).map(a => ({
    headline:    a.title,
    url:         a.link,
    source:      a.sourceName,
    publishedAt: a.pubDate,
    description: a.description,
  }));
}

// Quick one-line angle suggestion via Anthropic for the recommended story.
async function generateAngleLine(headline, source) {
  if (!ANTHROPIC_API_KEY) return '';
  try {
    const anthropicRes = await httpsRequest(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        timeout: 20000,
      },
      {
        model: 'claude-opus-4-6',
        max_tokens: 180,
        system: 'You are a producer for The Michael Fanone Show, a progressive political YouTube channel hosted by former DC police officer Michael Fanone. Suggest one strong editorial angle the show could take on a news story. Be concrete, specific, and under 35 words. Return only the angle as plain prose — no preamble, no labels, no quotation marks. NEVER suggest angles that connect unrelated stories to January 6th. Only mention January 6th if the story is LITERALLY about January 6th events, defendants, or hearings. Find angles based on corruption, law enforcement, constitutional issues, accountability, foreign policy, or Fanone\'s broader 20-year law enforcement expertise instead.',
        messages: [{
          role: 'user',
          content: `Suggest one strong editorial angle for The Michael Fanone Show based on this headline: "${headline}"${source ? ` (source: ${source})` : ''}`,
        }],
      }
    );
    if (anthropicRes.status !== 200) return '';
    const text = ((anthropicRes.body.content || []).find(c => c.type === 'text') || {}).text || '';
    return text.trim().replace(/^["']|["']$/g, '');
  } catch (err) {
    console.warn('[recommended-story] angle suggestion failed:', err.message);
    return '';
  }
}

function lifecycleLabel(analysis) {
  const sat = analysis?.saturation_score ?? 50;
  const momentum = analysis?.trends?.momentum;
  if (sat <= 35 || momentum === 'rising') return 'Rising';
  if (sat >= 70 || momentum === 'falling') return 'Declining';
  return 'Peak';
}

// In-memory presence store: name -> lastSeen (ms timestamp)
const presenceStore = new Map();
const PRESENCE_TTL_MS = 90 * 1000;

console.log('PASSPHRASE loaded:', !!process.env.PASSPHRASE);
console.log('SHEET_ID loaded:', process.env.SHEET_ID ? `"${process.env.SHEET_ID}"` : 'NOT SET — Sheets sync will be skipped');

// ── Mongoose models ───────────────────────────────────────────────────────────

const storySchema = new mongoose.Schema({
  _id:             { type: String, default: () => Date.now().toString() },
  claimed:         { type: Boolean, default: false },
  date:            String,
  host:            { type: String, default: '' },
  headline:        String,
  link:            { type: String, default: '' },
  additionalLinks: { type: String, default: '' },
  angleClarity:    { type: String, default: '' },
  breaking:        { type: Boolean, default: false },
  flagged:         { type: Boolean, default: false },
  thumbnailUrl:    { type: String, default: '' },
  timestamp:       { type: String, default: () => new Date().toISOString() },
  working:         { type: Boolean, default: false },
  done:            { type: Boolean, default: false },
  alerted:         { type: Boolean, default: false },
  duplicate:       { type: Boolean, default: false },
}, { versionKey: false });

const postSchema = new mongoose.Schema({
  _id:       { type: String, default: () => Date.now().toString() },
  sender:    String,
  text:      String,
  timestamp: { type: String, default: () => new Date().toISOString() },
  likes:     { type: Number, default: 0 },
}, { versionKey: false });

const logSchema = new mongoose.Schema({
  _id:       { type: String, default: () => Date.now().toString() },
  timestamp: { type: String, default: () => new Date().toISOString() },
  user:      String,
  action:    String,
  details:   { type: String, default: '' },
}, { versionKey: false });

const commentSchema = new mongoose.Schema({
  _id:       { type: String, default: () => Date.now().toString() },
  storyId:   String,
  author:    String,
  text:      String,
  timestamp: { type: String, default: () => new Date().toISOString() },
}, { versionKey: false });

const dmSchema = new mongoose.Schema({
  _id:       { type: String, default: () => Date.now().toString() },
  sender:    String,
  recipient: String,
  text:      String,
  timestamp: { type: String, default: () => new Date().toISOString() },
  readBy:    { type: [String], default: [] },
}, { versionKey: false });

const listItemSchema = new mongoose.Schema({
  _id:       { type: String, default: () => Date.now().toString() },
  type:      { type: String, enum: ['doNotCover', 'learned', 'suggestion'], required: true },
  content:   { type: String, required: true },
  reason:    { type: String, default: '' },
  hostName:  { type: String, required: true },
  forHunter: { type: Boolean, default: false },
  timestamp: { type: String, default: () => new Date().toISOString() },
}, { versionKey: false });

const hunterUpdateSchema = new mongoose.Schema({
  _id:       { type: String, default: () => Date.now().toString() },
  text:      { type: String, required: true },
  author:    { type: String, default: 'Hunter' },
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { versionKey: false });

const scriptSchema = new mongoose.Schema({
  _id:              { type: String, default: () => Date.now().toString() },
  articleTitle:     { type: String, default: '' },
  articleSource:    { type: String, default: '' },
  angleNotes:       { type: String, default: '' },
  generatedScript:  { type: String, required: true },
  previousVersion:  { type: String, default: '' },
  generatedBy:      { type: String, default: '' },
  createdAt:        { type: String, default: () => new Date().toISOString() },
  updatedAt:        { type: String, default: '' },
}, { versionKey: false, collection: 'scripts' });

const Story        = mongoose.model('Story', storySchema);
const Post         = mongoose.model('Post', postSchema);
const Log          = mongoose.model('Log', logSchema);
const Comment      = mongoose.model('Comment', commentSchema);
const DM           = mongoose.model('DM', dmSchema);
const ListItem     = mongoose.model('ListItem', listItemSchema);
const HunterUpdate = mongoose.model('HunterUpdate', hunterUpdateSchema);
const Script       = mongoose.model('Script', scriptSchema);

// Convert mongoose doc → plain object with `id` field instead of `_id`
function toObj(doc) {
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  obj.id = obj._id;
  delete obj._id;
  return obj;
}

async function addLog(user, action, details) {
  try {
    await new Log({
      user: user || 'Unknown',
      action,
      details: details || '',
    }).save();
  } catch (err) {
    console.error('[addLog] error:', err.message);
  }
}

// ── Auth middleware ───────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const auth = (req.headers['x-passphrase'] || '').trim();
  if (auth !== PASSPHRASE) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── Google Sheets ─────────────────────────────────────────────────────────────

async function syncStoryToSheet(story) {
  const STORIES_SHEET_ID = '1COUvAHrBmcaRuc0ogERJRq-0PTmMknmQ8lDosj2r6lQ';
  const STORIES_TAB = 'Stories';
  // Columns A–E: DATE, HOST, HEADLINE, LINK, ADDITIONAL COMMENTS
  // Append starting after row 3 (headers in rows 1-3)
  const row = [
    story.date            || '',
    story.host            || '',
    story.headline        || '',
    story.link            || '',
    story.additionalLinks || '',
  ];
  try {
    const credJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!credJson) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
    }
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(credJson),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    await sheets.spreadsheets.values.append({
      spreadsheetId: STORIES_SHEET_ID,
      range: `${STORIES_TAB}!A4:E`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
    console.log('Sheets write success — host:', row[1], '| headline:', row[2]);
  } catch (err) {
    console.error('Sheets write error:', err);
  }
}

async function getSheetsClient() {
  const authOptions = { scopes: ['https://www.googleapis.com/auth/spreadsheets'] };
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    authOptions.credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } else {
    authOptions.keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
  const auth = new google.auth.GoogleAuth(authOptions);
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

// ── Generic HTTPS helper ──────────────────────────────────────────────────────

function httpsRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const bodyStr = body ? JSON.stringify(body) : null;
    const timeoutMs = options.timeout || 15000;
    const reqOptions = {
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: {
        ...options.headers,
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
      agent: pooledAgent,
      timeout: timeoutMs,
    };
    const req = https.request(reqOptions, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error(`Request to ${u.hostname} timed out after ${timeoutMs}ms`));
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── ntfy helper ───────────────────────────────────────────────────────────────

function sendNtfyToTopic(topic, title, message, clickUrl = 'https://odhub.xyz') {
  const body = message || title || 'MFS Hub';
  const headers = {
    'Content-Type': 'text/plain',
    'Title':        title || 'MFS Hub',
    'Click':        clickUrl,
    'Content-Length': String(Buffer.byteLength(body)),
  };
  console.log(`[ntfy] POST /${topic} | headers:`, JSON.stringify(headers));
  const options = {
    hostname: 'ntfy.sh',
    port: 443,
    path: `/${topic}`,
    method: 'POST',
    headers,
  };
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      res.on('data', () => {});
      res.on('end', resolve);
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sendNtfy(title, message) {
  if (!NTFY_TOPIC) return Promise.resolve();
  return sendNtfyToTopic(NTFY_TOPIC, title, message, 'https://odhub.xyz');
}

// ── Users (stays as JSON — static config, not dynamic data) ──────────────────

function readUsers() {
  try {
    const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    console.log('[users] Loaded', data.length, 'users from', USERS_FILE);
    return data;
  } catch (err) {
    console.error('[users] Failed to read users.json:', err.message, '| path:', USERS_FILE);
    return [];
  }
}

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket.remoteAddress
    || 'unknown';
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/auth/users — return approved user names only (no PINs)
app.get('/api/auth/users', (req, res) => {
  const users = readUsers();
  const names = users.map(u => u.name);
  console.log('[GET /api/auth/users] returning', names.length, 'names:', names);
  res.json(names);
});

// POST /api/presence — heartbeat: record last-seen timestamp for a host
app.post('/api/presence', requireAuth, (req, res) => {
  const { name } = req.body;
  if (name) presenceStore.set(name, Date.now());
  res.json({ ok: true });
});

// GET /api/presence — return names seen within the last 90 seconds
app.get('/api/presence', requireAuth, (req, res) => {
  const cutoff = Date.now() - PRESENCE_TTL_MS;
  const online = [];
  for (const [name, lastSeen] of presenceStore) {
    if (lastSeen >= cutoff) online.push(name);
  }
  res.json(online);
});

// POST /api/auth — verify passphrase + name + PIN with IP lockout
app.post('/api/auth', (req, res) => {
  const ip = getClientIp(req);
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };

  if (record.lockedUntil > now) {
    const minutesLeft = Math.ceil((record.lockedUntil - now) / 60000);
    return res.status(429).json({
      error: `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`,
    });
  }

  const submittedPassphrase = (req.body.passphrase || '').trim();
  const submittedName = (req.body.name || '').trim();

  const users = readUsers();
  const user = users.find(u => u.name === submittedName);
  const valid = submittedPassphrase === PASSPHRASE && !!user;

  if (valid) {
    loginAttempts.delete(ip);
    return res.json({ ok: true });
  }

  record.count += 1;
  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS;
    loginAttempts.set(ip, record);
    console.log('[ntfy:login-lockout] Click: https://odhub.xyz');
    sendNtfy(
      'MFS Hub — Login Alert',
      `IP ${ip} locked out after ${MAX_ATTEMPTS} failed login attempts.`
    ).catch(() => {});
    return res.status(429).json({ error: 'Too many failed attempts. Locked out for 15 minutes.' });
  }
  loginAttempts.set(ip, record);
  res.status(401).json({ error: 'Invalid credentials.' });
});

// GET /api/stories — newest first
app.get('/api/stories', requireAuth, async (req, res) => {
  try {
    const stories = await Story.find({}).sort({ timestamp: -1 }).lean();
    res.json(stories.map(s => { s.id = s._id; delete s._id; return s; }));
  } catch (err) {
    console.error('GET /api/stories error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stories — create; ntfy only fires when claimed:true
app.post('/api/stories', requireAuth, async (req, res) => {
  const { date, headline, link, additionalLinks, angleClarity, claimed, host: formHost, breaking, thumbnailUrl, user } = req.body;
  if (!date || !headline) {
    return res.status(400).json({ error: 'date and headline are required' });
  }
  if (claimed && !formHost && !user) {
    return res.status(400).json({ error: 'host is required when claiming a story' });
  }
  // Use the form's selected host for claimed stories; fall back to logged-in user if not provided
  const host = claimed ? (formHost || user || '') : '';
  console.log(`[stories] POST | received date from client: "${date}" | server UTC date: "${new Date().toISOString().slice(0, 10)}" | user: ${user} | claimed: ${claimed} | host: "${host}" | headline: ${headline}`);
  try {
    const story = await new Story({
      claimed: !!claimed,
      date,
      host,
      headline,
      link: link || '',
      additionalLinks: additionalLinks || '',
      angleClarity: angleClarity || '',
      breaking: !!breaking,
      flagged: false,
      thumbnailUrl: thumbnailUrl || '',
    }).save();
    const obj = toObj(story);
    addLog(user || 'Unknown', 'story_submitted', headline);
    syncStoryToSheet(obj).catch(() => {});
    res.json(obj);
  } catch (err) {
    console.error('POST /api/stories error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stories/:id/alert — host sends a "needs attention" alert to Hunter
app.post('/api/stories/:id/alert', requireAuth, async (req, res) => {
  const { user, host } = req.body;
  if (!user || !host || user !== host) {
    return res.status(403).json({ error: 'Only the story host can send an alert' });
  }
  if (!HUNTER_NTFY_TOPIC) {
    return res.status(503).json({ error: 'HUNTER_NTFY_TOPIC is not configured' });
  }
  try {
    await Story.findByIdAndUpdate(req.params.id, { alerted: true });
    console.log('[ntfy:hunter-alert] Click: https://odhub.xyz');
    await sendNtfyToTopic(HUNTER_NTFY_TOPIC, 'Needs Attention', `${host}'s video needs attention`, 'https://odhub.xyz');
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/stories/:id/alert error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stories/:id/working-on-it — Hunter clears alert and notifies host
app.post('/api/stories/:id/working-on-it', requireAuth, async (req, res) => {
  const { user } = req.body;
  if (user !== ADMIN_USER) {
    return res.status(403).json({ error: 'Only Hunter can mark stories as working on it' });
  }
  try {
    const story = await Story.findByIdAndUpdate(req.params.id, { alerted: false }, { new: true });
    if (!story) return res.status(404).json({ error: 'Story not found' });
    const topic = getPersonalTopic(story.host);
    if (topic) {
      console.log(`[ntfy:working-on-it] topic=${topic} Click: https://odhub.xyz`);
      sendNtfyToTopic(
        topic,
        'Hunter is on it!',
        `Hunter is working on your video: ${story.headline}`,
        'https://odhub.xyz'
      ).catch(() => {});
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/stories/:id/working-on-it error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stories/notify-available — manual team notification for unclaimed stories
app.post('/api/stories/notify-available', requireAuth, (req, res) => {
  console.log('[ntfy:team-notify] Click: https://odhub.xyz');
  sendNtfy('MFS Hub', 'New Stories Are Available To Claim!').catch(() => {});
  res.json({ ok: true });
});

// POST /api/stories/:id/claim — assign a host and move to claimed
app.post('/api/stories/:id/claim', requireAuth, async (req, res) => {
  const { host, user } = req.body;
  if (!host) return res.status(400).json({ error: 'host is required' });
  try {
    const story = await Story.findByIdAndUpdate(
      req.params.id,
      { claimed: true, host },
      { new: true }
    );
    if (!story) return res.status(404).json({ error: 'Story not found' });
    addLog(user || host, 'story_claimed', story.headline);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/stories/:id/claim error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stories/:id/flag — flag a problem on a host's video
app.post('/api/stories/:id/flag', requireAuth, async (req, res) => {
  const { user } = req.body;
  try {
    const story = await Story.findByIdAndUpdate(req.params.id, { flagged: true }, { new: true });
    if (!story) return res.status(404).json({ error: 'Story not found' });
    addLog(user || 'Unknown', 'story_flagged', story.headline);
    const flagMessage = 'Hunter flagged a problem on your video. Check the hub.';
    const hostTopic = getPersonalTopic(story.host);
    const targetTopic = hostTopic || NTFY_TOPIC;
    if (targetTopic) {
      console.log(`[ntfy:story-flagged] topic=${targetTopic} story="${story.headline}"`);
      sendNtfyToTopic(targetTopic, 'Story Flagged', flagMessage, 'https://odhub.xyz').catch(() => {});
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/stories/:id/flag error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stories/:id/unflag — clear the flag
app.post('/api/stories/:id/unflag', requireAuth, async (req, res) => {
  const { user } = req.body;
  try {
    const story = await Story.findByIdAndUpdate(req.params.id, { flagged: false }, { new: true });
    if (!story) return res.status(404).json({ error: 'Story not found' });
    addLog(user || 'Unknown', 'story_unflagged', story.headline);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/stories/:id/unflag error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stories/:id/approve — Hunter approves a flagged story
app.post('/api/stories/:id/approve', requireAuth, async (req, res) => {
  const { user } = req.body;
  if (user !== ADMIN_USER) {
    return res.status(403).json({ error: 'Only Hunter can approve stories' });
  }
  try {
    const story = await Story.findByIdAndUpdate(req.params.id, { flagged: false }, { new: true });
    if (!story) return res.status(404).json({ error: 'Story not found' });
    const topic = getPersonalTopic(story.host);
    if (topic) {
      console.log(`[ntfy:approve] topic=${topic} Click: https://odhub.xyz`);
      sendNtfyToTopic(topic, 'Story Approved', `Hunter approved your story: ${story.headline}`, 'https://odhub.xyz').catch(() => {});
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/stories/:id/approve error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stories/:id/decline — Hunter declines and deletes a flagged story
app.post('/api/stories/:id/decline', requireAuth, async (req, res) => {
  const { user } = req.body;
  if (user !== ADMIN_USER) {
    return res.status(403).json({ error: 'Only Hunter can decline stories' });
  }
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).json({ error: 'Story not found' });
    const topic = getPersonalTopic(story.host);
    await Story.findByIdAndDelete(req.params.id);
    if (topic) {
      console.log(`[ntfy:decline] topic=${topic} Click: https://odhub.xyz`);
      sendNtfyToTopic(topic, 'Story Declined', `Hunter declined your story: ${story.headline}`, 'https://odhub.xyz').catch(() => {});
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/stories/:id/decline error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/stories/:id — update a story
app.put('/api/stories/:id', requireAuth, async (req, res) => {
  const { date, host, headline, link, additionalLinks, angleClarity, breaking, thumbnailUrl } = req.body;
  if (!date || !host || !headline) {
    return res.status(400).json({ error: 'date, host, and headline are required' });
  }
  try {
    const story = await Story.findByIdAndUpdate(
      req.params.id,
      { date, host, headline, link: link || '', additionalLinks: additionalLinks || '', angleClarity: angleClarity || '', breaking: !!breaking, thumbnailUrl: thumbnailUrl || '' },
      { new: true }
    );
    if (!story) return res.status(404).json({ error: 'Story not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/stories/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/stories/:id — remove a story
app.delete('/api/stories/:id', requireAuth, async (req, res) => {
  const { user } = req.body || {};
  try {
    const story = await Story.findByIdAndDelete(req.params.id);
    if (!story) return res.status(404).json({ error: 'Story not found' });
    addLog(user || 'Unknown', 'story_deleted', story.headline);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/stories/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stories/comment-counts — return { storyId: count } for all stories with comments
app.get('/api/stories/comment-counts', requireAuth, async (req, res) => {
  try {
    const agg = await Comment.aggregate([
      { $group: { _id: '$storyId', count: { $sum: 1 } } },
    ]);
    const counts = {};
    for (const { _id, count } of agg) {
      if (_id) counts[_id] = count;
    }
    res.json(counts);
  } catch (err) {
    console.error('GET /api/stories/comment-counts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stories/:id/comments — return all comments for a story, oldest first
app.get('/api/stories/:id/comments', requireAuth, async (req, res) => {
  try {
    const comments = await Comment.find({ storyId: req.params.id }).sort({ timestamp: 1 }).lean();
    res.json(comments.map(c => { c.id = c._id; delete c._id; return c; }));
  } catch (err) {
    console.error('GET /api/stories/:id/comments error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stories/:id/comments — add a comment to a story
app.post('/api/stories/:id/comments', requireAuth, async (req, res) => {
  const { author, text } = req.body;
  if (!author || !text) {
    return res.status(400).json({ error: 'author and text are required' });
  }
  try {
    const comment = await new Comment({ storyId: req.params.id, author, text }).save();
    const obj = toObj(comment);
    res.json(obj);
  } catch (err) {
    console.error('POST /api/stories/:id/comments error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/stories/:storyId/comments/:commentId — author-only delete
app.delete('/api/stories/:storyId/comments/:commentId', requireAuth, async (req, res) => {
  const { user } = req.body;
  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    if (comment.author !== user) return res.status(403).json({ error: 'You can only delete your own comments' });
    await Comment.findByIdAndDelete(req.params.commentId);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/stories/comments error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stories/:id/working — Hunter marks a story as being packaged
app.post('/api/stories/:id/working', requireAuth, async (req, res) => {
  const { user } = req.body;
  if (user !== ADMIN_USER) return res.status(403).json({ error: 'Only Hunter can do this' });
  try {
    const story = await Story.findByIdAndUpdate(req.params.id, { working: true, done: false }, { new: true });
    if (!story) return res.status(404).json({ error: 'Story not found' });
    const topic = getPersonalTopic(story.host);
    if (topic) {
      console.log(`[ntfy:working] topic=${topic} Click: https://odhub.xyz`);
      sendNtfyToTopic(topic, 'Video Update', `Hunter is packaging your video: ${story.headline}`, 'https://odhub.xyz').catch(() => {});
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/stories/:id/working error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stories/:id/done — Hunter marks a story as published
app.post('/api/stories/:id/done', requireAuth, async (req, res) => {
  const { user } = req.body;
  if (user !== ADMIN_USER) return res.status(403).json({ error: 'Only Hunter can do this' });
  try {
    const story = await Story.findByIdAndUpdate(req.params.id, { done: true, working: false }, { new: true });
    if (!story) return res.status(404).json({ error: 'Story not found' });
    const topic = getPersonalTopic(story.host);
    if (topic) {
      console.log(`[ntfy:done] topic=${topic} Click: https://odhub.xyz`);
      sendNtfyToTopic(topic, 'Video Published!', `Hunter has published your video: ${story.headline}`, 'https://odhub.xyz').catch(() => {});
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/stories/:id/done error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stories/:id/duplicate — any host flags story as duplicate
app.post('/api/stories/:id/duplicate', requireAuth, async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).json({ error: 'Not found' });
    story.duplicate = true;
    await story.save();
    const headline = story.headline || 'Untitled';
    console.log('[ntfy] POST /api/stories/:id/duplicate — sending duplicate alert to team topic');
    await sendNtfyToTopic(NTFY_TOPIC, 'DUPLICATE ALERT', `A video has been flagged as DUPLICATE - Please review the sheet ASAP: ${headline}`, 'https://odhub.xyz');
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/stories/:id/duplicate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stories/:id/unduplicate — any host dismisses duplicate flag
app.post('/api/stories/:id/unduplicate', requireAuth, async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).json({ error: 'Not found' });
    story.duplicate = false;
    await story.save();
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/stories/:id/unduplicate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/find-videos — public YouTube Data API v3 search (API key only, no OAuth)
// Titles that are primarily non-Latin (Arabic, Chinese, Korean, etc.) are discarded post-fetch.
const NON_LATIN_RE = /[^\u0000-\u024F\u1E00-\u1EFF\s\d\p{P}]/u;
const YT_DEFAULT_QUERY = '"Trump" OR "Democrats" OR "Republicans" OR "Congress" OR "MAGA" OR "White House"';

app.get('/api/find-videos', requireAuth, async (req, res) => {
  try {
    const userQ    = (req.query.q || '').trim();
    const queryStr = userQ || YT_DEFAULT_QUERY;
    const cacheKey = userQ.toLowerCase() || 'default';

    const cached = findVideosCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      console.log('[find-videos] cache hit for:', cacheKey);
      return res.json(cached.data);
    }

    const apiKey = (process.env.YOUTUBE_API_KEY || '').trim();
    console.log('[find-videos] key present:', !!apiKey, '| length:', apiKey.length);
    if (!apiKey) {
      return res.status(503).json({ error: 'YOUTUBE_API_KEY is not set in environment variables' });
    }

    const q = encodeURIComponent(queryStr);
    const ytUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${q}&type=video&order=date&maxResults=10&videoDuration=medium&relevanceLanguage=en&regionCode=US&key=${apiKey}`;
    console.log('[find-videos] requesting:', ytUrl.replace(apiKey, '<REDACTED>'), '| query:', queryStr);

    const ytRes = await httpsRequest(ytUrl, { headers: { 'User-Agent': 'TeamHub/1.0' } });
    console.log('[find-videos] status:', ytRes.status);

    if (ytRes.status !== 200 || !ytRes.body || !Array.isArray(ytRes.body.items)) {
      const errCode = (ytRes.body && ytRes.body.error && ytRes.body.error.code) || ytRes.status;
      const errMsg  = (ytRes.body && ytRes.body.error && ytRes.body.error.message) || `HTTP ${ytRes.status}`;
      console.error('[find-videos] failed | code:', errCode, '| message:', errMsg);
      return res.status(502).json({ error: `YouTube API error (${errCode}): ${errMsg}` });
    }

    const videos = ytRes.body.items
      .filter(item => item.id && item.id.videoId && item.snippet)
      .filter(item => !NON_LATIN_RE.test(item.snippet.title || ''))
      .map(item => ({
        id:          item.id.videoId,
        videoId:     item.id.videoId,
        title:       item.snippet.title || '',
        channel:     item.snippet.channelTitle || '',
        publishedAt: item.snippet.publishedAt || '',
        thumbnail:   (item.snippet.thumbnails && (item.snippet.thumbnails.medium || item.snippet.thumbnails.default || {}).url) || '',
        url:         `https://www.youtube.com/watch?v=${item.id.videoId}`,
      }));

    console.log('[find-videos] raw items:', ytRes.body.items.length, '| after language filter:', videos.length);
    findVideosCache.set(cacheKey, { data: videos, expiresAt: Date.now() + FIND_STORIES_CACHE_TTL_MS });
    res.json(videos);
  } catch (err) {
    console.error('[find-videos] exception:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/youtube-stats — live channel stats for The Michael Fanone Show
app.get('/api/youtube-stats', requireAuth, async (req, res) => {
  try {
    if (youtubeStatsCache && youtubeStatsCache.expiresAt > Date.now()) {
      return res.json(youtubeStatsCache.data);
    }

    const apiKey = (process.env.YOUTUBE_API_KEY || '').trim();
    if (!apiKey) {
      return res.status(503).json({ error: 'YOUTUBE_API_KEY is not set in environment variables' });
    }

    const ytUrl = `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${MFS_CHANNEL_ID}&key=${apiKey}`;
    const ytRes = await httpsRequest(ytUrl, { headers: { 'User-Agent': 'MFSHub/1.0' } });

    if (ytRes.status !== 200 || !ytRes.body || !Array.isArray(ytRes.body.items) || ytRes.body.items.length === 0) {
      const errCode = (ytRes.body && ytRes.body.error && ytRes.body.error.code) || ytRes.status;
      const errMsg  = (ytRes.body && ytRes.body.error && ytRes.body.error.message) || `HTTP ${ytRes.status}`;
      console.error('[youtube-stats] failed | code:', errCode, '| message:', errMsg);
      return res.status(502).json({ error: `YouTube API error (${errCode}): ${errMsg}` });
    }

    const item = ytRes.body.items[0];
    const snippet = item.snippet || {};
    const stats   = item.statistics || {};
    const thumbs  = snippet.thumbnails || {};

    const data = {
      channelId:       item.id || MFS_CHANNEL_ID,
      channelName:     snippet.title || 'The Michael Fanone Show',
      thumbnail:       (thumbs.high && thumbs.high.url) || (thumbs.medium && thumbs.medium.url) || (thumbs.default && thumbs.default.url) || '',
      subscriberCount: Number(stats.subscriberCount || 0),
      viewCount:       Number(stats.viewCount || 0),
      videoCount:      Number(stats.videoCount || 0),
      hiddenSubscriberCount: !!stats.hiddenSubscriberCount,
      fetchedAt:       new Date().toISOString(),
    };

    youtubeStatsCache = { data, expiresAt: Date.now() + YOUTUBE_STATS_CACHE_TTL_MS };
    res.json(data);
  } catch (err) {
    console.error('[youtube-stats] exception:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/recommended-story — surfaces the best-opportunity story
//   1. Pull the latest find-stories cache (or rebuild it minimally if empty)
//   2. Pick approved-source candidates
//   3. Run topic-pulse analysis on the top 3
//   4. Return the lowest-saturation (highest-opportunity) story + analysis
app.get('/api/recommended-story', requireAuth, async (req, res) => {
  try {
    if (recommendedStoryCache && recommendedStoryCache.expiresAt > Date.now()) {
      return res.json(recommendedStoryCache.data);
    }

    if (recommendedStoryInflight) {
      const data = await recommendedStoryInflight;
      return res.json(data);
    }

    recommendedStoryInflight = (async () => {
      const pool = await fetchHeadlinePool();

      if (!pool.length) {
        throw new Error('No articles available from Google News RSS');
      }

      const tagged = pool.map(a => {
        const outlet = matchApprovedOutlet(a);
        return { ...a, outlet };
      });

      const scored = tagged.map(article => {
        const { score: baseScore, matched, urgency } = scoreHeadlineForFanone(article);
        const finalScore = Math.max(0, Math.min(100, baseScore + (article.outlet ? 5 : 0)));
        return { article, score: finalScore, matched, urgency };
      });

      scored.sort((a, b) => b.score - a.score);

      // Take top 9 stories for the carousel
      const topPicks = scored.slice(0, 9);

      console.log('[recommended-story] top 9:', topPicks.map(s => `${s.score}|${s.urgency}| ${s.article.headline}`));

      // Generate angle lines for top 3 in parallel, rest get empty angles
      const anglePromises = topPicks.slice(0, 3).map(pick =>
        generateAngleLine(pick.article.headline, pick.article.outlet || pick.article.source)
          .catch(() => '')
      );
      const angles = await Promise.all(anglePromises);

      const suggestions = topPicks.map((pick, i) => {
        const angleLine = i < 3 ? angles[i] : '';
        const opportunity = fanoneOpportunityBucket(pick.score);
        return {
          article: {
            id:          pick.article.url || pick.article.headline,
            headline:    pick.article.headline,
            source:      pick.article.source || '',
            outlet:      pick.article.outlet || null,
            url:         pick.article.url || '',
            publishedAt: pick.article.publishedAt || '',
            angle:       angleLine,
          },
          score:      pick.score,
          matched:    pick.matched,
          urgency:    pick.urgency,
          opportunity,
          lifecycle:  opportunity.level === 'high' ? 'Rising'
                    : opportunity.level === 'moderate' ? 'Peak'
                    : 'Off-lane',
        };
      });

      // Top pick for back-compat
      const pick = suggestions[0];
      const data = {
        article:    pick.article,
        score:      pick.score,
        matched:    pick.matched,
        urgency:    pick.urgency,
        opportunity: pick.opportunity,
        analysis: {
          saturation_score: 100 - pick.score,
          best_angle:       pick.article.angle,
          recommendation:   '',
          dominant_framing: '',
          trends:           null,
          youtube_video_count: 0,
          avg_views_per_video: 0,
          upload_velocity:     0,
        },
        lifecycle: pick.lifecycle,
        empty: false,
        scored_at: new Date().toISOString(),
        candidates_considered: scored.length,
        // New: all story suggestions for carousel
        suggestions,
      };

      recommendedStoryCache = { data, expiresAt: Date.now() + RECOMMENDED_STORY_CACHE_TTL_MS };
      return data;
    })();

    try {
      const data = await recommendedStoryInflight;
      res.json(data);
    } finally {
      recommendedStoryInflight = null;
    }
  } catch (err) {
    console.error('[recommended-story] error:', err.message);
    recommendedStoryInflight = null;
    res.status(500).json({ error: err.message });
  }
});

// ── Twitter/X tweet parser — The Old Bird (twitter154) format ─────────────────

function parseTweetResults(body) {
  const out = [];

  // --- Shape: twitter154 { results: [...] } or { data: [...] } or top-level array ---
  const results = Array.isArray(body?.results) ? body.results
                : Array.isArray(body?.data)    ? body.data
                : Array.isArray(body)           ? body
                : [];

  for (const tweet of results) {
    try {
      const tweetId = tweet.tweet_id || tweet.id_str || String(tweet.id || '');
      const handle  = tweet.user?.username || tweet.user?.screen_name || '';
      if (!tweetId || !handle) continue;

      // media_url is an array of media objects on twitter154
      const media     = Array.isArray(tweet.media_url) ? tweet.media_url : [];
      const firstMedia = media[0];
      const thumbnail  = firstMedia?.media_url_https || firstMedia?.url || firstMedia?.media_url || null;
      const hasVideo   = media.some(m =>
        m.type === 'video' || m.type === 'animated_gif' ||
        (m.media_url_https || '').includes('/video/')
      );

      out.push({
        id:        tweetId,
        text:      (tweet.text || tweet.full_text || '').replace(/https?:\/\/t\.co\/\S+/g, '').trim(),
        author:    tweet.user?.name || handle,
        handle,
        url:       `https://x.com/${handle}/status/${tweetId}`,
        thumbnail,
        hasVideo,
        likes:     tweet.favorite_count ?? null,
        retweets:  tweet.retweet_count  ?? null,
        views:     tweet.views          ?? null,
        createdAt: tweet.creation_date  ? new Date(tweet.creation_date).toISOString() : null,
      });
    } catch {}
  }
  return out;
}

// GET /api/twitter-search — search X/Twitter via The Old Bird (twitter154) RapidAPI
app.get('/api/twitter-search', requireAuth, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'q parameter is required' });

  const cacheKey = q.toLowerCase();
  const cached = twitterSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    console.log('[twitter-search] cache hit for:', q);
    return res.json(cached.data);
  }

  const apiKey  = (process.env.RAPIDAPI_KEY || '').trim();
  const apiHost = 'twitter154.p.rapidapi.com';

  if (!apiKey || apiKey === 'your_key_here') {
    return res.status(503).json({ error: 'RAPIDAPI_KEY is not configured' });
  }

  try {
    const url = `https://${apiHost}/search/search?query=${encodeURIComponent(q)}&section=top&min_retweets=1&min_likes=1&limit=20&language=en`;
    console.log('[twitter-search] GET', url);
    console.log('[twitter-search] key length:', apiKey.length, '| host:', apiHost);

    const resp = await httpsRequest(url, {
      headers: {
        'x-rapidapi-host': apiHost,
        'x-rapidapi-key':  apiKey,
        'Content-Type':    'application/json',
      },
      timeout: 15000,
    });

    console.log('[twitter-search] status:', resp.status);
    console.log('[twitter-search] response top-level keys:', typeof resp.body === 'object' ? Object.keys(resp.body) : typeof resp.body);
    console.log('[twitter-search] full response body:', JSON.stringify(resp.body, null, 2));

    if (resp.status !== 200) {
      const msg = (typeof resp.body === 'object' && (resp.body?.message || resp.body?.error)) || `HTTP ${resp.status}`;
      console.error('[twitter-search] non-200:', msg);
      return res.status(502).json({ error: `X API error: ${msg}` });
    }

    const tweets = parseTweetResults(resp.body);
    console.log('[twitter-search] parsed tweets:', tweets.length);

    twitterSearchCache.set(cacheKey, { data: tweets, expiresAt: Date.now() + FIND_STORIES_CACHE_TTL_MS });
    res.json(tweets);
  } catch (err) {
    console.error('[twitter-search] exception:', err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/training-data — append a row to the training data sheet (Hunter only)
app.post('/api/training-data', requireAuth, async (req, res) => {
  const { url, headline, reasoning, user } = req.body;
  if (user !== ADMIN_USER) {
    return res.status(403).json({ error: 'Only Hunter can add training data' });
  }
  if (!url || !headline) {
    return res.status(400).json({ error: 'url and headline are required' });
  }
  try {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: TRAINING_SHEET_ID,
      range: 'Sheet1!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[url, headline, reasoning || '']],
      },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/training-data error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notify — send ntfy push notification (kept for compatibility)
app.post('/api/notify', requireAuth, async (req, res) => {
  try {
    const { title, message } = req.body;
    console.log('[ntfy:notify-endpoint] Click: https://odhub.xyz');
    await sendNtfy(title, message);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/notify error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/messages — newest first
app.get('/api/messages', requireAuth, async (req, res) => {
  try {
    const posts = await Post.find({}).sort({ timestamp: -1 }).lean();
    res.json(posts.map(p => { p.id = p._id; delete p._id; return p; }));
  } catch (err) {
    console.error('GET /api/messages error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/messages — save a post, fire team ntfy, and send personal ntfy to @mentioned hosts
app.post('/api/messages', requireAuth, async (req, res) => {
  const { sender, text } = req.body;
  if (!sender || !text) {
    return res.status(400).json({ error: 'sender and text are required' });
  }
  try {
    const post = await new Post({ sender, text }).save();
    const obj = toObj(post);
    addLog(sender, 'message_posted', text.slice(0, 100));
    console.log('[ntfy:post-broadcast] Click: https://odhub.xyz');
    sendNtfy(sender, text).catch(() => {});

    // Fire personal ntfy for each @mention (case-insensitive, deduped)
    const mentionRe = /@([A-Za-z]+)/g;
    const seen = new Set();
    let m;
    while ((m = mentionRe.exec(text)) !== null) {
      const name = m[1];
      const key = name.toLowerCase();
      if (seen.has(key) || key === sender.toLowerCase()) continue;
      seen.add(key);
      const topic = getPersonalTopic(name);
      if (topic) {
        console.log(`[ntfy:mention] topic=${topic} Click: https://odhub.xyz/go/posts`);
        sendNtfyToTopic(topic, `Mentioned by ${sender}`, text, 'https://odhub.xyz/go/posts').catch(() => {});
      }
    }

    res.json(obj);
  } catch (err) {
    console.error('POST /api/messages error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hunter-updates — return all updates newest first (requireAuth; any user can read)
app.get('/api/hunter-updates', requireAuth, async (req, res) => {
  try {
    const updates = await HunterUpdate.find({}).sort({ createdAt: -1 }).lean();
    res.json(updates.map(u => { u.id = u._id; delete u._id; return u; }));
  } catch (err) {
    console.error('GET /api/hunter-updates error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hunter-updates — Hunter only; creates update and notifies team
app.post('/api/hunter-updates', requireAuth, async (req, res) => {
  const { user, text } = req.body;
  if (user !== ADMIN_USER) {
    return res.status(403).json({ error: 'Only Hunter can post updates' });
  }
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  try {
    const update = await new HunterUpdate({ text: text.trim() }).save();
    const obj = { ...update.toObject(), id: update._id };
    delete obj._id;
    addLog('Hunter', 'hunter_update_posted', text.trim().slice(0, 100));
    console.log('[ntfy:hunter-update] Click: https://odhub.xyz');
    sendNtfy('Hunter posted an update', text.trim().slice(0, 100)).catch(() => {});
    res.json(obj);
  } catch (err) {
    console.error('POST /api/hunter-updates error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/:id/like — toggle like count
app.post('/api/messages/:id/like', requireAuth, async (req, res) => {
  const action = (req.body && req.body.action) || 'like';
  const delta = action === 'unlike' ? -1 : 1;
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Message not found' });
    post.likes = Math.max(0, (post.likes || 0) + delta);
    await post.save();
    res.json({ likes: post.likes });
  } catch (err) {
    console.error('POST /api/messages/:id/like error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/messages/:id — remove a post
app.delete('/api/messages/:id', requireAuth, async (req, res) => {
  try {
    const post = await Post.findByIdAndDelete(req.params.id);
    if (!post) return res.status(404).json({ error: 'Message not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/messages/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dm — return conversation between two users (?user=A&peer=B)
// Marks all messages in the thread as read by `user`.
app.get('/api/dm', requireAuth, async (req, res) => {
  const user = (req.query.user || '').trim();
  const peer = (req.query.peer || '').trim();
  if (!user || !peer) {
    return res.status(400).json({ error: 'user and peer query params are required' });
  }
  try {
    // Mark all messages in this thread as read by user
    await DM.updateMany(
      {
        $or: [
          { sender: user, recipient: peer },
          { sender: peer, recipient: user },
        ],
        readBy: { $ne: user },
      },
      { $addToSet: { readBy: user } }
    );
    const dms = await DM.find({
      $or: [
        { sender: user, recipient: peer },
        { sender: peer, recipient: user },
      ],
    }).sort({ timestamp: 1 }).lean();
    res.json(dms.map(d => { d.id = d._id; delete d._id; return d; }));
  } catch (err) {
    console.error('GET /api/dm error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dm/unread — return unread DM count for a user (?user=X)
app.get('/api/dm/unread', requireAuth, async (req, res) => {
  const user = (req.query.user || '').trim();
  if (!user) return res.status(400).json({ error: 'user query param required' });
  try {
    const count = await DM.countDocuments({
      recipient: user,
      readBy: { $ne: user },
    });
    res.json({ count });
  } catch (err) {
    console.error('GET /api/dm/unread error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dm/unread-by-sender — return unread DM count per sender for a user (?user=X)
app.get('/api/dm/unread-by-sender', requireAuth, async (req, res) => {
  const user = (req.query.user || '').trim();
  if (!user) return res.status(400).json({ error: 'user query param required' });
  try {
    const results = await DM.aggregate([
      { $match: { recipient: user, readBy: { $ne: user } } },
      { $group: { _id: '$sender', count: { $sum: 1 } } },
    ]);
    const byPeer = {};
    for (const r of results) byPeer[r._id] = r.count;
    res.json({ byPeer });
  } catch (err) {
    console.error('GET /api/dm/unread-by-sender error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dm — send a private message and notify the recipient
app.post('/api/dm', requireAuth, async (req, res) => {
  const { sender, recipient, text } = req.body;
  if (!sender || !recipient || !text) {
    return res.status(400).json({ error: 'sender, recipient, and text are required' });
  }
  try {
    // Sender has already read their own message
    const dm = await new DM({ sender, recipient, text, readBy: [sender] }).save();
    const topic = getPersonalTopic(recipient);
    if (topic) {
      console.log(`[ntfy:dm] topic=${topic} Click: https://odhub.xyz/go/dm`);
      sendNtfyToTopic(topic, `Private message from ${sender}`, text, 'https://odhub.xyz/go/dm').catch(() => {});
    }
    const obj = toObj(dm);
    res.json(obj);
  } catch (err) {
    console.error('POST /api/dm error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/activity-log — return last 50 log entries, newest first
app.get('/api/activity-log', requireAuth, async (req, res) => {
  try {
    const entries = await Log.find({}).sort({ timestamp: -1 }).limit(50).lean();
    res.json(entries.map(e => { e.id = e._id; delete e._id; return e; }));
  } catch (err) {
    console.error('GET /api/activity-log error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/title-tool — generate MFS-style YouTube titles and thumbnail text
const MFS_TITLE_SYSTEM_PROMPT = `You are the title generator for The Michael Fanone Show (MFS), a progressive political YouTube channel hosted by Michael Fanone — a 20-year law enforcement veteran, former D.C. police officer, FBI/ATF/DEA task force member, and NYT bestselling author. The channel averages 200K-500K views on top videos. Do not reference January 6th in titles unless the video is specifically about January 6th events.

Given an article, headline, or summary, generate 5 YouTube title options and 3 thumbnail text options.

TITLE RULES:
- First person discovery framing is the #1 performer. Use 'I Just Found...', 'I Just Uncovered...', 'I Just Discovered...' as the primary pattern.
- Capitalize KEY dramatic words but not every word. Examples: 'I Just Found A HIDDEN BOMB In Trump's Beautiful Bill', 'I Just Uncovered The DARK MONEY Funding The NEXT MAGA Leader'
- End every title with the alert siren emoji 🚨
- Include 'We ALL Missed' or 'Nobody Noticed' framing when the story is about something hidden or overlooked
- Use action verbs: Found, Uncovered, Discovered, Confronted, Exposed, Sent, Blasts
- Trump reaction framing works: 'Trump PANICS As...', 'Trump Just ACCIDENTALLY EXPOSED...'
- Third party action framing: '[Person] Just Made A SUSPICIOUS Announcement', '[Person] JUST FOUND Trump's Achilles Heel'
- Keep titles under 70 characters when possible but prioritize impact over length
- Never use generic clickbait that the video cannot deliver on
- The title should make someone stop scrolling immediately

THUMBNAIL TEXT RULES:
- ALL CAPS always
- 2-5 words maximum
- Dramatic, punchy, standalone phrases
- Examples of proven performers: FOLLOW THE MONEY, CHECKMATE!, THE FULL STORY, ICE GETS ARRESTED, TRUMP'S DARK SECRET EXPOSED!, NOBODY NOTICED THIS, WE CAN TAKE HIM DOWN!, THIS IS MAJOR
- Use exclamation marks and question marks for energy
- The thumbnail text should work even without reading the title

OUTPUT FORMAT:
# TITLES
1. [title with 🚨]
2. [title with 🚨]
3. [title with 🚨]
4. [title with 🚨]
5. [title with 🚨]

# THUMBNAIL TEXT
1. [ALL CAPS TEXT]
2. [ALL CAPS TEXT]
3. [ALL CAPS TEXT]`;

// Parse the markdown response into { titles, thumbnails }.
function parseMfsTitleResponse(raw) {
  const titles = [];
  const thumbnails = [];
  if (!raw) return { titles, thumbnails };

  let section = null; // 'titles' | 'thumbnails' | null
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^#+\s*titles?\s*$/i.test(line)) { section = 'titles'; continue; }
    if (/^#+\s*thumbnail(\s*text)?\s*$/i.test(line)) { section = 'thumbnails'; continue; }
    if (line.startsWith('#')) { section = null; continue; }

    // Numbered list item: "1. Foo" or "1) Foo" or "- Foo"
    const m = line.match(/^(?:\d+[.)]|-)\s*(.+)$/);
    if (!m || !section) continue;
    const value = m[1].replace(/^\[|\]$/g, '').trim();
    if (!value) continue;
    if (section === 'titles') titles.push(value);
    else if (section === 'thumbnails') thumbnails.push(value);
  }

  return { titles: titles.slice(0, 5), thumbnails: thumbnails.slice(0, 3) };
}

app.post('/api/title-tool', requireAuth, async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  try {
    const anthropicRes = await httpsRequest(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
      },
      {
        model: 'claude-opus-4-6',
        max_tokens: 1024,
        system: MFS_TITLE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: text.trim() }],
      }
    );

    if (anthropicRes.status !== 200) {
      const errBody = anthropicRes.body || {};
      const errMsg = (errBody.error && errBody.error.message) || JSON.stringify(errBody);
      console.error('[title-tool] Anthropic error | status:', anthropicRes.status, '| body:', JSON.stringify(errBody));
      return res.status(502).json({ error: `Anthropic API error (${anthropicRes.status}): ${errMsg}` });
    }

    const raw = ((anthropicRes.body.content || []).find(c => c.type === 'text') || {}).text || '';
    const { titles, thumbnails } = parseMfsTitleResponse(raw);
    if (titles.length === 0 && thumbnails.length === 0) {
      console.error('[title-tool] could not parse model output:', raw);
      return res.status(502).json({ error: 'Could not parse AI response' });
    }

    res.json({ titles, thumbnails });
  } catch (err) {
    console.error('POST /api/title-tool error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/generate-script — full MFS script package via Claude
app.post('/api/generate-script', requireAuth, async (req, res) => {
  const { articleText = '', articleTitle = '', articleSource = '', angleNotes = '', user = '' } = req.body || {};
  if (!articleText.trim() && !articleTitle.trim()) {
    return res.status(400).json({ error: 'articleText or articleTitle is required' });
  }
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server' });
  }

  const todayStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const userMessage =
    `Today's date is ${todayStr}. Generate a full MFS script package from this story:\n\n` +
    `Title: ${articleTitle}\n` +
    `Source: ${articleSource}\n\n` +
    `${articleText}\n\n` +
    `${angleNotes ? 'Angle notes: ' + angleNotes : ''}`;

  try {
    const anthropicRes = await httpsRequest(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        timeout: 120000,
      },
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16000,
        system: MFS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }
    );

    if (anthropicRes.status !== 200) {
      const errBody = anthropicRes.body || {};
      const errMsg = (errBody.error && errBody.error.message) || JSON.stringify(errBody);
      console.error('[generate-script] Anthropic error | status:', anthropicRes.status, '| body:', JSON.stringify(errBody));
      return res.status(502).json({ error: `Anthropic API error (${anthropicRes.status}): ${errMsg}` });
    }

    const script = ((anthropicRes.body.content || []).find(c => c.type === 'text') || {}).text || '';
    if (!script) return res.status(502).json({ error: 'Empty script returned from Anthropic' });

    let savedId = null;
    try {
      const saved = await new Script({
        articleTitle:    articleTitle || '',
        articleSource:   articleSource || '',
        angleNotes:      angleNotes || '',
        generatedScript: script,
        generatedBy:    user || '',
      }).save();
      savedId = saved._id;
    } catch (saveErr) {
      console.error('[generate-script] failed to persist script:', saveErr.message);
    }

    res.json({ script, id: savedId });
  } catch (err) {
    console.error('POST /api/generate-script error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/scripts — list all saved scripts, newest first
app.get('/api/scripts', requireAuth, async (req, res) => {
  try {
    const scripts = await Script.find({}).sort({ createdAt: -1 }).lean();
    res.json(scripts.map(s => { s.id = s._id; delete s._id; return s; }));
  } catch (err) {
    console.error('GET /api/scripts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/scripts/:id
app.delete('/api/scripts/:id', requireAuth, async (req, res) => {
  try {
    const result = await Script.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ error: 'Script not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/scripts/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/scripts/:id — update script text (manual edits)
app.put('/api/scripts/:id', requireAuth, async (req, res) => {
  try {
    const { generatedScript } = req.body || {};
    if (!generatedScript || !generatedScript.trim()) {
      return res.status(400).json({ error: 'generatedScript is required' });
    }
    const existing = await Script.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Script not found' });

    existing.previousVersion = existing.generatedScript;
    existing.generatedScript = generatedScript;
    existing.updatedAt = new Date().toISOString();
    await existing.save();

    const obj = existing.toObject();
    obj.id = obj._id;
    delete obj._id;
    res.json(obj);
  } catch (err) {
    console.error('PUT /api/scripts/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scripts/:id/regenerate — regenerate script with user notes
app.post('/api/scripts/:id/regenerate', requireAuth, async (req, res) => {
  const { notes = '', user = '' } = req.body || {};
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured' });
  }
  try {
    const existing = await Script.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Script not found' });

    const todayStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const userMessage =
      `Today's date is ${todayStr}. You previously generated a script for this story. The user wants a revised version.\n\n` +
      `Original article title: ${existing.articleTitle}\n` +
      `Original article source: ${existing.articleSource}\n` +
      `${existing.angleNotes ? 'Original angle notes: ' + existing.angleNotes + '\n' : ''}` +
      `\n--- CURRENT SCRIPT ---\n${existing.generatedScript}\n--- END SCRIPT ---\n\n` +
      `User feedback / revision notes: ${notes}\n\n` +
      `Please generate a revised script package incorporating this feedback. Keep the same output format.`;

    const anthropicRes = await httpsRequest(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        timeout: 120000,
      },
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16000,
        system: MFS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }
    );

    if (anthropicRes.status !== 200) {
      const errBody = anthropicRes.body || {};
      const errMsg = (errBody.error && errBody.error.message) || JSON.stringify(errBody);
      return res.status(502).json({ error: `Anthropic API error (${anthropicRes.status}): ${errMsg}` });
    }

    const script = ((anthropicRes.body.content || []).find(c => c.type === 'text') || {}).text || '';
    if (!script) return res.status(502).json({ error: 'Empty script returned from Anthropic' });

    existing.previousVersion = existing.generatedScript;
    existing.generatedScript = script;
    existing.updatedAt = new Date().toISOString();
    await existing.save();

    const obj = existing.toObject();
    obj.id = obj._id;
    delete obj._id;
    res.json(obj);
  } catch (err) {
    console.error('POST /api/scripts/:id/regenerate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/find-stories — scrape Google News RSS and enrich with Anthropic
app.get('/api/find-stories', requireAuth, async (req, res) => {
  try {
    const win = req.query.window || '6h';
    const windowMs = win === '24h' ? 24 * 60 * 60 * 1000 : 6 * 60 * 60 * 1000;
    const cacheKey = win;

    const cached = findStoriesCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      console.log('[find-stories] cache hit');
      return res.json(cached.data);
    }

    const rssUrl = 'https://news.google.com/rss/search?q=Trump+OR+Democrats+OR+Republicans+OR+Congress+OR+MAGA&hl=en-US&gl=US&ceid=US:en';
    console.log('[find-stories] fetching RSS');

    const rssRes = await httpsRequest(rssUrl, { headers: { 'User-Agent': 'Mozilla/5.0 TeamHub/1.0' } });
    console.log('[find-stories] RSS status:', rssRes.status);

    if (rssRes.status !== 200 || typeof rssRes.body !== 'string') {
      return res.status(502).json({ error: 'Google News RSS fetch failed', rssStatus: rssRes.status });
    }

    const rssParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    const parsed = rssParser.parse(rssRes.body);
    const rawItems = [].concat(parsed?.rss?.channel?.item || []);
    console.log('[find-stories] RSS items:', rawItems.length);

    if (rawItems.length === 0) {
      return res.status(502).json({ error: 'Google News RSS returned no items' });
    }

    const POLITICAL_KEYWORDS = /trump|white house|congress|senate|maga|democrat|republican|biden|political/i;
    const JUNK_TITLE_WORDS   = /\bnfl\b|\bnba\b|\bmlb\b|\bmovie\b|\bcelebrity\b|\bsports?\b|\bgame\b|\bscore\b|\bactor\b/i;

    const cutoff = Date.now() - windowMs;
    const seen = new Set();
    const pool = [];

    for (const item of rawItems) {
      const title = typeof item.title === 'string' ? item.title
        : (item.title?.['#text'] || String(item.title || ''));
      const link = typeof item.link === 'string' ? item.link : '';
      const pubDate = item.pubDate ? String(item.pubDate) : '';
      const pubMs = pubDate ? new Date(pubDate).getTime() : 0;
      const sourceName = typeof item.source === 'string' ? item.source
        : (item.source?.['#text'] || '');
      const description = typeof item.description === 'string' ? item.description : '';

      if (!title || !link || seen.has(link)) continue;
      seen.add(link);
      pool.push({ title, link, pubDate, pubMs, sourceName, description });
    }

    // Filter by time window — fall back to full pool if too few pass
    const timeFiltered = pool.filter(a => !a.pubMs || a.pubMs >= cutoff);
    const workingPool = timeFiltered.length >= 3 ? timeFiltered : pool;

    const keywordFiltered = workingPool.filter(a =>
      POLITICAL_KEYWORDS.test(a.title) || POLITICAL_KEYWORDS.test(a.description)
    );
    const junkFiltered = keywordFiltered.filter(a => !JUNK_TITLE_WORDS.test(a.title));
    // Filter out tabloid/gossip sources
    const fullFiltered = junkFiltered.filter(a => !isTabloidSource(a));
    const filteredPool = fullFiltered.length >= 3 ? fullFiltered
      : junkFiltered.length >= 3 ? junkFiltered
      : keywordFiltered.length >= 3 ? keywordFiltered : workingPool;

    filteredPool.sort((a, b) => (b.pubMs || 0) - (a.pubMs || 0));
    const articles = filteredPool.slice(0, 15);

    console.log('[find-stories] pool:', pool.length, '| timeFiltered:', timeFiltered.length, '| after junk filter:', filteredPool.length, '| enriching:', articles.length, '| freshest:', articles[0]?.pubDate || 'none');

    const enriched = await Promise.all(articles.map(async (article) => {
      try {
        const anthropicRes = await httpsRequest(
          'https://api.anthropic.com/v1/messages',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01',
            },
          },
          {
            model: 'claude-opus-4-6',
            max_tokens: 512,
            system: 'You are a political news producer for The Michael Fanone Show, a progressive political YouTube channel. The current year is 2026. Donald Trump is the sitting President of the United States — always refer to him as "President Trump" or "Trump," never as "former president" or "ex-president." Given this headline and description, provide: 1) A brief angle explaining why this story matters, drawing on themes of corruption, accountability, law enforcement, constitutional law, foreign policy, or institutional failure, 2) Three suggested headlines in a punchy cable news style. CRITICAL: Do NOT connect stories to January 6th or the Capitol attack unless the story is literally about those events. Find angles based on Fanone\'s broader expertise instead. Return as JSON with fields: angle, titles (array of 3 strings). Return only valid JSON, no other text.',
            messages: [
              {
                role: 'user',
                content: `Headline: ${article.title}\nDescription: ${article.description || '(none)'}`,
              },
            ],
          }
        );

        let angle = '';
        let titles = [];
        if (anthropicRes.status === 200 && anthropicRes.body.content) {
          const text = (anthropicRes.body.content.find(c => c.type === 'text') || {}).text || '';
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const p = JSON.parse(jsonMatch[0]);
            angle = p.angle || '';
            titles = Array.isArray(p.titles) ? p.titles : [];
          }
        } else if (anthropicRes.status !== 200) {
          const errBody = anthropicRes.body || {};
          const errMsg = (errBody.error && errBody.error.message) || JSON.stringify(errBody);
          console.error('[find-stories] Anthropic error for "' + article.title + '" | status:', anthropicRes.status, '| msg:', errMsg);
          angle = `Anthropic error (${anthropicRes.status}): ${errMsg}`;
        }

        return {
          id: article.link || article.title,
          headline: article.title,
          source: article.sourceName,
          url: article.link,
          publishedAt: article.pubDate,
          angle,
          titles,
        };
      } catch (enrichErr) {
        console.error('[find-stories] enrichment error for "' + article.title + '":', enrichErr.message);
        return {
          id: article.link || article.title,
          headline: article.title,
          source: article.sourceName,
          url: article.link,
          publishedAt: article.pubDate,
          angle: `Enrichment error: ${enrichErr.message}`,
          titles: [],
        };
      }
    }));

    enriched.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    findStoriesCache.set(cacheKey, { data: enriched, expiresAt: Date.now() + FIND_STORIES_CACHE_TTL_MS });
    console.log('[find-stories] cached result | expires in 2 min');
    res.json(enriched);
  } catch (err) {
    console.error('GET /api/find-stories error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── List items ────────────────────────────────────────────────────────────────

app.get('/api/list', requireAuth, async (req, res) => {
  try {
    const items = await ListItem.find().sort({ timestamp: -1 });
    res.json(items.map(toObj));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/list', requireAuth, async (req, res) => {
  const { type, content, reason, hostName, forHunter } = req.body;
  if (!type || !content || !hostName) return res.status(400).json({ error: 'Missing fields' });
  try {
    const item = await new ListItem({ type, content, reason: reason || '', hostName, forHunter: !!forHunter }).save();
    res.json(toObj(item));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/list/:id', requireAuth, async (req, res) => {
  try {
    await ListItem.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Topic Pulse ───────────────────────────────────────────────────────────────
app.use('/api/topic-pulse', requireAuth, topicPulseRouter);

// ── ntfy deep-link redirects ─────────────────────────────────────────────────
// ntfy on iOS strips query parameters, so we use path-based redirects instead.
// These routes must come before the static catch-all.
app.get('/go/posts', (req, res) => res.redirect('/?page=posts'));
app.get('/go/dm',    (req, res) => res.redirect('/?page=dm'));

// Serve React build — always register so deep links work on Railway even if
// the dist folder is created after process startup checks.
const clientDist = path.join(__dirname, '../client/dist');
const indexHtml  = path.join(clientDist, 'index.html');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  res.sendFile(indexHtml, (err) => {
    if (err) {
      console.error(`[static] Failed to serve index.html for ${req.path}:`, err.message);
      res.status(404).send('Not found');
    }
  });
});

// ── Connect to MongoDB then start listening ───────────────────────────────────

const PORT = process.env.PORT || 3001;

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('[MongoDB] Connected successfully');
    const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    server.on('error', (err) => {
      console.error('[CRASH] server listen error:', err);
      process.exit(1);
    });
  })
  .catch(err => {
    console.error('[MongoDB] Connection failed:', err.message);
    process.exit(1);
  });
