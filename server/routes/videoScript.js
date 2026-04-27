const express = require('express');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const router  = express.Router();

const MFS_SYSTEM_PROMPT = require('../mfs-system-prompt');
const { extractYouTubeId }         = require('../utils/urlType');
const { fetchTranscript }          = require('../utils/youtubeTranscript');
const { scoreTranscriptForFanone, fanoneOpportunityBucket, parseClaudeJson } = require('../utils/fanone-shared');

// ── Helpers ──────────────────────────────────────────────────────────────────

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
    req.on('timeout', () => req.destroy(new Error(`Request to ${u.hostname} timed out after ${timeoutMs}ms`)));
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function formatTimestamp(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Build a timestamped transcript string for the Claude prompt
function buildTranscriptText(chunks) {
  return chunks.map(c => {
    const ts = formatTimestamp(c.offset / 1000);
    return `[${ts}] ${c.text}`;
  }).join('\n');
}

// Fetch basic video metadata via oEmbed (no API key required)
async function fetchVideoMeta(videoId) {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await httpsRequest(url, { timeout: 8000 });
    if (res.status === 200 && res.body && typeof res.body === 'object') {
      return {
        title:   res.body.title || '',
        channel: res.body.author_name || '',
      };
    }
  } catch {}
  return { title: '', channel: '' };
}

