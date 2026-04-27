import React from 'react';

// Donut/circular gauge — Fanone-lane relevance score (0–100)
// Extracted as a shared component so both Dashboard and VideoScript can reuse it.
export default function OpportunityDonut({ score, color, label, gaugeLabel = 'LANE FIT' }) {
  const safeScore = Math.max(0, Math.min(100, Number(score) || 0));
  const size = 110;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (safeScore / 100) * circumference;
  return (
    <div className="opp-donut" role="img" aria-label={`${label} — ${safeScore} of 100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
        <text
          x="50%"
          y="48%"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#ffffff"
          fontSize="22"
          fontWeight="800"
        >
          {safeScore}
        </text>
        <text
          x="50%"
          y="68%"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="rgba(255,255,255,0.55)"
          fontSize="9"
          fontWeight="700"
          letterSpacing="1.2"
        >
          {gaugeLabel}
        </text>
      </svg>
    </div>
  );
}
