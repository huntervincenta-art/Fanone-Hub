import React, { useState, useRef } from 'react';
import OpportunityDonut from '../components/OpportunityDonut';

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function parseTimeInput(val) {
  if (!val && val !== 0) return NaN;
  const str = String(val).trim();
  // "M:SS" format
  const parts = str.split(':');
  if (parts.length === 2) {
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }
  return parseInt(str, 10);
}

function ClipCard({ label, clip, videoId, accentClass }) {
  if (!clip) return null;
  const embedUrl = `https://www.youtube.com/embed/${videoId}?start=${Math.floor(clip.start)}&end=${Math.ceil(clip.end)}&autoplay=0`;
  return (
    <div className={`vs-clip-card ${accentClass || ''}`}>
      <div className="vs-clip-label">{label}</div>
      <div className="vs-clip-embed">
        <iframe
          src={embedUrl}
          title={label}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <div className="vs-clip-meta">
        <span className="vs-clip-time">{formatTime(clip.start)} – {formatTime(clip.end)}</span>
        <span className="vs-clip-duration">({Math.round(clip.end - clip.start)}s)</span>
      </div>
      {clip.transcriptSnippet && (
        <div className="vs-clip-snippet">"{clip.transcriptSnippet}"</div>
      )}
    </div>
  );
}

function ScriptSection({ title, body, isCue }) {
  return (
    <div className={`vs-script-section${isCue ? ' vs-script-section--cue' : ''}`}>
      <h4 className="vs-script-section-title">{title}</h4>
      <div className="vs-script-section-body">{body}</div>
    </div>
  );
}

function OverrideEditor({ currentClips, transcript, onRegenerate, onCancel, loading }) {
  const [hookStart, setHookStart] = useState(currentClips?.hookClip ? formatTime(currentClips.hookClip.start) : '');
  const [hookEnd, setHookEnd] = useState(currentClips?.hookClip ? formatTime(currentClips.hookClip.end) : '');
  const [payoffStart, setPayoffStart] = useState(currentClips?.payoffClip ? formatTime(currentClips.payoffClip.start) : '');
  const [payoffEnd, setPayoffEnd] = useState(currentClips?.payoffClip ? formatTime(currentClips.payoffClip.end) : '');
  const [setTarget, setSetTarget] = useState(null); // 'hookStart' | 'hookEnd' | 'payoffStart' | 'payoffEnd'
  const transcriptRef = useRef(null);

  const setters = { hookStart: setHookStart, hookEnd: setHookEnd, payoffStart: setPayoffStart, payoffEnd: setPayoffEnd };

  const handleTranscriptClick = (offsetMs) => {
    const sec = Math.floor(offsetMs / 1000);
    const formatted = formatTime(sec);
    if (setTarget && setters[setTarget]) {
      setters[setTarget](formatted);
      setSetTarget(null);
    }
  };

  const handleRegenerate = () => {
    const clips = {
      hookStart: parseTimeInput(hookStart),
      hookEnd: parseTimeInput(hookEnd),
      payoffStart: parseTimeInput(payoffStart),
      payoffEnd: parseTimeInput(payoffEnd),
    };
    if (Object.values(clips).some(v => isNaN(v))) {
      alert('All four timestamps are required. Use M:SS or seconds.');
      return;
    }
    onRegenerate(clips);
  };

  return (
    <div className="vs-override">
      <h3 className="vs-override-title">Override Clip Timestamps</h3>
      <div className="vs-override-inputs">
        <div className="vs-override-group">
          <span className="vs-override-label">Hook</span>
          <div className="vs-override-fields">
            <label>
              Start
              <input value={hookStart} onChange={e => setHookStart(e.target.value)} placeholder="M:SS" />
              <button
                type="button"
                className={`vs-set-btn${setTarget === 'hookStart' ? ' vs-set-btn--active' : ''}`}
                onClick={() => setSetTarget(setTarget === 'hookStart' ? null : 'hookStart')}
                title="Click a transcript line to set this value"
              >Set</button>
            </label>
            <label>
              End
              <input value={hookEnd} onChange={e => setHookEnd(e.target.value)} placeholder="M:SS" />
              <button
                type="button"
                className={`vs-set-btn${setTarget === 'hookEnd' ? ' vs-set-btn--active' : ''}`}
                onClick={() => setSetTarget(setTarget === 'hookEnd' ? null : 'hookEnd')}
                title="Click a transcript line to set this value"
              >Set</button>
            </label>
          </div>
        </div>
        <div className="vs-override-group">
          <span className="vs-override-label">Payoff</span>
          <div className="vs-override-fields">
            <label>
              Start
              <input value={payoffStart} onChange={e => setPayoffStart(e.target.value)} placeholder="M:SS" />
              <button
                type="button"
                className={`vs-set-btn${setTarget === 'payoffStart' ? ' vs-set-btn--active' : ''}`}
                onClick={() => setSetTarget(setTarget === 'payoffStart' ? null : 'payoffStart')}
                title="Click a transcript line to set this value"
              >Set</button>
            </label>
            <label>
              End
              <input value={payoffEnd} onChange={e => setPayoffEnd(e.target.value)} placeholder="M:SS" />
              <button
                type="button"
                className={`vs-set-btn${setTarget === 'payoffEnd' ? ' vs-set-btn--active' : ''}`}
                onClick={() => setSetTarget(setTarget === 'payoffEnd' ? null : 'payoffEnd')}
                title="Click a transcript line to set this value"
              >Set</button>
            </label>
          </div>
        </div>
      </div>

      {setTarget && (
        <div className="vs-override-hint">Click a transcript line below to set <strong>{setTarget.replace(/([A-Z])/g, ' $1').toLowerCase()}</strong></div>
      )}

      <div className="vs-override-transcript" ref={transcriptRef}>
        {(transcript || []).map((chunk, i) => {
          const sec = Math.floor(chunk.offset / 1000);
          return (
            <div
              key={i}
              className={`vs-transcript-line${setTarget ? ' vs-transcript-line--clickable' : ''}`}
              onClick={() => handleTranscriptClick(chunk.offset)}
            >
              <span className="vs-transcript-ts">{formatTime(sec)}</span>
              <span className="vs-transcript-text">{chunk.text}</span>
            </div>
          );
        })}
      </div>

      <div className="vs-override-actions">
        <button className="btn btn-primary" onClick={handleRegenerate} disabled={loading}>
          {loading ? 'Regenerating…' : 'Regenerate Script with These Clips'}
        </button>
        <button className="btn-ghost" onClick={onCancel} disabled={loading}>Cancel</button>
      </div>
    </div>
  );
}

