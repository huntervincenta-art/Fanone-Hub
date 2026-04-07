import React, { useState, useEffect, useRef } from 'react';
import { getHostColor } from '../config/hosts';

const TrashIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M2 4h12M5 4V2.5a.5.5 0 01.5-.5h5a.5.5 0 01.5.5V4M6.5 7v5M9.5 7v5M3.5 4l.75 8.25a.75.75 0 00.75.75h6a.75.75 0 00.75-.75L12.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const LIKED_KEY = 'team_hub_liked_messages';

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Render post text with @mentions highlighted
function renderMentions(text, currentUser) {
  const parts = text.split(/(@[A-Za-z]+)/g);
  return parts.map((part, i) => {
    if (/^@[A-Za-z]+$/.test(part)) {
      const name = part.slice(1).toLowerCase();
      const isMe = currentUser && name === currentUser.toLowerCase();
      return (
        <span
          key={i}
          className={`msg-mention${isMe ? ' msg-mention--me' : ''}`}
        >
          {part}
        </span>
      );
    }
    return part;
  });
}

const DM_EXCLUDED = new Set(['omar']);

const crown = name => name === 'Hunter' ? <>{name} 👑</> : name;

export default function MessagingPanel({ passphrase, userName, initialTab }) {
  const [msgTab, setMsgTab] = useState(initialTab || 'posts');

  // Log pathname on mount so we can verify React Router received the correct path
  useEffect(() => {
    console.log('[MessagingPanel] mounted — pathname:', window.location.pathname, '| initialTab:', initialTab || 'posts');
  }, []);

  // ── Posts tab state ────────────────────────────────
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [postStatus, setPostStatus] = useState(null);
  const [postError, setPostError] = useState('');
  const [likedIds, setLikedIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(LIKED_KEY) || '[]')); }
    catch { return new Set(); }
  });

  // @ mention state
  const [mentionVisible, setMentionVisible] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const msgInputRef  = useRef(null);
  const dmInputRef   = useRef(null);

  const MAX_MSG_LEN = 500;
  // ~8 rows: 8 * 22px line-height + 16px padding
  const MAX_TEXTAREA_HEIGHT = 192;

  const resizeTextarea = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT) + 'px';
  };

  // ── Hunter's Updates tab state ────────────────────
  const [hunterUpdates, setHunterUpdates] = useState([]);
  const [hunterUpdateText, setHunterUpdateText] = useState('');
  const [hunterUpdateStatus, setHunterUpdateStatus] = useState(null); // null | 'loading' | 'success' | 'error'
  const [hunterUpdateError, setHunterUpdateError] = useState('');
  const hunterUpdateRef = useRef(null);

  // ── DM tab state ───────────────────────────────────
  const [dmPeer, setDmPeer] = useState(null);       // selected conversation partner
  const [dmThread, setDmThread] = useState([]);
  const [dmInput, setDmInput] = useState('');
  const [dmSending, setDmSending] = useState(false);
  const [dmLoading, setDmLoading] = useState(false);
  const [dmUnreadBySender, setDmUnreadBySender] = useState({});
  const dmEndRef = useRef(null);

  const fetchHunterUpdates = () =>
    fetch('/api/hunter-updates', { headers: { 'x-passphrase': passphrase } })
      .then(r => r.ok ? r.json() : [])
      .then(setHunterUpdates)
      .catch(() => {});

  // ── Load users and posts on mount ─────────────────
  useEffect(() => {
    fetch('/api/auth/users')
      .then(r => r.ok ? r.json() : [])
      .then(setAllUsers)
      .catch(() => {});
    fetchPosts();
    if (userName === 'Hunter') fetchHunterUpdates();
  }, [passphrase]);

  // ── Poll unread DM count per sender ───────────────
  useEffect(() => {
    if (!userName) return;
    const fetchUnread = () =>
      fetch(`/api/dm/unread-by-sender?user=${encodeURIComponent(userName)}`, {
        headers: { 'x-passphrase': passphrase },
      })
        .then(r => r.ok ? r.json() : { byPeer: {} })
        .then(data => setDmUnreadBySender(data.byPeer || {}))
        .catch(() => {});
    fetchUnread();
    const id = setInterval(fetchUnread, 15000);
    return () => clearInterval(id);
  }, [userName, passphrase]);

  const fetchPosts = () =>
    fetch('/api/messages', { headers: { 'x-passphrase': passphrase } })
      .then(r => r.ok ? r.json() : [])
      .then(setMessages)
      .catch(() => {});

  // ── @ mention detection ────────────────────────────
  const handleMessageChange = (e) => {
    const val = e.target.value.slice(0, MAX_MSG_LEN);
    setMessage(val);
    resizeTextarea(e.target);

    const lastAt = val.lastIndexOf('@');
    if (lastAt !== -1) {
      const afterAt = val.slice(lastAt + 1);
      if (!afterAt.includes(' ') && afterAt.length <= 20) {
        setMentionQuery(afterAt.toLowerCase());
        setMentionVisible(true);
        return;
      }
    }
    setMentionVisible(false);
  };

  const mentionMatches = allUsers.filter(u =>
    u.toLowerCase() !== (userName || '').toLowerCase() &&
    u.toLowerCase().startsWith(mentionQuery)
  );

  const insertMention = (hostName) => {
    const lastAt = message.lastIndexOf('@');
    const newMsg = message.slice(0, lastAt) + `@${hostName} `;
    setMessage(newMsg);
    setMentionVisible(false);
    msgInputRef.current?.focus();
  };

  // ── Send post ──────────────────────────────────────
  const handleSend = async (e) => {
    e.preventDefault();
    if (!userName || !message.trim()) return;
    setPostStatus('loading');
    setPostError('');
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({ sender: userName, text: message.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to send');
      }
      const newMsg = await res.json();
      setMessages(prev => [newMsg, ...prev]);
      setMessage('');
      if (msgInputRef.current) msgInputRef.current.style.height = 'auto';
      setMentionVisible(false);
      setPostStatus('success');
      setTimeout(() => setPostStatus(null), 2000);
    } catch (err) {
      setPostError(err.message);
      setPostStatus('error');
    }
  };

  // ── Like / delete post ────────────────────────────
  const handleLike = async (id) => {
    const isLiked = likedIds.has(id);
    try {
      const res = await fetch(`/api/messages/${id}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({ action: isLiked ? 'unlike' : 'like' }),
      });
      if (!res.ok) return;
      const { likes } = await res.json();
      const newLiked = new Set(likedIds);
      if (isLiked) newLiked.delete(id); else newLiked.add(id);
      setLikedIds(newLiked);
      localStorage.setItem(LIKED_KEY, JSON.stringify([...newLiked]));
      setMessages(prev => prev.map(m => m.id === id ? { ...m, likes } : m));
    } catch {}
  };

  const handleDeletePost = async (id) => {
    try {
      const res = await fetch(`/api/messages/${id}`, {
        method: 'DELETE',
        headers: { 'x-passphrase': passphrase },
      });
      if (!res.ok) return;
      setMessages(prev => prev.filter(m => m.id !== id));
    } catch {}
  };

  // ── Hunter's Updates submit ───────────────────────
  const handlePostUpdate = async (e) => {
    e.preventDefault();
    if (!hunterUpdateText.trim()) return;
    setHunterUpdateStatus('loading');
    setHunterUpdateError('');
    try {
      const res = await fetch('/api/hunter-updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({ user: userName, text: hunterUpdateText.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to post');
      }
      const newUpdate = await res.json();
      setHunterUpdates(prev => [newUpdate, ...prev]);
      setHunterUpdateText('');
      if (hunterUpdateRef.current) hunterUpdateRef.current.style.height = 'auto';
      setHunterUpdateStatus('success');
      setTimeout(() => setHunterUpdateStatus(null), 2000);
    } catch (err) {
      setHunterUpdateError(err.message);
      setHunterUpdateStatus('error');
    }
  };

  // ── DM helpers ────────────────────────────────────
  const openDM = async (peer) => {
    setDmPeer(peer);
    setDmThread([]);
    setDmLoading(true);
    // Optimistically clear this peer's badge immediately
    setDmUnreadBySender(prev => { const next = { ...prev }; delete next[peer]; return next; });
    try {
      const res = await fetch(
        `/api/dm?user=${encodeURIComponent(userName)}&peer=${encodeURIComponent(peer)}`,
        { headers: { 'x-passphrase': passphrase } }
      );
      if (res.ok) {
        setDmThread(await res.json());
        // Refresh per-sender unread counts after marking thread as read
        fetch(`/api/dm/unread-by-sender?user=${encodeURIComponent(userName)}`, {
          headers: { 'x-passphrase': passphrase },
        })
          .then(r => r.ok ? r.json() : { byPeer: {} })
          .then(data => setDmUnreadBySender(data.byPeer || {}))
          .catch(() => {});
      }
    } catch {}
    setDmLoading(false);
  };

  useEffect(() => {
    if (dmEndRef.current) dmEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [dmThread]);

  const sendDM = async (e) => {
    e.preventDefault();
    if (!dmInput.trim() || !dmPeer || !userName) return;
    setDmSending(true);
    try {
      const res = await fetch('/api/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({ sender: userName, recipient: dmPeer, text: dmInput.trim() }),
      });
      if (res.ok) {
        const dm = await res.json();
        setDmThread(prev => [...prev, dm]);
        setDmInput('');
        if (dmInputRef.current) dmInputRef.current.style.height = 'auto';
      }
    } catch {}
    setDmSending(false);
  };

  // Hosts to show in DM list (everyone except current user and excluded users)
  const dmHosts = allUsers.filter(u =>
    u.toLowerCase() !== (userName || '').toLowerCase() &&
    !DM_EXCLUDED.has(u.toLowerCase())
  );

  // Total unread across all conversations
  const dmUnread = Object.values(dmUnreadBySender).reduce((a, b) => a + b, 0);

  return (
    <div className="msg-panel">
      {/* ── Tab bar ── */}
      <div className="msg-tab-bar">
        <button
          className={`msg-tab-btn${msgTab === 'posts' ? ' msg-tab-btn--active' : ''}`}
          onClick={() => setMsgTab('posts')}
        >
          Posts
        </button>
        <button
          className={`msg-tab-btn${msgTab === 'dm' ? ' msg-tab-btn--active' : ''}`}
          onClick={() => { setMsgTab('dm'); setDmPeer(null); }}
        >
          Direct Messages
          {dmUnread > 0 && <span className="msg-unread-badge">{dmUnread}</span>}
        </button>
        {userName === 'Hunter' && (
          <button
            className={`msg-tab-btn${msgTab === 'hunterUpdates' ? ' msg-tab-btn--active' : ''}`}
            onClick={() => setMsgTab('hunterUpdates')}
          >
            Hunter's Updates
          </button>
        )}
      </div>

      {/* ══ Posts tab ══ */}
      {msgTab === 'posts' && (
        <div>
          <form className="form" onSubmit={handleSend}>
            <div className="msg-row msg-row--textarea" style={{ position: 'relative' }}>
              <textarea
                ref={msgInputRef}
                className="msg-input msg-textarea"
                rows={3}
                value={message}
                onChange={handleMessageChange}
                onKeyDown={e => {
                  if (mentionVisible && e.key === 'Escape') {
                    e.preventDefault();
                    setMentionVisible(false);
                  }
                }}
                onBlur={() => setTimeout(() => setMentionVisible(false), 150)}
                placeholder={`Post as ${userName || 'you'}… Use @ to mention`}
              />
              <button
                className="btn btn-primary"
                type="submit"
                disabled={postStatus === 'loading' || !message.trim() || !userName}
              >
                {postStatus === 'loading' ? 'Sending…' : 'Post'}
              </button>

              {/* @ mention dropdown */}
              {mentionVisible && mentionMatches.length > 0 && (
                <div className="mention-dropdown">
                  {mentionMatches.map(u => (
                    <button
                      key={u}
                      className="mention-option"
                      type="button"
                      onMouseDown={() => insertMention(u)}
                      style={getHostColor(u) ? { color: getHostColor(u) } : undefined}
                    >
                      @{u}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className={`msg-char-counter${message.length >= MAX_MSG_LEN - 50 ? ' msg-char-counter--warn' : ''}`}>
              {message.length} / {MAX_MSG_LEN}
            </div>
            {postStatus === 'error' && <div className="alert alert-error">{postError}</div>}
            {postStatus === 'success' && <div className="alert alert-success">Posted!</div>}
          </form>

          {messages.length > 0 && (
            <div className="msg-log">
              {messages.map(msg => (
                <div className={`msg-item${msg.sender === 'Hunter' ? ' msg-item--hunter' : ''}`} key={msg.id}>
                  <div className="msg-item-header">
                    <span
                      className="msg-sender host-name"
                      style={getHostColor(msg.sender) ? { color: getHostColor(msg.sender) } : undefined}
                    >
                      {crown(msg.sender)}
                    </span>
                    <span className="msg-time">{formatTime(msg.timestamp)}</span>
                  </div>
                  <div className="msg-text">{renderMentions(msg.text, userName)}</div>
                  <div className="msg-item-actions">
                    <button
                      className={`msg-like-btn${likedIds.has(msg.id) ? ' msg-like-btn--liked' : ''}`}
                      onClick={() => handleLike(msg.id)}
                      title={likedIds.has(msg.id) ? 'Unlike' : 'Like'}
                    >
                      👍{msg.likes > 0 && <span className="msg-like-count">{msg.likes}</span>}
                    </button>
                    {userName && msg.sender === userName && (
                      <button className="msg-delete-btn" onClick={() => handleDeletePost(msg.id)} title="Delete post">
                        <TrashIcon />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ Direct Messages tab ══ */}
      {msgTab === 'dm' && !dmPeer && (
        <div className="dm-host-list">
          <p className="dm-host-list-label">Start or continue a conversation:</p>
          {dmHosts.map(host => (
            <button
              key={host}
              className="dm-host-item"
              onClick={() => openDM(host)}
              style={getHostColor(host) ? { '--host-color': getHostColor(host) } : undefined}
            >
              <span className="dm-host-name-group">
                <span
                  className="dm-host-name"
                  style={getHostColor(host) ? { color: getHostColor(host) } : undefined}
                >
                  {crown(host)}
                </span>
                {dmUnreadBySender[host] > 0 && (
                  <span className="msg-unread-badge">{dmUnreadBySender[host]}</span>
                )}
              </span>
              <span className="dm-host-arrow">›</span>
            </button>
          ))}
          {dmHosts.length === 0 && (
            <div className="dm-empty">No other hosts found.</div>
          )}
        </div>
      )}

      {/* ══ Hunter's Updates tab ══ */}
      {msgTab === 'hunterUpdates' && userName === 'Hunter' && (
        <div>
          <form className="form" onSubmit={handlePostUpdate}>
            <div className="msg-row msg-row--textarea">
              <textarea
                ref={hunterUpdateRef}
                className="msg-input msg-textarea"
                rows={3}
                value={hunterUpdateText}
                onChange={e => {
                  const val = e.target.value.slice(0, MAX_MSG_LEN);
                  setHunterUpdateText(val);
                  resizeTextarea(e.target);
                }}
                placeholder="Write an update for the team…"
              />
              <button
                className="btn btn-primary"
                type="submit"
                disabled={hunterUpdateStatus === 'loading' || !hunterUpdateText.trim()}
              >
                {hunterUpdateStatus === 'loading' ? 'Posting…' : 'Post Update'}
              </button>
            </div>
            <div className={`msg-char-counter${hunterUpdateText.length >= MAX_MSG_LEN - 50 ? ' msg-char-counter--warn' : ''}`}>
              {hunterUpdateText.length} / {MAX_MSG_LEN}
            </div>
            {hunterUpdateStatus === 'error' && <div className="alert alert-error">{hunterUpdateError}</div>}
            {hunterUpdateStatus === 'success' && <div className="alert alert-success">Posted!</div>}
          </form>

          {hunterUpdates.length > 0 && (
            <div className="msg-log">
              {hunterUpdates.map(u => (
                <div className="msg-item msg-item--hunter" key={u.id}>
                  <div className="msg-item-header">
                    <span className="msg-sender host-name" style={{ color: 'var(--accent)' }}>
                      Hunter 👑
                    </span>
                    <span className="msg-time">{formatTime(u.createdAt)}</span>
                  </div>
                  <div className="msg-text">{u.text}</div>
                </div>
              ))}
            </div>
          )}
          {hunterUpdates.length === 0 && (
            <div className="dm-empty">No updates posted yet.</div>
          )}
        </div>
      )}

      {msgTab === 'dm' && dmPeer && (
        <div className="dm-thread-wrap">
          <div className="dm-thread-header">
            <button className="dm-back-btn" onClick={() => setDmPeer(null)}>
              <BackIcon /> Back
            </button>
            <span
              className="dm-thread-peer"
              style={getHostColor(dmPeer) ? { color: getHostColor(dmPeer) } : undefined}
            >
              {crown(dmPeer)}
            </span>
          </div>

          <div className="dm-thread">
            {dmLoading && <div className="dm-loading">Loading…</div>}
            {!dmLoading && dmThread.length === 0 && (
              <div className="dm-empty">No messages yet. Say something!</div>
            )}
            {dmThread.map(dm => {
              const isMine = dm.sender === userName;
              return (
                <div key={dm.id} className={`dm-bubble-wrap${isMine ? ' dm-bubble-wrap--mine' : ''}`}>
                  <div className={`dm-bubble${isMine ? ' dm-bubble--mine' : ' dm-bubble--theirs'}${dm.sender === 'Hunter' ? ' dm-bubble--hunter' : ''}`}>
                    {dm.text}
                  </div>
                  <div className="dm-bubble-meta">
                    {!isMine && (
                      <span
                        className="dm-bubble-sender"
                        style={getHostColor(dm.sender) ? { color: getHostColor(dm.sender) } : undefined}
                      >
                        {crown(dm.sender)}
                      </span>
                    )}
                    <span className="dm-bubble-time">{formatTime(dm.timestamp)}</span>
                  </div>
                </div>
              );
            })}
            <div ref={dmEndRef} />
          </div>

          <form className="dm-input-row dm-input-row--textarea" onSubmit={sendDM}>
            <div className="dm-input-wrap">
              <textarea
                ref={dmInputRef}
                className="msg-input msg-textarea"
                rows={3}
                value={dmInput}
                onChange={e => {
                  const val = e.target.value.slice(0, MAX_MSG_LEN);
                  setDmInput(val);
                  resizeTextarea(e.target);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!dmSending && dmInput.trim()) sendDM(e);
                  }
                }}
                placeholder={`Message ${dmPeer}… (Enter to send, Shift+Enter for new line)`}
                disabled={dmSending}
              />
              <div className={`msg-char-counter${dmInput.length >= MAX_MSG_LEN - 50 ? ' msg-char-counter--warn' : ''}`}>
                {dmInput.length} / {MAX_MSG_LEN}
              </div>
            </div>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={dmSending || !dmInput.trim()}
            >
              {dmSending ? '…' : 'Send'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
