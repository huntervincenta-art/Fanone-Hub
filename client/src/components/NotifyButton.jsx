import React, { useState } from 'react';

export default function NotifyButton({ passphrase }) {
  const [status, setStatus] = useState(null); // null | 'loading' | 'ok' | 'error'
  const [msg, setMsg] = useState('');

  const handleNotify = async () => {
    setStatus('loading');
    setMsg('');
    try {
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-passphrase': passphrase,
        },
        body: JSON.stringify({ title: 'MFS Hub', message: 'New stories are ready!' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Notification failed');
      }
      setStatus('ok');
      setMsg('Sent!');
      setTimeout(() => { setStatus(null); setMsg(''); }, 3000);
    } catch (err) {
      setStatus('error');
      setMsg(err.message);
      setTimeout(() => { setStatus(null); setMsg(''); }, 4000);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <button
        className="btn btn-notify"
        onClick={handleNotify}
        disabled={status === 'loading'}
      >
        {status === 'loading' ? 'Sending…' : 'Push Notification'}
      </button>
      {msg && (
        <span className={`notify-status${status === 'error' ? ' error' : ''}`}>
          {msg}
        </span>
      )}
    </div>
  );
}
