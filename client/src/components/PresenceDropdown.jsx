import React, { useState, useEffect, useRef } from 'react';

const crown = name => name;

export default function PresenceDropdown({ userName, onlineUsers, allUsers, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const onlineSet = new Set(onlineUsers);

  // Current user first, then rest sorted alphabetically
  const others = allUsers.filter(n => n !== userName).sort((a, b) => a.localeCompare(b));
  const sorted = userName ? [userName, ...others] : others;

  return (
    <div className="presence-dropdown" ref={ref}>
      <button
        className="presence-trigger"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className={`presence-dot ${onlineSet.has(userName) ? 'presence-dot--online' : 'presence-dot--offline'}`} />
        <span className="presence-trigger-name">{crown(userName)}</span>
        <span className="presence-chevron" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="presence-menu">
          <div className="presence-menu-header">
            <span className="presence-dot presence-dot--online" />
            {onlineUsers.length} of {allUsers.length} online
          </div>
          {sorted.map(name => (
            <div
              key={name}
              className={`presence-item${name === userName ? ' presence-item--self' : ''}`}
            >
              <span className={`presence-dot ${onlineSet.has(name) ? 'presence-dot--online' : 'presence-dot--offline'}`} />
              <span className="presence-item-name">{crown(name)}</span>
              {name === userName && <span className="presence-item-you">you</span>}
            </div>
          ))}
          <button className="presence-logout-btn" onClick={onLogout}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
