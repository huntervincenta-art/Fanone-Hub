import React, { useState, useEffect, useRef } from 'react';
import { HOSTS, getHostColor } from '../config/hosts';

const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M2 4h12M5 4V2.5a.5.5 0 01.5-.5h5a.5.5 0 01.5.5V4M6.5 7v5M9.5 7v5M3.5 4l.75 8.25a.75.75 0 00.75.75h6a.75.75 0 00.75-.75L12.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const ChatIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

const ChevronIcon = ({ open }) => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true"
    style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', flexShrink: 0 }}>
    <path d="M5 3l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const ADMIN_USER = 'Hunter';

function isURL(str) {
  try { return Boolean(new URL(str)); } catch { return false; }
}

function toImageSrc(url) {
  if (!url) return null;
  const driveMatch = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=view&)?id=)([a-zA-Z0-9_-]+)/);
  if (driveMatch) return `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w400`;
  return url;
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatSubmittedAt(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (isNaN(d)) return null;
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const tz = d.toLocaleTimeString([], { timeZoneName: 'short' }).split(' ').pop();
  return `${time} ${tz}`;
}

function formatCommentTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d)) return '';
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function stripAiContent(text) {
  if (!text) return '';
  return text
    .replace(/\[AI Angle\][\s\S]*?(?=\[|$)/g, '')
    .replace(/\[Suggested Headlines\][\s\S]*?(?=\[|$)/g, '')
    .trim();
}

export default function StoryFeed({ stories, loading, error, passphrase, onRefresh, userName, onSubmitClick, lastUpdated }) {
  console.log('[StoryFeed] logged-in userName:', JSON.stringify(userName), '| ADMIN_USER:', JSON.stringify(ADMIN_USER), '| match:', userName === ADMIN_USER);
  const [hubTab, setHubTab] = useState('stories');
  const [users, setUsers] = useState([]);
  const [claimSelections, setClaimSelections] = useState({});
  const [claimingIds, setClaimingIds] = useState(new Set());
  const [editingId, setEditingId] = useState(null);
  const [editFields, setEditFields] = useState({});
  const [editStatus, setEditStatus] = useState(null);
  const [editError, setEditError] = useState('');
  const [notifying, setNotifying] = useState(false);
  const [trainingModal, setTrainingModal] = useState(null);
  const [trainingFields, setTrainingFields] = useState({ url: '', headline: '', reasoning: '' });
  const [trainingStatus, setTrainingStatus] = useState('idle');
  const [trainingError, setTrainingError] = useState('');
  const [trainedStoryIds, setTrainedStoryIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('trained_stories') || '[]')); }
    catch { return new Set(); }
  });
  const [newStoryIds, setNewStoryIds] = useState(new Set());
  const prevStoryIdsRef = useRef(null);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Comment threads
  const [expandedComments, setExpandedComments] = useState(new Set());
  const [commentsData, setCommentsData] = useState({});
  const [commentInputs, setCommentInputs] = useState({});
  const [commentSubmitting, setCommentSubmitting] = useState(new Set());
  const [commentCounts, setCommentCounts] = useState({});
  const [commentDeleting, setCommentDeleting] = useState(new Set());

  useEffect(() => {
    fetch('/api/auth/users')
      .then(r => r.ok ? r.json() : [])
      .then(setUsers)
      .catch(() => {});
  }, []);

  // Fetch comment counts for badge display — re-runs on every story refresh
  useEffect(() => {
    fetch('/api/stories/comment-counts', { headers: { 'x-passphrase': passphrase } })
      .then(r => r.ok ? r.json() : {})
      .then(setCommentCounts)
      .catch(() => {});
  }, [stories]);

  // Track newly added stories for flash animation
  useEffect(() => {
    const currentIds = new Set(stories.map(s => s.id));
    if (prevStoryIdsRef.current === null) {
      prevStoryIdsRef.current = currentIds;
      return;
    }
    const added = [...currentIds].filter(id => !prevStoryIdsRef.current.has(id));
    prevStoryIdsRef.current = currentIds;
    if (added.length === 0) return;
    setNewStoryIds(new Set(added));
    const t = setTimeout(() => setNewStoryIds(new Set()), 1200);
    return () => clearTimeout(t);
  }, [stories]);

  // ── Search filter ───────────────────────────────────
  const matchesSearch = (story) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (story.headline || '').toLowerCase().includes(q) ||
      (story.host || '').toLowerCase().includes(q) ||
      (story.additionalLinks || '').toLowerCase().includes(q)
    );
  };

  const claimed = stories
    .filter(s => s.claimed)
    .filter(matchesSearch)
    .slice()
    .sort((a, b) => {
      if (a.flagged !== b.flagged) return a.flagged ? -1 : 1;
      return (b.date || '').localeCompare(a.date || '');
    });

  const unclaimed = stories
    .filter(s => !s.claimed)
    .filter(matchesSearch)
    .slice()
    .sort((a, b) => {
      if (a.flagged !== b.flagged) return a.flagged ? -1 : 1;
      if (a.breaking !== b.breaking) return a.breaking ? -1 : 1;
      return (b.date || '').localeCompare(a.date || '');
    });

  // ── Claim ──────────────────────────────────────────
  const handleClaim = async (id, directHost) => {
    const host = directHost || claimSelections[id];
    if (!host) return;
    setClaimingIds(prev => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/stories/${id}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({ host, user: userName }),
      });
      if (res.ok) {
        setClaimSelections(prev => { const n = { ...prev }; delete n[id]; return n; });
        onRefresh();
      }
    } catch {}
    finally {
      setClaimingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  // ── Notify team ─────────────────────────────────────
  const handleNotifyAvailable = async () => {
    setNotifying(true);
    try {
      await fetch('/api/stories/notify-available', {
        method: 'POST',
        headers: { 'x-passphrase': passphrase },
      });
    } catch {}
    finally { setNotifying(false); }
  };

  // ── Delete ───────────────────────────────────────────
  const handleDelete = async (id) => {
    try {
      const res = await fetch(`/api/stories/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({ user: userName }),
      });
      if (res.ok) onRefresh();
    } catch {}
  };

  // ── Flag / Unflag ─────────────────────────────────────
  const handleFlag = async (id) => {
    try {
      const res = await fetch(`/api/stories/${id}/flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({ user: userName }),
      });
      if (res.ok) onRefresh();
    } catch {}
  };

  const handleUnflag = async (id) => {
    try {
      const res = await fetch(`/api/stories/${id}/unflag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({ user: userName }),
      });
      if (res.ok) onRefresh();
    } catch {}
  };

  const handleApprove = async (id) => {
    try {
      const res = await fetch(`/api/stories/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({ user: userName }),
      });
      if (res.ok) onRefresh();
    } catch {}
  };

  const handleDecline = async (id) => {
    try {
      const res = await fetch(`/api/stories/${id}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({ user: userName }),
      });
      if (res.ok) onRefresh();
    } catch {}
  };

  // ── Alert ─────────────────────────────────────────
  const [alertingIds, setAlertingIds] = useState(new Set());
  const [alertedIds, setAlertedIds] = useState(new Set());
  const [workingOnIds, setWorkingOnIds] = useState(new Set());

  const handleAlert = async (story) => {
    if (story.host !== userName) return;
    const id = story.id;
    setAlertingIds(prev => new Set(prev).add(id));
    try {
      await fetch(`/api/stories/${id}/alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({ user: userName, host: story.host }),
      });
      setAlertedIds(prev => new Set(prev).add(id));
      setTimeout(() => setAlertedIds(prev => { const n = new Set(prev); n.delete(id); return n; }), 3000);
      onRefresh();
    } catch {}
    finally {
      setAlertingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  const handleWorkingOnIt = async (id) => {
    setWorkingOnIds(prev => new Set(prev).add(id));
    try {
      await fetch(`/api/stories/${id}/working-on-it`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({ user: userName }),
      });
      onRefresh();
    } catch {}
    finally {
      setWorkingOnIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  // ── Working / Done (Hunter only) ──────────────────
  const [expandedThumbnails, setExpandedThumbnails] = useState(new Set());

  const toggleThumbnail = (id) => setExpandedThumbnails(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const handleWorking = async (id) => {
    try {
      const res = await fetch(`/api/stories/${id}/working`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({ user: userName }),
      });
      if (res.ok) onRefresh();
    } catch {}
  };

  const handleDone = async (id) => {
    try {
      const res = await fetch(`/api/stories/${id}/done`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({ user: userName }),
      });
      if (res.ok) onRefresh();
    } catch {}
  };

  // ── Duplicate ─────────────────────────────────────
  const [duplicatingIds, setDuplicatingIds] = useState(new Set());

  const handleDuplicate = async (story) => {
    if (!window.confirm('Flag this story as a duplicate?')) return;
    const id = story.id;
    setDuplicatingIds(prev => new Set(prev).add(id));
    try {
      await fetch(`/api/stories/${id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({ user: userName }),
      });
      onRefresh();
    } catch {}
    finally {
      setDuplicatingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  const handleUnduplicate = async (id) => {
    try {
      await fetch(`/api/stories/${id}/unduplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({ user: userName }),
      });
      onRefresh();
    } catch {}
  };

  // ── Comments ───────────────────────────────────────
  const fetchComments = async (storyId) => {
    try {
      const res = await fetch(`/api/stories/${storyId}/comments`, {
        headers: { 'x-passphrase': passphrase },
      });
      if (res.ok) {
        const data = await res.json();
        setCommentsData(prev => ({ ...prev, [storyId]: data }));
      }
    } catch {}
  };

  const toggleComments = async (storyId) => {
    const isExpanded = expandedComments.has(storyId);
    if (isExpanded) {
      setExpandedComments(prev => { const n = new Set(prev); n.delete(storyId); return n; });
    } else {
      setExpandedComments(prev => new Set(prev).add(storyId));
      if (!commentsData[storyId]) {
        await fetchComments(storyId);
      }
    }
  };

  const submitComment = async (storyId) => {
    const text = (commentInputs[storyId] || '').trim();
    if (!text) return;
    setCommentSubmitting(prev => new Set(prev).add(storyId));
    try {
      const res = await fetch(`/api/stories/${storyId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({ author: userName, text }),
      });
      if (res.ok) {
        setCommentInputs(prev => ({ ...prev, [storyId]: '' }));
        setCommentCounts(prev => ({ ...prev, [storyId]: (prev[storyId] || 0) + 1 }));
        await fetchComments(storyId);
      }
    } catch {}
    finally {
      setCommentSubmitting(prev => { const n = new Set(prev); n.delete(storyId); return n; });
    }
  };

  const deleteComment = async (storyId, commentId) => {
    setCommentDeleting(prev => new Set(prev).add(commentId));
    try {
      const res = await fetch(`/api/stories/${storyId}/comments/${commentId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({ user: userName }),
      });
      if (res.ok) {
        setCommentCounts(prev => ({ ...prev, [storyId]: Math.max(0, (prev[storyId] || 0) - 1) }));
        await fetchComments(storyId);
      }
    } catch {}
    finally {
      setCommentDeleting(prev => { const n = new Set(prev); n.delete(commentId); return n; });
    }
  };

  // ── Edit ──────────────────────────────────────────────
  const startEdit = (story) => {
    setEditingId(story.id);
    setEditFields({
      date: story.date,
      host: story.host,
      headline: story.headline,
      link: story.link || '',
      additionalLinks: story.additionalLinks || '',
      angleClarity: story.angleClarity || '',
      breaking: story.breaking || false,
      thumbnailUrl: story.thumbnailUrl || '',
    });
    setEditStatus(null);
    setEditError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditFields({});
    setEditStatus(null);
  };

  const setField = (key) => (e) => setEditFields(f => ({ ...f, [key]: e.target.value }));
  const setCheck = (key) => (e) => setEditFields(f => ({ ...f, [key]: e.target.checked }));

  const handleSave = async (id) => {
    setEditStatus('loading');
    setEditError('');
    try {
      const res = await fetch(`/api/stories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify(editFields),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Save failed');
      }
      setEditingId(null);
      setEditFields({});
      onRefresh();
    } catch (err) {
      setEditError(err.message);
      setEditStatus('error');
    }
  };

  // ── Training data ─────────────────────────────────────
  const openTrainingModal = (story) => {
    setTrainingModal(story);
    setTrainingFields({ url: story.link || '', headline: story.headline || '', reasoning: '' });
    setTrainingStatus('idle');
    setTrainingError('');
  };

  const closeTrainingModal = () => {
    setTrainingModal(null);
    setTrainingStatus('idle');
    setTrainingError('');
  };

  const submitTrainingData = async () => {
    setTrainingStatus('loading');
    setTrainingError('');
    try {
      const res = await fetch('/api/training-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body: JSON.stringify({ url: trainingFields.url, headline: trainingFields.headline, reasoning: trainingFields.reasoning, user: userName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Submission failed');
      }
      setTrainingStatus('success');
      if (trainingModal?.id) {
        setTrainedStoryIds(prev => {
          const next = new Set(prev);
          next.add(trainingModal.id);
          localStorage.setItem('trained_stories', JSON.stringify([...next]));
          return next;
        });
      }
      setTimeout(closeTrainingModal, 1500);
    } catch (err) {
      setTrainingError(err.message);
      setTrainingStatus('error');
    }
  };

  if (error) {
    return <div className="alert alert-error" style={{ margin: '1.5rem' }}>{error}</div>;
  }

  // ── Comment thread row renderer ────────────────────
  const renderCommentThread = (storyId, colSpan) => {
    if (!expandedComments.has(storyId)) return null;
    const comments = commentsData[storyId];
    const input = commentInputs[storyId] || '';
    const submitting = commentSubmitting.has(storyId);
    return (
      <tr className="hub-row-comments">
        <td colSpan={colSpan}>
          <div className="hub-comment-thread">
            {!comments ? (
              <div className="hub-comment-loading">Loading…</div>
            ) : comments.length === 0 ? (
              <div className="hub-comment-empty">No comments yet. Be the first.</div>
            ) : (
              <div className="hub-comment-list">
                {comments.map(c => (
                  <div className="hub-comment" key={c.id}>
                    <div className="hub-comment-header">
                      <span className="hub-comment-author">{c.author}</span>
                      <span className="hub-comment-time">{formatCommentTime(c.timestamp)}</span>
                      {c.author === userName && (
                        <button
                          className="hub-comment-delete"
                          onClick={() => deleteComment(storyId, c.id)}
                          disabled={commentDeleting.has(c.id)}
                          title="Delete comment"
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </div>
                    <div className="hub-comment-text">{c.text}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="hub-comment-form">
              <input
                className="hub-comment-input"
                type="text"
                placeholder="Add a comment…"
                value={input}
                onChange={e => setCommentInputs(prev => ({ ...prev, [storyId]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(storyId); } }}
                disabled={submitting}
              />
              <button
                className="hub-comment-submit"
                onClick={() => submitComment(storyId)}
                disabled={submitting || !input.trim()}
              >
                {submitting ? '…' : 'Post'}
              </button>
            </div>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="hub-tables">

      {/* ── Tab bar ── */}
      <div className="hub-tab-bar">
        <button
          className={`hub-tab-btn${hubTab === 'stories' ? ' hub-tab-btn--active' : ''}`}
          onClick={() => setHubTab('stories')}
        >
          Stories
          <span className="hub-tab-count">{claimed.length}</span>
        </button>
        <button
          className={`hub-tab-btn${hubTab === 'available' ? ' hub-tab-btn--active' : ''}`}
          onClick={() => setHubTab('available')}
        >
          Available to Claim
          <span className={`hub-tab-count${unclaimed.length > 0 ? ' hub-tab-count--amber' : ''}`}>{unclaimed.length}</span>
        </button>
        <button className="hub-tab-submit" onClick={onSubmitClick}>
          + Add Story
        </button>
      </div>

      {/* ── Search input ── */}
      <div className="hub-search-wrap">
        <input
          className="hub-search-input"
          type="search"
          placeholder="Search stories by title, host, or comments…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button className="hub-search-clear" onClick={() => setSearchQuery('')} aria-label="Clear search">✕</button>
        )}
      </div>

      {/* ── Stories table ── */}
      {hubTab === 'stories' && <div className="hub-section">
        <div className="hub-section-header">
          <div className="hub-section-header-left">
            <span className="hub-section-title">Stories</span>
            <span className="hub-count">{claimed.length}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {lastUpdated && <span className="hub-last-updated">Updated {formatTime(lastUpdated)}</span>}
            <button className="btn-ghost" onClick={onRefresh} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="hub-table-wrap">
          <table className="hub-table">
            <thead>
              <tr>
                <th className="hub-th-date">Date</th>
                <th className="hub-th-title">Title</th>
                <th className="hub-th-host">Host</th>
                <th className="hub-th-actions"></th>
              </tr>
            </thead>
            <tbody>
              {claimed.length === 0 ? (
                <tr>
                  <td colSpan={4} className="hub-table-empty">
                    {loading ? 'Loading…' : searchQuery ? 'No stories match your search.' : 'No stories yet.'}
                  </td>
                </tr>
              ) : claimed.map((story, idx) => (
                <React.Fragment key={story.id}>
                  <tr
                    className={`hub-row${idx % 2 === 1 ? ' hub-row--alt' : ''}${story.flagged ? ' hub-row--flagged' : ''}${editingId === story.id ? ' hub-row--editing' : ''}${newStoryIds.has(story.id) ? ' hub-row--new' : ''}${story.alerted && userName === ADMIN_USER ? ' hub-row--alerted' : ''}${story.duplicate ? ' hub-row--duplicate' : ''}${story.done ? ' hub-row--done' : ''}`}
                    style={getHostColor(story.host) ? { '--host-color': getHostColor(story.host) } : undefined}
                  >
                    <td className="hub-cell-date">{story.date || '—'}</td>
                    <td className="hub-cell-title">
                      <div className="hub-title-wrap">
                        {story.breaking && <span className="hub-badge hub-badge--breaking">Breaking</span>}
                        {story.flagged && <span className="hub-badge hub-badge--flagged">⚑</span>}
                        {story.thumbnailUrl && toImageSrc(story.thumbnailUrl) && (
                          <button
                            className="hub-thumb-toggle"
                            onClick={() => toggleThumbnail(story.id)}
                            title={expandedThumbnails.has(story.id) ? 'Collapse thumbnail' : 'Expand thumbnail'}
                          >
                            <ChevronIcon open={expandedThumbnails.has(story.id)} />
                          </button>
                        )}
                        {story.link && isURL(story.link)
                          ? <a href={story.link} target="_blank" rel="noopener noreferrer" className="hub-title-link">{story.headline}</a>
                          : <span className="hub-title-text">{story.headline}</span>
                        }
                        {story.duplicate && <span className="hub-duplicate-badge">DUPLICATE</span>}
                      </div>
                      {stripAiContent(story.additionalLinks) && (
                        <div className="hub-comments">{stripAiContent(story.additionalLinks)}</div>
                      )}
                      {story.angleClarity && (
                        <div className="hub-angle-clarity">
                          <span className="hub-angle-clarity-label">Angle:</span> {story.angleClarity}
                        </div>
                      )}
                      {formatSubmittedAt(story.timestamp) && (
                        <div className="hub-submit-time">Submitted {formatSubmittedAt(story.timestamp)}</div>
                      )}
                      {story.thumbnailUrl && toImageSrc(story.thumbnailUrl) && expandedThumbnails.has(story.id) && (
                        <a href={story.thumbnailUrl} target="_blank" rel="noopener noreferrer" className="story-thumbnail-link">
                          <img src={toImageSrc(story.thumbnailUrl)} alt="thumbnail" className="story-thumbnail" />
                        </a>
                      )}
                    </td>
                    <td className="hub-cell-host">
                      {story.host
                        ? <span className="host-name" style={getHostColor(story.host) ? { color: getHostColor(story.host) } : undefined}>
                            {story.host}
                            {story.host === ADMIN_USER && <span className="host-admin-badge" title="Admin">ADMIN</span>}
                          </span>
                        : '—'}
                    </td>
                    <td className="hub-cell-actions">
                      {/* Working / Done — Hunter only */}
                      {userName === ADMIN_USER && (
                        <>
                          <button
                            className={`hub-action-btn hub-action-btn--working${story.working ? ' hub-action-btn--working-active' : ''}`}
                            onClick={() => handleWorking(story.id)}
                            title="Hunter is packaging this video"
                          >
                            Working
                          </button>
                          <button
                            className={`hub-action-btn hub-action-btn--done${story.done ? ' hub-action-btn--done-active' : ''}`}
                            onClick={() => handleDone(story.id)}
                            title="Hunter has published this video"
                          >
                            Done
                          </button>
                        </>
                      )}
                      {/* Comments toggle with badge */}
                      <span className="hub-comment-btn-wrap">
                        <button
                          className={`hub-action-btn hub-action-btn--comments${expandedComments.has(story.id) ? ' hub-action-btn--comments-open' : ''}`}
                          onClick={() => toggleComments(story.id)}
                          title="Comments"
                          aria-label="Comments"
                        >
                          <ChatIcon />
                        </button>
                        {(commentCounts[story.id] || 0) > 0 && (
                          <span className="hub-comment-badge">{commentCounts[story.id]}</span>
                        )}
                      </span>
                      <button
                        className="hub-action-btn"
                        onClick={() => editingId === story.id ? cancelEdit() : startEdit(story)}
                      >
                        {editingId === story.id ? 'Cancel' : 'Edit'}
                      </button>
                      {story.flagged ? (
                        userName === ADMIN_USER && (
                          <>
                            <button className="hub-action-btn hub-action-btn--approve" onClick={() => handleApprove(story.id)} title="Approve story">
                              Approve
                            </button>
                            <button className="hub-action-btn hub-action-btn--danger" onClick={() => handleDecline(story.id)} title="Decline and delete story">
                              Decline
                            </button>
                          </>
                        )
                      ) : (
                        <button className="hub-action-btn" onClick={() => handleFlag(story.id)} title="Flag for approval">⚑</button>
                      )}
                      {story.host === userName && (
                        <button
                          className={`hub-action-btn hub-action-btn--alert${alertedIds.has(story.id) ? ' hub-action-btn--alert-sent' : ''}`}
                          onClick={() => handleAlert(story)}
                          disabled={alertingIds.has(story.id) || alertedIds.has(story.id) || story.alerted}
                          title="Alert Hunter that your story needs attention"
                        >
                          {alertedIds.has(story.id) || story.alerted ? '✓ Sent' : alertingIds.has(story.id) ? '…' : '🚨'}
                        </button>
                      )}
                      {story.alerted && userName === ADMIN_USER && (
                        <button
                          className="hub-action-btn hub-action-btn--working-on-it"
                          onClick={() => handleWorkingOnIt(story.id)}
                          disabled={workingOnIds.has(story.id)}
                          title="Let the host know you're working on it"
                        >
                          {workingOnIds.has(story.id) ? '…' : 'Working on it'}
                        </button>
                      )}
                      {story.duplicate ? (
                        <button
                          className="hub-action-btn hub-action-btn--unduplicate"
                          onClick={() => handleUnduplicate(story.id)}
                          title="Dismiss duplicate flag"
                        >
                          ⚠️ Dismiss
                        </button>
                      ) : (
                        <button
                          className="hub-action-btn hub-action-btn--duplicate"
                          onClick={() => handleDuplicate(story)}
                          disabled={duplicatingIds.has(story.id)}
                          title="Flag as duplicate"
                        >
                          {duplicatingIds.has(story.id) ? '…' : '⚠️'}
                        </button>
                      )}
                      {userName === ADMIN_USER && (
                        trainedStoryIds.has(story.id)
                          ? <span className="hub-trained-label">✓ Added</span>
                          : <button className="hub-action-btn hub-action-btn--train" onClick={() => openTrainingModal(story)} title="Add to AI Training Data">Train AI</button>
                      )}
                      <button className="hub-action-btn hub-action-btn--danger" onClick={() => handleDelete(story.id)} title="Delete">
                        <TrashIcon />
                      </button>
                    </td>
                  </tr>

                  {editingId === story.id && (
                    <tr className="hub-row-edit">
                      <td colSpan={4}>
                        <div className="hub-edit-form">
                          <div className="form-row">
                            <div className="form-group">
                              <label>Date</label>
                              <input type="date" value={editFields.date} onChange={setField('date')} required />
                            </div>
                            <div className="form-group">
                              <label>Host</label>
                              <select value={editFields.host} onChange={setField('host')}>
                                <option value="">Unassigned</option>
                                {users.map(u => <option key={u} value={u}>{u}</option>)}
                              </select>
                            </div>
                          </div>
                          <div className="form-group">
                            <label>Headline</label>
                            <input type="text" value={editFields.headline} onChange={setField('headline')} required />
                          </div>
                          <div className="form-group">
                            <label>Link</label>
                            <input type="url" value={editFields.link} onChange={setField('link')} />
                          </div>
                          <div className="form-group">
                            <label>Thumbnail URL <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span></label>
                            <input type="url" value={editFields.thumbnailUrl} onChange={setField('thumbnailUrl')} placeholder="https://… or Google Drive share link" />
                          </div>
                          <div className="form-group">
                            <label>Additional Comments</label>
                            <textarea className="form-textarea" value={editFields.additionalLinks} onChange={setField('additionalLinks')} rows={3} />
                          </div>
                          <div className="form-group">
                            <label>Angle Clarity <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span></label>
                            <textarea className="form-textarea" value={editFields.angleClarity} onChange={setField('angleClarity')} rows={3} placeholder="Explain how you angled your video…" maxLength={300} />
                          </div>
                          <div className="form-check-row">
                            <label className="form-check-label">
                              <input type="checkbox" className="form-check-input" checked={editFields.breaking} onChange={setCheck('breaking')} />
                              <span className="form-check-text">Breaking</span>
                            </label>
                          </div>
                          {editStatus === 'error' && <div className="alert alert-error">{editError}</div>}
                          <div className="hub-edit-actions">
                            <button className="btn btn-primary" onClick={() => handleSave(story.id)} disabled={editStatus === 'loading'}>
                              {editStatus === 'loading' ? 'Saving…' : 'Save'}
                            </button>
                            <button className="btn-ghost" onClick={cancelEdit}>Cancel</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}

                  {renderCommentThread(story.id, 4)}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>}

      {/* ── Training Data Modal ── */}
      {trainingModal && (
        <div className="td-modal-overlay" onClick={closeTrainingModal}>
          <div className="td-modal" onClick={e => e.stopPropagation()}>
            <div className="td-modal-header">
              <span className="td-modal-title">Add to Training Data</span>
              <button className="modal-close" onClick={closeTrainingModal}>✕</button>
            </div>
            <div className="td-modal-body">
              <div className="form-group">
                <label>URL</label>
                <input
                  type="url"
                  value={trainingFields.url}
                  onChange={e => setTrainingFields(f => ({ ...f, url: e.target.value }))}
                  placeholder="https://…"
                />
              </div>
              <div className="form-group">
                <label>Headline</label>
                <input
                  type="text"
                  value={trainingFields.headline}
                  onChange={e => setTrainingFields(f => ({ ...f, headline: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Reasoning <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span></label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  value={trainingFields.reasoning}
                  onChange={e => setTrainingFields(f => ({ ...f, reasoning: e.target.value }))}
                  placeholder="Why is this a good training example?"
                />
              </div>
              {trainingStatus === 'error' && <div className="alert alert-error">{trainingError}</div>}
              {trainingStatus === 'success' && <div className="alert alert-success">Added to training data!</div>}
            </div>
            <div className="td-modal-footer">
              <button
                className="btn btn-primary"
                onClick={submitTrainingData}
                disabled={trainingStatus === 'loading' || trainingStatus === 'success' || !trainingFields.url || !trainingFields.headline}
              >
                {trainingStatus === 'loading' ? 'Submitting…' : 'Submit'}
              </button>
              <button className="btn-ghost" onClick={closeTrainingModal}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {hubTab === 'available' && <div className="hub-section">
        <div className="hub-section-header">
          <div className="hub-section-header-left">
            <span className="hub-section-title hub-section-title--amber">Available to Claim</span>
            <span className="hub-count">{unclaimed.length}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {lastUpdated && <span className="hub-last-updated">Updated {formatTime(lastUpdated)}</span>}
            <button className="hub-notify-btn" onClick={handleNotifyAvailable} disabled={notifying}>
              {notifying ? 'Sending…' : 'Notify Team'}
            </button>
          </div>
        </div>

        <div className="hub-table-wrap">
          <table className="hub-table">
            <thead>
              <tr>
                <th className="hub-th-date">Date</th>
                <th className="hub-th-title">Title</th>
                <th className="hub-th-claim">Claim</th>
                <th className="hub-th-actions"></th>
              </tr>
            </thead>
            <tbody>
              {unclaimed.length === 0 ? (
                <tr>
                  <td colSpan={4} className="hub-table-empty">
                    {loading ? 'Loading…' : searchQuery ? 'No stories match your search.' : 'No stories available.'}
                  </td>
                </tr>
              ) : unclaimed.map((story, idx) => (
                <React.Fragment key={story.id}>
                  <tr
                    className={`hub-row${idx % 2 === 1 ? ' hub-row--alt' : ''}${story.flagged ? ' hub-row--flagged' : ''}${newStoryIds.has(story.id) ? ' hub-row--new' : ''}${story.duplicate ? ' hub-row--duplicate' : ''}${story.done ? ' hub-row--done' : ''}`}
                    style={getHostColor(story.host) ? { '--host-color': getHostColor(story.host) } : undefined}
                  >
                    <td className="hub-cell-date">{story.date || '—'}</td>
                    <td className="hub-cell-title">
                      <div className="hub-title-wrap">
                        {story.breaking && <span className="hub-badge hub-badge--breaking">Breaking</span>}
                        {story.flagged && <span className="hub-badge hub-badge--flagged">⚑</span>}
                        {story.thumbnailUrl && toImageSrc(story.thumbnailUrl) && (
                          <button
                            className="hub-thumb-toggle"
                            onClick={() => toggleThumbnail(story.id)}
                            title={expandedThumbnails.has(story.id) ? 'Collapse thumbnail' : 'Expand thumbnail'}
                          >
                            <ChevronIcon open={expandedThumbnails.has(story.id)} />
                          </button>
                        )}
                        {story.link && isURL(story.link)
                          ? <a href={story.link} target="_blank" rel="noopener noreferrer" className="hub-title-link">{story.headline}</a>
                          : <span className="hub-title-text">{story.headline}</span>
                        }
                        {story.duplicate && <span className="hub-duplicate-badge">DUPLICATE</span>}
                      </div>
                      {story.additionalLinks && (
                        <div className="hub-comments">{story.additionalLinks}</div>
                      )}
                      {story.angleClarity && (
                        <div className="hub-angle-clarity">
                          <span className="hub-angle-clarity-label">Angle:</span> {story.angleClarity}
                        </div>
                      )}
                      {formatSubmittedAt(story.timestamp) && (
                        <div className="hub-submit-time">Submitted {formatSubmittedAt(story.timestamp)}</div>
                      )}
                      {story.thumbnailUrl && toImageSrc(story.thumbnailUrl) && expandedThumbnails.has(story.id) && (
                        <a href={story.thumbnailUrl} target="_blank" rel="noopener noreferrer" className="story-thumbnail-link">
                          <img src={toImageSrc(story.thumbnailUrl)} alt="thumbnail" className="story-thumbnail" />
                        </a>
                      )}
                    </td>
                    <td className="hub-cell-claim">
                      <button
                        className="hub-claim-btn"
                        onClick={() => handleClaim(story.id, userName)}
                        disabled={claimingIds.has(story.id)}
                      >
                        {claimingIds.has(story.id) ? '…' : 'Claim'}
                      </button>
                    </td>
                    <td className="hub-cell-actions">
                      {/* Comments toggle with badge */}
                      <span className="hub-comment-btn-wrap">
                        <button
                          className={`hub-action-btn hub-action-btn--comments${expandedComments.has(story.id) ? ' hub-action-btn--comments-open' : ''}`}
                          onClick={() => toggleComments(story.id)}
                          title="Comments"
                          aria-label="Comments"
                        >
                          <ChatIcon />
                        </button>
                        {(commentCounts[story.id] || 0) > 0 && (
                          <span className="hub-comment-badge">{commentCounts[story.id]}</span>
                        )}
                      </span>
                      {story.flagged ? (
                        userName === ADMIN_USER && (
                          <>
                            <button className="hub-action-btn hub-action-btn--approve" onClick={() => handleApprove(story.id)} title="Approve story">Approve</button>
                            <button className="hub-action-btn hub-action-btn--danger" onClick={() => handleDecline(story.id)} title="Decline and delete story">Decline</button>
                          </>
                        )
                      ) : (
                        <button className="hub-action-btn" onClick={() => handleFlag(story.id)} title="Flag for approval">⚑</button>
                      )}
                      {story.duplicate ? (
                        <button
                          className="hub-action-btn hub-action-btn--unduplicate"
                          onClick={() => handleUnduplicate(story.id)}
                          title="Dismiss duplicate flag"
                        >
                          ⚠️ Dismiss
                        </button>
                      ) : (
                        <button
                          className="hub-action-btn hub-action-btn--duplicate"
                          onClick={() => handleDuplicate(story)}
                          disabled={duplicatingIds.has(story.id)}
                          title="Flag as duplicate"
                        >
                          {duplicatingIds.has(story.id) ? '…' : '⚠️'}
                        </button>
                      )}
                      <button className="hub-action-btn hub-action-btn--danger" onClick={() => handleDelete(story.id)} title="Delete">
                        <TrashIcon />
                      </button>
                    </td>
                  </tr>

                  {renderCommentThread(story.id, 4)}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

      </div>}

    </div>
  );
}
