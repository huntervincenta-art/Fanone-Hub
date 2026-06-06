// ── Shared Fanone scoring logic ──────────────────────────────────────────────
// Single source of truth for CTR keyword scoring, category assignment, and
// opportunity bucketing.
// Used by: article script routes, video script route, recommended-story endpoint.
//
// Updated 2026-05-20 to align with FANONE_EDITORIAL.md:
//   - Editorial lane keywords map to Sections 2 & 3
//   - Two-pass scoring: keyword (40%) + AI lane fit (60%)
//   - "Mike-worthy?" gate for recommendation surfaces
//
// Updated 2026-06-05: keywords, weights, multipliers, and penalties now loaded
// from fanone-editorial.json at repo root. Scoring math is unchanged.

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── Load editorial config (once at module init) ─────────────────────────────

const CONFIG_PATH = path.join(__dirname, '..', '..', 'fanone-editorial.json');
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

// ── Editorial Lane Keywords (per FANONE_EDITORIAL.md Section 2) ──────────────

const lanesByID = {};
for (const lane of CONFIG.editorialLanes) {
  lanesByID[lane.id] = lane.keywords;
}

const LANE_FEDERAL_LE_KEYWORDS      = lanesByID['FEDERAL_LE'];
const LANE_ADMIN_CORRUPTION_KEYWORDS = lanesByID['ADMIN_CORRUPTION'];
const LANE_DEMS_MOMENT_KEYWORDS     = lanesByID['DEMS_MOMENT'];
const LANE_DEM_DIRECTION_KEYWORDS   = lanesByID['DEM_DIRECTION'];
const LANE_MEDIA_BALANCE_KEYWORDS   = lanesByID['MEDIA_BALANCE'];

// ── Deprioritize keywords (Section 3) ────────────────────────────────────────

const INTERNATIONAL_PENALTY_KEYWORDS   = CONFIG.deprioritize.internationalPenalty;
const INTERNATIONAL_EXCEPTION_KEYWORDS = CONFIG.deprioritize.internationalExceptions;

// ── Legacy keyword arrays (kept for backward compat with existing callers) ───

const FANONE_HIGH_KEYWORDS = [
  ...LANE_FEDERAL_LE_KEYWORDS,
  ...LANE_ADMIN_CORRUPTION_KEYWORDS,
  ...CONFIG.scoringKeywords.highExtra,
];

const FANONE_MEDIUM_KEYWORDS = [
  ...LANE_DEMS_MOMENT_KEYWORDS,
  ...LANE_DEM_DIRECTION_KEYWORDS,
  ...LANE_MEDIA_BALANCE_KEYWORDS,
  ...CONFIG.scoringKeywords.mediumExtra,
];

const FANONE_LOW_KEYWORDS    = CONFIG.scoringKeywords.low;
const FANONE_IMPACT_KEYWORDS = CONFIG.scoringKeywords.impact;
const BREAKING_KEYWORDS      = CONFIG.scoringKeywords.breaking;

// ── Category assignment keywords ─────────────────────────────────────────────

const LAW_ENFORCEMENT_KEYWORDS     = CONFIG.categoryKeywords.lawEnforcement;
const POLITICAL_COMMENTARY_KEYWORDS = CONFIG.categoryKeywords.politicalCommentary;

// ── Category classifier ──────────────────────────────────────────────────────

function classifyCategory(text) {
  const lower = text.toLowerCase();
  let leHits = 0;
  let pcHits = 0;
  for (const kw of LAW_ENFORCEMENT_KEYWORDS) {
    if (lower.includes(kw)) leHits++;
  }
  for (const kw of POLITICAL_COMMENTARY_KEYWORDS) {
    if (lower.includes(kw)) pcHits++;
  }
  if (leHits > 0) return 'Law Enforcement';
  if (pcHits > 0) return 'Political Commentary';
  return 'Political Commentary';
}

// ── Editorial lane detection (maps to FANONE_EDITORIAL.md Section 2) ─────────

const EDITORIAL_LANES = CONFIG.editorialLanes.map(lane => ({
  id: lane.id,
  label: lane.label,
  keywords: lane.keywords,
  weight: lane.weight,
}));

function detectEditorialLanes(text) {
  const lower = text.toLowerCase();
  const hits = [];
  for (const lane of EDITORIAL_LANES) {
    let count = 0;
    for (const kw of lane.keywords) {
      if (lower.includes(kw)) count++;
    }
    if (count > 0) {
      hits.push({ ...lane, hits: count, laneScore: count * lane.weight });
    }
  }
  hits.sort((a, b) => b.laneScore - a.laneScore);
  return hits;
}

// ── Lane multiplier keywords (loaded from config) ───────────────────────────