// Whisper fallback: download audio with ytdl-core, transcribe via OpenAI Whisper
async function whisperFallback(videoId) {
  let ytdl, OpenAI;
  try {
    ytdl = require('ytdl-core');
    OpenAI = require('openai').default || require('openai');
  } catch {
    throw new Error('Whisper fallback unavailable — ytdl-core or openai not installed');
  }

  const openaiKey = (process.env.OPENAI_API_KEY || '').trim();
  if (!openaiKey) throw new Error('OPENAI_API_KEY not configured — cannot use Whisper fallback');

  const tmpPath = path.join(__dirname, '..', `_tmp_audio_${videoId}.mp4`);
  try {
    // Download audio-only stream
    await new Promise((resolve, reject) => {
      const stream = ytdl(`https://www.youtube.com/watch?v=${videoId}`, {
        filter: 'audioonly',
        quality: 'lowestaudio',
      });
      const ws = fs.createWriteStream(tmpPath);
      stream.pipe(ws);
      ws.on('finish', resolve);
      stream.on('error', reject);
      ws.on('error', reject);
    });

    const openai = new OpenAI({ apiKey: openaiKey });
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tmpPath),
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

    const segments = transcription.segments || [];
    return segments.map(seg => ({
      text: seg.text.trim(),
      offset: Math.round(seg.start * 1000),
      duration: Math.round((seg.end - seg.start) * 1000),
    }));
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

// ── Video script prompt ──────────────────────────────────────────────────────

function buildVideoScriptPrompt(meta, transcriptText, ctrResult, userClips, videoDurationSec) {
  const clipInstruction = userClips
    ? `USE THESE EXACT CLIPS — do not change the timestamps:\n` +
      `  Hook clip: ${userClips.hookStart}s – ${userClips.hookEnd}s\n` +
      `  Payoff clip: ${userClips.payoffStart}s – ${userClips.payoffEnd}s\n`
    : `Pick the two best clips from this video:\n` +
      `  1. HOOK CLIP (15-30 seconds): The most attention-grabbing moment that sets up the story.\n` +
      `  2. PAYOFF CLIP (15-45 seconds): The moment that lands the point or reveals the punchline. Must be from a DIFFERENT part of the video than the hook.\n`;

  return `You are writing a Fanone Show script built around TWO clips from a YouTube video.

VIDEO METADATA:
- Title: ${meta.title || 'Unknown'}
- Channel: ${meta.channel || 'Unknown'}
${videoDurationSec ? `- Duration: ${Math.round(videoDurationSec / 60)} minutes` : ''}

CTR LANE FIT SCORE: ${ctrResult.score}/100
Category: ${ctrResult.category}
Matched keywords: ${[...ctrResult.matched.high, ...ctrResult.matched.medium, ...ctrResult.matched.impact].join(', ') || 'none'}
Urgency: ${ctrResult.urgency}

${clipInstruction}

SCRIPT STRUCTURE (follow this exactly):
1. SETUP — Fanone introduces the story, frames why it matters
2. CLIP 1 (HOOK) — 15-30s, most attention-grabbing moment
3. REACTION — Fanone's gut response in his voice
4. CONTEXT — deeper background, who benefits, the receipts
5. CLIP 2 (PAYOFF) — 15-45s, lands the point or reveals the punchline. MUST be from a different part of the video than the hook.
6. CLOSE — takeaway + CTA + strong button line

Respond with JSON ONLY — no markdown, no code fences, no explanation. The JSON must match this exact shape:
{
  "hookClip": { "start": <seconds>, "end": <seconds>, "transcriptSnippet": "..." },
  "payoffClip": { "start": <seconds>, "end": <seconds>, "transcriptSnippet": "..." },
  "script": {
    "setup": "...",
    "hookCue": "<one-line lead-in to clip 1>",
    "reaction": "...",
    "context": "...",
    "payoffCue": "<one-line lead-in to clip 2>",
    "close": "..."
  },
  "estimatedRuntimeSeconds": <number>,
  "notes": "..."
}

FULL TIMESTAMPED TRANSCRIPT:
${transcriptText}`;
}

// ── POST /video-script ───────────────────────────────────────────────────────

router.post('/video-script', async (req, res) => {
  const { youtubeUrl = '', userClips } = req.body || {};
  if (!youtubeUrl.trim()) {
    return res.status(400).json({ error: 'youtubeUrl is required' });
  }

  const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured' });
  }

  // 1. Extract video ID
  const videoId = extractYouTubeId(youtubeUrl);
  if (!videoId) {
    return res.status(400).json({ error: 'Could not extract a YouTube video ID from this URL.' });
  }

  let transcript = null;
  let transcriptSource = 'captions';

  // 2. Fetch transcript (primary: InnerTube captions)
  try {
    transcript = await fetchTranscript(videoId);
  } catch (primaryErr) {
    console.warn(`[video-script] Primary transcript failed for ${videoId}:`, primaryErr.message);

    // 3. Fallback: Whisper
    try {
      transcript = await whisperFallback(videoId);
      transcriptSource = 'whisper';
    } catch (whisperErr) {
      console.error(`[video-script] Whisper fallback also failed for ${videoId}:`, whisperErr.message);
      return res.status(422).json({
        error: 'No transcript available for this video.',
        details: `Captions: ${primaryErr.message} | Whisper: ${whisperErr.message}`,
      });
    }
  }

  if (!transcript || transcript.length === 0) {
    return res.status(422).json({ error: 'Transcript was empty for this video.' });
  }

  try {
    // 4. Fetch video metadata
    const meta = await fetchVideoMeta(videoId);

    // Estimate video duration from last transcript chunk
    const lastChunk = transcript[transcript.length - 1];
    const videoDurationSec = lastChunk ? Math.round((lastChunk.offset + lastChunk.duration) / 1000) : 0;

    // 5. Score transcript against Fanone's lanes
    const fullText = transcript.map(c => c.text).join(' ');
    const ctrResult = scoreTranscriptForFanone(fullText);
    const opportunity = fanoneOpportunityBucket(ctrResult.score);

    // 6. Build prompt
    const transcriptText = buildTranscriptText(transcript);
    const userPrompt = buildVideoScriptPrompt(meta, transcriptText, ctrResult, userClips, videoDurationSec);

    // 7. Call Claude
    const anthropicRes = await httpsRequest(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        timeout: 120000,
      },
      {
        model:      'claude-opus-4-7-20250422',
        max_tokens: 4000,
        system:     MFS_SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: userPrompt }],
      }
    );

    if (anthropicRes.status !== 200) {
      const errBody = anthropicRes.body || {};
      const errMsg = (errBody.error && errBody.error.message) || JSON.stringify(errBody);
      console.error('[video-script] Anthropic error | status:', anthropicRes.status, '| body:', JSON.stringify(errBody));
      return res.status(502).json({ error: `Anthropic API error (${anthropicRes.status}): ${errMsg}` });
    }

    const rawText = ((anthropicRes.body.content || []).find(c => c.type === 'text') || {}).text || '';
    if (!rawText) {
      return res.status(502).json({ error: 'Empty response from Anthropic' });
    }

    // 8. Parse JSON — strip code fences defensively
    let parsed;
    try {
      parsed = parseClaudeJson(rawText);
    } catch (parseErr) {
      console.error('[video-script] JSON parse failed. Raw output:', rawText.slice(0, 500));
      return res.status(500).json({
        error: 'Failed to parse Claude response as JSON',
        rawOutput: rawText,
      });
    }

    // 9. Persist to scripts collection if Script model is available
    let savedId = null;
    try {
      const mongoose = require('mongoose');
      if (mongoose.models.Script) {
        const Script = mongoose.models.Script;
        const scriptTitle = parsed?.script?.setup
          ? parsed.script.setup.slice(0, 120)
          : (meta.title || youtubeUrl);
        const saved = await new Script({
          articleTitle:    meta.title || youtubeUrl,
          articleSource:   meta.channel || 'YouTube',
          generatedScript: JSON.stringify(parsed),
          generatedBy:     req.body.user || '',
          inputType:       'video',
          sourceUrl:       youtubeUrl,
        }).save();
        savedId = saved._id;
      }
    } catch (saveErr) {
      console.error('[video-script] failed to persist script:', saveErr.message);
    }

    // 10. Return result
    res.json({
      videoId,
      meta: { ...meta, durationSeconds: videoDurationSec },
      transcriptSource,
      transcript,
      scoring: {
        score: ctrResult.score,
        matched: ctrResult.matched,
        urgency: ctrResult.urgency,
        category: ctrResult.category,
        opportunity,
      },
      result: parsed,
      scriptId: savedId,
    });

  } catch (err) {
    console.error('[video-script] unexpected error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
