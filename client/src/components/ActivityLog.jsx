import React, { useState, useEffect } from 'react';

const ACTION_LABELS = {
  story_submitted: 'submitted a story',
  story_claimed: 'claimed a story',
  story_flagged: 'flagged a story for approval',
  story_aired: 'marked a story as aired',
  story_deleted: 'deleted a story',
  message_posted: 'posted a message',
};

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function ActivityLog({ passphrase }) {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchLog = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/activity-log', {
        headers: { 'x-passphrase': passphrase },
      });
      if (res.ok) setLog(await res.json());
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (open) fetchLog();
  }, [open]);

  return (
    <div className="activity-log">
      <button className="activity-log-toggle" onClick={() => setOpen(o => !o)} type="button">
        <span className="activity-log-toggle-label">Activity Log</span>
        <span className="activity-log-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="activity-log-body">
          <div className="activity-log-header">
            <span className="activity-log-count">{log.length} recent actions</span>
            <button className="btn-ghost" onClick={fetchLog} disabled={loading} type="button">
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          {loading && log.length === 0 ? (
            <div className="activity-log-empty">Loading…</div>
          ) : log.length === 0 ? (
            <div className="activity-log-empty">No activity yet.</div>
          ) : (
            <div className="activity-log-list">
              {log.map(entry => (
                <div key={entry.id} className="activity-log-item">
                  <span className="activity-log-time">{formatTime(entry.timestamp)}</span>
                  <span className="activity-log-user">{entry.user}</span>
                  <span className="activity-log-action">{ACTION_LABELS[entry.action] || entry.action}</span>
                  {entry.details && (
                    <span className="activity-log-details">"{entry.details}"</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