const boostsByLane = {};
for (const b of CONFIG.boosts) {
  boostsByLane[b.lane] = b;
}

const penaltiesByLane = {};
for (const p of CONFIG.penalties) {
  penaltiesByLane[p.lane] = p;
}

function hasProperNoun(text) {
  const names = text.match(/\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}/g);
  return names && names.length > 0;
}

function computeLaneMultipliers(text, originalText) {
  const applied = [];
  const boostCandidates = [];

  const magaDef = boostsByLane['MAGA Defection'];
  if (magaDef.keywords.some(kw => text.includes(kw))) {
    boostCandidates.push({ lane: 'MAGA Defection', type: 'boost', multiplier: magaDef.multiplier });
  }

  const innerCircle = boostsByLane['Inner Circle Collapse'];
  if (innerCircle.keywords.some(kw => text.includes(kw))) {
    boostCandidates.push({ lane: 'Inner Circle Collapse', type: 'boost', multiplier: innerCircle.multiplier });
  }

  // Media malpractice now part of editorial lanes; keep boost for backward compat
  if (LANE_MEDIA_BALANCE_KEYWORDS.some(kw => text.includes(kw))) {
    const mediaCfg = boostsByLane['Media Malpractice'];
    let mediaMult = mediaCfg.multiplier;
    if (mediaCfg.bonusSignals.some(s => text.includes(s))) mediaMult += mediaCfg.bonusAmount;
    boostCandidates.push({ lane: 'Media Malpractice', type: 'boost', multiplier: mediaMult });
  }

  const acctCfg = boostsByLane['Specific Named Accountability'];
  if (acctCfg.keywords.some(kw => text.includes(kw)) && hasProperNoun(originalText)) {
    boostCandidates.push({ lane: 'Specific Named Accountability', type: 'boost', multiplier: acctCfg.multiplier });
  }

  let boost = 1.0;
  if (boostCandidates.length > 0) {
    boostCandidates.sort((a, b) => b.multiplier - a.multiplier);
    const winner = boostCandidates[0];
    boost = winner.multiplier;
    applied.push(winner);
  }

  let penalty = 1.0;

  const epsteinCfg = penaltiesByLane['Epstein-only'];
  const epsteinHits = epsteinCfg.keywords.filter(kw => text.includes(kw)).length;
  if (epsteinHits > 0) {
    if (!epsteinCfg.freshSignals.some(s => text.includes(s))) {
      penalty *= epsteinCfg.multiplier;
      applied.push({ lane: 'Epstein-only', type: 'penalty', multiplier: epsteinCfg.multiplier });
    }
  }

  const foreignCfg = penaltiesByLane['Generic foreign policy'];
  const foreignHits = foreignCfg.keywords.filter(kw => text.includes(kw)).length;
  if (foreignHits > 0 && boost <= 1.0) {
    // Check for international exceptions before penalizing
    if (!INTERNATIONAL_EXCEPTION_KEYWORDS.some(kw => text.includes(kw))) {
      penalty *= foreignCfg.multiplier;
      applied.push({ lane: 'Generic foreign policy', type: 'penalty', multiplier: foreignCfg.multiplier });
    }
  }

  const reactiveCfg = penaltiesByLane['Reactive outrage'];
  const reactiveHits = reactiveCfg.keywords.filter(p => text.includes(p)).length;
  if (reactiveHits > 0) {
    if (!reactiveCfg.exceptionHooks.some(h => text.includes(h))) {
      penalty *= reactiveCfg.multiplier;
      applied.push({ lane: 'Reactive outrage', type: 'penalty', multiplier: reactiveCfg.multiplier });
    }
  }

  // International general penalty (Section 3.1)
  const intlCfg = penaltiesByLane['International (general)'];
  const intlHits = INTERNATIONAL_PENALTY_KEYWORDS.filter(kw => text.includes(kw)).length;
  if (intlHits >= intlCfg.minHits && boost <= 1.0) {
    if (!INTERNATIONAL_EXCEPTION_KEYWORDS.some(kw => text.includes(kw))) {
      penalty *= intlCfg.multiplier;
      applied.push({ lane: 'International (general)', type: 'penalty', multiplier: intlCfg.multiplier });
    }
  }

  return { boost, penalty, combined: boost * penalty, applied };
}

// ── Scoring function (keyword pass — Pass 1 deterministic part) ──────────────

