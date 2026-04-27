import React, { useState, useEffect, useCallback, useMemo } from 'react';
import OpportunityDonut from '../components/OpportunityDonut';

// ── Helpers ──────────────────────────────────────────────────────────────────

function detectInputType(text) {
  if (!text || !text.trim()) return null;
  const t = text.trim();
  // YouTube URL patterns
  if (/^(https?:\/\/)?(www\.)?(youtube\.com\/(watch|shorts|embed|live|v)|youtu\.be\/|m\.youtube\.com)/i.test(t)) return 'video';
  if (/^[A-Za-z0-9_-]{11}$/.test(t)) return 'video';
  // Other URL
  if (/^https?:\/\//i.test(t)) return 'article';
  // Plain text topic
  return 'topic';
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatRelative(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms)) return '';
  if (ms < 60000) return 'just now';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function parseScript(raw) {
  if (!raw) return [];
  const lines = raw.split('\n');
  const sections = [];
  let current = null;
  for (const line of lines) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m) {
      if (current) sections.push(current);
      current = { title: m[1].trim(), body: '' };
    } else if (current) {
      current.body += (current.body ? '\n' : '') + line;
    }
  }
  if (current) sections.push(current);
  return sections.map(s => ({ ...s, body: s.body.trim() }));
}

const INPUT_LABELS = { video: 'YouTube Video', article: 'Article URL', topic: 'Topic' };

// ── Section 1: Smart Input Bar ───────────────────────────────────────────────

function SmartInput({ onGenerate, loading }) {
  const [text, setText] = useState('');
  const detected = detectInputType(text);

  return (
    <div className="tp-input-section">
      <div className="tp-input-row">
        <input
          className="tp-input"
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Paste a YouTube URL, article URL, or type a topic…"
          onKeyDown={e => { if (e.key === 'Enter' && !loading && detected) onGenerate(text.trim(), detected); }}
          disabled={loading}
        />
        <button
          className="btn btn-primary"
          onClick={() => onGenerate(text.trim(), detected)}
          disabled={loading || !detected}
        >
          {loading ? 'Generating…' : 'Generate'}
        </button>
      </div>
      {text.trim() && detected && (
        <div className="tp-detect-badge">
          Detected: <strong>{INPUT_LABELS[detected]}</strong>
        </div>
      )}
    </div>
  );
}

// ── Script Result Display ────────────────────────────────────────────────────

function ScriptDisplay({ script, inputType, onClose }) {
  const [copied, setCopied] = useState(false);

  // For video scripts, the generatedScript is JSON
  let displayText = script;
  if (inputType === 'video' && typeof script === 'string') {
    try {
      const parsed = JSON.parse(script);
      const s = parsed.script || {};
      displayText = [
        '## SETUP', s.setup || '',
        '', `## HOOK CUE: ${s.hookCue || ''}`,
        '', '## REACTION', s.reaction || '',
        '', '## CONTEXT', s.context || '',
        '', `## PAYOFF CUE: ${s.payoffCue || ''}`,
        '', '## CLOSE', s.close || '',
      ].join('\n');
    } catch { /* not JSON, render as-is */ }
  }

  const sections = parseScript(displayText);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="tp-script-display">
      <div className="tp-script-header">
        <h3>Generated Script</h3>
        <div className="tp-script-actions">
          <button className="btn-ghost" onClick={handleCopy}>{copied ? 'Copied!' : 'Copy Script'}</button>
          {onClose && <button className="btn-ghost" onClick={onClose}>Close</button>}
        </div>
      </div>
      {sections.length > 0 ? (
        <div className="tp-script-sections">
          {sections.map((s, i) => (
            <div className="tp-script-section" key={i}>
              <h4 className="tp-script-section-title">{s.title}</h4>
              <pre className="tp-script-section-body">{s.body}</pre>
            </div>
          ))}
        </div>
      ) : (
        <pre className="tp-script-raw">{displayText}</pre>
      )}
    </div>
  );
}

// ── Section 2: Story List ────────────────────────────────────────────────────

const TP_STORIES_COLLAPSED_KEY = 'tp_stories_collapsed';

