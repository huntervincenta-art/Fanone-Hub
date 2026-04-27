import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import TitleTool from '../components/TitleTool';
import OpportunityDonut from '../components/OpportunityDonut';


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

// OpportunityDonut imported from ../components/OpportunityDonut

// Saturation gauge — how covered is the top story on YouTube
function SaturationGauge({ saturationScore }) {
  const sat = Math.max(0, Math.min(100, Number(saturationScore) || 0));
  let color = '#22c55e';
  let contextLabel = 'Low saturation — fresh opportunity';
  if (sat >= 70) {
    color = '#ef4444';
    contextLabel = 'High saturation — heavily covered';
  } else if (sat >= 40) {
    color = '#fbbf24';
    contextLabel = 'Moderate saturation — find a unique angle';
  }

  return (
    <div className="saturation-gauge-card">
      <OpportunityDonut
        score={sat}
        color={color}
        label={contextLabel}
        gaugeLabel="SATURATION"
      />
      <div className="saturation-gauge-info">
        <span className="saturation-gauge-label">Topic Saturation</span>
        <span className="saturation-gauge-context">{contextLabel}</span>
      </div>
    </div>
  );
}

function StorySuggestionsCarousel({ suggestions, passphrase, userName }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('All');
  const [generating, setGenerating] = useState(null);

  const filtered = filter === 'All'
    ? suggestions
    : suggestions.filter(s => s.category === filter);

  const handleGenerateScript = async (story, opp) => {
    const id = story.id;
    setGenerating(id);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    try {
      const res = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({
          articleText: story.angle || story.headline || '',
          articleTitle: story.headline || '',
          articleSource: story.outlet || story.source || '',
          angleNotes: '',
          user: userName,
        }),
        signal: controller.signal,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to generate script');
      navigate('/script-result', {
        state: {
          script: body.script,
          articleTitle: story.headline || '',
          articleSource: story.outlet || story.source || '',
        },
      });
    } catch (err) {
      if (err.name !== 'AbortError') alert(err.message);
    } finally {
      clearTimeout(timeoutId);
      setGenerating(null);
    }
  };

  return (
    <div className="story-carousel-wrap">
      <div className="urgency-filter-bar">
        {['All', 'Law Enforcement', 'Political Commentary'].map(f => (
          <button
            key={f}
            className={`urgency-filter-btn${filter === f ? ' urgency-filter-btn--active' : ''}`}
            onClick={() => setFilter(f)}
            type="button"
          >
            {f}
            {f !== 'All' && (
              <span style={{ marginLeft: 4, opacity: 0.7 }}>
                ({suggestions.filter(s => s.category === f).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="dash-empty">No {filter.toLowerCase()} stories right now.</div>
      ) : (
        <div className="story-carousel">
          {filtered.map((item, i) => {
            const story = item.article;
            const opp = item.opportunity || {};
            const isGenerating = generating === story.id;
            return (
              <div className="story-card" key={story.id || i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span
                    className={`story-card-category story-card-category--${item.category === 'Law Enforcement' ? 'le' : 'pc'}`}
                    title={item.category === 'Law Enforcement' ? 'Law Enforcement — police, courts, DOJ, FBI, crime, civil rights' : 'Political Commentary — politics, elections, policy, Congress, White House'}
                  >
                    {item.category === 'Law Enforcement' ? 'Law Enforcement' : 'Political Commentary'}
                  </span>
                  <div className="story-card-score" title={`Lane Fit Score: ${item.score}/100 — based on Fanone's proven high-performing categories`}>
                    <span
                      className="story-card-score-dot"
                      style={{ background: opp.color || '#9ca3af' }}
                    />
                    {item.score}
                  </div>
                </div>

                <div className="story-card-headline">
                  {story.url ? (
                    <a href={story.url} target="_blank" rel="noopener noreferrer">
                      {story.headline}
                    </a>
                  ) : story.headline}
                </div>

                <div className="story-card-meta">
                  {(story.outlet || story.source) && (
                    <span className="article-outlet-badge" style={{ fontSize: '0.7rem' }} title={`Source: ${story.outlet || story.source}`}>
                      {story.outlet || story.source}
                    </span>
                  )}
                  {story.publishedAt && (
                    <span>{formatRelative(story.publishedAt)}</span>
                  )}
                </div>

                {story.angle && (
                  <div className="story-card-angle">{story.angle}</div>
                )}

                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ marginTop: 'auto', fontSize: '0.78rem', padding: '0.35rem 0.6rem' }}
                  onClick={() => handleGenerateScript(story, opp)}
                  disabled={isGenerating}
                >
                  {isGenerating ? 'Generating…' : 'Generate Script'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FeaturedStoryCard({ item, passphrase, userName }) {
  const navigate = useNavigate();
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');

  const story = item.article;
  const opp = item.opportunity || {};
  const score = item.score;
  const saturationScore = score != null ? 100 - score : null;

  const handleGenerateScript = async () => {
    setGenerating(true);
    setGenerateError('');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    try {
      const res = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({
          articleText: story.angle || story.headline || '',
          articleTitle: story.headline || '',
          articleSource: story.outlet || story.source || '',
          angleNotes: '',
          user: userName,
        }),
        signal: controller.signal,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to generate script');
      navigate('/script-result', {
        state: {
          script: body.script,
          articleTitle: story.headline || '',
          articleSource: story.outlet || story.source || '',
        },
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        setGenerateError('Script generation timed out. Try again.');
      } else {
        setGenerateError(err.message);
      }
    } finally {
      clearTimeout(timeoutId);
      setGenerating(false);
    }
  };

  return (
    <div className="featured-story">
      <div className="featured-story-top">
        <span
          className={`story-card-category story-card-category--${item.category === 'Law Enforcement' ? 'le' : 'pc'}`}
          title={item.category === 'Law Enforcement' ? 'Law Enforcement — police, courts, DOJ, FBI, crime, civil rights' : 'Political Commentary — politics, elections, policy, Congress, White House'}
        >
          {item.category === 'Law Enforcement' ? 'Law Enforcement' : 'Political Commentary'}
        </span>
        <span className="featured-story-rank">TOP PICK</span>
      </div>

      <div className="featured-story-body">
        <div className="featured-story-gauges">
          <OpportunityDonut score={score} color={opp.color} label={opp.label} />
          {saturationScore != null && (
            <SaturationGauge saturationScore={saturationScore} />
          )}
        </div>

        <div className="featured-story-content">
          <div className="featured-story-headline">
            {story.url ? (
              <a href={story.url} target="_blank" rel="noopener noreferrer">{story.headline}</a>
            ) : story.headline}
          </div>

          <div className="featured-story-meta">
            {(story.outlet || story.source) && (
              <span className="article-outlet-badge" title={`Source: ${story.outlet || story.source}`}>{story.outlet || story.source}</span>
            )}
            {story.publishedAt && (
              <span className="featured-story-time">{formatRelative(story.publishedAt)}</span>
            )}
            <div
              className={`recommended-opp-tag recommended-opp-tag--${opp.level}`}
              style={{ color: opp.color, borderColor: opp.color }}
            >
              LANE FIT · {score != null ? `${score}/100` : '—'}
            </div>
          </div>

          {story.angle && (
            <div className="featured-story-angle">
              <span className="featured-story-angle-label">Angle</span>
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
        </div>
      </div>
    </div>
  );
}

function RecommendedStoryCard({ passphrase, userName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchRecommended = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/recommended-story', {
        headers: { 'x-passphrase': passphrase },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to load recommended stories');
      setData(body);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [passphrase]);

  useEffect(() => {
    fetchRecommended();
  }, [fetchRecommended]);

  const isEmpty = data?.empty === true;
  const suggestions = data?.suggestions || [];
  const featured = suggestions.length > 0 ? suggestions[0] : null;
  const remaining = suggestions.slice(1);

  return (
    <div className="dash-card dash-card--recommended" style={{ gridColumn: '1 / -1' }}>
      <div className="dash-card-head">
        <span className="dash-card-label">Story Suggestions</span>
        <button
          type="button"
          className="dash-icon-btn"
          onClick={fetchRecommended}
          disabled={loading}
          title="Refresh"
          aria-label="Refresh story suggestions"
        >↻</button>
      </div>

      {loading && !data && (
        <div className="dash-empty">Scoring stories for Fanone's lane…</div>
      )}
      {error && !loading && (
        <div className="alert alert-error">{error}</div>
      )}
      {!loading && !error && isEmpty && (
        <div className="dash-empty">
          {data?.empty_message || 'No high-opportunity stories right now. Check back soon.'}
        </div>
      )}

      {!isEmpty && featured && (
        <>
          {/* Featured #1 story with gauges */}
          <FeaturedStoryCard
            item={featured}
            passphrase={passphrase}
            userName={userName}
          />

          {/* Remaining stories in carousel */}
          {remaining.length > 0 && (
            <StorySuggestionsCarousel
              suggestions={remaining}
              passphrase={passphrase}
              userName={userName}
            />
          )}
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
      const data = await res.json();
      const all = data.scripts || data;
      setScripts(Array.isArray(all) ? all.slice(0, 5) : []);
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
              <Link to="/topic-pulse" className="recent-scripts-link">
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
        <Link to="/topic-pulse" className="dashboard-link-muted">View all scripts →</Link>
      </div>
    </div>
  );
}

export default function Dashboard({ passphrase, userName }) {
  return (
    <div className="dashboard">
      {/* Row 1 — channel stats strip */}
      <ChannelStatsCard passphrase={passphrase} />

      {/* Row 2 — Story Suggestions (full width carousel with gauges) */}
      <RecommendedStoryCard passphrase={passphrase} userName={userName} />

      {/* Row 3 — Title Generator (60) + Recent Scripts (40) */}
      <div className="dashboard-grid">
        <div className="dash-card dash-card--title">
          <div className="dash-card-head">
            <span className="dash-card-label">Title Generator</span>
          </div>
          <TitleTool passphrase={passphrase} userName={userName} />
        </div>
        <RecentScriptsCompact passphrase={passphrase} />
      </div>
    </div>
  );
}
