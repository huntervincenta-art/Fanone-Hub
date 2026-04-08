import React, { useState, useEffect } from 'react';

export default function AuthGate({ onAuth }) {
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);

  const [passphrase, setPassphrase] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/auth/users')
      .then(r => {
        console.log('[AuthGate] /api/auth/users status:', r.status, r.ok);
        return r.ok ? r.json() : [];
      })
      .then(names => {
        console.log('[AuthGate] /api/auth/users names received:', names);
        setUsers(names);
        setUsersLoading(false);
      })
      .catch(err => {
        console.error('[AuthGate] /api/auth/users fetch error:', err);
        setUsersLoading(false);
      });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase, name }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onAuth(passphrase, name);
      } else {
        setError(data.error || 'Invalid credentials.');
      }
    } catch {
      setError('Could not connect to server.');
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = !loading && passphrase && name;

  return (
    <div className="auth-gate">
      <div className="auth-branding">
        <span className="auth-logo-hub">MFS Hub</span>
        <span className="auth-logo-sub">The Michael Fanone Show</span>
      </div>
      <div className="auth-card">
        <p>Enter the team passphrase and select your name.</p>
        <form className="form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="passphrase">Team Passphrase</label>
            <input
              id="passphrase"
              type="password"
              value={passphrase}
              onChange={e => setPassphrase(e.target.value)}
              autoFocus
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>
          <div className="form-group">
            <label htmlFor="auth-name">Your Name</label>
            <select
              id="auth-name"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={usersLoading}
            >
              <option value="">{usersLoading ? 'Loading…' : 'Select your name…'}</option>
              {users.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={!canSubmit}>
            {loading ? 'Checking…' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  );
}
