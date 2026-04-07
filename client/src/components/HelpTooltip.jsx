import React, { useState, useEffect, useRef } from 'react';

/**
 * HelpTooltip — small circular ? button with a dismissable popover.
 *
 * Props:
 *   text  — help text to display (string)
 *   align — 'left' | 'right' (default 'left') — which side the popover opens toward
 */
export default function HelpTooltip({ text, align = 'left' }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  return (
    <span className="help-tooltip-wrap" ref={wrapRef}>
      <button
        className="help-tooltip-btn"
        onClick={() => setOpen(o => !o)}
        aria-label="Help"
        type="button"
      >
        ?
      </button>
      {open && (
        <div className={`help-tooltip-popover help-tooltip-popover--${align}`}>
          {text}
        </div>
      )}
    </span>
  );
}
