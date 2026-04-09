import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import HelpTooltip from './HelpTooltip';

// ── Approved news outlets ──────────────────────────────────────────────────
// Loose, partial-substring matching against the article's URL AND source name.
// Each outlet has one or more "needles" — if any needle appears anywhere in the
// article's URL or source name (case-insensitive), the article matches.
const APPROVED_OUTLETS = [
  { name: 'TIME',            needles: ['time.com', 'time magazine', 'time'] },
  { name: 'Reuters',         needles: ['reuters'] },
  { name: 'Politico',        needles: ['politico'] },
  { name: 'AP',              needles: ['apnews', 'associated press', 'ap news'] },
  { name: 'NPR',             needles: ['npr.org', 'npr'] },
  { name: 'The Daily Beast', needles: ['thedailybeast', 'daily beast'] },
  { name: 'New York Times',  needles: ['nytimes', 'new york times', 'nyt'] },
  { name: 'Washington Post', needles: ['washingtonpost', 'washington post'] },
];

// Pull a usable source-name string out of whatever shape the API returns.
function extractSourceName(article) {
  if (!article) return '';
  const s = article.source;
  if (!s) return '';
  if (typeof s === 'string') return s;
  if (typeof s === 'object') return s.name || s.title || s.id || '';
  return '';
}

// Build the haystack we search against: URL host + path + source name.
function buildHaystack(article) {
  const parts = [];
  if (article.url) {
    try {
      const u = new URL(article.url);
      parts.push(u.hostname.toLowerCase().replace(/^www\./, ''));
      parts.push(u.pathname.toLowerCase());
    } catch {
      parts.push(String(article.url).toLowerCase());
    }
  }
  const srcName = extractSourceName(article);
  if (srcName) parts.push(String(srcName).toLowerCase());
  return parts.join(' ');
}

function matchOutlet(article) {
  const hay = buildHaystack(article);
  if (!hay) return null;
  for (const outlet of APPROVED_OUTLETS) {
    for (const needle of outlet.needles) {
      if (hay.includes(needle)) return outlet.name;
    }
  }
  return null;
}

// Returns { articles, fallback } — fallback=true means no matches were found
// and we're showing the full result set instead.
function filterApprovedArticles(articles) {
  const list = articles || [];
  const matched = list
    .map(a => {
      const name = matchOutlet(a);
      return name ? { ...a, outlet: name } : null;
    })
    .filter(Boolean);

  if (matched.length > 0) {
    return { articles: matched, fallback: false };
  }
  // Fallback: no approved outlets found — show everything, untagged.
  return { articles: list, fallback: true };
}

function todayISO() {
  const d = new Date().toLocaleDateString('en-CA');
  console.log('[FindStories] todayISO:', d, '| raw UTC:', new Date().toISOString());
  return d;
}

// Returns "just now", "5m ago", "2h ago", etc. — no timezone ambiguity
function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Full local datetime for tooltip
function fullLocalTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function buildComments(article) {
  const parts = [];
  if (article.angle) {
    parts.push(`[AI Angle]\n${article.angle}`);
  }
  if (article.titles && article.titles.length) {
    parts.push(`[Suggested Headlines]\n${article.titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}`);
  }
  return parts.join('\n\n');
}

