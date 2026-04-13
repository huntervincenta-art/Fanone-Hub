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

function ScriptDetail({ script, onCopy, onDelete, onUpdate, copiedId, deletingId, passphrase }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPrevious, setShowPrevious] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenNotes, setRegenNotes] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState('');

  const displayText = showPrevious && script.previousVersion ? script.previousVersion : script.generatedScript;
  const sections = useMemo(() => parseScript(displayText), [displayText]);
  const isCopied = copiedId === script.id;
  const isDeleting = deletingId === script.id;

  const startEdit = () => {
    setEditText(script.generatedScript);
    setEditing(true);
    setShowPrevious(false);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditText('');
  };

  const saveEdit = async () => {
    if (!editText.trim() || editText === script.generatedScript) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/scripts/${script.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({ generatedScript: editText }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save');
      }
      const updated = await res.json();
      onUpdate(updated);
      setEditing(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    if (!regenNotes.trim()) return;
    setRegenerating(true);
    setRegenError('');
    try {
      const res = await fetch(`/api/scripts/${script.id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({ notes: regenNotes }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to regenerate');
      }
      const updated = await res.json();
      onUpdate(updated);
      setRegenOpen(false);
      setRegenNotes('');
    } catch (err) {
      setRegenError(err.message);
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="scripts-detail">
      <div className="scripts-detail-actions">
        {!editing && (
          <button className="btn-ghost" onClick={startEdit} type="button">
            Edit
          </button>
        )}
        {editing && (
          <>
            <button className="btn-ghost" onClick={cancelEdit} disabled={saving} type="button">
              Cancel
            </button>
            <button className="btn-ghost scripts-detail-save" onClick={saveEdit} disabled={saving} type="button">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </>
        )}
        <button
          className="btn-ghost"
          onClick={() => onCopy(script)}
          type="button"
        >
          {isCopied ? 'Copied!' : 'Copy'}
        </button>
        <button
          className="btn-ghost"
          onClick={() => { setRegenOpen(!regenOpen); setRegenError(''); }}
          disabled={editing || regenerating}
          type="button"
        >
          Regenerate with Notes
        </button>
        {script.previousVersion && (
          <button
            className="btn-ghost"
            onClick={() => { setShowPrevious(!showPrevious); setEditing(false); }}
            type="button"
          >
            {showPrevious ? 'Current Version' : 'Previous Version'}
          </button>
        )}
        <button
          className="btn-ghost scripts-detail-delete"
          onClick={() => onDelete(script)}
          disabled={isDeleting}
          type="button"
        >
          {isDeleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>

      {regenOpen && (
        <div className="scripts-regen-panel">
          <textarea
            className="scripts-regen-textarea"
            rows={3}
            value={regenNotes}
            onChange={e => setRegenNotes(e.target.value)}
            placeholder="e.g. Make the opening punchier, focus more on the financial angle..."
            disabled={regenerating}
          />
          {regenError && <div className="alert alert-error" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>{regenError}</div>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              className="btn btn-primary"
              onClick={handleRegenerate}
              disabled={regenerating || !regenNotes.trim()}
              type="button"
            >
              {regenerating ? 'Regenerating…' : 'Regenerate'}
            </button>
            <button
              className="btn-ghost"
              onClick={() => { setRegenOpen(false); setRegenError(''); }}
              disabled={regenerating}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {script.angleNotes && (
        <div className="scripts-detail-notes">
          <span className="scripts-detail-notes-label">Angle notes:</span> {script.angleNotes}
        </div>
      )}

      {showPrevious && script.previousVersion && (
        <div className="scripts-version-label">Viewing previous version</div>
      )}

      {editing ? (
        <textarea
          className="scripts-edit-textarea"
          value={editText}
          onChange={e => setEditText(e.target.value)}
          disabled={saving}
        />
      ) : sections.length === 0 ? (
        <pre className="script-result-raw">{displayText}</pre>
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

  const handleUpdate = (updated) => {
    setScripts(prev => prev.map(s => s.id === updated.id ? updated : s));
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
                            onUpdate={handleUpdate}
                            copiedId={copiedId}
                            deletingId={deletingId}
                            passphrase={passphrase}
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
