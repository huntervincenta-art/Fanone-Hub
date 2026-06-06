import React, { useState, useEffect, useCallback } from 'react';

const TABS = [
  { key: '',         label: 'All' },
  { key: 'script',   label: 'Scripts Generated' },
  { key: 'topic',    label: 'Topics Entered' },
  { key: 'discover', label: 'Discover Runs' },
  { key: 'analyzer', label: 'Analyzer Runs' },
];

const TYPE_BADGES = {
  script:   { label: 'Script',   cls: 'history-badge--script' },
  topic:    { label: 'Topic',    cls: 'history-badge--topic' },
  discover: { label: 'Discover', cls: 'history-badge--discover' },
  analyzer: { label: 'Analyzer', cls: 'history-badge--analyzer' },
};

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function PayloadDetail({ entry }) {
  const p = entry.payload || {};

  if (entry.type === 'script') {
    return (
      <div className="history-detail-body">
        {p.inputType && <div><strong>Input type:</strong> {p.inputType}</div>}
        {p.articleSource && <div><strong>Source:</strong> {p.articleSource}</div>}
        {p.sourceUrl && <div><strong>URL:</strong> <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer">{p.sourceUrl}</a></div>}
        {p.scriptId && <div><strong>Script ID:</strong> {p.scriptId}</div>}
      </div>
    );
  }

  if (entry.type === 'topic') {
    return (
      <div className="history-detail-body">
        {p.inputType && <div><strong>Flow:</strong> {p.inputType === 'topical' ? 'Topical narrative' : 'Plain topic'}</div>}
        {p.scriptId && <div><strong>Script ID:</strong> {p.scriptId}</div>}
      </div>
    );
  }

  if (entry.type === 'discover') {
    return (
      <div className="history-detail-body">
        {p.window && <div><strong>Window:</strong> {p.window}</div>}
        {p.storyCount != null && <div><strong>Stories found:</strong> {p.storyCount}</div>}
        {p.topHeadlines && p.topHeadlines.length > 0 && (
          <div>
            <strong>Top headlines:</strong>
            <ul className="history-headline-list">
              {p.topHeadlines.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          </div>
        )}
      </div>
    );
  }

  if (entry.type === 'analyzer') {
    return (
      <div className="history-detail-body">
        {p.recommendation && <div><strong>Recommendation:</strong> <span className={`history-rec history-rec--${(p.recommendation || '').toLowerCase()}`}>{p.recommendation}</span></div>}
        {p.angle && <div><strong>Angle:</strong> {p.angle}</div>}
        {p.hookStrength && <div><strong>Hook strength:</strong> {p.hookStrength}</div>}
        {p.retention && <div><strong>Est. retention:</strong> {p.retention}</div>}
        {p.suggestions && p.suggestions.length > 0 && (
          <div>
            <strong>Suggestions:</strong>
            <ul className="history-headline-list">
              {p.suggestions.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // Fallback
  return <pre className="history-detail-raw">{JSON.stringify(p, null, 2)}</pre>;
}

function HistoryRow({ entry }) {
  const [expanded, setExpanded] = useState(false);
  const badge = TYPE_BADGES[entry.type] || { label: entry.type, cls: '' };

  return (
    <div className={`history-row${expanded ? ' history-row--expanded' : ''}`}>
      <div className="history-row-summary" onClick={() => setExpanded(e => !e)}>
        <span className="history-chevron">{expanded ? '▾' : '▸'}</span>
        <span className={`history-badge ${badge.cls}`}>{badge.label}</span>
        <span className="history-title">{entry.title || '(Untitled)'}</span>
        <span className="history-meta">
          {entry.user && <span className="history-user">{entry.user}</span>}
          <span className="history-date">{formatDate(entry.createdAt)}</span>
        </span>
      </div>
      {expanded && (
        <div className="history-detail">
          <PayloadDetail entry={entry} />
        </div>
      )}
    </div>
  );
}

export default function History({ passphrase }) {
  const [activeType, setActiveType] = useState('');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchActivity = useCallback(async (p = 1) => {
    setLoading(true);
    setError('');
    try {
      const typeParam = activeType ? `&type=${activeType}` : '';
      const res = await fetch(`/api/activity?page=${p}&limit=50${typeParam}`, {
        headers: { 'x-passphrase': passphrase },
      });
      if (!res.ok) throw new Error('Failed to load activity');
      const data = await res.json();
      setEntries(data.entries || []);
      setTotalPages(data.pages || 1);
      setPage(data.page || 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [passphrase, activeType]);

  useEffect(() => {
    fetchActivity(1);
  }, [fetchActivity]);

  const handleTabChange = (key) => {
    setActiveType(key);
    setPage(1);
  };

  return (
    <section className="section history-page">
      <div className="history-header">
        <h2>History</h2>
        <button className="btn-ghost" onClick={() => fetchActivity(page)} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="tp-tab-bar">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`tp-tab-btn${activeType === tab.key ? ' tp-tab-btn--active' : ''}`}
            onClick={() => handleTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {loading && entries.length === 0 ? (
        <div className="tp-empty">Loading activity...</div>
      ) : entries.length === 0 ? (
        <div className="tp-empty">No activity logged yet.</div>
      ) : (
        <div className="history-list">
          {entries.map(entry => (
            <HistoryRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="history-pagination">
          <button
            className="btn-ghost"
            disabled={page <= 1 || loading}
            onClick={() => fetchActivity(page - 1)}
          >
            Prev
          </button>
          <span className="history-page-info">Page {page} of {totalPages}</span>
          <button
            className="btn-ghost"
            disabled={page >= totalPages || loading}
            onClick={() => fetchActivity(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
