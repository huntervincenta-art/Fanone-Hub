const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const fs      = require('fs');
const path    = require('path');

const SUBJECTS_FILE = path.join(__dirname, '../data/subjects.json');

// ── subjects.json helpers (kept for backwards compat) ─────────────────────────

function readSubjects() {
  try { return JSON.parse(fs.readFileSync(SUBJECTS_FILE, 'utf8')); }
  catch { return []; }
}
function writeSubjects(subjects) {
  fs.writeFileSync(SUBJECTS_FILE, JSON.stringify(subjects, null, 2));
}

// ── JSON parsing helper ───────────────────────────────────────────────────────

function parseClaudeJson(text) {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in Claude response');
  return JSON.parse(match[0]);
}

// ── Subject CRUD (legacy — no longer called by UI) ────────────────────────────

router.get('/subjects', (req, res) => res.json(readSubjects()));

router.post('/subjects', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  const subjects = readSubjects();
  if (subjects.includes(name)) return res.status(409).json({ error: 'Subject already exists' });
  subjects.push(name);
  writeSubjects(subjects);
  res.json(subjects);
});

router.delete('/subjects/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  writeSubjects(readSubjects().filter(s => s !== name));
  res.json(readSubjects());
});

// ── YouTube stats (search + view counts) ─────────────────────────────────────

async function fetchYouTubeStats(subject, apiKey) {
  const now        = Date.now();
  const oneDayAgo  = new Date(now - 24 * 60 * 60 * 1000);
  const oneHrAgo   = new Date(now -  1 * 60 * 60 * 1000);

  // Search: top 20 videos published in last 24 hours
  const searchRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
    params: {
      part:           'snippet',
      q:              subject,
      type:           'video',
      order:          'date',
      publishedAfter: oneDayAgo.toISOString(),
      maxResults:     20,
      key:            apiKey,
    },
    timeout: 12000,
  });

  const searchItems = searchRes.data.items || [];
  const videoIds    = searchItems.map(item => item.id?.videoId).filter(Boolean);

  const empty = {
    total_views_24h:     0,
    avg_views_per_video: 0,
    upload_velocity:     0,
    hourly_breakdown:    new Array(24).fill(0),
    youtube_video_count: 0,
    videos_last_hour:    0,
    titles:              [],
    yt_velocity_score:   0,
  };

  if (!videoIds.length) return empty;

  // Fetch statistics for those videos
  const statsRes = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
    params: {
      part: 'statistics,snippet',
      id:   videoIds.join(','),
      key:  apiKey,
    },
    timeout: 12000,
  });

  const videos = statsRes.data.items || [];
  if (!videos.length) return empty;

  const hourlyBreakdown = new Array(24).fill(0);
  let totalViews     = 0;
  let videosLastHour = 0;
  const titles       = [];

  for (const video of videos) {
    const publishedAt = new Date(video.snippet?.publishedAt);
    const views       = parseInt(video.statistics?.viewCount || '0', 10);
    const title       = video.snippet?.title || '';

    if (title) titles.push(title);
    totalViews += views;
    if (publishedAt >= oneHrAgo) videosLastHour++;

    // Bucket index: 0 = 24h ago, 23 = most recent hour
    const hoursAgo = (now - publishedAt.getTime()) / (1000 * 60 * 60);
    const bucket   = Math.max(0, Math.min(23, Math.round(23 - hoursAgo)));
    hourlyBreakdown[bucket] += views;
  }

  const count   = videos.length;
  const avgViews = count > 0 ? Math.round(totalViews / count) : 0;

  // YouTube velocity score (0–100, represents saturation level)
  // Scale count (max 20 results) → base 0–80
  let ytScore = Math.round((count / 20) * 80);
  // High demand + low supply = opportunity → lower saturation
  if (avgViews > 100000 && count <= 4)  ytScore = Math.max(0, ytScore - 25);
  // High uploads + high views = crowded → higher saturation
  else if (avgViews > 50000 && count >= 12) ytScore = Math.min(100, ytScore + 20);
  ytScore = Math.max(0, Math.min(100, ytScore));

  return {
    total_views_24h:     totalViews,
    avg_views_per_video: avgViews,
    upload_velocity:     videosLastHour, // videos published in last 1 hr
    hourly_breakdown:    hourlyBreakdown,
    youtube_video_count: count,
    videos_last_hour:    videosLastHour,
    titles,
    yt_velocity_score:   ytScore,
  };
}

// ── Title homogeneity check (Claude) ─────────────────────────────────────────

