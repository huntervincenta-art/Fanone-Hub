// ── Shared Fanone scoring logic ──────────────────────────────────────────────
// Single source of truth for CTR keyword scoring, category assignment, and
// opportunity bucketing.
// Used by: article script routes, video script route, recommended-story endpoint.

// ── Scoring keywords (unchanged — drive the 0-100 lane-fit score) ────────────

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

// Time-sensitivity keywords (unchanged — drive the BREAKING/EVERGREEN urgency flag)
const BREAKING_KEYWORDS = [
  'breaking', 'just in', 'developing', 'happening now',
  'arrested today', 'just arrested', 'just indicted', 'just ruled',
  'emergency', 'shooting', 'active', 'unfolding',
  'hours ago', 'minutes ago', 'just announced',
];

// ── Category assignment keywords ─────────────────────────────────────────────
// Two buckets: "Law Enforcement" and "Political Commentary".
// If a story matches ANY LE keyword, it's Law Enforcement (LE wins ties).
// Everything else defaults to Political Commentary.

const LAW_ENFORCEMENT_KEYWORDS = [
  // Core law enforcement
  'police', 'cop ', 'cops', 'officer', 'officers', 'sheriff', 'deputy',
  'law enforcement', 'policing', 'police department', 'police officer',
  'state trooper', 'trooper', 'highway patrol', 'marshal', 'constable',
  // Federal agencies
  'fbi', 'doj', 'dea', 'atf', 'ice ', 'i.c.e.', 'u.s. marshal',
  'secret service', 'homeland security', 'dhs', 'federal agent',
  'federal agents', 'bureau of', 'task force',
  // Legal / courts / prosecution
  'prosecutor', 'district attorney', 'attorney general', 'grand jury',
  'indictment', 'indicted', 'indict', 'arraign', 'arraignment',
  'sentenc', 'verdict', 'trial', 'federal court', 'plea deal',
  'plea bargain', 'guilty', 'convicted', 'conviction', 'acquitted',
  'charges filed', 'criminal charges', 'felony', 'misdemeanor',
  // Crime and investigations
  'homicide', 'murder', 'shooting', 'mass shooting', 'gun violence',
  'stabbing', 'assault', 'robbery', 'burglary', 'carjacking',
  'kidnapping', 'human trafficking', 'trafficking', 'drug trafficking',
  'narcotics', 'cartel', 'organized crime', 'gang', 'gangs',
  'crime scene', 'criminal investigation', 'cold case', 'forensic',
  // Accountability and reform
  'body cam', 'bodycam', 'body camera', 'use of force', 'excessive force',
  'police brutality', 'police misconduct', 'police reform', 'internal affairs',
  'qualified immunity', 'civil rights violation', 'section 1983',
  'consent decree', 'pattern or practice', 'police union',
  'officer-involved', 'officer involved',
  // Corrections / detention
  'prison', 'jail', 'incarcerat', 'inmate', 'correctional',
  'detention', 'detained', 'detain', 'parole', 'probation',
  'bail', 'bail reform', 'pretrial',
  // Jan 6 / Capitol
  'january 6', 'jan. 6', 'jan 6', 'capitol riot', 'capitol attack',
  'capitol breach', 'insurrection',
  // Immigration enforcement
  'deport', 'deportation', 'border patrol', 'immigration enforcement',
  'immigration arrest', 'immigration raid', 'cbp',
  // Whistleblower / oversight (LE context)
  'inspector general', 'misconduct', 'abuse of power',
  'whistleblower', 'cover up', 'cover-up', 'coverup',
  // Broad arrest / warrant
  'arrested', 'arrest', 'warrant', 'search warrant', 'raid',
  'seized', 'seizure', 'confiscated',
];