function scoreHeadlineForFanone(article) {
  const headline = String(article.headline || '');
  const description = String(article.description || '');
  const originalText = `${headline} ${description}`;
  const lowerHeadline = headline.toLowerCase();
  const lowerDescription = description.toLowerCase();
  const text = `${lowerHeadline} ${lowerHeadline} ${lowerDescription}`;

  let score = 50;
  const matched = { high: [], medium: [], low: [], impact: [] };

  let highBonus = 0;
  for (const kw of FANONE_HIGH_KEYWORDS) {
    if (text.includes(kw)) {
      highBonus += 12;
      matched.high.push(kw.trim());
    }
  }
  score += Math.min(highBonus, 40);

  let medBonus = 0;
  for (const kw of FANONE_MEDIUM_KEYWORDS) {
    if (text.includes(kw)) {
      medBonus += 5;
      matched.medium.push(kw.trim());
    }
  }
  score += Math.min(medBonus, 15);

  for (const kw of FANONE_LOW_KEYWORDS) {
    if (text.includes(kw)) {
      score -= 8;
      matched.low.push(kw.trim());
    }
  }

  let impactBonus = 0;
  for (const kw of FANONE_IMPACT_KEYWORDS) {
    if (text.includes(kw)) {
      impactBonus += 5;
      matched.impact.push(kw.trim());
    }
  }
  score += Math.min(impactBonus, 10);

  const pubMs = article.publishedAt ? new Date(article.publishedAt).getTime() : 0;
  let ageHours = Infinity;
  if (pubMs) {
    ageHours = (Date.now() - pubMs) / (1000 * 60 * 60);
    if (ageHours <= 6) score += 10;
    else if (ageHours <= 12) score += 5;
    else if (ageHours > 24) score -= 10;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const multiplierResult = computeLaneMultipliers(text, originalText);
  const baseScore = score;
  score = Math.max(0, Math.min(100, Math.round(score * multiplierResult.combined)));

  if (multiplierResult.applied.length > 0) {
    const tags = multiplierResult.applied.map(m => `${m.lane}(${m.multiplier}x)`).join(', ');
    console.log(`[score] ${baseScore} → ${score} | ${tags} | ${headline.slice(0, 80)}`);
  }

  let urgency = 'EVERGREEN';
  const breakingMatches = BREAKING_KEYWORDS.filter(kw => text.includes(kw));
  if (breakingMatches.length >= 2 && ageHours <= 6) urgency = 'BREAKING';
  else if (breakingMatches.length >= 1 && ageHours <= 3) urgency = 'BREAKING';

  const category = classifyCategory(text);

  // Detect primary editorial lane
  const laneHits = detectEditorialLanes(text);
  const primaryLane = laneHits.length > 0 ? laneHits[0].label : null;

  return { score, matched, urgency, category, multipliers: multiplierResult.applied, primaryLane };
}

// ── AI Lane Fit Pass (Pass 1 AI part) ────────────────────────────────────────
// Returns { laneFit: 0-100, primaryLane, reasoning }
// Uses claude-haiku-4-5 for cost efficiency.

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
    req.on('timeout', () => req.destroy(new Error(`Request to ${u.hostname} timed out`)));
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

const EDITORIAL_LANES_PROMPT = `Editorial lanes for The Michael Fanone Show:
1. FEDERAL LE (CORE): ICE overreach, DOJ politicization, FBI corruption, Kash Patel, federal LE leadership
2. ADMIN CORRUPTION: Cabinet loyalists (RFK Jr, Hegseth, Rubio, Patel), incompetent plays for power, Trump corrupt deals
3. DEMS NOT MEETING THE MOMENT: Democrats capitulating, soft-pedaling, normalizing Trump (Fetterman archetype)
4. PARTY DIRECTION: Democratic party direction, infighting, midterm strategy
5. MEDIA FALSE BALANCE: Legacy media "fair and balanced" instead of calling out Trump corruption/authoritarianism

DEPRIORITIZE: Generic international stories (unless Trump corrupt deals overseas, military/veteran angles, or domestic economic effects). Low-saturation stories that don't matter.`;

async function aiLaneFitScore(headline, bodySnippet, apiKey) {
  if (!apiKey) return null;
  try {
    const res = await httpsRequest(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        timeout: 15000,
      },
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        system: 'You score news stories for editorial fit. Reply with ONLY valid JSON, no other text.',
        messages: [{
          role: 'user',
          content: `${EDITORIAL_LANES_PROMPT}\n\nDoes this story fit any of these editorial lanes?\nHeadline: ${headline}\nSnippet: ${(bodySnippet || '').slice(0, 500)}\n\nReply JSON: { "laneFit": <0-100>, "primaryLane": "<lane name or null>", "reasoning": "<one sentence>" }`,
        }],
      }
    );
    if (res.status !== 200) return null;
    const text = ((res.body.content || []).find(c => c.type === 'text') || {}).text || '';
    return parseClaudeJson(text);
  } catch (err) {
    console.warn('[aiLaneFitScore] failed:', err.message);
    return null;
  }
}