export default function FindStories({ passphrase, userName }) {
  const navigate = useNavigate();

  // Script generator modal state
  const [scriptModalArticle, setScriptModalArticle] = useState(null);
  const [angleNotes, setAngleNotes] = useState('');
  const [generatingScript, setGeneratingScript] = useState(false);
  const [scriptError, setScriptError] = useState('');

  // Articles state (unchanged)
  const [articles, setArticles] = useState([]);
  const [sourceFallback, setSourceFallback] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionStatus, setActionStatus] = useState({});
  const [window, setWindow] = useState('6h');

  // Videos state
  const [videos, setVideos] = useState([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosError, setVideosError] = useState('');
  const [videoActionStatus, setVideoActionStatus] = useState({});

  // Shared video search query
  const DEFAULT_VIDEO_QUERY = 'Trump';
  const [videoQueryInput, setVideoQueryInput] = useState(DEFAULT_VIDEO_QUERY);
  const [videoQuery, setVideoQuery] = useState(DEFAULT_VIDEO_QUERY);

  // X / Twitter state
  const [tweets, setTweets] = useState([]);
  const [tweetsLoading, setTweetsLoading] = useState(false);
  const [tweetsError, setTweetsError] = useState('');

  // Tab
  const [findTab, setFindTab] = useState('articles');

  // ── Article fetch (unchanged) ────────────────────────
  const fetchArticles = async (win = window) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/find-stories?window=${win}`, {
        headers: { 'x-passphrase': passphrase },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch stories');
      }
      const raw = await res.json();
      const { articles: filtered, fallback } = filterApprovedArticles(raw);
      setArticles(filtered);
      setSourceFallback(fallback);
      setActionStatus({});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Video fetch ──────────────────────────────────────
  const fetchVideos = async (q) => {
    setVideosLoading(true);
    setVideosError('');
    try {
      const url = q ? `/api/find-videos?q=${encodeURIComponent(q)}` : '/api/find-videos';
      const res = await fetch(url, { headers: { 'x-passphrase': passphrase } });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch videos');
      }
      setVideos(await res.json());
      setVideoActionStatus({});
    } catch (err) {
      setVideosError(err.message);
    } finally {
      setVideosLoading(false);
    }
  };

  // ── Twitter / X fetch ────────────────────────────────
  const fetchTweets = async (q) => {
    const query = (q || DEFAULT_VIDEO_QUERY).trim();
    setTweetsLoading(true);
    setTweetsError('');
    try {
      const res = await fetch(`/api/twitter-search?q=${encodeURIComponent(query)}`, {
        headers: { 'x-passphrase': passphrase },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to fetch X posts');
      setTweets(data);
    } catch (err) {
      setTweetsError(err.message);
    } finally {
      setTweetsLoading(false);
    }
  };

  // Fetch all on mount, in parallel
  useEffect(() => {
    fetchArticles();
    fetchVideos(DEFAULT_VIDEO_QUERY);
    fetchTweets(DEFAULT_VIDEO_QUERY);
  }, []);

  // ── Unified video search ────────────────────────────
  const handleVideoSearch = (e) => {
    e?.preventDefault();
    const q = videoQueryInput.trim() || DEFAULT_VIDEO_QUERY;
    setVideoQuery(q);
    fetchVideos(q);
    fetchTweets(q);
  };

  const handleWindowToggle = (win) => {
    setWindow(win);
    fetchArticles(win);
  };

  // ── Article actions (unchanged) ──────────────────────
  const setStatus = (id, status) =>
    setActionStatus(prev => ({ ...prev, [id]: status }));

  const addToAvailable = async (article) => {
    const { id } = article;
    setStatus(id, 'adding');
    try {
      const res = await fetch('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({
          date: todayISO(),
          headline: article.headline,
          link: article.url,
          additionalLinks: '',
          claimed: false,
          host: '',
          user: userName,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      setStatus(id, 'added');
    } catch {
      setStatus(id, 'error');
    }
  };

  const claimIt = async (article) => {
    const { id } = article;
    if (!userName) { setStatus(id, 'no-user'); return; }
    setStatus(id, 'claiming');
    try {
      const res = await fetch('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({
          date: todayISO(),
          headline: article.headline,
          link: article.url,
          additionalLinks: '',
          claimed: true,
          host: userName,
          user: userName,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      setStatus(id, 'claimed');
    } catch {
      setStatus(id, 'error');
    }
  };

  // ── Video actions ────────────────────────────────────
  const setVideoStatus = (id, status) =>
    setVideoActionStatus(prev => ({ ...prev, [id]: status }));

  const addVideoToAvailable = async (video) => {
    setVideoStatus(video.id, 'adding');
    try {
      const res = await fetch('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({
          date: todayISO(),
          headline: video.title,
          link: video.url,
          additionalLinks: '',
          claimed: false,
          host: '',
          user: userName,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      setVideoStatus(video.id, 'added');
    } catch {
      setVideoStatus(video.id, 'error');
    }
  };

  const claimVideo = async (video) => {
    if (!userName) { setVideoStatus(video.id, 'no-user'); return; }
    setVideoStatus(video.id, 'claiming');
    try {
      const res = await fetch('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({
          date: todayISO(),
          headline: video.title,
          link: video.url,
          additionalLinks: '',
          claimed: true,
          host: userName,
          user: userName,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      setVideoStatus(video.id, 'claimed');
    } catch {
      setVideoStatus(video.id, 'error');
    }
  };

  // ── Script generator ────────────────────────────────
  const openScriptModal = (article) => {
    setScriptModalArticle(article);
    setAngleNotes('');
    setScriptError('');
  };
  const closeScriptModal = () => {
    if (generatingScript) return;
    setScriptModalArticle(null);
    setAngleNotes('');
    setScriptError('');
  };
  const handleGenerateScript = async () => {
    if (!scriptModalArticle) return;
    setGeneratingScript(true);
    setScriptError('');
    try {
      const res = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({
          articleText: scriptModalArticle.summary || scriptModalArticle.angle || scriptModalArticle.headline || '',
          articleTitle: scriptModalArticle.headline || '',
          articleSource: scriptModalArticle.outlet || scriptModalArticle.source || '',
          angleNotes: angleNotes.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to generate script');
      navigate('/script-result', {
        state: {
          script: data.script,
          articleTitle: scriptModalArticle.headline || '',
          articleSource: scriptModalArticle.outlet || scriptModalArticle.source || '',
        },
      });
    } catch (err) {
      setScriptError(err.message);
    } finally {
      setGeneratingScript(false);
    }
  };

  return (
    <div className="find-stories">
      <div className="find-stories-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="find-stories-title">Find Stories</span>
          <HelpTooltip text="Searches Google News RSS for the latest breaking political stories. Results update every 5 minutes automatically. Tap a headline to open the article. Use the AI angle and title buttons to generate content suggestions for each story." />
        </div>
        <div className="find-stories-controls">
          {findTab === 'articles' && (
            <div className="find-stories-window-toggle">
              <button
                className={`find-stories-window-btn${window === '6h' ? ' find-stories-window-btn--active' : ''}`}
                onClick={() => handleWindowToggle('6h')}
                disabled={loading}
                type="button"
              >
                Last 6h
              </button>
              <button
                className={`find-stories-window-btn${window === '24h' ? ' find-stories-window-btn--active' : ''}`}
                onClick={() => handleWindowToggle('24h')}
                disabled={loading}
                type="button"
              >
                Last 24h
              </button>
            </div>
          )}
          {findTab === 'articles' && (
            <button className="btn-ghost" onClick={() => fetchArticles()} disabled={loading}>
              {loading ? 'Fetching…' : 'Refresh'}
            </button>
          )}
          {findTab === 'videos' && (
            <button
              className="btn-ghost"
              onClick={() => { fetchVideos(videoQuery); fetchTweets(videoQuery); }}
              disabled={videosLoading || tweetsLoading}
            >
              {(videosLoading || tweetsLoading) ? 'Fetching…' : 'Refresh'}
            </button>
          )}
        </div>
      </div>

      {/* Articles / Videos tab bar */}
      <div className="find-tab-bar">
        <button
          className={`find-tab-btn${findTab === 'articles' ? ' find-tab-btn--active' : ''}`}
          onClick={() => setFindTab('articles')}
          type="button"
        >
          Articles
          {articles.length > 0 && <span className="find-tab-count">{articles.length}</span>}
        </button>
        <button
          className={`find-tab-btn${findTab === 'videos' ? ' find-tab-btn--active' : ''}`}
          onClick={() => setFindTab('videos')}
          type="button"
        >
          Videos
          {videos.length > 0 && <span className="find-tab-count">{videos.length}</span>}
        </button>
      </div>

      {/* ── Articles tab (completely unchanged rendering) ── */}
      {findTab === 'articles' && (
        <>
          {loading && <div className="find-stories-loading-bar" />}
          {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}
          {sourceFallback && articles.length > 0 && (
            <div className="source-fallback-notice">
              No results from preferred sources — showing all results.
            </div>
          )}

          {loading && articles.length === 0 ? (
            <div className="find-stories-empty">Fetching latest political news and generating angles…</div>
          ) : articles.length === 0 && !loading ? (
            <div className="find-stories-empty">No articles from approved outlets found. Try refreshing or switching to Last 24h.</div>
          ) : (
            <div className="article-grid">
              {articles.map(article => {
                const status = actionStatus[article.id];
                const done = status === 'added' || status === 'claimed';
                return (
                  <div className={`article-card${done ? ' article-card--done' : ''}`} key={article.id}>
                    <div className="article-card-meta">
                      {(article.outlet || article.source) && (
                        <span className="article-source article-outlet-badge">
                          {article.outlet || article.source}
                        </span>
                      )}
                      {article.publishedAt && (
                        <span
                          className="article-time"
                          title={fullLocalTime(article.publishedAt)}
                        >
                          {relativeTime(article.publishedAt)}
                        </span>
                      )}
                    </div>

                    {article.publishedAt && (
                      <div className="article-publish-time">
                        Published {fullLocalTime(article.publishedAt)}
                      </div>
                    )}

                    <a
                      className="article-headline"
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {article.headline}
                    </a>

                    {article.angle && (
                      <div className="article-angle">
                        <span className="article-section-label">Angle</span>
                        <p>{article.angle}</p>
                      </div>
                    )}

                    {article.titles && article.titles.length > 0 && (
                      <div className="article-titles">
                        <span className="article-section-label">Suggested Headlines</span>
                        <ol>
                          {article.titles.map((t, i) => <li key={i}>{t}</li>)}
                        </ol>
                      </div>
                    )}

                    <div className="article-actions">
                      <button
                        className="article-btn article-btn--available"
                        onClick={() => addToAvailable(article)}
                        disabled={!!status}
                      >
                        {status === 'adding' ? 'Adding…' : status === 'added' ? 'Added!' : 'Add to Available'}
                      </button>
                      <button
                        className="article-btn article-btn--claim"
                        onClick={() => claimIt(article)}
                        disabled={!!status}
                      >
                        {status === 'claiming' ? 'Claiming…' : status === 'claimed' ? 'Claimed!' : 'Claim It'}
                      </button>
                      <button
                        className="article-btn article-btn--script"
                        onClick={() => openScriptModal(article)}
                        type="button"
                      >
                        Generate Script
                      </button>
                    </div>

                    {status === 'error' && (
                      <div className="alert alert-error" style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
                        Action failed. Try again.
                      </div>
                    )}
                    {status === 'no-user' && (
                      <div className="alert alert-error" style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
                        No user session found. Please log back in.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Videos tab ── */}
      {findTab === 'videos' && (
        <>
          {/* Shared video search */}
          <form className="video-search-form" onSubmit={handleVideoSearch}>
            <input
              className="video-search-input"
              type="text"
              value={videoQueryInput}
              onChange={e => setVideoQueryInput(e.target.value)}
              placeholder="Search YouTube + X for videos…"
            />
            <button
              className="video-search-btn"
              type="submit"
              disabled={videosLoading || tweetsLoading}
            >
              Search
            </button>
          </form>

          {/* ── YouTube section ── */}
          <div className="video-section-header">
            <span className="video-section-badge video-section-badge--yt">▶ YouTube</span>
            {videos.length > 0 && <span className="video-section-count">{videos.length}</span>}
          </div>

          {videosLoading && <div className="find-stories-loading-bar" />}
          {videosError && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{videosError}</div>}

          {videosLoading && videos.length === 0 ? (
            <div className="find-stories-empty">Fetching YouTube videos…</div>
          ) : videos.length === 0 && !videosLoading ? (
            <div className="find-stories-empty">No YouTube videos found. Try a different search.</div>
          ) : (
            <div className="video-grid">
              {videos.map(video => {
                const status = videoActionStatus[video.id];
                const done = status === 'added' || status === 'claimed';
                return (
                  <div className={`video-card${done ? ' video-card--done' : ''}`} key={video.id}>
                    {video.thumbnail && (
                      <a href={video.url} target="_blank" rel="noopener noreferrer" className="video-thumbnail-link">
                        <img className="video-thumbnail" src={video.thumbnail} alt="" loading="lazy" />
                        <span className="video-play-icon" aria-hidden="true">▶</span>
                      </a>
                    )}
                    <div className="video-body">
                      <div className="video-meta">
                        {video.channel && <span className="video-channel">{video.channel}</span>}
                        {video.publishedAt && (
                          <span className="video-time" title={fullLocalTime(video.publishedAt)}>
                            {relativeTime(video.publishedAt)}
                          </span>
                        )}
                      </div>
                      <a className="video-title" href={video.url} target="_blank" rel="noopener noreferrer">
                        {video.title}
                      </a>
                      <div className="article-actions">
                        <button className="article-btn article-btn--available" onClick={() => addVideoToAvailable(video)} disabled={!!status}>
                          {status === 'adding' ? 'Adding…' : status === 'added' ? 'Added!' : 'Add to Available'}
                        </button>
                        <button className="article-btn article-btn--claim" onClick={() => claimVideo(video)} disabled={!!status}>
                          {status === 'claiming' ? 'Claiming…' : status === 'claimed' ? 'Claimed!' : 'Claim It'}
                        </button>
                      </div>
                      {status === 'error' && <div className="alert alert-error" style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>Action failed. Try again.</div>}
                      {status === 'no-user' && <div className="alert alert-error" style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>No user session found.</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── X / Twitter section ── */}
          <div className="video-section-header" style={{ marginTop: '1.75rem' }}>
            <span className="video-section-badge video-section-badge--x">𝕏 X / Twitter</span>
            {tweets.length > 0 && <span className="video-section-count">{tweets.length}</span>}
          </div>

          {tweetsLoading && <div className="find-stories-loading-bar" />}
          {tweetsError && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{tweetsError}</div>}

          {tweetsLoading && tweets.length === 0 ? (
            <div className="find-stories-empty">Searching X for video posts…</div>
          ) : tweets.length === 0 && !tweetsLoading ? (
            <div className="find-stories-empty">No X video posts found for this search.</div>
          ) : (
            <div className="x-tweet-grid">
              {tweets.map(tweet => (
                <div className="x-tweet-card" key={tweet.id}>
                  <div className="x-tweet-header">
                    <span className="x-tweet-handle">@{tweet.handle}</span>
                    {tweet.createdAt && (
                      <span className="x-tweet-time" title={fullLocalTime(tweet.createdAt)}>
                        {relativeTime(tweet.createdAt)}
                      </span>
                    )}
                  </div>
                  <p className="x-tweet-text">{tweet.text || '(no text)'}</p>
                  <div className="x-tweet-footer">
                    {tweet.views != null && (
                      <span className="x-tweet-views">{tweet.views.toLocaleString()} views</span>
                    )}
                    <a
                      className="x-tweet-link-btn"
                      href={tweet.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open on X ↗
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Script generator modal ── */}
      {scriptModalArticle && (
        <div
          className="modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) closeScriptModal(); }}
        >
          <div className="modal-panel script-modal">
            <div className="modal-header">
              <span className="modal-title">Generate MFS Script</span>
              <button className="modal-close" onClick={closeScriptModal} disabled={generatingScript}>✕</button>
            </div>
            <div className="modal-body">
              <div className="script-modal-article">
                <div className="script-modal-label">Story</div>
                <div className="script-modal-headline">{scriptModalArticle.headline}</div>
                {(scriptModalArticle.outlet || scriptModalArticle.source) && (
                  <div className="script-modal-source">
                    {scriptModalArticle.outlet || scriptModalArticle.source}
                  </div>
                )}
              </div>
              <label className="script-modal-field-label" htmlFor="angle-notes">Angle Notes (optional)</label>
              <textarea
                id="angle-notes"
                className="script-modal-textarea"
                rows={4}
                value={angleNotes}
                onChange={e => setAngleNotes(e.target.value)}
                placeholder="e.g. Focus on the law enforcement hypocrisy angle..."
                disabled={generatingScript}
              />
              {scriptError && (
                <div className="alert alert-error" style={{ marginTop: '0.75rem' }}>{scriptError}</div>
              )}
              <div className="script-modal-actions">
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={closeScriptModal}
                  disabled={generatingScript}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={handleGenerateScript}
                  disabled={generatingScript}
                >
                  {generatingScript ? (
                    <>
                      <span className="script-spinner" aria-hidden="true" />
                      Generating…
                    </>
                  ) : 'Generate'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
