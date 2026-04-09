import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import AuthGate from './components/AuthGate';
import StoryForm from './components/StoryForm';
import StoryFeed from './components/StoryFeed';
import MessagingPanel from './components/MessagingPanel';
import FindStories from './components/FindStories';
import TitleTool from './components/TitleTool';
import PresenceDropdown from './components/PresenceDropdown';
import Notifications from './components/Notifications';
import ListPage from './components/ListPage';
import TopicPulse from './pages/TopicPulse';
import ScriptResult from './pages/ScriptResult';
import Scripts from './pages/Scripts';
import Dashboard from './pages/Dashboard';
import './App.css';

const PERSISTENT_KEY       = 'team_hub_persistent_auth';
const THIRTY_DAYS_MS       = 30 * 24 * 60 * 60 * 1000;
const POSTS_LAST_VISIT_KEY = 'team_hub_posts_last_visit';

function getSavedAuth() {
  if (window.__TEAM_HUB_AUTH__) return window.__TEAM_HUB_AUTH__;
  try {
    const raw = localStorage.getItem(PERSISTENT_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved.passphrase || !saved.name || !saved.timestamp) return null;
    if (Date.now() - saved.timestamp > THIRTY_DAYS_MS) {
      localStorage.removeItem(PERSISTENT_KEY);
      return null;
    }
    return saved;
  } catch {
    return null;
  }
}

// ── Toast component ───────────────────────────────────────────────────────────
function Toast({ toast, onRemove, onNavigate }) {
  useEffect(() => {
    const t = setTimeout(() => onRemove(toast.id), 5000);
    return () => clearTimeout(t);
  }, [toast.id, onRemove]);

  return (
    <div
      className="toast"
      onClick={() => { onNavigate('/posts'); onRemove(toast.id); }}
      role="alert"
    >
      <div className="toast-sender">{toast.sender}</div>
      <div className="toast-text">
        {toast.text.length > 60 ? toast.text.slice(0, 60) + '…' : toast.text}
      </div>
    </div>
  );
}

