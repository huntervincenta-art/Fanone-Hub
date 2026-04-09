import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import TitleTool from '../components/TitleTool';
import TopicPulse from './TopicPulse';

// Approved-source matchers — kept in sync with FindStories.jsx
const APPROVED_OUTLETS = [
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
];

function matchOutlet(article) {
  const parts = [];
  if (article.url) {
    try {
      const u = new URL(article.url);
      parts.push(u.hostname.toLowerCase().replace(/^www\./, ''));
      parts.push(u.pathname.toLowerCase());
    } catch {}
  }
  const src = typeof article.source === 'string'
    ? article.source
    : (article.source && (article.source.name || article.source.title)) || '';
  if (src) parts.push(String(src).toLowerCase());
  const hay = parts.join(' ');
  if (!hay) return null;
  for (const outlet of APPROVED_OUTLETS) {
    for (const needle of outlet.needles) {
      if (hay.includes(needle)) return outlet.name;
    }
  }
  return null;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatCount(n) {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000)         return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function formatRelative(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms)) return '';
  if (ms < 60_000) return 'just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function ChannelStatsCard({ passphrase }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/youtube-stats', {
        headers: { 'x-passphrase': passphrase },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load channel stats');
      setStats(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [passphrase]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return (
    <section className="channel-stats-card">
      <div className="channel-stats-thumb">
        {stats && stats.thumbnail ? (
          <img src={stats.thumbnail} alt={stats.channelName} />
        ) : (
          <div className="channel-stats-thumb-placeholder" aria-hidden="true">MFS</div>
        )}
      </div>
      <div className="channel-stats-body">
        <div className="channel-stats-name">
          {stats?.channelName || 'The Michael Fanone Show'}
        </div>
        {error ? (
          <div className="channel-stats-error">{error}</div>
        ) : (
          <div className="channel-stats-row">
            <div className="channel-stats-metric channel-stats-metric--primary">
              <span className="channel-stats-value">
                {stats && !stats.hiddenSubscriberCount ? formatCount(stats.subscriberCount) : '—'}
              </span>
              <span className="channel-stats-label">subscribers</span>
            </div>
            <div className="channel-stats-metric">
              <span className="channel-stats-value">{stats ? formatCount(stats.viewCount) : '—'}</span>
              <span className="channel-stats-label">views</span>
            </div>
            <div className="channel-stats-metric">
              <span className="channel-stats-value">{stats ? formatCount(stats.videoCount) : '—'}</span>
              <span className="channel-stats-label">videos</span>
            </div>
          </div>
        )}
      </div>
      <div className="channel-stats-meta">
        {loading && <span className="channel-stats-loading">Loading…</span>}
        {!loading && stats && (
          <span className="channel-stats-updated">
            Updated {formatRelative(stats.fetchedAt)}
          </span>
        )}
        <button
          type="button"
          className="channel-stats-refresh"
          onClick={fetchStats}
          disabled={loading}
          aria-label="Refresh channel stats"
        >
          ↻
        </button>
      </div>
    </section>
  );
}

function RecommendedStoryCard({ passphrase, userName }) {
  const navigate = useNavigate();
  const [story, setStory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');

  const fetchTopStory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/find-stories?window=24h', {
        headers: { 'x-passphrase': passphrase },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load stories');
      }
      const articles = await res.json();
      // Prefer approved sources; fall back to first article overall.
      let pick = null;
      for (const a of articles || []) {
        const outlet = matchOutlet(a);
        if (outlet) { pick = { ...a, outlet }; break; }
      }
      if (!pick && articles && articles.length > 0) {
        pick = { ...articles[0], outlet: null };
      }
      setStory(pick || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [passphrase]);

  useEffect(() => {
    fetchTopStory();
  }, [fetchTopStory]);

  const handleGenerateScript = async () => {
    if (!story) return;
    setGenerating(true);
    setGenerateError('');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    try {
      const res = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({
          articleText: story.angle || story.summary || story.headline || '',
          articleTitle: story.headline || '',
          articleSource: story.outlet || story.source || '',
          angleNotes: '',
          user: userName,
        }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to generate script');
      navigate('/script-result', {
        state: {
          script: data.script,
          articleTitle: story.headline || '',
          articleSource: story.outlet || story.source || '',
        },
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        setGenerateError('Script generation timed out after 2 minutes. Try again.');
      } else {
        setGenerateError(err.message);
      }
    } finally {
      clearTimeout(timeoutId);
      setGenerating(false);
    }
  };

  return (
    <div className="dash-card dash-card--recommended">
      <div className="dash-card-head">
        <span className="dash-card-label">Recommended Story</span>
        <button
          type="button"
          className="dash-icon-btn"
          onClick={fetchTopStory}
          disabled={loading}
          title="Refresh"
          aria-label="Refresh recommended story"
        >↻</button>
      </div>

      {loading && !story && (
        <div className="dash-empty">Finding the top story…</div>
      )}
      {error && !loading && (
        <div className="alert alert-error">{error}</div>
      )}
      {!loading && !error && !story && (
        <div className="dash-empty">No stories available right now.</div>
      )}

      {story && (
        <>
          <div className="recommended-meta">
            {story.outlet && <span className="recommended-outlet">{story.outlet}</span>}
            {!story.outlet && story.source && <span className="recommended-outlet recommended-outlet--off">{story.source}</span>}
            {story.publishedAt && (
              <span className="recommended-date">{formatDate(story.publishedAt)}</span>
            )}
          </div>
          {story.url ? (
            <a
              className="recommended-headline"
              href={story.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {story.headline}
            </a>
          ) : (
            <div className="recommended-headline">{story.headline}</div>
          )}
          {story.angle && (
            <div className="recommended-angle">
              <span className="recommended-angle-label">Angle</span>
              <p>{story.angle}</p>
            </div>
          )}
          {generateError && <div className="alert alert-error" style={{ marginTop: '0.5rem' }}>{generateError}</div>}
          <button
            type="button"
            className="btn btn-primary recommended-cta"
            onClick={handleGenerateScript}
            disabled={generating}
          >
            {generating ? 'Generating script…' : 'Generate Full Script'}
          </button>
        </>
      )}
    </div>
  );
}

function RecentScriptsCompact({ passphrase }) {
  const [scripts, setScripts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchScripts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/scripts', {
        headers: { 'x-passphrase': passphrase },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load scripts');
      }
      const all = await res.json();
      setScripts(all.slice(0, 5));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [passphrase]);

  useEffect(() => {
    fetchScripts();
  }, [fetchScripts]);

  return (
    <div className="dash-card dash-card--recent-scripts">
      <div className="dash-card-head">
        <span className="dash-card-label">Recent Scripts</span>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {loading && scripts.length === 0 ? (
        <div className="dash-empty">Loading…</div>
      ) : scripts.length === 0 ? (
        <div className="dash-empty">No scripts yet.</div>
      ) : (
        <ul className="recent-scripts-list">
          {scripts.map(s => (
            <li key={s.id} className="recent-scripts-item">
              <Link to="/scripts" className="recent-scripts-link">
                <div className="recent-scripts-title">{s.articleTitle || '(Untitled)'}</div>
                <div className="recent-scripts-meta">
                  <span>{formatDate(s.createdAt)}</span>
                  {s.generatedBy && <span> · {s.generatedBy}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="dash-card-footer">
        <Link to="/scripts" className="dashboard-link-muted">View all →</Link>
      </div>
    </div>
  );
}

export default function Dashboard({ passphrase, userName }) {
  return (
    <div className="dashboard">
      {/* Row 1 — channel stats strip */}
      <ChannelStatsCard passphrase={passphrase} />

      {/* Row 2 — Title Generator (60) + Recommended Story (40) */}
      <div className="dashboard-grid">
        <div className="dash-card dash-card--title">
          <div className="dash-card-head">
            <span className="dash-card-label">Title Generator</span>
          </div>
          <TitleTool passphrase={passphrase} userName={userName} />
        </div>
        <RecommendedStoryCard passphrase={passphrase} userName={userName} />
      </div>

      {/* Row 3 — Topic Pulse (60) + Recent Scripts (40) */}
      <div className="dashboard-grid">
        <div className="dash-card dash-card--pulse">
          <div className="dash-card-head">
            <span className="dash-card-label">Topic Pulse</span>
          </div>
          <TopicPulse passphrase={passphrase} />
        </div>
        <RecentScriptsCompact passphrase={passphrase} />
      </div>
    </div>
  );
}