// ── Mike-worthy gate ─────────────────────────────────────────────────────────
// Returns { mikeWorthy: true|false, reasoning: "..." }

const mikeWorthyCache = new Map(); // url -> { result, expiresAt }
const MIKE_WORTHY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function checkMikeWorthy(headline, bodySnippet, storyUrl, apiKey) {
  if (!apiKey) return { mikeWorthy: true, reasoning: 'No API key — skipping gate' };

  // Check cache
  if (storyUrl && mikeWorthyCache.has(storyUrl)) {
    const cached = mikeWorthyCache.get(storyUrl);
    if (cached.expiresAt > Date.now()) return cached.result;
    mikeWorthyCache.delete(storyUrl);
  }

  try {
    const res = await httpsRequest(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        timeout: 15000,
      },
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        system: 'You decide if a story is worth covering on The Michael Fanone Show. Reply with ONLY valid JSON.',
        messages: [{
          role: 'user',
          content: `Given the editorial guide below, would Mike actually cover this story on The Michael Fanone Show? Yes or no, with one sentence of reasoning.\n\n${EDITORIAL_LANES_PROMPT}\n\nStory headline: ${headline}\nFirst 500 characters: ${(bodySnippet || '').slice(0, 500)}\n\nReply JSON: { "mikeWorthy": true or false, "reasoning": "..." }`,
        }],
      }
    );
    if (res.status !== 200) return { mikeWorthy: true, reasoning: 'API error — defaulting to worthy' };
    const text = ((res.body.content || []).find(c => c.type === 'text') || {}).text || '';
    const result = parseClaudeJson(text);
    // Cache result
    if (storyUrl) {
      mikeWorthyCache.set(storyUrl, { result, expiresAt: Date.now() + MIKE_WORTHY_TTL_MS });
    }
    return result;
  } catch (err) {
    console.warn('[checkMikeWorthy] failed:', err.message);
    return { mikeWorthy: true, reasoning: 'Error — defaulting to worthy' };
  }
}

// ── Two-pass scoring (combined keyword + AI) ─────────────────────────────────

async function twoPassScore(article, apiKey) {
  // Pass 1a: deterministic keyword score
  const keywordResult = scoreHeadlineForFanone(article);
  const keywordScore = keywordResult.score;

  // Pass 1b: AI lane fit (if API key available)
  const aiResult = await aiLaneFitScore(
    article.headline || '',
    article.description || '',
    apiKey
  );

  let finalLaneFit;
  let aiLane = null;
  let aiReasoning = null;

  if (aiResult && typeof aiResult.laneFit === 'number') {
    // Weighted average: 40% keyword, 60% AI
    finalLaneFit = Math.round(keywordScore * 0.4 + aiResult.laneFit * 0.6);
    aiLane = aiResult.primaryLane || null;
    aiReasoning = aiResult.reasoning || null;
  } else {
    // AI unavailable — use keyword score only
    finalLaneFit = keywordScore;
  }

  finalLaneFit = Math.max(0, Math.min(100, finalLaneFit));

  // Use AI lane if available, otherwise keyword-detected lane
  const primaryLane = aiLane || keywordResult.primaryLane;

  return {
    laneFit: finalLaneFit,
    keywordScore,
    aiScore: aiResult ? aiResult.laneFit : null,
    primaryLane,
    aiReasoning,
    matched: keywordResult.matched,
    urgency: keywordResult.urgency,
    category: keywordResult.category,
    multipliers: keywordResult.multipliers,
  };
}

// ── Opportunity bucketing ────────────────────────────────────────────────────

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

function scoreTranscriptForFanone(text) {
  return scoreHeadlineForFanone({ headline: text, description: '' });
}

function parseClaudeJson(text) {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in Claude response');
  return JSON.parse(match[0]);
}

module.exports = {
  LANE_FEDERAL_LE_KEYWORDS,
  LANE_ADMIN_CORRUPTION_KEYWORDS,
  LANE_DEMS_MOMENT_KEYWORDS,
  LANE_DEM_DIRECTION_KEYWORDS,
  LANE_MEDIA_BALANCE_KEYWORDS,
  FANONE_HIGH_KEYWORDS,
  FANONE_MEDIUM_KEYWORDS,
  FANONE_LOW_KEYWORDS,
  FANONE_IMPACT_KEYWORDS,
  BREAKING_KEYWORDS,
  LAW_ENFORCEMENT_KEYWORDS,
  POLITICAL_COMMENTARY_KEYWORDS,
  EDITORIAL_LANES,
  classifyCategory,
  detectEditorialLanes,
  scoreHeadlineForFanone,
  scoreTranscriptForFanone,
  fanoneOpportunityBucket,
  parseClaudeJson,
  aiLaneFitScore,
  checkMikeWorthy,
  twoPassScore,
};
