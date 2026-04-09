import React, { useState, useEffect, useRef } from 'react';
import HelpTooltip from '../components/HelpTooltip';

// ── Color helpers ─────────────────────────────────────────────────────────────
const C_GREEN = '#1D9E75';
const C_AMBER = '#EF9F27';
const C_RED   = '#D85A30';

// Opportunity score = 100 - saturation; high opp = green, low opp = red
function oppColor(opp) {
  if (opp >= 60) return C_GREEN;
  if (opp >= 31) return C_AMBER;
  return C_RED;
}

function verdictPillBg(opp) {
  if (opp >= 60) return 'rgba(29,158,117,0.13)';
  if (opp >= 31) return 'rgba(239,159,39,0.13)';
  return 'rgba(216,90,48,0.13)';
}

function fmtViews(n) {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

// ── Semicircle gauge ──────────────────────────────────────────────────────────
function SemiGauge({ oppScore, color }) {
  const cx = 60, cy = 62, r = 50;

  // Convert math angle (0° = right, 180° = left) → SVG point
  const ptAt = (deg) => ({
    x: cx + r * Math.cos(deg * Math.PI / 180),
    y: cy - r * Math.sin(deg * Math.PI / 180),
  });

  const startPt  = ptAt(180); // left end of arc
  const bgEndPt  = ptAt(0);   // right end of arc

  // Fill arc sweeps from 180° toward 0° proportional to oppScore.
  // Sweep is always ≤ 180°, so large-arc-flag is always 0.
  const endAngle = 180 - (oppScore / 100) * 180;
  const endPt    = ptAt(endAngle);

  // sweep-flag=1 = clockwise in SVG screen coords → goes through the top ✓
  const bgPath = `M ${startPt.x.toFixed(2)} ${startPt.y.toFixed(2)} A ${r} ${r} 0 0 1 ${bgEndPt.x.toFixed(2)} ${bgEndPt.y.toFixed(2)}`;
  const fgPath = oppScore > 0
    ? `M ${startPt.x.toFixed(2)} ${startPt.y.toFixed(2)} A ${r} ${r} 0 0 1 ${endPt.x.toFixed(2)} ${endPt.y.toFixed(2)}`
    : null;

  return (
    <svg viewBox="0 0 120 72" className="tp-gauge-svg" aria-hidden="true">
      {/* background track */}
      <path
        d={bgPath}
        fill="none"
        stroke="var(--border)"
        strokeWidth="8"
        strokeLinecap="round"
      />
      {/* colored fill */}
      {fgPath && (
        <path
          d={fgPath}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
        />
      )}
      {/* score number */}
      <text
        x={cx} y={46}
        textAnchor="middle"
        fill={color}
        fontSize="22"
        fontWeight="700"
        fontFamily="inherit"
      >
        {oppScore}
      </text>
      {/* label */}
      <text
        x={cx} y={59}
        textAnchor="middle"
        fill="var(--muted)"
        fontSize="7.5"
        fontFamily="inherit"
        letterSpacing="1"
      >
        OPPORTUNITY
      </text>
    </svg>
  );
}

// ── Hourly bar chart (Chart.js from cdnjs) ────────────────────────────────────
function HourlyChart({ hourlyBreakdown, color }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    const mount = () => {
      if (!canvasRef.current || !window.Chart) return;
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

      const labels = hourlyBreakdown.map((_, i) => {
        if (i === 0)  return '24h ago';
        if (i === 23) return 'Now';
        return '';
      });

      // hex color → rgba helper
      const hex2rgba = (hex, a) => {
        const h = hex.replace('#', '');
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        return `rgba(${r},${g},${b},${a})`;
      };

      chartRef.current = new window.Chart(canvasRef.current.getContext('2d'), {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            data:            hourlyBreakdown,
            backgroundColor: hex2rgba(color, 0.4),
            borderColor:     color,
            borderWidth:     1,
            borderRadius:    2,
            borderSkipped:   false,
          }],
        },
        options: {
          responsive:          true,
          maintainAspectRatio: false,
          animation:           { duration: 350 },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (items) => `Hour ${items[0].dataIndex + 1} of 24`,
                label: (ctx)   => ` ${fmtViews(ctx.raw)} views`,
              },
            },
          },
          scales: {
            x: {
              ticks: {
                callback:    (val, idx) => labels[idx],
                color:       'var(--muted, #888)',
                font:        { size: 9 },
                maxRotation: 0,
                autoSkip:    false,
              },
              grid:   { display: false },
              border: { display: false },
            },
            y: {
              ticks: {
                callback:     (val) => fmtViews(val),
                color:        'var(--muted, #888)',
                font:         { size: 9 },
                maxTicksLimit: 4,
              },
              grid:   { color: 'rgba(128,128,128,0.08)' },
              border: { display: false },
            },
          },
        },
      });
    };

    if (window.Chart) {
      mount();
    } else {
      const SCRIPT_ID = 'chartjs-cdn';
      let script = document.getElementById(SCRIPT_ID);
      if (!script) {
        script = document.createElement('script');
        script.id  = SCRIPT_ID;
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
        document.head.appendChild(script);
      }
      script.addEventListener('load', mount);
    }

    return () => {
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    };
  }, [hourlyBreakdown, color]);

  return <canvas ref={canvasRef} className="tp-chart-canvas" />;
}