// ── Bell icon SVG ─────────────────────────────────────────────────────────────
const BellIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const savedAuth = getSavedAuth();
  const [authed, setAuthed] = useState(() => !!savedAuth);
  const [passphrase, setPassphrase] = useState(() => savedAuth?.passphrase || '');
  const [userName, setUserName] = useState(() => savedAuth?.name || '');
  const [stories, setStories] = useState([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState('');
  const [submitOpen, setSubmitOpen] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('team_hub_theme') || 'dark');
  const [dmUnread, setDmUnread] = useState(0);
  const [unreadPosts, setUnreadPosts] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);

  const prevPostsRef = useRef([]);

  const navigate = useNavigate();
  const location = useLocation();

  const handleAuth = (phrase, name) => {
    localStorage.setItem(PERSISTENT_KEY, JSON.stringify({ passphrase: phrase, name, timestamp: Date.now() }));
    localStorage.setItem('team_hub_sender_name', name);
    setPassphrase(phrase);
    setUserName(name);
    setAuthed(true);
  };

  const handleLogout = () => {
    localStorage.removeItem(PERSISTENT_KEY);
    setPassphrase('');
    setUserName('');
    setAuthed(false);
    navigate('/');
  };

  // ── Mark posts as read (called when visiting Posts page or clicking bell) ──
  const markPostsRead = useCallback(() => {
    localStorage.setItem(POSTS_LAST_VISIT_KEY, String(Date.now()));
    setUnreadPosts(0);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── Fetch posts for bell badge + toasts ───────────────────────────────────
  const fetchPosts = useCallback(async () => {
    try {
      const res = await fetch('/api/messages', { headers: { 'x-passphrase': passphrase } });
      if (!res.ok) return;
      const newPosts = await res.json();

      // If currently on the Posts page, treat everything as read
      if (window.location.pathname.startsWith('/posts')) {
        markPostsRead();
      } else {
        const lastVisit = parseInt(localStorage.getItem(POSTS_LAST_VISIT_KEY) || '0', 10);
        const count = newPosts.filter(p =>
          new Date(p.timestamp).getTime() > lastVisit && p.sender !== userName
        ).length;
        setUnreadPosts(count);
      }

      // Show toasts for posts that appeared since the last poll (not own posts)
      if (prevPostsRef.current.length > 0) {
        const prevIds = new Set(prevPostsRef.current.map(p => p.id));
        const newOnes = newPosts.filter(p => !prevIds.has(p.id) && p.sender !== userName);
        if (newOnes.length > 0) {
          setToasts(prev => {
            const added = newOnes.slice(0, 3).map(p => ({ id: p.id, sender: p.sender, text: p.text }));
            return [...added, ...prev].slice(0, 3);
          });
        }
      }

      prevPostsRef.current = newPosts;
    } catch {}
  }, [passphrase, userName, markPostsRead]);

  useEffect(() => {
    if (authed) fetchPosts();
  }, [authed, fetchPosts]);

  // Poll posts every 30s (same cadence as presence)
  useEffect(() => {
    if (!authed) return;
    const id = setInterval(fetchPosts, 30000);
    return () => clearInterval(id);
  }, [authed, fetchPosts]);

  // Clear bell badge whenever the user is on the Posts page
  useEffect(() => {
    if (location.pathname.startsWith('/posts')) {
      markPostsRead();
    }
  }, [location.pathname, markPostsRead]);

  // Close mobile menu on navigation
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // ── Stories ───────────────────────────────────────────────────────────────
  const fetchStories = useCallback(async () => {
    setFeedLoading(true);
    setFeedError('');
    try {
      const res = await fetch('/api/stories', {
        headers: { 'x-passphrase': passphrase },
      });
      if (!res.ok) throw new Error('Failed to load stories');
      setStories(await res.json());
      setLastUpdated(new Date());
    } catch (err) {
      setFeedError(err.message);
    } finally {
      setFeedLoading(false);
    }
  }, [passphrase]);

  useEffect(() => {
    if (authed) fetchStories();
  }, [authed, fetchStories]);

  // Auto-refresh every 60s
  useEffect(() => {
    if (!authed) return;
    const id = setInterval(fetchStories, 60000);
    return () => clearInterval(id);
  }, [authed, fetchStories]);

  // Fetch full user list once for the presence dropdown
  useEffect(() => {
    if (!authed) return;
    fetch('/api/auth/users')
      .then(r => r.ok ? r.json() : [])
      .then(setAllUsers)
      .catch(() => {});
  }, [authed]);

  // Presence heartbeat: ping every 30s and refresh online list
  useEffect(() => {
    if (!authed || !userName) return;
    const ping = () => fetch('/api/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
      body: JSON.stringify({ name: userName }),
    }).catch(() => {});
    const fetchOnline = () => fetch('/api/presence', {
      headers: { 'x-passphrase': passphrase },
    }).then(r => r.ok ? r.json() : []).then(setOnlineUsers).catch(() => {});
    ping(); fetchOnline();
    const id = setInterval(() => { ping(); fetchOnline(); }, 30000);
    return () => clearInterval(id);
  }, [authed, userName, passphrase]);

  // Poll unread DM count for nav badge
  useEffect(() => {
    if (!authed || !userName) return;
    const fetchUnread = () =>
      fetch(`/api/dm/unread?user=${encodeURIComponent(userName)}`, {
        headers: { 'x-passphrase': passphrase },
      })
        .then(r => r.ok ? r.json() : { count: 0 })
        .then(data => setDmUnread(data.count))
        .catch(() => {});
    fetchUnread();
    const id = setInterval(fetchUnread, 15000);
    return () => clearInterval(id);
  }, [authed, userName, passphrase]);

  // Handle ?page= query param from ntfy deep links
  useEffect(() => {
    if (!authed) return;
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    if (!page) return;
    window.history.replaceState({}, '', window.location.pathname);
    if (page === 'dm') {
      navigate('/posts/dm');
    } else if (page === 'posts') {
      navigate('/posts');
    }
  }, [authed, navigate]);

  // Apply theme to <html> and persist
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('team_hub_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  // Close modal on Escape; open on N (Stories page only)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && submitOpen) { setSubmitOpen(false); return; }
      if (e.key === 'n' && !submitOpen && location.pathname === '/stories') {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        setSubmitOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [submitOpen, location.pathname]);

  if (!authed) {
    return <AuthGate onAuth={handleAuth} />;
  }

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <div className="app">
      <header className="app-header">
        <Link className="app-logo" to="/">
          <span className="app-logo-text">MFS Hub</span>
        </Link>
        <nav className="app-nav">
          <Link
            className={`app-nav-link app-nav-link--primary${isActive('/') ? ' app-nav-link--active' : ''}`}
            to="/"
          >
            Dashboard
          </Link>
          <Link
            className={`app-nav-link${isActive('/stories') ? ' app-nav-link--active' : ''}`}
            to="/stories"
          >
            Stories
          </Link>
          <Link
            className={`app-nav-link${isActive('/find-stories') ? ' app-nav-link--active' : ''}`}
            to="/find-stories"
          >
            Find Stories
          </Link>
          <span className="app-nav-divider" aria-hidden="true" />
          <Link
            className={`app-nav-link app-nav-link--secondary${isActive('/scripts') ? ' app-nav-link--active' : ''}`}
            to="/scripts"
          >
            Scripts
          </Link>
          <Link
            className={`app-nav-link app-nav-link--secondary${isActive('/list') ? ' app-nav-link--active' : ''}`}
            to="/list"
          >
            List
          </Link>
          <Link
            className={`app-nav-link app-nav-link--secondary${isActive('/notifications') ? ' app-nav-link--active' : ''}`}
            to="/notifications"
            title="Alerts"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            Alerts
          </Link>
        </nav>
        <div className="app-header-right">
          {/* Hamburger — mobile only */}
          <button
            className="hamburger-btn"
            onClick={() => setMenuOpen(o => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            <span className={`hamburger-icon${menuOpen ? ' hamburger-icon--open' : ''}`}>
              <span /><span /><span />
              {(unreadPosts + dmUnread) > 0 && (
                <span className="hamburger-badge">
                  {unreadPosts + dmUnread > 99 ? '99+' : unreadPosts + dmUnread}
                </span>
              )}
            </span>
          </button>

          {/* Bell: unread posts badge */}
          <button
            className={`bell-btn${unreadPosts > 0 ? ' bell-btn--active' : ''}`}
            onClick={() => { navigate('/posts'); markPostsRead(); }}
            title="Team posts"
            aria-label={unreadPosts > 0 ? `${unreadPosts} unread post${unreadPosts === 1 ? '' : 's'}` : 'Team posts'}
          >
            <BellIcon />
            {unreadPosts > 0 && (
              <span className="bell-badge">{unreadPosts > 99 ? '99+' : unreadPosts}</span>
            )}
          </button>

          <button className="theme-toggle-btn" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} aria-label="Toggle theme">
            {theme === 'dark' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
          {userName && (
            <PresenceDropdown
              userName={userName}
              onlineUsers={onlineUsers}
              allUsers={allUsers}
              onLogout={handleLogout}
            />
          )}
        </div>

        {/* Mobile nav dropdown — inside header so position:absolute anchors to it */}
        {menuOpen && (
          <>
            <div className="mobile-nav-overlay" onClick={() => setMenuOpen(false)} />
            <nav className="mobile-nav-dropdown">
              <Link className={`mobile-nav-link${isActive('/') ? ' mobile-nav-link--active' : ''}`} to="/">Dashboard</Link>
              <Link className={`mobile-nav-link${isActive('/stories') ? ' mobile-nav-link--active' : ''}`} to="/stories">Stories</Link>
              <Link className={`mobile-nav-link${isActive('/find-stories') ? ' mobile-nav-link--active' : ''}`} to="/find-stories">Find Stories</Link>
              <Link className={`mobile-nav-link${isActive('/scripts') ? ' mobile-nav-link--active' : ''}`} to="/scripts">Scripts</Link>
              <Link className={`mobile-nav-link${isActive('/list') ? ' mobile-nav-link--active' : ''}`} to="/list">List</Link>
              <Link className={`mobile-nav-link${isActive('/notifications') ? ' mobile-nav-link--active' : ''}`} to="/notifications">Alerts</Link>
            </nav>
          </>
        )}
      </header>

      <main className={`app-main${location.pathname === '/stories' ? ' app-main--hub' : ''}`}>
        <Routes>
          <Route path="/" element={<Dashboard passphrase={passphrase} userName={userName} />} />
          <Route path="/stories" element={
            <StoryFeed
              stories={stories}
              loading={feedLoading}
              error={feedError}
              passphrase={passphrase}
              onRefresh={fetchStories}
              userName={userName}
              onSubmitClick={() => setSubmitOpen(true)}
              lastUpdated={lastUpdated}
            />
          } />
          <Route path="/find-stories" element={
            <section className="section">
              <FindStories passphrase={passphrase} userName={userName} />
            </section>
          } />
          <Route path="/title-tool" element={
            <section className="section">
              <TitleTool passphrase={passphrase} userName={userName} />
            </section>
          } />
          <Route path="/posts" element={
            <section className="section">
              <h2>Team Posts</h2>
              <MessagingPanel passphrase={passphrase} userName={userName} initialTab="posts" />
            </section>
          } />
          <Route path="/posts/dm" element={
            <section className="section">
              <h2>Team Posts</h2>
              <MessagingPanel passphrase={passphrase} userName={userName} initialTab="dm" />
            </section>
          } />
          <Route path="/list" element={
            <section className="section">
              <ListPage passphrase={passphrase} userName={userName} />
            </section>
          } />
          <Route path="/notifications" element={
            <section className="section">
              <Notifications />
            </section>
          } />
          <Route path="/topic-pulse" element={
            <section className="section">
              <TopicPulse passphrase={passphrase} userName={userName} />
            </section>
          } />
          <Route path="/script-result" element={<ScriptResult />} />
          <Route path="/scripts" element={<Scripts passphrase={passphrase} />} />
        </Routes>
      </main>

      {/* Toast notifications — shown on all pages */}
      {toasts.length > 0 && (
        <div className="toast-container" aria-live="polite">
          {toasts.map(toast => (
            <Toast key={toast.id} toast={toast} onRemove={removeToast} onNavigate={navigate} />
          ))}
        </div>
      )}

      {submitOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setSubmitOpen(false); }}
        >
          <div className="modal-panel">
            <div className="modal-header">
              <span className="modal-title">Add Story</span>
              <button className="modal-close" onClick={() => setSubmitOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <StoryForm
                passphrase={passphrase}
                onSubmitted={() => { fetchStories(); setSubmitOpen(false); }}
                userName={userName}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