const POLITICAL_COMMENTARY_KEYWORDS = [
  // Elections and campaigns
  'election', 'campaign', 'ballot', 'voter', 'polling', 'primary',
  'caucus', 'swing state', 'electoral', 'candidate', 'running mate',
  'nomination', 'delegate',
  // Branches of government
  'congress', 'senate', 'house of representatives', 'white house',
  'oval office', 'speaker of the house', 'majority leader',
  'minority leader', 'filibuster', 'cloture', 'committee',
  // Policy and legislation
  'policy', 'legislation', 'bill', 'executive order', 'directive',
  'budget', 'spending bill', 'appropriation', 'government spending',
  'funding cut', 'shutdown', 'debt ceiling', 'continuing resolution',
  // Partisan politics
  'bipartisan', 'partisan', 'republican party', 'democratic party',
  'gop', 'maga', 'progressive', 'conservative', 'liberal',
  'left wing', 'right wing', 'moderate', 'centrist',
  // Political figures (generic signals)
  'trump administration', 'administration', 'cabinet', 'secretary',
  'ambassador', 'envoy', 'appointee', 'nominee',
  // Political commentary
  'op-ed', 'opinion', 'editorial', 'political analysis', 'political interview',
  'press conference', 'press briefing', 'state of the union',
  'approval rating', 'poll numbers',
  // Foreign policy (political context)
  'foreign policy', 'diplomacy', 'diplomat', 'sanctions', 'nato',
  'trade war', 'tariff', 'summit', 'treaty', 'alliance',
];

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

  // LE wins ties — it's currently underrepresented and we want to surface it
  if (leHits > 0) return 'Law Enforcement';
  if (pcHits > 0) return 'Political Commentary';
  return 'Political Commentary'; // default
}

// ── Lane multiplier keywords ────────────────────────────────────────────────
// BOOST multipliers (highest match wins, don't stack)
const MAGA_DEFECTION_KEYWORDS = [
  'maga', 'trump voter', 'former supporter', 'his base', 'loyal base',
  'breaking with trump', 'regret voting', 'turning on trump',
  'lifelong republican', 'former republican', 'maga crack', 'base fractur',
];

const INNER_CIRCLE_KEYWORDS = [
  'resign', 'quit', 'fired', 'betray', 'trump ally', 'advisor', 'cabinet',
  'insider', 'loyalist', 'split with trump', 'break with trump', 'fracture',
  'turn on trump', 'former aide',
];

const ACCOUNTABILITY_ACTION_KEYWORDS = [
  'indicted', 'charged', 'arrested', 'convicted', 'sentenced', 'fired', 'removed',
];

// PENALTY keywords
const EPSTEIN_KEYWORDS = ['epstein', 'maxwell', 'ghislaine'];
const FOREIGN_POLICY_KEYWORDS = ['iran', 'putin', 'europe', 'china', 'venezuela'];
const REACTIVE_OUTRAGE_PATTERNS = [
  'trump said', 'trump posted', 'trump did', 'trump called', 'trump claims',
  'trump tweeted', 'trump attacked', 'trump slammed', 'trump blasted',
];

// Detect a proper noun: at least one capitalized word (2+ chars) that isn't
// a sentence-start artifact. We check in the original (non-lowered) text.
function hasProperNoun(text) {
  // Match capitalized words that aren't common title-case noise
  const names = text.match(/\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}/g);
  return names && names.length > 0;
}