function StoryList({ passphrase, userName, onGenerateFromStory }) {
  const [stories, setStories] = useState([]);
  const [prevBatch, setPrevBatch] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [catFilter, setCatFilter] = useState('All');
  const [generatingId, setGeneratingId] = useState(null);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(TP_STORIES_COLLAPSED_KEY) === '1'; } catch { return false; }
  });

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem(TP_STORIES_COLLAPSED_KEY, next ? '1' : '0'); } catch {}
      return next;
    });
  };

  const fetchStories = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/find-stories?window=24h', {
        headers: { 'x-passphrase': passphrase },
      });
      if (!res.ok) throw new Error('Failed to load stories');
      const data = await res.json();
      // Keep current batch as previous before replacing
      if (stories.length > 0) setPrevBatch(stories);
      setStories(data);
      setPage(1);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [passphrase]);

  useEffect(() => { fetchStories(); }, [fetchStories]);

  const filtered = catFilter === 'All' ? stories : stories.filter(s => s.category === catFilter);
  const pageSize = 20;
  const pageStories = filtered.slice(0, page * pageSize);
  const hasMore = pageStories.length < filtered.length;

  const handleGenerate = async (story) => {
    setGeneratingId(story.id);
    onGenerateFromStory(story);
  };

  return (
    <div className="tp-stories-section">
      <div className="tp-stories-header" onClick={toggleCollapsed} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggleCollapsed(); }}>
        <h3>
          <span className="tp-stories-chevron">{collapsed ? '▸' : '▾'}</span>
          Suggested Stories {!collapsed && `(${filtered.length})`}
        </h3>
        {!collapsed && (
          <div className="tp-stories-controls" onClick={e => e.stopPropagation()}>
            <div className="urgency-filter-bar">
              {['All', 'Law Enforcement', 'Political Commentary'].map(f => (
                <button
                  key={f}
                  className={`urgency-filter-btn${catFilter === f ? ' urgency-filter-btn--active' : ''}`}
                  onClick={() => { setCatFilter(f); setPage(1); }}
                  type="button"
                >
                  {f === 'Law Enforcement' ? 'LE' : f === 'Political Commentary' ? 'PC' : f}
                  {f !== 'All' && <span style={{ marginLeft: 4, opacity: 0.7 }}>({stories.filter(s => s.category === f).length})</span>}
                </button>
              ))}
            </div>
            <button className="btn-ghost" onClick={fetchStories} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        )}
      </div>

      {!collapsed && (
        <>
          {error && <div className="alert alert-error">{error}</div>}

          {prevBatch && (
            <button className="btn-ghost tp-prev-batch-btn" onClick={() => { setStories(prevBatch); setPrevBatch(null); setPage(1); }}>
              Show previous batch ({prevBatch.length} stories)
            </button>
          )}

          {loading && stories.length === 0 ? (
            <div className="tp-empty">Loading stories…</div>
          ) : stories.length === 0 ? (
            <div className="tp-empty">No stories found. Try refreshing.</div>
          ) : (
            <>
              <div className="tp-story-grid">
                {pageStories.map(story => (
              <div className="tp-story-card" key={story.id}>
                <div className="tp-story-card-top">
                  {story.category && (
                    <span
                      className={`story-card-category story-card-category--${story.category === 'Law Enforcement' ? 'le' : 'pc'}`}
                      title={story.category === 'Law Enforcement' ? 'Law Enforcement — police, courts, DOJ, FBI, crime, civil rights' : 'Political Commentary — politics, elections, policy, Congress, White House'}
                    >
                      {story.category === 'Law Enforcement' ? 'LE' : 'PC'}
                    </span>
                  )}
                  {(story.outlet || story.source) && (
                    <span className="article-outlet-badge" style={{ fontSize: '0.65rem' }} title={`Source: ${story.outlet || story.source}`}>
                      {story.outlet || story.source}
                    </span>
                  )}
                  {story.isInternational && (
                    <span className="article-international-badge" title="International publisher (not US-based)">INTL</span>
                  )}
                  {story.publishedAt && (
                    <span className="tp-story-time">{formatRelative(story.publishedAt)}</span>
                  )}
                </div>
                <a className="tp-story-headline" href={story.url} target="_blank" rel="noopener noreferrer">
                  {story.headline}
                </a>
                {story.angle && <div className="tp-story-angle">{story.angle}</div>}
                <button
                  className="btn btn-primary tp-story-gen-btn"
                  onClick={() => handleGenerate(story)}
                  disabled={generatingId === story.id}
                  type="button"
                >
                  {generatingId === story.id ? 'Generating…' : 'Generate Script'}
                </button>
              </div>
            ))}
          </div>
          {hasMore ? (
            <button className="btn-ghost tp-load-more" onClick={() => setPage(p => p + 1)}>
              Load More ({filtered.length - pageStories.length} remaining)
            </button>
          ) : filtered.length > pageSize && (
            <div className="tp-all-loaded">All {filtered.length} stories shown</div>
          )}
        </>
      )}
        </>
      )}
    </div>
  );
}

// ── Section 3: History Log ───────────────────────────────────────────────────

