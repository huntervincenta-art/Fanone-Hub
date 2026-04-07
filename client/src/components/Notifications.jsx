import React, { useState } from 'react';

const TEAM_TOPIC = 'OD-notifications';

const PERSONAL_TOPICS = [
  { name: 'Kevin',   topic: 'OD-Kevin' },
  { name: 'John',    topic: 'OD-John' },
  { name: 'Dan',     topic: 'OD-Dan' },
  { name: 'Vincent', topic: 'OD-Vincent' },
  { name: 'David',   topic: 'OD-David' },
  { name: 'Hunter',  topic: 'OD-Hunter' },
];

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button className="notif-copy-btn" onClick={copy}>
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export default function Notifications() {
  const [selectedName, setSelectedName] = useState('');
  const personalEntry = PERSONAL_TOPICS.find(t => t.name === selectedName);

  return (
    <div className="notif-page">
      <h2>Get Notifications</h2>
      <p className="notif-intro">
        Team Hub sends push notifications via <strong>ntfy.sh</strong> — a free app that delivers
        alerts directly to your phone. You need to subscribe to <strong>two topics</strong>: one for
        team-wide alerts and one for your personal messages.
      </p>

      {/* Step 1 */}
      <div className="notif-section">
        <h3>Step 1 — Install ntfy</h3>
        <div className="notif-platform-list">
          <a className="notif-platform-link" href="https://apps.apple.com/us/app/ntfy/id1625396347" target="_blank" rel="noreferrer">
            iOS (App Store)
          </a>
          <a className="notif-platform-link" href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noreferrer">
            Android (Google Play)
          </a>
          <a className="notif-platform-link" href="https://ntfy.sh" target="_blank" rel="noreferrer">
            Web (ntfy.sh)
          </a>
        </div>
      </div>

      {/* Step 2 */}
      <div className="notif-section">
        <h3>Step 2 — How to subscribe</h3>
        <ol className="notif-steps">
          <li>Open the ntfy app and tap the <strong>+</strong> button.</li>
          <li>Make sure the server is set to <code>ntfy.sh</code>.</li>
          <li>Type or paste the topic name, then tap <strong>Subscribe</strong>.</li>
          <li>Repeat for both topics below.</li>
        </ol>
      </div>

      {/* Step 3a — Team topic */}
      <div className="notif-section">
        <div className="notif-step-label">
          <span className="notif-step-badge">3a</span>
          <h3>Subscribe to the team topic</h3>
        </div>
        <p className="notif-sub-label">
          This topic sends team-wide alerts — new story announcements, flagged stories, and login
          security notices. <strong>Everyone needs this one.</strong>
        </p>
        <div className="notif-big-topic-box">
          <span className="notif-big-topic-text">{TEAM_TOPIC}</span>
          <CopyButton text={TEAM_TOPIC} />
        </div>
      </div>

      {/* Step 3b — Personal topic */}
      <div className="notif-section">
        <div className="notif-step-label">
          <span className="notif-step-badge">3b</span>
          <h3>Subscribe to your personal topic</h3>
        </div>
        <p className="notif-sub-label">
          Your personal topic delivers notifications only to you — @mentions in posts, direct
          messages, and thumbs up alerts on your stories. Select your name to see your topic.
        </p>

        <div className="notif-name-select-row">
          <label className="notif-name-label" htmlFor="notif-name-select">Who are you?</label>
          <select
            id="notif-name-select"
            className="notif-name-select"
            value={selectedName}
            onChange={e => setSelectedName(e.target.value)}
          >
            <option value="">— Select your name —</option>
            {PERSONAL_TOPICS.map(({ name }) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        {personalEntry ? (
          <div className="notif-big-topic-box notif-big-topic-box--personal">
            <span className="notif-big-topic-text">{personalEntry.topic}</span>
            <CopyButton text={personalEntry.topic} />
          </div>
        ) : (
          <div className="notif-personal-placeholder">
            Select your name above to see your personal topic.
          </div>
        )}

        <details className="notif-all-topics">
          <summary className="notif-all-topics-summary">Show all personal topics</summary>
          <div className="notif-topic-list">
            {PERSONAL_TOPICS.map(({ name, topic }) => (
              <div className="notif-topic-row" key={name}>
                <span className="notif-topic-name">{name}</span>
                <code className="notif-topic-code">{topic}</code>
                <CopyButton text={topic} />
              </div>
            ))}
          </div>
        </details>
      </div>

      {/* What you'll receive */}
      <div className="notif-section">
        <h3>What you'll receive</h3>
        <div className="notif-receive-grid">
          <div className="notif-receive-card notif-receive-card--team">
            <div className="notif-receive-card-label">Team topic</div>
            <ul className="notif-what-list">
              <li><strong>New stories available</strong> — unclaimed stories ready to pick up</li>
              <li><strong>Story flagged</strong> — a story was flagged for review</li>
              <li><strong>Needs Attention</strong> — a host flagged their own story for Hunter</li>
            </ul>
          </div>
          <div className="notif-receive-card notif-receive-card--personal">
            <div className="notif-receive-card-label">Personal topic</div>
            <ul className="notif-what-list">
              <li><strong>@mention</strong> — someone tagged you in a post</li>
              <li><strong>Direct message</strong> — a private message from a teammate</li>
              <li><strong>Hunter is on it!</strong> — Hunter marked your story with a thumbs up</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
