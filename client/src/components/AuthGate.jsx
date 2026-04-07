import React, { useState, useEffect } from 'react';

export default function AuthGate({ onAuth }) {
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);

  const [passphrase, setPassphrase] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
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
        body: JSON.stringify({ passphrase, name, pin }),
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

  const canSubmit = !loading && passphrase && name && pin;

  return (
    <div className="auth-gate">
      <div className="auth-branding">
        <img src="/logo.png" alt="Logo" className="auth-logo-img" />
        <span className="auth-logo-hub">HUB</span>
      </div>
      <div className="auth-card">
        <p>Enter your credentials to continue.</p>
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
          <div className="form-group">
            <label htmlFor="pin">Personal PIN</label>
            <input
              id="pin"
              type="password"
              value={pin}
              onChange={e => setPin(e.target.value)}
              autoComplete="one-time-code"
              placeholder="••••"
              inputMode="numeric"
            />
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