function computeLaneMultipliers(text, originalText) {
  const applied = [];

  // ── BOOST: pick the single highest matching lane ──
  const boostCandidates = [];
  if (MAGA_DEFECTION_KEYWORDS.some(kw => text.includes(kw))) {
    boostCandidates.push({ lane: 'MAGA Defection', type: 'boost', multiplier: 2.0 });
  }
  if (INNER_CIRCLE_KEYWORDS.some(kw => text.includes(kw))) {
    boostCandidates.push({ lane: 'Inner Circle Collapse', type: 'boost', multiplier: 1.8 });
  }
  const hasAccountabilityAction = ACCOUNTABILITY_ACTION_KEYWORDS.some(kw => text.includes(kw));
  if (hasAccountabilityAction && hasProperNoun(originalText)) {
    boostCandidates.push({ lane: 'Specific Named Accountability', type: 'boost', multiplier: 1.5 });
  }
  // Pick the highest multiplier; ties go to the first match (higher-priority lane)
  let boost = 1.0;
  if (boostCandidates.length > 0) {
    boostCandidates.sort((a, b) => b.multiplier - a.multiplier);
    const winner = boostCandidates[0];
    boost = winner.multiplier;
    applied.push(winner);
  }

  // ── PENALTIES: stack together ──
  let penalty = 1.0;

  // Epstein-only (0.4x) — only if primarily about Epstein with no fresh angle
  const epsteinHits = EPSTEIN_KEYWORDS.filter(kw => text.includes(kw)).length;
  if (epsteinHits > 0) {
    // Check for fresh angle: a proper noun that isn't Epstein/Maxwell, or "new", "unsealed", "document"
    const freshSignals = ['new ', 'unsealed', 'document', 'reveal', 'just released', 'newly'];
    const hasFreshAngle = freshSignals.some(s => text.includes(s));
    if (!hasFreshAngle) {
      penalty *= 0.4;
      applied.push({ lane: 'Epstein-only', type: 'penalty', multiplier: 0.4 });
    }
  }

  // Generic foreign policy (0.6x) — unless there's a defection/inner-circle angle
  const foreignHits = FOREIGN_POLICY_KEYWORDS.filter(kw => text.includes(kw)).length;
  if (foreignHits > 0 && boost <= 1.0) {
    // No boost lane matched, so it's generic foreign policy
    penalty *= 0.6;
    applied.push({ lane: 'Generic foreign policy', type: 'penalty', multiplier: 0.6 });
  }

  // Reactive outrage (0.7x) — "Trump said/did X" with no accountability hook
  const reactiveHits = REACTIVE_OUTRAGE_PATTERNS.filter(p => text.includes(p)).length;
  if (reactiveHits > 0) {
    // Check for accountability hooks that redeem it
    const accountabilityHooks = ['indicted', 'charged', 'arrested', 'convicted', 'resign',
      'fired', 'defect', 'breaking with', 'turning on', 'consequence'];
    const hasHook = accountabilityHooks.some(h => text.includes(h));
    if (!hasHook) {
      penalty *= 0.7;
      applied.push({ lane: 'Reactive outrage', type: 'penalty', multiplier: 0.7 });
    }
  }

  return { boost, penalty, combined: boost * penalty, applied };
}

// ── Scoring function ─────────────────────────────────────────────────────────

function scoreHeadlineForFanone(article) {
  const headline = String(article.headline || '');
  const description = String(article.description || '');
  const originalText = `${headline} ${description}`;
  const lowerHeadline = headline.toLowerCase();
  const lowerDescription = description.toLowerCase();
  const text = `${lowerHeadline} ${lowerHeadline} ${lowerDescription}`; // headline weighted 2x

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

  // Clamp base score to 0–100 before multipliers
  score = Math.max(0, Math.min(100, Math.round(score)));

  // ── Lane multipliers (applied AFTER base score) ──
  const multiplierResult = computeLaneMultipliers(text, originalText);
  const baseScore = score;
  score = Math.max(0, Math.min(100, Math.round(score * multiplierResult.combined)));

  if (multiplierResult.applied.length > 0) {
    const tags = multiplierResult.applied.map(m => `${m.lane}(${m.multiplier}x)`).join(', ');
    console.log(`[score] ${baseScore} → ${score} | ${tags} | ${headline.slice(0, 80)}`);
  }

  // Urgency classification: BREAKING vs EVERGREEN (time-sensitivity only)
  let urgency = 'EVERGREEN';
  const breakingMatches = BREAKING_KEYWORDS.filter(kw => text.includes(kw));
  if (breakingMatches.length >= 2 && ageHours <= 6) {
    urgency = 'BREAKING';
  } else if (breakingMatches.length >= 1 && ageHours <= 3) {
    urgency = 'BREAKING';
  }

  // Category: "Law Enforcement" vs "Political Commentary"
  const category = classifyCategory(text);

  return { score, matched, urgency, category, multipliers: multiplierResult.applied };
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

// Score free-form text (e.g. a transcript) the same way as a headline.
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
  FANONE_HIGH_KEYWORDS,
  FANONE_MEDIUM_KEYWORDS,
  FANONE_LOW_KEYWORDS,
  FANONE_IMPACT_KEYWORDS,
  BREAKING_KEYWORDS,
  LAW_ENFORCEMENT_KEYWORDS,
  POLITICAL_COMMENTARY_KEYWORDS,
  classifyCategory,
  scoreHeadlineForFanone,
  scoreTranscriptForFanone,
  fanoneOpportunityBucket,
  parseClaudeJson,
};
