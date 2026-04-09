import React, { useState, useRef } from 'react';

function todayISO() {
  const d = new Date().toLocaleDateString('en-CA');
  console.log('[TitleTool] todayISO:', d, '| raw UTC:', new Date().toISOString());
  return d;
}

function buildComments(result) {
  const parts = [];
  if (result.summary) parts.push(`[Summary]\n${result.summary}`);
  if (result.angle)   parts.push(`[AI Angle]\n${result.angle}`);
  return parts.join('\n\n');
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button className="title-copy-btn" onClick={handleCopy} type="button" title="Copy to clipboard">
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

export default function TitleTool({ passphrase, userName }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [titleStatus, setTitleStatus] = useState({});
  const textareaRef = useRef(null);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    setTitleStatus({});
    try {
      const res = await fetch('/api/title-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const setStatus = (idx, status) =>
    setTitleStatus(prev => ({ ...prev, [idx]: status }));

  const addToAvailable = async (title, idx) => {
    setStatus(idx, 'adding');
    try {
      const res = await fetch('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({
          date: todayISO(),
          headline: title,
          link: '',
          additionalLinks: buildComments(result),
          claimed: false,
          host: '',
          user: userName,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      setStatus(idx, 'added');
    } catch {
      setStatus(idx, 'error');
    }
  };

  const claimIt = async (title, idx) => {
    const host = sessionStorage.getItem('team_hub_session_name') || '';
    if (!host) { setStatus(idx, 'no-user'); return; }
    setStatus(idx, 'claiming');
    try {
      const res = await fetch('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({
          date: todayISO(),
          headline: title,
          link: '',
          additionalLinks: buildComments(result),
          claimed: true,
          host,
          user: userName,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      setStatus(idx, 'claimed');
    } catch {
      setStatus(idx, 'error');
    }
  };

  const handleClear = () => {
    setText('');
    setResult(null);
    setError('');
    setTitleStatus({});
    textareaRef.current?.focus();
  };

  return (
    <div className="title-tool">
      {result && (
        <div className="title-tool-header">
          <button className="btn-ghost" onClick={handleClear} type="button">Clear</button>
        </div>
      )}

      <form onSubmit={handleGenerate}>
        <div className="title-tool-input-area">
          <textarea
            ref={textareaRef}
            className="title-tool-textarea"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Paste an article, headline, or summary here…"
            rows={3}
            disabled={loading}
          />
          <div className="title-tool-actions">
            <button
              className="btn btn-primary title-tool-generate"
              type="submit"
              disabled={loading || !text.trim()}
            >
              {loading ? 'Generating…' : 'Generate Titles'}
            </button>
          </div>
        </div>
      </form>

      {error && (
        <div className="alert alert-error" style={{ marginTop: '1rem' }}>{error}</div>
      )}

      {loading && (
        <div className="title-tool-loading">
          <span className="title-tool-loading-dot" />
          <span className="title-tool-loading-dot" />
          <span className="title-tool-loading-dot" />
          Generating MFS titles and thumbnail text…
        </div>
      )}

      {result && (
        <div className="title-tool-results">
          {result.titles && result.titles.length > 0 && (
            <div className="title-tool-block">
              <span className="title-tool-block-label">YouTube Titles</span>
              <div className="title-tool-titles">
                {result.titles.map((title, idx) => {
                  const status = titleStatus[idx];
                  const done = status === 'added' || status === 'claimed';
                  return (
                    <div className={`title-tool-title-row${done ? ' title-tool-title-row--done' : ''}`} key={idx}>
                      <span className="title-tool-title-num">{idx + 1}</span>
                      <span className="title-tool-title-text">{title}</span>
                      <div className="title-tool-title-actions">
                        <CopyButton text={title} />
                        <button
                          className="title-tool-action-btn title-tool-action-btn--available"
                          onClick={() => addToAvailable(title, idx)}
                          disabled={!!status}
                          type="button"
                        >
                          {status === 'adding' ? 'Adding…' : status === 'added' ? 'Added!' : 'Add to Available'}
                        </button>
                        <button
                          className="title-tool-action-btn title-tool-action-btn--claim"
                          onClick={() => claimIt(title, idx)}
                          disabled={!!status}
                          type="button"
                        >
                          {status === 'claiming' ? 'Claiming…' : status === 'claimed' ? 'Claimed!' : 'Claim It'}
                        </button>
                      </div>
                      {status === 'error' && (
                        <span className="title-tool-row-error">Action failed. Try again.</span>
                      )}
                      {status === 'no-user' && (
                        <span className="title-tool-row-error">No user session. Log back in.</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {result.thumbnails && result.thumbnails.length > 0 && (
            <div className="title-tool-block">
              <span className="title-tool-block-label">Thumbnail Text</span>
              <div className="title-tool-thumbnails">
                {result.thumbnails.map((thumb, idx) => (
                  <div className="title-tool-thumb-row" key={idx}>
                    <span className="title-tool-title-num">{idx + 1}</span>
                    <span className="title-tool-thumb-text">{thumb}</span>
                    <CopyButton text={thumb} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