function HistoryLog({ passphrase }) {
  const [scripts, setScripts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedScript, setExpandedScript] = useState(null);

  const fetchScripts = useCallback(async (p = 1) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/scripts?page=${p}&limit=20`, {
        headers: { 'x-passphrase': passphrase },
      });
      if (!res.ok) throw new Error('Failed to load scripts');
      const data = await res.json();
      setScripts(data.scripts || []);
      setTotalPages(data.pages || 1);
      setPage(data.page || 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [passphrase]);

  useEffect(() => { fetchScripts(); }, [fetchScripts]);

  const handleExpand = async (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedScript(null);
      return;
    }
    setExpandedId(id);
    // Script body is already in the list data
    const found = scripts.find(s => s.id === id);
    if (found) setExpandedScript(found);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this script? This cannot be undone.')) return;
    try {
      await fetch(`/api/scripts/${id}`, {
        method: 'DELETE',
        headers: { 'x-passphrase': passphrase },
      });
      setScripts(prev => prev.filter(s => s.id !== id));
      if (expandedId === id) { setExpandedId(null); setExpandedScript(null); }
    } catch {}
  };

  const typeLabels = { article: 'Article', video: 'Video', topic: 'Topic', url: 'URL' };

  return (
    <div className="tp-history-section">
      <div className="tp-history-header">
        <h3>Script History</h3>
        <button className="btn-ghost" onClick={() => fetchScripts(1)} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {scripts.length === 0 && !loading ? (
        <div className="tp-empty">No scripts generated yet.</div>
      ) : (
        <div className="tp-history-list">
          {scripts.map(s => (
            <div key={s.id} className={`tp-history-row${expandedId === s.id ? ' tp-history-row--expanded' : ''}`}>
              <div className="tp-history-row-summary" onClick={() => handleExpand(s.id)}>
                <span className="tp-history-chevron">{expandedId === s.id ? '▾' : '▸'}</span>
                <span className="tp-history-title">{s.articleTitle || '(Untitled)'}</span>
                <span className="tp-history-type">{typeLabels[s.inputType] || 'Article'}</span>
                <span className="tp-history-user">{s.generatedBy || '—'}</span>
                <span className="tp-history-date">{formatDate(s.createdAt)}</span>
              </div>
              {expandedId === s.id && expandedScript && (
                <div className="tp-history-detail">
                  <div className="tp-history-detail-actions">
                    <button className="btn-ghost tp-history-delete" onClick={() => handleDelete(s.id)}>Delete</button>
                  </div>
                  <ScriptDisplay
                    script={expandedScript.generatedScript}
                    inputType={expandedScript.inputType}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="tp-history-pagination">
          <button className="btn-ghost" onClick={() => fetchScripts(page - 1)} disabled={page <= 1 || loading}>Prev</button>
          <span className="tp-history-page">Page {page} of {totalPages}</span>
          <button className="btn-ghost" onClick={() => fetchScripts(page + 1)} disabled={page >= totalPages || loading}>Next</button>
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function TopicPulse({ passphrase, userName }) {
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [genResult, setGenResult] = useState(null);
  const [genInputType, setGenInputType] = useState(null);
  const [historyKey, setHistoryKey] = useState(0);

  const handleGenerate = async (input, inputType) => {
    setGenerating(true);
    setGenError('');
    setGenResult(null);
    setGenInputType(inputType);

    try {
      let res;
      if (inputType === 'video') {
        res = await fetch('/api/fanone-hub/video-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
          body: JSON.stringify({ youtubeUrl: input, user: userName }),
        });
      } else if (inputType === 'article') {
        res = await fetch('/api/fanone/generate-script-from-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
          body: JSON.stringify({ url: input, user: userName }),
        });
      } else {
        res = await fetch('/api/fanone-hub/topic-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
          body: JSON.stringify({ topic: input, user: userName }),
        });
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);

      // Normalize: video route returns result.script, others return script
      if (inputType === 'video') {
        setGenResult(JSON.stringify(data.result));
      } else {
        setGenResult(data.script);
      }
      // Refresh history log
      setHistoryKey(k => k + 1);
    } catch (err) {
      setGenError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateFromStory = async (story) => {
    setGenerating(true);
    setGenError('');
    setGenResult(null);
    setGenInputType('article');

    try {
      const res = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({
          articleText: story.angle || story.headline || '',
          articleTitle: story.headline || '',
          articleSource: story.outlet || story.source || '',
          user: userName,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to generate script');
      setGenResult(data.script);
      setHistoryKey(k => k + 1);
    } catch (err) {
      setGenError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section className="section tp-page">
      <div className="tp-page-header">
        <h2>Topic Pulse</h2>
      </div>

      {/* Section 1: Smart Input */}
      <SmartInput onGenerate={handleGenerate} loading={generating} />

      {/* Generated result */}
      {genError && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{genError}</div>}
      {generating && (
        <div className="tp-generating">
          <div className="tp-spinner" />
          <span>Generating script… this may take a minute.</span>
        </div>
      )}
      {genResult && (
        <ScriptDisplay
          script={genResult}
          inputType={genInputType}
          onClose={() => setGenResult(null)}
        />
      )}

      {/* Section 2: Story List */}
      <StoryList passphrase={passphrase} userName={userName} onGenerateFromStory={handleGenerateFromStory} />

      {/* Section 3: History Log */}
      <HistoryLog key={historyKey} passphrase={passphrase} />
    </section>
  );
}
