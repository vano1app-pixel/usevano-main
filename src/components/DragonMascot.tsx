import React from 'react';

interface DragonMascotProps {
  size?: number;
  className?: string;
  animate?: boolean;
}

/**
 * Knight mascot — business/hiring guide.
 * Armored knight with sword, shield, cape, and friendly face. Has hands for pointing.
 */
export const DragonMascot: React.FC<DragonMascotProps> = ({
  size = 70,
  className,
  animate = true,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.2))' }}
    >
      {/* Cape */}
      <path
        d="M 42,55 Q 35,75 38,100 Q 48,105 60,105 Q 72,105 82,100 Q 85,75 78,55"
        fill="#dc2626"
        opacity="0.9"
      />
      <path
        d="M 44,58 Q 38,78 40,98 Q 48,102 60,102 Q 72,102 80,98 Q 82,78 76,58"
        fill="#ef4444"
        opacity="0.5"
      />

      {/* Body / Armor */}
      <path
        d="M 42,50 L 42,78 Q 42,82 46,82 L 74,82 Q 78,82 78,78 L 78,50 Q 78,44 60,44 Q 42,44 42,50 Z"
        fill="#6b7280"
      />
      {/* Chest plate */}
      <path
        d="M 48,50 L 48,72 Q 48,74 50,74 L 70,74 Q 72,74 72,72 L 72,50 Q 72,48 60,48 Q 48,48 48,50 Z"
        fill="#9ca3af"
      />
      {/* Chest emblem */}
      <circle cx="60" cy="60" r="6" fill="#dc2626" opacity="0.8" />
      <path d="M 57,58 L 60,54 L 63,58 L 63,64 L 57,64 Z" fill="#fbbf24" />

      {/* Belt */}
      <rect x="42" y="74" width="36" height="4" rx="2" fill="#92400e" />
      <rect x="56" y="73" width="8" height="6" rx="2" fill="#fbbf24" />

      {/* Left Arm — pointing hand */}
      <g className={animate ? 'origin-[42px_54px] animate-[wave_1.5s_ease-in-out_infinite]' : ''}>
        {/* Shoulder armor */}
        <circle cx="38" cy="52" r="7" fill="#9ca3af" />
        <circle cx="38" cy="52" r="5" fill="#6b7280" />
        {/* Arm */}
        <rect x="26" y="50" width="14" height="7" rx="3.5" fill="#6b7280" />
        {/* Glove / Hand — pointing */}
        <circle cx="24" cy="53" r="5" fill="#fcd8b1" />
        {/* Pointing finger */}
        <rect x="16" y="51" width="10" height="4" rx="2" fill="#fcd8b1" />
      </g>

      {/* Right Arm + Shield */}
      <g>
        {/* Shoulder armor */}
        <circle cx="82" cy="52" r="7" fill="#9ca3af" />
        <circle cx="82" cy="52" r="5" fill="#6b7280" />
        {/* Arm */}
        <rect x="80" y="50" width="14" height="7" rx="3.5" fill="#6b7280" />
        {/* Shield */}
        <path d="M 90,44 L 102,48 L 102,62 L 96,68 L 90,62 Z" fill="#3b82f6" stroke="#1e40af" strokeWidth="1.5" />
        <path d="M 93,50 L 99,52 L 99,60 L 96,63 L 93,60 Z" fill="#60a5fa" />
        {/* Shield emblem — V for VANO */}
        <text x="96" y="58" textAnchor="middle" fontSize="10" fontWeight="bold" fill="white">V</text>
      </g>

      {/* Legs */}
      <rect x="46" y="82" width="10" height="16" rx="4" fill="#6b7280" />
      <rect x="64" y="82" width="10" height="16" rx="4" fill="#6b7280" />
      {/* Boots */}
      <ellipse cx="51" cy="100" rx="8" ry="4" fill="#57534e" />
      <ellipse cx="69" cy="100" rx="8" ry="4" fill="#57534e" />

      {/* Head */}
      <circle cx="60" cy="34" r="14" fill="#fcd8b1" />

      {/* Helmet */}
      <path d="M 44,30 Q 44,14 60,12 Q 76,14 76,30 L 76,34 L 44,34 Z" fill="#6b7280" />
      {/* Helmet visor opening */}
      <path d="M 48,30 Q 48,20 60,18 Q 72,20 72,30 L 72,32 L 48,32 Z" fill="#4b5563" />
      {/* Helmet plume */}
      <path d="M 60,12 Q 62,4 68,6 Q 64,10 66,14" fill="#dc2626" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" />
      {animate && (
        <path d="M 60,12 Q 62,4 68,6 Q 64,10 66,14" fill="#ef4444" opacity="0.7">
          <animate attributeName="d" values="M 60,12 Q 62,4 68,6 Q 64,10 66,14;M 60,12 Q 64,3 70,5 Q 66,9 68,13;M 60,12 Q 62,4 68,6 Q 64,10 66,14" dur="2s" repeatCount="indefinite" />
        </path>
      )}
      {/* Helmet nose guard */}
      <rect x="58" y="28" width="4" height="8" rx="1" fill="#9ca3af" />

      {/* Eyes */}
      <circle cx="53" cy="30" r="2.5" fill="white" />
      <circle cx="67" cy="30" r="2.5" fill="white" />
      <circle cx="53.5" cy="30.5" r="1.3" fill="#1e293b" />
      <circle cx="67.5" cy="30.5" r="1.3" fill="#1e293b" />
      <circle cx="54.5" cy="29.5" r="0.6" fill="white" />
      <circle cx="68.5" cy="29.5" r="0.6" fill="white" />

      {/* Smile */}
      <path d="M 54,37 Q 60,41 66,37" stroke="#b45309" strokeWidth="1.2" fill="none" strokeLinecap="round" />

      {/* Blush */}
      <ellipse cx="49" cy="35" rx="3" ry="1.5" fill="#fca5a5" opacity="0.35" />
      <ellipse cx="71" cy="35" rx="3" ry="1.5" fill="#fca5a5" opacity="0.35" />
    </svg>
  );
};