async function fetchTitleHomogeneity(subject, titles, anthropicKey) {
  if (!titles.length) {
    return {
      dominant_framing: 'No titles found in last 24 hours',
      saturation_score: 0,
      untapped_angles:  [],
      avoid_phrases:    [],
    };
  }

  const prompt =
    `You are analyzing YouTube video titles about ${subject} from the last 24 hours to detect narrative saturation for a progressive political content channel.\n\n` +
    `Here are the titles:\n${titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n` +
    `Respond ONLY with a JSON object:\n` +
    `{\n` +
    `  "dominant_framing": "one sentence describing the most repeated narrative angle",\n` +
    `  "saturation_score": 0-100,\n` +
    `  "untapped_angles": ["angle 1", "angle 2", "angle 3"],\n` +
    `  "avoid_phrases": ["phrase1", "phrase2"]\n` +
    `}`;

  const resp = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model:      'claude-opus-4-6',
      max_tokens: 512,
      messages:   [{ role: 'user', content: prompt }],
    },
    {
      headers: {
        'x-api-key':         anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json',
      },
      timeout: 20000,
    }
  );

  const text = resp.data.content?.[0]?.text || '{}';
  return parseClaudeJson(text);
}

// ── Google Trends momentum ────────────────────────────────────────────────────

async function fetchGoogleTrendsMomentum(subject) {
  try {
    const exploreReq = JSON.stringify({
      comparisonItem: [{ keyword: subject, geo: 'US', time: 'now 7-d' }],
      category: 0,
      property: '',
    });

    const exploreRes = await axios.get('https://trends.google.com/trends/api/explore', {
      params:  { hl: 'en-US', tz: 300, req: exploreReq },
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TeamHub/1.0)' },
      timeout: 8000,
    });

    const rawExplore = typeof exploreRes.data === 'string'
      ? exploreRes.data.replace(/^\)\]\}',?\n/, '')
      : JSON.stringify(exploreRes.data);

    const widgets        = JSON.parse(rawExplore).widgets || [];
    const timelineWidget = widgets.find(w => w.id === 'TIMESERIES');
    if (!timelineWidget?.token) return null;

    const multilineReq = JSON.stringify({
      time:           'now 7-d',
      resolution:     'HOUR',
      locale:         'en-US',
      comparisonItem: [{
        geo: { country: 'US' },
        complexKeywordsRestriction: {
          keyword: [{ type: 'BROAD', value: subject }],
        },
      }],
      requestOptions: { property: '', backend: 'IZG', category: 0 },
    });

    const multiRes = await axios.get(
      'https://trends.google.com/trends/api/widgetdata/multiline',
      {
        params:  { hl: 'en-US', tz: 300, req: multilineReq, token: timelineWidget.token },
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TeamHub/1.0)' },
        timeout: 8000,
      }
    );

    const rawMulti = typeof multiRes.data === 'string'
      ? multiRes.data.replace(/^\)\]\}',?\n/, '')
      : JSON.stringify(multiRes.data);

    const timelineData = JSON.parse(rawMulti)?.default?.timelineData || [];
    if (!timelineData.length) return null;

    const values        = timelineData.map(d => (d.value?.[0] ?? 0));
    const current_value = values[values.length - 1];
    const last6         = values.slice(-6);
    const prior18       = values.slice(-24, -6);

    const avg6  = last6.reduce((a, b) => a + b, 0)  / (last6.length  || 1);
    const avg18 = prior18.length
      ? prior18.reduce((a, b) => a + b, 0) / prior18.length
      : avg6;

    const delta    = avg6 - avg18;
    const momentum = delta > 15 ? 'rising' : delta < -10 ? 'falling' : 'stable';

    return { current_value, momentum, delta: Math.round(delta) };
  } catch (err) {
    console.warn(`[topic-pulse] Google Trends skipped for "${subject}":`, err.message);
    return null;
  }
}

// ── Synthesis (Claude) ────────────────────────────────────────────────────────

