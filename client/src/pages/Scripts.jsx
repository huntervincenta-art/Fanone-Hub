import React, { useState, useEffect, useCallback, useMemo } from 'react';

// Same parser used by ScriptResult — splits the model output into labeled sections.
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

function prettyLabel(title) {
  return SECTION_LABELS[title.toUpperCase()] || title;
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

function ScriptDetail({ script, onCopy, onDelete, copiedId, deletingId }) {
  const sections = useMemo(() => parseScript(script.generatedScript), [script.generatedScript]);
  const isCopied = copiedId === script.id;
  const isDeleting = deletingId === script.id;

  return (
    <div className="scripts-detail">
      <div className="scripts-detail-actions">
        <button
          className="btn-ghost"
          onClick={() => onCopy(script)}
          type="button"
        >
          {isCopied ? 'Copied!' : 'Copy to Clipboard'}
        </button>
        <button
          className="btn-ghost scripts-detail-delete"
          onClick={() => onDelete(script)}
          disabled={isDeleting}
          type="button"
        >
          {isDeleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>

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

export default function Scripts({ passphrase }) {
  const [scripts, setScripts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

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
      setScripts(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [passphrase]);

  useEffect(() => {
    fetchScripts();
  }, [fetchScripts]);

  const handleCopy = async (script) => {
    try {
      await navigator.clipboard.writeText(script.generatedScript || '');
      setCopiedId(script.id);
      setTimeout(() => setCopiedId(prev => (prev === script.id ? null : prev)), 1800);
    } catch {
      // ignore
    }
  };

  const handleDelete = async (script) => {
    if (!confirm(`Delete this script for "${script.articleTitle || 'Untitled'}"? This cannot be undone.`)) return;
    setDeletingId(script.id);
    try {
      const res = await fetch(`/api/scripts/${script.id}`, {
        method: 'DELETE',
        headers: { 'x-passphrase': passphrase },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete script');
      }
      setScripts(prev => prev.filter(s => s.id !== script.id));
      if (expandedId === script.id) setExpandedId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const toggleExpanded = (id) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  return (
    <section className="section scripts-page">
      <div className="scripts-header">
        <h2>Generated Scripts</h2>
        <button className="btn-ghost" onClick={fetchScripts} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {loading && scripts.length === 0 ? (
        <div className="scripts-empty">Loading scripts…</div>
      ) : scripts.length === 0 ? (
        <div className="scripts-empty">
          No scripts yet. Generate one from the Find Stories page.
        </div>
      ) : (
        <div className="scripts-table-wrap">
          <table className="scripts-table">
            <thead>
              <tr>
                <th className="scripts-th-date">Date</th>
                <th className="scripts-th-title">Article Title</th>
                <th className="scripts-th-source">Source</th>
                <th className="scripts-th-by">Generated By</th>
              </tr>
            </thead>
            <tbody>
              {scripts.map(script => {
                const isExpanded = expandedId === script.id;
                return (
                  <React.Fragment key={script.id}>
                    <tr
                      className={`scripts-row${isExpanded ? ' scripts-row--expanded' : ''}`}
                      onClick={() => toggleExpanded(script.id)}
                    >
                      <td className="scripts-cell-date">{formatDate(script.createdAt)}</td>
                      <td className="scripts-cell-title">
                        <span className="scripts-row-chevron" aria-hidden="true">
                          {isExpanded ? '▾' : '▸'}
                        </span>
                        {script.articleTitle || '(Untitled)'}
                      </td>
                      <td className="scripts-cell-source">
                        {script.articleSource ? (
                          <span className="article-outlet-badge">{script.articleSource}</span>
                        ) : '—'}
                      </td>
                      <td className="scripts-cell-by">{script.generatedBy || '—'}</td>
                    </tr>
                    {isExpanded && (
                      <tr className="scripts-row-detail">
                        <td colSpan={4}>
                          <ScriptDetail
                            script={script}
                            onCopy={handleCopy}
                            onDelete={handleDelete}
                            copiedId={copiedId}
                            deletingId={deletingId}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
