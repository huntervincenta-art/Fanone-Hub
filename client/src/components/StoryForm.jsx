import React, { useState, useEffect, useRef } from 'react';

function todayISO() {
  const d = new Date().toLocaleDateString('en-CA');
  console.log('[StoryForm] todayISO:', d, '| raw UTC:', new Date().toISOString());
  return d;
}

export default function StoryForm({ passphrase, onSubmitted, userName }) {
  const [mode, setMode] = useState('unclaimed'); // 'unclaimed' | 'claimed'
  const [users, setUsers] = useState([]);
  const [fields, setFields] = useState({
    date: todayISO(),
    host: userName || '',
    headline: '',
    link: '',
    additionalLinks: '',
    angleClarity: '',
    breaking: false,
    thumbnailUrl: '',
  });
  const angleClarityRef = useRef(null);
  const ANGLE_MAX = 300;
  const ANGLE_MAX_HEIGHT = 6 * 22 + 16; // 6 rows * ~22px line-height + padding

  const resizeAngleClarity = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, ANGLE_MAX_HEIGHT) + 'px';
  };
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/auth/users')
      .then(r => r.ok ? r.json() : [])
      .then(setUsers)
      .catch(() => {});
  }, []);

  const set = (key) => (e) => setFields(f => ({ ...f, [key]: e.target.value }));
  const setCheck = (key) => (e) => setFields(f => ({ ...f, [key]: e.target.checked }));

  const headlineLen = fields.headline.length;
  const headlineCountClass = headlineLen >= 100 ? 'char-count char-count--red' : headlineLen >= 80 ? 'char-count char-count--amber' : 'char-count';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('loading');
    setError('');
    try {
      const res = await fetch('/api/stories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-passphrase': passphrase,
        },
        body: JSON.stringify({ ...fields, claimed: mode === 'claimed', user: userName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Submission failed');
      }
      setStatus('success');
      setFields({ date: todayISO(), host: userName || '', headline: '', link: '', additionalLinks: '', angleClarity: '', breaking: false, thumbnailUrl: '' });
      if (angleClarityRef.current) angleClarityRef.current.style.height = 'auto';
      onSubmitted();
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  const canSubmit = status !== 'loading' && fields.date && fields.headline && (mode === 'unclaimed' || fields.host);

  return (
    <form className="form" onSubmit={handleSubmit}>
      <div className="form-mode-toggle">
        <button
          type="button"
          className={`form-mode-btn${mode === 'claimed' ? ' form-mode-btn--active-teal' : ''}`}
          onClick={() => setMode('claimed')}
        >
          Host
        </button>
        <button
          type="button"
          className={`form-mode-btn${mode === 'unclaimed' ? ' form-mode-btn--active-amber' : ''}`}
          onClick={() => setMode('unclaimed')}
        >
          Available to Claim
        </button>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="date">Date</label>
          <input
            id="date"
            type="date"
            value={fields.date}
            onChange={set('date')}
            required
          />
        </div>
        {mode === 'claimed' && (
          <div className="form-group">
            <label htmlFor="host">Host</label>
            <select
              id="host"
              value={fields.host}
              onChange={set('host')}
              required
            >
              <option value="">Select host…</option>
              {users.map(u => (
                <React.Fragment key={u}>
                  <option value={u}>{u}</option>
                  {u === 'David' && <option value="David's Show">David's Show</option>}
                </React.Fragment>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="headline">Headline</label>
        <input
          id="headline"
          type="text"
          value={fields.headline}
          onChange={set('headline')}
          placeholder="Story headline"
          required
        />
        <span className={headlineCountClass}>{headlineLen} / 100</span>
      </div>

      <div className="form-group">
        <label htmlFor="link">Link</label>
        <input
          id="link"
          type="url"
          value={fields.link}
          onChange={set('link')}
          placeholder="https://…"
        />
      </div>

      <div className="form-group">
        <label htmlFor="additionalLinks">Additional Comments</label>
        <textarea
          id="additionalLinks"
          className="form-textarea"
          value={fields.additionalLinks}
          onChange={set('additionalLinks')}
          placeholder="Notes, context, or any additional information…"
          rows={3}
        />
      </div>

      <div className="form-group">
        <label htmlFor="angleClarity">
          Angle Clarity <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span>
        </label>
        <textarea
          id="angleClarity"
          ref={angleClarityRef}
          className="form-textarea"
          style={{ resize: 'none', overflowY: 'hidden' }}
          rows={3}
          value={fields.angleClarity}
          onChange={e => {
            const val = e.target.value.slice(0, ANGLE_MAX);
            setFields(f => ({ ...f, angleClarity: val }));
            resizeAngleClarity(e.target);
          }}
          placeholder="Explain how you angled your video…"
        />
        <span className={`char-count${fields.angleClarity.length >= ANGLE_MAX - 50 ? ' char-count--red' : ''}`}>
          {fields.angleClarity.length} / {ANGLE_MAX}
        </span>
      </div>

      <div className="form-group">
        <label htmlFor="thumbnailUrl">Thumbnail URL <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span></label>
        <input
          id="thumbnailUrl"
          type="url"
          value={fields.thumbnailUrl}
          onChange={set('thumbnailUrl')}
          placeholder="https://… or Google Drive share link"
        />
      </div>

      <div className="form-check-row">
        <label className="form-check-label">
          <input
            type="checkbox"
            className="form-check-input"
            checked={fields.breaking}
            onChange={setCheck('breaking')}
          />
          <span className="form-check-text">Mark as Breaking</span>
        </label>
      </div>

      {status === 'error' && <div className="alert alert-error">{error}</div>}
      {status === 'success' && <div className="alert alert-success">Story submitted!</div>}
      <div>
        <button className="btn btn-primary" type="submit" disabled={!canSubmit}>
          {status === 'loading' ? 'Adding…' : mode === 'unclaimed' ? 'Add to Available' : 'Add Story'}
        </button>
      </div>
    </form>
  );
}