async function synthesize(subject, ytStats, homogeneity, trends, anthropicKey) {
  const trendsStr  = trends
    ? `${trends.momentum} (current index: ${trends.current_value}, delta: ${trends.delta})`
    : 'data unavailable';
  const anglesStr  = (homogeneity.untapped_angles || []).join(', ') || 'none identified';

  // Derive legacy velocity fields for prompt context
  const avgHourlyUploads = ytStats.youtube_video_count / 24;
  const velocityRatio    = avgHourlyUploads > 0
    ? ytStats.videos_last_hour / avgHourlyUploads
    : 0;
  const phase = velocityRatio > 2.5 ? 'Breaking' : velocityRatio >= 0.8 ? 'Transitioning' : 'Cooling';

  const userPrompt =
    `Analyze this subject for content opportunity:\n\n` +
    `Subject: ${subject}\n` +
    `YouTube videos in last 24h: ${ytStats.youtube_video_count}\n` +
    `Videos in last hour: ${ytStats.videos_last_hour} (phase: ${phase})\n` +
    `Total views (24h): ${ytStats.total_views_24h.toLocaleString()}\n` +
    `Avg views per video: ${ytStats.avg_views_per_video.toLocaleString()}\n` +
    `Title saturation score: ${homogeneity.saturation_score}/100\n` +
    `Dominant framing already used: ${homogeneity.dominant_framing}\n` +
    `Trends momentum: ${trendsStr}\n` +
    `Untapped angles: ${anglesStr}\n\n` +
    `Respond ONLY with JSON:\n` +
    `{\n` +
    `  "phase": "Breaking" | "Peak Saturation" | "Angle Window" | "Cooling",\n` +
    `  "recommendation": "Cover Now" | "Wait for Angle" | "Skip" | "Unique Angle Only",\n` +
    `  "recommendation_color": "green" | "yellow" | "red",\n` +
    `  "reasoning": "2-3 sentence plain English explanation for a content producer",\n` +
    `  "best_angle": "One specific title-style angle suggestion for this channel",\n` +
    `  "avoid": "What framing to stay away from"\n` +
    `}`;

  const resp = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model:      'claude-opus-4-6',
      max_tokens: 512,
      system:     'You are a content strategy AI for a progressive political YouTube channel with 500k+ subscribers. You help the team decide what to cover and how to cover it uniquely.',
      messages:   [{ role: 'user', content: userPrompt }],
    },
    {
      headers: {
        'x-api-key':         anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json',
      },
      timeout: 25000,
    }
  );

  const text = resp.data.content?.[0]?.text || '{}';
  return parseClaudeJson(text);
}

// ── Reusable single-subject analysis ──────────────────────────────────────────

async function analyzeSubject(subject, youtubeKey, anthropicKey) {
  try {
    // YouTube stats + Google Trends run in parallel
    // Title homogeneity chains off YouTube titles
    const [{ ytStats, homogeneity }, trendsData] = await Promise.all([
      fetchYouTubeStats(subject, youtubeKey).then(async (ytStats) => {
        const homogeneity = await fetchTitleHomogeneity(subject, ytStats.titles, anthropicKey);
        return { ytStats, homogeneity };
      }),
      fetchGoogleTrendsMomentum(subject),
    ]);

    // Blend Claude saturation (60%) with YouTube velocity score (40%)
    const blendedScore = Math.round(
      0.6 * homogeneity.saturation_score + 0.4 * ytStats.yt_velocity_score
    );

    const synthesis = await synthesize(subject, ytStats, homogeneity, trendsData, anthropicKey);

    return {
      subject,
      saturation_score:    blendedScore,
      dominant_framing:    homogeneity.dominant_framing,
      untapped_angles:     homogeneity.untapped_angles || [],
      avoid_phrases:       homogeneity.avoid_phrases   || [],
      trends:              trendsData,
      // YouTube data fields
      total_views_24h:     ytStats.total_views_24h,
      avg_views_per_video: ytStats.avg_views_per_video,
      upload_velocity:     ytStats.upload_velocity,
      hourly_breakdown:    ytStats.hourly_breakdown,
      youtube_video_count: ytStats.youtube_video_count,
      ...synthesis,
      error: null,
    };
  } catch (err) {
    console.error(`[topic-pulse] "${subject}" failed:`, err.message);
    return { subject, error: err.message };
  }
}

// ── POST /analyze ─────────────────────────────────────────────────────────────

router.post('/analyze', async (req, res) => {
  const { subjects } = req.body;
  if (!Array.isArray(subjects) || !subjects.length) {
    return res.status(400).json({ error: 'subjects array is required' });
  }

  const youtubeKey   = (process.env.YOUTUBE_API_KEY   || '').trim();
  const anthropicKey = (process.env.ANTHROPIC_API_KEY || '').trim();

  if (!youtubeKey)   return res.status(503).json({ error: 'YOUTUBE_API_KEY is not configured' });
  if (!anthropicKey) return res.status(503).json({ error: 'ANTHROPIC_API_KEY is not configured' });

  const results = await Promise.all(
    subjects.map((subject) => analyzeSubject(subject, youtubeKey, anthropicKey))
  );

  res.json({ results, analyzed_at: new Date().toISOString() });
});

module.exports = router;
module.exports.analyzeSubject = analyzeSubject;