// ── SubjectCard ───────────────────────────────────────────────────────────────
function SubjectCard({ result }) {
  if (result.error) {
    return (
      <div className="tp-card">
        <div className="tp-card-subject">{result.subject}</div>
        <div style={{ color: C_RED, fontSize: 13 }}>Analysis failed: {result.error}</div>
      </div>
    );
  }

  const satScore   = result.saturation_score   ?? 0;
  const oppScore   = 100 - satScore;
  const color      = oppColor(oppScore);
  const videoCount = result.youtube_video_count ?? 0;
  const avgViews   = result.avg_views_per_video  ?? 0;
  const velocity   = result.upload_velocity      ?? 0;
  const breakdown  = result.hourly_breakdown     ?? new Array(24).fill(0);
  const hasChart   = breakdown.some(v => v > 0);

  return (
    <div className="tp-card">
      {/* ── Header: keyword + video count ─ */}
      <div className="tp-card-header">
        <div className="tp-card-subject">{result.subject}</div>
        <div className="tp-video-count">
          {videoCount} video{videoCount !== 1 ? 's' : ''} in 24h
        </div>
      </div>

      {/* ── Semicircle gauge + stats ─────── */}
      <div className="tp-gauge-wrap">
        <SemiGauge oppScore={oppScore} color={color} />
        <div className="tp-gauge-stats">
          <div className="tp-stat-block">
            <div className="tp-stat-label">Avg Views</div>
            <div className="tp-stat-value" style={{ color }}>{fmtViews(avgViews)}</div>
          </div>
          <div className="tp-stat-divider" />
          <div className="tp-stat-block">
            <div className="tp-stat-label">Upload Velocity</div>
            <div className="tp-stat-value" style={{ color }}>{velocity}/hr</div>
          </div>
        </div>
      </div>

      {/* ── Hourly activity chart ────────── */}
      {hasChart && (
        <div className="tp-chart-wrap">
          <div className="tp-chart-label">YouTube activity — last 24 hours</div>
          <HourlyChart hourlyBreakdown={breakdown} color="#c41e3a" />
        </div>
      )}

      {/* ── Verdict pill ─────────────────── */}
      {result.recommendation && (
        <div>
          <span
            className="tp-verdict-pill"
            style={{ background: verdictPillBg(oppScore), color }}
          >
            {result.recommendation}
          </span>
        </div>
      )}

      {/* ── Best angle ───────────────────── */}
      {result.best_angle && (
        <div className="tp-best-angle">
          <div className="tp-label-upper">Best Angle</div>
          <div className="tp-best-angle-text">{result.best_angle}</div>
        </div>
      )}

      {/* ── Avoid ────────────────────────── */}
      {result.avoid && (
        <div className="tp-avoid">
          <div className="tp-label-upper" style={{ color: C_RED }}>Avoid</div>
          <div className="tp-avoid-text">{result.avoid}</div>
        </div>
      )}

      <hr className="tp-divider" />
      <p className="tp-reasoning">{result.reasoning}</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TopicPulse({ passphrase }) {
  const [keywordInput, setKeywordInput] = useState('');
  const [results, setResults]           = useState(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [analyzedAt, setAnalyzedAt]     = useState(null);

  const runAnalysis = async () => {
    const keywords = keywordInput.split(',').map(k => k.trim()).filter(Boolean);
    if (!keywords.length || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/topic-pulse/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-passphrase': passphrase },
        body:    JSON.stringify({ subjects: keywords }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setResults(data.results);
      setAnalyzedAt(new Date(data.analyzed_at));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  function formatAnalyzedAt(d) {
    return d.toLocaleString([], {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  return (
    <div className="tp-page">
      <style>{`
        @keyframes tp-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.35; transform: scale(0.8); }
        }
        @keyframes tp-spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Header row */}
      <div className="tp-header-row">
        <div className="tp-header-left">
          <span className="tp-pulse-dot" />
          <span className="tp-header-label">News Pulse</span>
          <HelpTooltip text="Enter any political subject or name and hit Run Analysis. News Pulse fetches real YouTube view data from the last 24 hours, calculates an opportunity score (green = open, red = oversaturated), and shows upload velocity and hourly view activity. The Best Angle is your lane in — use it." />
        </div>
        {analyzedAt && !loading && (
          <span className="tp-updated">Updated {formatAnalyzedAt(analyzedAt)}</span>
        )}
      </div>

      {/* Input */}
      <div className="tp-input-area">
        <div className="tp-input-row">
          <input
            type="text"
            className="tp-input"
            value={keywordInput}
            onChange={e => setKeywordInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && runAnalysis()}
            placeholder="Enter keyword or multiple keywords separated by commas (e.g. Trump, Mike Johnson)"
            disabled={loading}
          />
          <button
            className="tp-run-btn"
            onClick={runAnalysis}
            disabled={loading || !keywordInput.trim()}
          >
            {loading ? (
              <>
                <span className="tp-spinner" />
                Analyzing…
              </>
            ) : 'Run Analysis'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && !loading && (
        <div className="tp-error">{error}</div>
      )}

      {/* Loading panel */}
      {loading && (
        <div className="tp-loading-panel">
          <div className="tp-loading-title">Analyzing keywords…</div>
          <div className="tp-loading-sub">
            Fetching YouTube view data, scanning title saturation,
            pulling Google Trends, and generating AI insights.
            This typically takes 15–30 seconds.
          </div>
        </div>
      )}

      {/* Results */}
      {results && !loading && (
        <div className="tp-results">
          {results.map(result => (
            <SubjectCard key={result.subject} result={result} />
          ))}
        </div>
      )}
    </div>
  );
}
