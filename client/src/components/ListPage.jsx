import React, { useState, useEffect } from 'react';
import { getHostColor } from '../config/hosts';

const crown = name => name;

const TrashIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M2 4h12M5 4V2.5a.5.5 0 01.5-.5h5a.5.5 0 01.5.5V4M6.5 7v5M9.5 7v5M3.5 4l.75 8.25a.75.75 0 00.75.75h6a.75.75 0 00.75-.75L12.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const TABS = [
  { key: 'doNotCover', label: 'Do Not Cover' },
  { key: 'learned',    label: 'Something I Learned' },
  { key: 'suggestion', label: 'Suggestion' },
];

export default function ListPage({ passphrase, userName }) {
  const [activeTab, setActiveTab] = useState('doNotCover');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Do Not Cover form ──
  const [dncTopic, setDncTopic]   = useState('');
  const [dncWhy, setDncWhy]       = useState('');
  const [dncSending, setDncSending] = useState(false);

  // ── Learned form ──
  const [learnedText, setLearnedText] = useState('');
  const [learnedSending, setLearnedSending] = useState(false);

  // ── Suggestion form ──
  const [suggText, setSuggText]       = useState('');
  const [forHunter, setForHunter]     = useState(false);
  const [suggSending, setSuggSending] = useState(false);

  const fetchItems = () => {
    setLoading(true);
    fetch('/api/list', { headers: { 'x-passphrase': passphrase } })
      .then(r => r.ok ? r.json() : [])
      .then(data => { setItems(data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchItems(); }, [passphrase]);

  const post = async (body) => {
    const res = await fetch('/api/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
      body: JSON.stringify({ ...body, hostName: userName }),
    });
    if (!res.ok) throw new Error('Failed');
    return res.json();
  };

  const handleDelete = async (id) => {
    try {
      await fetch(`/api/list/${id}`, {
        method: 'DELETE',
        headers: { 'x-passphrase': passphrase },
      });
      setItems(prev => prev.filter(it => it.id !== id));
    } catch {}
  };

  // ── Submit handlers ──
  const submitDnc = async (e) => {
    e.preventDefault();
    if (!dncTopic.trim()) return;
    setDncSending(true);
    try {
      const item = await post({ type: 'doNotCover', content: dncTopic.trim(), reason: dncWhy.trim() });
      setItems(prev => [item, ...prev]);
      setDncTopic('');
      setDncWhy('');
    } catch {}
    setDncSending(false);
  };

  const submitLearned = async (e) => {
    e.preventDefault();
    if (!learnedText.trim()) return;
    setLearnedSending(true);
    try {
      const item = await post({ type: 'learned', content: learnedText.trim() });
      setItems(prev => [item, ...prev]);
      setLearnedText('');
    } catch {}
    setLearnedSending(false);
  };

  const submitSugg = async (e) => {
    e.preventDefault();
    if (!suggText.trim()) return;
    setSuggSending(true);
    try {
      const item = await post({ type: 'suggestion', content: suggText.trim(), forHunter });
      setItems(prev => [item, ...prev]);
      setSuggText('');
      setForHunter(false);
    } catch {}
    setSuggSending(false);
  };

  const byType = (type) => items.filter(it => it.type === type);

  return (
    <div className="list-page">
      <h2 className="list-page-title">Team List</h2>

      {/* Tab bar */}
      <div className="list-tab-bar">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`list-tab-btn${activeTab === tab.key ? ' list-tab-btn--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            {byType(tab.key).length > 0 && (
              <span className="list-tab-count">{byType(tab.key).length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ══ Do Not Cover ══ */}
      {activeTab === 'doNotCover' && (
        <div className="list-section">
          <p className="list-section-desc">
            Topics or stories the team has agreed to skip. Add anything you think we should avoid covering.
          </p>
          <form className="list-form" onSubmit={submitDnc}>
            <div className="list-form-row">
              <input
                className="list-input"
                type="text"
                placeholder="Topic to avoid…"
                value={dncTopic}
                onChange={e => setDncTopic(e.target.value)}
                required
              />
            </div>
            <div className="list-form-row">
              <input
                className="list-input"
                type="text"
                placeholder="Why? (optional)"
                value={dncWhy}
                onChange={e => setDncWhy(e.target.value)}
              />
              <button className="btn btn-primary" type="submit" disabled={dncSending || !dncTopic.trim()}>
                {dncSending ? '…' : 'Add'}
              </button>
            </div>
          </form>

          {loading ? (
            <div className="list-loading">Loading…</div>
          ) : byType('doNotCover').length === 0 ? (
            <div className="list-empty">No entries yet.</div>
          ) : (
            <ul className="list-entries">
              {byType('doNotCover').map(item => (
                <li key={item.id} className="list-entry list-entry--dnc">
                  <div className="list-entry-main">
                    <span className="list-entry-content">{item.content}</span>
                    {item.reason && (
                      <span className="list-entry-reason">{item.reason}</span>
                    )}
                  </div>
                  <div className="list-entry-meta">
                    <span
                      className="list-entry-host"
                      style={getHostColor(item.hostName) ? { color: getHostColor(item.hostName) } : undefined}
                    >
                      {crown(item.hostName)}
                    </span>
                    <span className="list-entry-time">{formatTime(item.timestamp)}</span>
                    {item.hostName === userName && (
                      <button
                        className="list-delete-btn"
                        onClick={() => handleDelete(item.id)}
                        title="Delete"
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ══ Something I Learned ══ */}
      {activeTab === 'learned' && (
        <div className="list-section">
          <p className="list-section-desc">
            Share something useful you picked up — a tip, a fact, a workflow trick.
          </p>
          <form className="list-form" onSubmit={submitLearned}>
            <div className="list-form-row">
              <input
                className="list-input"
                type="text"
                placeholder="Share what you learned…"
                value={learnedText}
                onChange={e => setLearnedText(e.target.value)}
                required
              />
              <button className="btn btn-primary" type="submit" disabled={learnedSending || !learnedText.trim()}>
                {learnedSending ? '…' : 'Add'}
              </button>
            </div>
          </form>

          {loading ? (
            <div className="list-loading">Loading…</div>
          ) : byType('learned').length === 0 ? (
            <div className="list-empty">No entries yet.</div>
          ) : (
            <ul className="list-entries">
              {byType('learned').map(item => (
                <li key={item.id} className="list-entry list-entry--learned">
                  <div className="list-entry-main">
                    <span className="list-entry-content">{item.content}</span>
                  </div>
                  <div className="list-entry-meta">
                    <span
                      className="list-entry-host"
                      style={getHostColor(item.hostName) ? { color: getHostColor(item.hostName) } : undefined}
                    >
                      {crown(item.hostName)}
                    </span>
                    <span className="list-entry-time">{formatTime(item.timestamp)}</span>
                    {item.hostName === userName && (
                      <button
                        className="list-delete-btn"
                        onClick={() => handleDelete(item.id)}
                        title="Delete"
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ══ Suggestion ══ */}
      {activeTab === 'suggestion' && (
        <div className="list-section">
          <p className="list-section-desc">
            Ideas about the show, the workflow, or anything else worth raising.
          </p>
          <form className="list-form" onSubmit={submitSugg}>
            <div className="list-form-row">
              <input
                className="list-input"
                type="text"
                placeholder="Your suggestion…"
                value={suggText}
                onChange={e => setSuggText(e.target.value)}
                required
              />
              <button className="btn btn-primary" type="submit" disabled={suggSending || !suggText.trim()}>
                {suggSending ? '…' : 'Add'}
              </button>
            </div>
            <label className="list-for-hunter-label">
              <input
                type="checkbox"
                checked={forHunter}
                onChange={e => setForHunter(e.target.checked)}
                className="list-for-hunter-checkbox"
              />
              Suggestion for Hunter
            </label>
          </form>

          {loading ? (
            <div className="list-loading">Loading…</div>
          ) : byType('suggestion').length === 0 ? (
            <div className="list-empty">No entries yet.</div>
          ) : (
            <ul className="list-entries">
              {byType('suggestion').map(item => (
                <li key={item.id} className={`list-entry list-entry--suggestion${item.forHunter ? ' list-entry--for-hunter' : ''}`}>
                  <div className="list-entry-main">
                    <span className="list-entry-content">{item.content}</span>
                    {item.forHunter && (
                      <span className="list-entry-hunter-tag">For Hunter</span>
                    )}
                  </div>
                  <div className="list-entry-meta">
                    <span
                      className="list-entry-host"
                      style={getHostColor(item.hostName) ? { color: getHostColor(item.hostName) } : undefined}
                    >
                      {crown(item.hostName)}
                    </span>
                    <span className="list-entry-time">{formatTime(item.timestamp)}</span>
                    {item.hostName === userName && (
                      <button
                        className="list-delete-btn"
                        onClick={() => handleDelete(item.id)}
                        title="Delete"
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
