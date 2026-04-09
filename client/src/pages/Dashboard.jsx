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

// Donut/circular gauge — opportunity = 100 - saturation_score
function OpportunityDonut({ saturationScore, color, label }) {
  const safeSat = Math.max(0, Math.min(100, Number(saturationScore) || 0));
  const opportunity = 100 - safeSat;
  const size = 110;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (opportunity / 100) * circumference;
  return (
    <div className="opp-donut" role="img" aria-label={`${label} — ${opportunity} of 100`}>
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
          {opportunity}
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
          OPPORTUNITY
        </text>
      </svg>
    </div>
  );
}

function RecommendedStoryCard({ passphrase, userName }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');

  const fetchRecommended = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/recommended-story', {
        headers: { 'x-passphrase': passphrase },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to load recommended story');
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

  const handleGenerateScript = async () => {
    const story = data?.article;
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
          articleText: story.angle || data?.analysis?.best_angle || story.headline || '',
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
        setGenerateError('Script generation timed out after 2 minutes. Try again.');
      } else {
        setGenerateError(err.message);
      }
    } finally {
      clearTimeout(timeoutId);
      setGenerating(false);
    }
  };

  const isEmpty = data?.empty === true;
  const story = data?.article;
  const opp = data?.opportunity || { level: 'unknown', label: 'Unknown', color: '#9ca3af' };
  const lifecycle = data?.lifecycle || 'Unknown';
  const sat = data?.analysis?.saturation_score;
  const subline = sat != null
    ? `${opp.label} — ${lifecycle === 'Rising' ? 'Low saturation, rising fast' : lifecycle === 'Peak' ? 'Coverage building, still viable' : 'Saturated, likely too late'}`
    : 'Scoring stories…';

  return (
    <div className="dash-card dash-card--recommended">
      <div className="dash-card-head">
        <span className="dash-card-label">Recommended Story</span>
        <button
          type="button"
          className="dash-icon-btn"
          onClick={fetchRecommended}
          disabled={loading}
          title="Refresh"
          aria-label="Refresh recommended story"
        >↻</button>
      </div>

      {loading && !data && (
        <div className="dash-empty">Scoring the top stories… (this can take ~30 seconds)</div>
      )}
      {error && !loading && (
        <div className="alert alert-error">{error}</div>
      )}
      {!loading && !error && isEmpty && (
        <div className="dash-empty">
          {data?.empty_message || 'No high-opportunity stories right now. Check back soon.'}
        </div>
      )}
      {!loading && !error && !isEmpty && !story && (
        <div className="dash-empty">No story available right now.</div>
      )}

      {story && !isEmpty && (
        <>
          <div className="recommended-top">
            <OpportunityDonut
              saturationScore={sat}
              color={opp.color}
              label={opp.label}
            />
            <div className="recommended-top-info">
              <div
                className={`recommended-opp-tag recommended-opp-tag--${opp.level}`}
                style={{ color: opp.color, borderColor: opp.color }}
              >
                {opp.label.toUpperCase()}
                <span className="recommended-opp-sep">·</span>
                {lifecycle.toUpperCase()}
              </div>
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
              <div className="recommended-subline">{subline}</div>
            </div>
          </div>

          {(story.angle || data?.analysis?.best_angle) && (
            <div className="recommended-angle">
              <span className="recommended-angle-label">Angle</span>
              <p>{data?.analysis?.best_angle || story.angle}</p>
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
