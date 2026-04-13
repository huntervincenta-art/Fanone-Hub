import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import TitleTool from '../components/TitleTool';
import TopicPulse from './TopicPulse';


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

// Donut/circular gauge — Fanone-lane relevance score (0–100)
function OpportunityDonut({ score, color, label, gaugeLabel = 'LANE FIT' }) {
  const safeScore = Math.max(0, Math.min(100, Number(score) || 0));
  const size = 110;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (safeScore / 100) * circumference;
  return (
    <div className="opp-donut" role="img" aria-label={`${label} — ${safeScore} of 100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
        <text
          x="50%"
          y="48%"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#ffffff"
          fontSize="22"
          fontWeight="800"
        >
          {safeScore}
        </text>
        <text
          x="50%"
          y="68%"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="rgba(255,255,255,0.55)"
          fontSize="9"
          fontWeight="700"
          letterSpacing="1.2"
        >
          {gaugeLabel}
        </text>
      </svg>
    </div>
  );
}

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
    : suggestions.filter(s => s.urgency === filter.toUpperCase());

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
        {['All', 'Breaking', 'Evergreen'].map(f => (
          <button
            key={f}
            className={`urgency-filter-btn${filter === f ? ' urgency-filter-btn--active' : ''}`}
            onClick={() => setFilter(f)}
            type="button"
          >
            {f}
            {f !== 'All' && (
              <span style={{ marginLeft: 4, opacity: 0.7 }}>
                ({suggestions.filter(s => s.urgency === f.toUpperCase()).length})
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
                  <span className={`story-card-urgency story-card-urgency--${item.urgency}`}>
                    {item.urgency}
                  </span>
                  <div className="story-card-score">
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
                    <span className="article-outlet-badge" style={{ fontSize: '0.7rem' }}>
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
  const topStory = data?.article;
  const opp = data?.opportunity || { level: 'unknown', label: 'Unknown', color: '#9ca3af' };
  const score = typeof data?.score === 'number'
    ? data.score
    : (data?.analysis?.saturation_score != null ? 100 - data.analysis.saturation_score : null);
  const saturationScore = data?.analysis?.saturation_score ?? (score != null ? 100 - score : null);

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

      {!isEmpty && topStory && (
        <>
          {/* Top story summary with gauges */}
          <div className="recommended-top" style={{ marginBottom: '0.75rem' }}>
            <OpportunityDonut
              score={score}
              color={opp.color}
              label={opp.label}
            />
            {saturationScore != null && (
              <SaturationGauge saturationScore={saturationScore} />
            )}
            <div className="recommended-top-info" style={{ flex: 1 }}>
              <div
                className={`recommended-opp-tag recommended-opp-tag--${opp.level}`}
                style={{ color: opp.color, borderColor: opp.color }}
              >
                LANE FIT · {score != null ? `${score}/100` : '—'}
              </div>
              <div className="recommended-subline">{score != null ? opp.label : 'Scoring stories…'}</div>
            </div>
          </div>

          {/* Story carousel */}
          {suggestions.length > 0 ? (
            <StorySuggestionsCarousel
              suggestions={suggestions}
              passphrase={passphrase}
              userName={userName}
            />
          ) : (
            <div className="dash-empty">No story suggestions available.</div>
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

      {/* Row 4 — Topic Pulse */}
      <div className="dashboard-grid">
        <div className="dash-card dash-card--pulse">
          <div className="dash-card-head">
            <span className="dash-card-label">Topic Pulse</span>
          </div>
          <TopicPulse passphrase={passphrase} />
        </div>
      </div>
    </div>
  );
}
