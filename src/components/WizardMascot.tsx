import React from 'react';

interface WizardMascotProps {
  size?: number;
  className?: string;
  animate?: boolean;
}

/**
 * Cartoony wizard mascot — freelancer guide.
 * Pointy hat, flowing robe, magical wand with sparkles, friendly face.
 */
export const WizardMascot: React.FC<WizardMascotProps> = ({
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
      {/* Robe / Body */}
      <path
        d="M 40,65 Q 38,80 35,100 Q 45,105 60,105 Q 75,105 85,100 Q 82,80 80,65 Z"
        fill="#6d28d9"
      />
      {/* Robe detail — star pattern */}
      <circle cx="52" cy="82" r="2" fill="#fbbf24" opacity="0.6" />
      <circle cx="68" cy="90" r="1.5" fill="#fbbf24" opacity="0.5" />
      <circle cx="55" cy="95" r="1.8" fill="#fbbf24" opacity="0.4" />
      {/* Robe collar */}
      <path d="M 42,65 Q 50,60 60,62 Q 70,60 78,65" stroke="#7c3aed" strokeWidth="2" fill="none" />

      {/* Belt */}
      <rect x="42" y="75" width="36" height="4" rx="2" fill="#a855f7" />
      <rect x="56" y="74" width="8" height="6" rx="2" fill="#fbbf24" />

      {/* Left Arm + Wand */}
      <g className={animate ? 'origin-[38px_68px] animate-[wave_1.5s_ease-in-out_infinite]' : ''}>
        <path d="M 40,66 Q 28,60 22,50" stroke="#6d28d9" strokeWidth="6" strokeLinecap="round" fill="none" />
        {/* Hand */}
        <circle cx="22" cy="50" r="4.5" fill="#fcd8b1" />
        {/* Wand */}
        <line x1="20" y1="48" x2="12" y2="24" stroke="#a16207" strokeWidth="3" strokeLinecap="round" />
        {/* Wand tip star */}
        <g className={animate ? 'animate-[sparkle_1s_ease-in-out_infinite]' : ''}>
          <circle cx="12" cy="22" r="5" fill="#fbbf24" opacity="0.8" />
          <circle cx="12" cy="22" r="3" fill="#fef3c7" />
        </g>
        {/* Sparkle particles from wand */}
        {animate && (
          <g>
            <circle cx="8" cy="16" r="1.5" fill="#fbbf24" opacity="0">
              <animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite" />
              <animate attributeName="cy" values="16;10;6" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx="16" cy="18" r="1" fill="#a78bfa" opacity="0">
              <animate attributeName="opacity" values="0;0.8;0" dur="1.8s" begin="0.4s" repeatCount="indefinite" />
              <animate attributeName="cy" values="18;12;8" dur="1.8s" begin="0.4s" repeatCount="indefinite" />
            </circle>
            <circle cx="6" cy="20" r="1.2" fill="#34d399" opacity="0">
              <animate attributeName="opacity" values="0;0.7;0" dur="2.2s" begin="0.8s" repeatCount="indefinite" />
              <animate attributeName="cx" values="6;3;1" dur="2.2s" begin="0.8s" repeatCount="indefinite" />
            </circle>
          </g>
        )}
      </g>

      {/* Right Arm */}
      <path d="M 80,66 Q 90,70 94,78" stroke="#6d28d9" strokeWidth="6" strokeLinecap="round" fill="none" />
      <circle cx="94" cy="78" r="4.5" fill="#fcd8b1" />

      {/* Head */}
      <circle cx="60" cy="50" r="16" fill="#fcd8b1" />

      {/* Beard */}
      <path d="M 48,56 Q 52,70 60,72 Q 68,70 72,56" fill="white" opacity="0.9" />
      <path d="M 50,58 Q 54,66 60,68 Q 66,66 70,58" fill="#f1f5f9" />

      {/* Wizard Hat */}
      <path d="M 38,42 L 60,6 L 82,42 Z" fill="#6d28d9" />
      {/* Hat brim */}
      <ellipse cx="60" cy="43" rx="26" ry="7" fill="#7c3aed" />
      {/* Hat band */}
      <path d="M 46,38 Q 53,32 60,34 Q 67,32 74,38" stroke="#fbbf24" strokeWidth="2.5" fill="none" />
      {/* Hat star */}
      <circle cx="58" cy="26" r="3" fill="#fbbf24" opacity="0.8" />
      {/* Hat tip curl */}
      <path d="M 60,6 Q 68,4 72,10" stroke="#6d28d9" strokeWidth="3" fill="none" strokeLinecap="round" />

      {/* Eyes */}
      <g>
        <circle cx="53" cy="48" r="3" fill="white" />
        <circle cx="67" cy="48" r="3" fill="white" />
        <circle cx="53.5" cy="48.5" r="1.5" fill="#1e293b" />
        <circle cx="67.5" cy="48.5" r="1.5" fill="#1e293b" />
        {/* Eye sparkle */}
        <circle cx="54.5" cy="47.5" r="0.7" fill="white" />
        <circle cx="68.5" cy="47.5" r="0.7" fill="white" />
      </g>

      {/* Eyebrows */}
      <path d="M 49,44 Q 53,42 56,44" stroke="#a16207" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M 64,44 Q 67,42 71,44" stroke="#a16207" strokeWidth="1.5" fill="none" strokeLinecap="round" />

      {/* Nose */}
      <ellipse cx="60" cy="52" rx="2" ry="1.5" fill="#f0c8a0" />

      {/* Smile */}
      <path d="M 54,56 Q 60,60 66,56" stroke="#b45309" strokeWidth="1.2" fill="none" strokeLinecap="round" />

      {/* Blush */}
      <ellipse cx="48" cy="53" rx="3.5" ry="2" fill="#fca5a5" opacity="0.35" />
      <ellipse cx="72" cy="53" rx="3.5" ry="2" fill="#fca5a5" opacity="0.35" />

      {/* Shoes */}
      <ellipse cx="48" cy="106" rx="10" ry="4" fill="#4a1d96" />
      <ellipse cx="72" cy="106" rx="10" ry="4" fill="#4a1d96" />
      {/* Shoe curl tip */}
      <path d="M 38,106 Q 35,104 36,100" stroke="#4a1d96" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M 82,106 Q 85,104 84,100" stroke="#4a1d96" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
};
