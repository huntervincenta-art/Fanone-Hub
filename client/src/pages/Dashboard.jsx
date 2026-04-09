import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import TitleTool from '../components/TitleTool';
import TopicPulse from './TopicPulse';

// Same parser used by ScriptResult / Scripts page.
function parseScript(raw) {
  if (!raw) return [];
  const lines = raw.split('\n');
  const sections = [];
  let current = null;
  for (const line of lines) {
    const headingMatch = line.match(/^#\s+(.+?)\s*$/);
    if (headingMatch) {
      if (current) sections.push(current);
      current = { title: headingMatch[1].trim(), body: '' };
    } else if (current) {
      current.body += (current.body ? '\n' : '') + line;
    }
  }
  if (current) sections.push(current);
  return sections.map(s => ({ ...s, body: s.body.trim() }));
}

const SECTION_LABELS = {
  'YOUTUBE TITLE':           'YouTube Title',
  'ALT TITLES':              'Alt Titles',
  'THUMBNAIL TEXT OPTIONS':  'Thumbnail Options',
  'YOUTUBE DESCRIPTION':     'Description',
  'TELEPROMPTER SCRIPT':     'Teleprompter Script',
};
const prettyLabel = (t) => SECTION_LABELS[t.toUpperCase()] || t;

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

function ScriptDetail({ script }) {
  const sections = useMemo(() => parseScript(script.generatedScript), [script.generatedScript]);
  return (
    <div className="scripts-detail">
      {script.angleNotes && (
        <div className="scripts-detail-notes">
          <span className="scripts-detail-notes-label">Angle notes:</span> {script.angleNotes}
        </div>
      )}
      {sections.length === 0 ? (
        <pre className="script-result-raw">{script.generatedScript}</pre>
      ) : (
        <div className="script-result-sections">
          {sections.map((s, i) => (
            <div className="script-section" key={i}>
              <h3 className="script-section-title">{prettyLabel(s.title)}</h3>
              <pre className="script-section-body">{s.body}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ passphrase, userName }) {
  const [recentScripts, setRecentScripts] = useState([]);
  const [scriptsLoading, setScriptsLoading] = useState(false);
  const [scriptsError, setScriptsError] = useState('');
  const [expandedScriptId, setExpandedScriptId] = useState(null);

  const fetchRecentScripts = useCallback(async () => {
    setScriptsLoading(true);
    setScriptsError('');
    try {
      const res = await fetch('/api/scripts', {
        headers: { 'x-passphrase': passphrase },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load scripts');
      }
      const all = await res.json();
      setRecentScripts(all.slice(0, 8));
    } catch (err) {
      setScriptsError(err.message);
    } finally {
      setScriptsLoading(false);
    }
  }, [passphrase]);

  useEffect(() => {
    fetchRecentScripts();
  }, [fetchRecentScripts]);

  return (
    <div className="dashboard">
      {/* ── YouTube channel stats ── */}
      <ChannelStatsCard passphrase={passphrase} />

      {/* ── Title Generator section ── */}
      <section className="dashboard-card">
        <div className="dashboard-card-header">
          <h2>Title Generator</h2>
          <Link to="/title-tool" className="dashboard-link">Open full tool →</Link>
        </div>
        <div className="dashboard-card-body dashboard-title-tool">
          <TitleTool passphrase={passphrase} userName={userName} />
        </div>
      </section>

      {/* ── Topic Pulse section ── */}
      <section className="dashboard-card">
        <div className="dashboard-card-header">
          <h2>Topic Pulse</h2>
          <Link to="/topic-pulse" className="dashboard-link">View full pulse →</Link>
        </div>
        <div className="dashboard-card-body dashboard-topic-pulse">
          <TopicPulse passphrase={passphrase} />
        </div>
      </section>

      {/* ── Recent Scripts section ── */}
      <section className="dashboard-card">
        <div className="dashboard-card-header">
          <h2>Recent Scripts</h2>
          <Link to="/scripts" className="dashboard-link">View All Scripts →</Link>
        </div>
        <div className="dashboard-card-body">
          {scriptsError && (
            <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{scriptsError}</div>
          )}
          {scriptsLoading && recentScripts.length === 0 ? (
            <div className="scripts-empty">Loading scripts…</div>
          ) : recentScripts.length === 0 ? (
            <div className="scripts-empty">
              No scripts yet. Generate one from the Find Stories page.
            </div>
          ) : (
            <div className="dashboard-scripts-list">
              {recentScripts.map(script => {
                const isExpanded = expandedScriptId === script.id;
                return (
                  <div key={script.id} className={`dashboard-script-item${isExpanded ? ' dashboard-script-item--expanded' : ''}`}>
                    <button
                      type="button"
                      className="dashboard-script-row"
                      onClick={() => setExpandedScriptId(isExpanded ? null : script.id)}
                    >
                      <span className="dashboard-script-chevron" aria-hidden="true">
                        {isExpanded ? '▾' : '▸'}
                      </span>
                      <span className="dashboard-script-date">{formatDate(script.createdAt)}</span>
                      <span className="dashboard-script-title">
                        {script.articleTitle || '(Untitled)'}
                      </span>
                      <span className="dashboard-script-by">
                        {script.generatedBy ? `by ${script.generatedBy}` : ''}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="dashboard-script-detail">
                        <ScriptDetail script={script} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
