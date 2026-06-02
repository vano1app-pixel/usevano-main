import React from 'react';
import { motion } from 'framer-motion';

/*
 * Simplified SVG outline of Ireland.
 * Coordinates normalised to viewBox "0 0 100 120":
 *   x = (longitude + 10.5) / 4.6 * 100
 *   y = (55.4 - latitude) / 4.0 * 120
 *
 * University locations (Galway):
 *   ATU Galway  ≈ 53.27 °N, 9.07 °W  → (31, 64)
 *   Univ Galway ≈ 53.28 °N, 9.06 °W  → (33, 63)
 */

const IRELAND_PATH =
  'M 68,1 L 80,4 L 95,5 L 99,24 L 97,40 L 92,62 L 98,73 ' +
  'L 87,85 L 78,98 L 73,93 L 44,107 L 15,119 L 10,113 ' +
  'L 8,100 L 12,85 L 10,80 L 14,72 L 12,69 ' +
  'L 15,60 L 10,44 L 11,32 L 28,36 L 44,34 L 45,23 L 51,8 Z';

const UNIVERSITIES = [
  { cx: 30, cy: 65, label: 'ATU', anchor: 'end' },
  { cx: 34, cy: 62, label: 'Univ. Galway', anchor: 'start' },
];

export const IrelandMap: React.FC = () => (
  <div className="relative w-full max-w-[260px] mx-auto select-none" aria-hidden="true">
    <svg
      viewBox="0 0 100 120"
      className="w-full h-auto drop-shadow-sm"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Sea background */}
      <rect x="0" y="0" width="100" height="120" fill="#dde8f0" rx="6" />

      {/* Island fill */}
      <path d={IRELAND_PATH} fill="#c8d9c4" stroke="#6b9b73" strokeWidth="0.8" />

      {/* Galway area highlight ring */}
      <circle cx="32" cy="64" r="9" fill="none" stroke="#6b9b73" strokeWidth="0.6" strokeDasharray="2 2" opacity="0.7" />

      {/* University dots */}
      {UNIVERSITIES.map(({ cx, cy, label, anchor }) => (
        <g key={label}>
          {/* Pulse ring */}
          <motion.circle
            cx={cx} cy={cy} r="4"
            fill="none" stroke="#e53e3e" strokeWidth="0.7"
            initial={{ opacity: 0.6, scale: 1 }}
            animate={{ opacity: 0, scale: 2.2 }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
          />
          {/* Dot */}
          <circle cx={cx} cy={cy} r="2" fill="#e53e3e" />
          {/* Label */}
          <text
            x={anchor === 'end' ? cx - 3 : cx + 3}
            y={cy + 0.5}
            fontSize="4.5"
            fontFamily="system-ui, sans-serif"
            fontWeight="600"
            fill="#1a202c"
            textAnchor={anchor as 'end' | 'start'}
            dominantBaseline="middle"
          >
            {label}
          </text>
        </g>
      ))}

      {/* Galway city label */}
      <text
        x="32" y="55"
        fontSize="4"
        fontFamily="system-ui, sans-serif"
        fill="#4a5568"
        textAnchor="middle"
        dominantBaseline="auto"
      >
        Galway
      </text>
    </svg>
    <p className="text-center text-[11px] text-muted-foreground mt-2 font-medium tracking-wide">
      ATU · University of Galway
    </p>
  </div>
);