export default function VideoScript({ passphrase }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async (userClips) => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    setLoading(true);
    setError('');
    setOverrideOpen(false);
    try {
      const body = { youtubeUrl: trimmedUrl };
      if (userClips) body.userClips = userClips;
      const res = await fetch('/api/fanone-hub/video-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyScript = async () => {
    if (!data?.result?.script) return;
    const s = data.result.script;
    const text = [
      '## SETUP',
      s.setup,
      '',
      `## HOOK CUE: ${s.hookCue}`,
      `[CLIP 1: ${formatTime(data.result.hookClip?.start || 0)} – ${formatTime(data.result.hookClip?.end || 0)}]`,
      '',
      '## REACTION',
      s.reaction,
      '',
      '## CONTEXT',
      s.context,
      '',
      `## PAYOFF CUE: ${s.payoffCue}`,
      `[CLIP 2: ${formatTime(data.result.payoffClip?.start || 0)} – ${formatTime(data.result.payoffClip?.end || 0)}]`,
      '',
      '## CLOSE',
      s.close,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const scoring = data?.scoring;
  const result = data?.result;
  const meta = data?.meta;

  return (
    <section className="section vs-page">
      <div className="vs-header">
        <h2>Video Script Generator</h2>
      </div>

      <div className="vs-input-row">
        <input
          className="vs-url-input"
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="Paste a YouTube URL…"
          onKeyDown={e => { if (e.key === 'Enter' && !loading) generate(); }}
          disabled={loading}
        />
        <button
          className="btn btn-primary"
          onClick={() => generate()}
          disabled={loading || !url.trim()}
        >
          {loading ? 'Generating…' : 'Generate'}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading && !data && (
        <div className="vs-loading">
          <div className="vs-spinner" />
          <span>Fetching transcript and generating script… this may take a minute.</span>
        </div>
      )}

      {data && result && (
        <div className="vs-results">
          {/* Meta bar */}
          <div className="vs-meta-bar">
            <div className="vs-meta-item">
              <span className="vs-meta-label">Title</span>
              <span className="vs-meta-value">{meta?.title || '—'}</span>
            </div>
            <div className="vs-meta-item">
              <span className="vs-meta-label">Channel</span>
              <span className="vs-meta-value">{meta?.channel || '—'}</span>
            </div>
            <div className="vs-meta-item">
              <span className="vs-meta-label">Length</span>
              <span className="vs-meta-value">{meta?.durationSeconds ? formatTime(meta.durationSeconds) : '—'}</span>
            </div>
            <div className="vs-meta-item">
              <span className="vs-meta-label">Transcript</span>
              <span className="vs-meta-value vs-meta-badge">{data.transcriptSource}</span>
            </div>
          </div>

          {/* Scoring */}
          <div className="vs-scoring-row">
            <OpportunityDonut
              score={scoring?.score}
              color={scoring?.opportunity?.color}
              label={scoring?.opportunity?.label}
            />
            <div className="vs-scoring-detail">
              <div className="vs-scoring-label">{scoring?.opportunity?.label}</div>
              <div className="vs-scoring-urgency">
                <span className={`story-card-category story-card-category--${scoring?.category === 'Law Enforcement' ? 'le' : 'pc'}`}>
                  {scoring?.category || 'Political Commentary'}
                </span>
              </div>
              {scoring?.matched && (
                <div className="vs-scoring-keywords">
                  {[...scoring.matched.high, ...scoring.matched.medium, ...scoring.matched.impact]
                    .slice(0, 8)
                    .map((kw, i) => <span key={i} className="vs-keyword-tag">{kw}</span>)
                  }
                </div>
              )}
            </div>
          </div>

          {/* Clip cards */}
          <div className="vs-clips-row">
            <ClipCard label="Hook Clip" clip={result.hookClip} videoId={data.videoId} accentClass="vs-clip-card--hook" />
            <ClipCard label="Payoff Clip" clip={result.payoffClip} videoId={data.videoId} accentClass="vs-clip-card--payoff" />
          </div>

          <div className="vs-clip-actions">
            <button className="btn-ghost" onClick={() => setOverrideOpen(!overrideOpen)}>
              {overrideOpen ? 'Close Override Editor' : 'Override Clips'}
            </button>
          </div>

          {overrideOpen && (
            <OverrideEditor
              currentClips={result}
              transcript={data.transcript}
              onRegenerate={(clips) => generate(clips)}
              onCancel={() => setOverrideOpen(false)}
              loading={loading}
            />
          )}

          {/* Script sections */}
          <div className="vs-script">
            <div className="vs-script-header">
              <h3>Script</h3>
              <div className="vs-script-actions">
                {result.estimatedRuntimeSeconds && (
                  <span className="vs-runtime">~{Math.round(result.estimatedRuntimeSeconds / 60)} min runtime</span>
                )}
                <button className="btn-ghost" onClick={handleCopyScript}>
                  {copied ? 'Copied!' : 'Copy Full Script'}
                </button>
              </div>
            </div>
            <ScriptSection title="Setup" body={result.script?.setup} />
            <ScriptSection title={`Hook Cue: ${result.script?.hookCue || ''}`} isCue />
            <div className="vs-script-clip-marker">[ PLAY CLIP 1 — {formatTime(result.hookClip?.start || 0)} to {formatTime(result.hookClip?.end || 0)} ]</div>
            <ScriptSection title="Reaction" body={result.script?.reaction} />
            <ScriptSection title="Context" body={result.script?.context} />
            <ScriptSection title={`Payoff Cue: ${result.script?.payoffCue || ''}`} isCue />
            <div className="vs-script-clip-marker">[ PLAY CLIP 2 — {formatTime(result.payoffClip?.start || 0)} to {formatTime(result.payoffClip?.end || 0)} ]</div>
            <ScriptSection title="Close" body={result.script?.close} />
          </div>

          {result.notes && (
            <div className="vs-notes">
              <strong>Notes:</strong> {result.notes}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
