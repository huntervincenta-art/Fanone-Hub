import React, { useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Parse the markdown-ish script returned by Claude into labeled sections.
// The system prompt locks the format to:
//   # YOUTUBE TITLE
//   # ALT TITLES
//   # THUMBNAIL TEXT OPTIONS
//   # YOUTUBE DESCRIPTION
//   # TELEPROMPTER SCRIPT
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
  'YOUTUBE TITLE':           'Title',
  'ALT TITLES':              'Alt Titles',
  'THUMBNAIL TEXT OPTIONS':  'Thumbnail Options',
  'YOUTUBE DESCRIPTION':     'Description',
  'TELEPROMPTER SCRIPT':     'Teleprompter Script',
};

function prettyLabel(title) {
  return SECTION_LABELS[title.toUpperCase()] || title;
}

export default function ScriptResult() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state || {};
  const { script = '', articleTitle = '', articleSource = '' } = state;

  const sections = useMemo(() => parseScript(script), [script]);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  if (!script) {
    return (
      <section className="section script-result">
        <h2>Script Result</h2>
        <p className="script-result-empty">
          No script to display. Generate one from the Find Stories page.
        </p>
        <button className="btn btn-primary" onClick={() => navigate('/find-stories')}>
          Back to Stories
        </button>
      </section>
    );
  }

  return (
    <section className="section script-result">
      <div className="script-result-header">
        <div>
          <h2>MFS Script</h2>
          {articleTitle && (
            <div className="script-result-source">
              From: <strong>{articleTitle}</strong>
              {articleSource && <span className="script-result-outlet"> · {articleSource}</span>}
            </div>
          )}
        </div>
        <div className="script-result-actions">
          <button className="btn btn-ghost" onClick={() => navigate('/find-stories')}>
            ← Back to Stories
          </button>
          <button className="btn btn-primary" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>
        </div>
      </div>

      {sections.length === 0 ? (
        <pre className="script-result-raw">{script}</pre>
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
    </section>
  );
}
