import React from 'react';
import { cn } from '@/lib/utils';

export type CharacterPose = 'walking' | 'thinking' | 'celebrating' | 'waving' | 'building' | 'idle';

interface JourneyCharacterProps {
  pose?: CharacterPose;
  size?: number;
  flip?: boolean;
  className?: string;
  color?: string;
}

/**
 * Animated SVG mascot — a little explorer/adventurer character.
 * Changes pose based on the current step in a journey flow.
 * Flat 2.5D illustration style, animated with CSS.
 */
export const JourneyCharacter: React.FC<JourneyCharacterProps> = ({
  pose = 'idle',
  size = 80,
  flip = false,
  className,
  color = '#3b82f6',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(
        'transition-transform duration-500 ease-out',
        flip && 'scale-x-[-1]',
        className
      )}
      style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' }}
    >
      {/* Backpack */}
      <rect x="54" y="38" width="12" height="18" rx="4" fill="#f59e0b" className="origin-center">
        <animate attributeName="ry" values="4;5;4" dur="2s" repeatCount="indefinite" />
      </rect>
      <rect x="56" y="42" width="8" height="4" rx="1.5" fill="#d97706" />

      {/* Body / Torso */}
      <rect x="38" y="38" width="20" height="24" rx="6" fill={color} />

      {/* Jacket detail */}
      <line x1="48" y1="38" x2="48" y2="60" stroke="white" strokeWidth="1" strokeOpacity="0.3" />

      {/* Belt */}
      <rect x="37" y="56" width="22" height="3" rx="1.5" fill="#1e40af" />
      <rect x="46" y="55.5" width="4" height="4" rx="1" fill="#fbbf24" />

      {/* Left Leg */}
      <g className={cn(
        'origin-[44px_62px]',
        pose === 'walking' && 'animate-[walk-left_0.6s_ease-in-out_infinite]',
        pose === 'celebrating' && 'animate-[jump_0.5s_ease-in-out_infinite]',
      )}>
        <rect x="40" y="62" width="8" height="18" rx="4" fill="#1e3a5f" />
        {/* Left Shoe */}
        <ellipse cx="43" cy="82" rx="7" ry="4" fill="#92400e" />
      </g>

      {/* Right Leg */}
      <g className={cn(
        'origin-[52px_62px]',
        pose === 'walking' && 'animate-[walk-right_0.6s_ease-in-out_infinite]',
        pose === 'celebrating' && 'animate-[jump_0.5s_ease-in-out_infinite]',
      )}>
        <rect x="50" y="62" width="8" height="18" rx="4" fill="#1e3a5f" />
        {/* Right Shoe */}
        <ellipse cx="55" cy="82" rx="7" ry="4" fill="#92400e" />
      </g>

      {/* Left Arm */}
      <g className={cn(
        'origin-[40px_42px]',
        pose === 'waving' && 'animate-[wave_0.8s_ease-in-out_infinite]',
        pose === 'walking' && 'animate-[arm-swing-left_0.6s_ease-in-out_infinite]',
        pose === 'celebrating' && 'animate-[celebrate-left_0.6s_ease-in-out_infinite]',
        pose === 'thinking' && 'animate-[think_2s_ease-in-out_infinite]',
      )}>
        <rect x="28" y="40" width="10" height="6" rx="3" fill={color} />
        {/* Hand */}
        <circle cx="28" cy="43" r="4" fill="#fcd8b1" />
      </g>

      {/* Right Arm */}
      <g className={cn(
        'origin-[58px_42px]',
        pose === 'walking' && 'animate-[arm-swing-right_0.6s_ease-in-out_infinite]',
        pose === 'celebrating' && 'animate-[celebrate-right_0.6s_ease-in-out_infinite]',
        pose === 'building' && 'animate-[build_1s_ease-in-out_infinite]',
      )}>
        <rect x="58" y="40" width="10" height="6" rx="3" fill={color} />
        {/* Hand */}
        <circle cx="68" cy="43" r="4" fill="#fcd8b1" />
        {/* Tool (only in building pose) */}
        {pose === 'building' && (
          <g>
            <rect x="66" y="32" width="3" height="14" rx="1" fill="#78716c" />
            <rect x="63" y="30" width="9" height="5" rx="1.5" fill="#a8a29e" />
          </g>
        )}
      </g>

      {/* Head */}
      <g className={cn(
        pose === 'celebrating' && 'animate-[head-bob_0.4s_ease-in-out_infinite]',
        pose === 'thinking' && 'animate-[head-tilt_2s_ease-in-out_infinite]',
      )}>
        {/* Face circle */}
        <circle cx="48" cy="28" r="14" fill="#fcd8b1" />

        {/* Hair */}
        <path d="M 34 24 Q 36 12 48 10 Q 60 12 62 24 Q 58 18 48 16 Q 38 18 34 24" fill="#4a2c1a" />

        {/* Explorer hat */}
        <ellipse cx="48" cy="16" rx="16" ry="5" fill="#78716c" />
        <rect x="40" y="10" width="16" height="8" rx="3" fill="#78716c" />
        <rect x="39" y="14" width="18" height="2" rx="1" fill="#a8a29e" />

        {/* Eyes */}
        <g>
          {pose === 'celebrating' ? (
            <>
              {/* Happy squint eyes */}
              <path d="M 41 27 Q 43 25 45 27" stroke="#1e293b" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              <path d="M 51 27 Q 53 25 55 27" stroke="#1e293b" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </>
          ) : pose === 'thinking' ? (
            <>
              {/* Looking up eyes */}
              <circle cx="43" cy="26" r="2.5" fill="white" />
              <circle cx="53" cy="26" r="2.5" fill="white" />
              <circle cx="43" cy="25" r="1.2" fill="#1e293b" />
              <circle cx="53" cy="25" r="1.2" fill="#1e293b" />
            </>
          ) : (
            <>
              {/* Normal eyes */}
              <circle cx="43" cy="27" r="2.5" fill="white" />
              <circle cx="53" cy="27" r="2.5" fill="white" />
              <circle cx="43.5" cy="27.5" r="1.3" fill="#1e293b" />
              <circle cx="53.5" cy="27.5" r="1.3" fill="#1e293b" />
              {/* Eye shine */}
              <circle cx="44.5" cy="26.5" r="0.6" fill="white" />
              <circle cx="54.5" cy="26.5" r="0.6" fill="white" />
            </>
          )}
        </g>

        {/* Mouth */}
        {pose === 'celebrating' ? (
          <path d="M 44 33 Q 48 37 52 33" stroke="#c2410c" strokeWidth="1.5" fill="#fff" strokeLinecap="round" />
        ) : pose === 'thinking' ? (
          <circle cx="50" cy="34" r="2" fill="#f9a8d4" stroke="#e879a4" strokeWidth="0.5" />
        ) : pose === 'waving' ? (
          <path d="M 44 33 Q 48 36 52 33" stroke="#c2410c" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        ) : (
          <path d="M 45 33 Q 48 35 51 33" stroke="#c2410c" strokeWidth="1" fill="none" strokeLinecap="round" />
        )}

        {/* Blush */}
        <ellipse cx="39" cy="31" rx="3" ry="1.5" fill="#fca5a5" fillOpacity="0.4" />
        <ellipse cx="57" cy="31" rx="3" ry="1.5" fill="#fca5a5" fillOpacity="0.4" />

        {/* Thought bubble (thinking pose) */}
        {pose === 'thinking' && (
          <g className="animate-[float_2s_ease-in-out_infinite]">
            <circle cx="68" cy="12" r="5" fill="white" stroke="#e2e8f0" strokeWidth="0.5" />
            <circle cx="62" cy="18" r="2.5" fill="white" stroke="#e2e8f0" strokeWidth="0.5" />
            <circle cx="59" cy="22" r="1.5" fill="white" stroke="#e2e8f0" strokeWidth="0.5" />
            <text x="68" y="14" textAnchor="middle" fontSize="5" fill="#64748b">?</text>
          </g>
        )}

        {/* Stars (celebrating pose) */}
        {pose === 'celebrating' && (
          <g>
            <text x="28" y="14" fontSize="8" className="animate-[sparkle_0.8s_ease-in-out_infinite]">&#x2728;</text>
            <text x="64" y="10" fontSize="6" className="animate-[sparkle_0.8s_ease-in-out_infinite]" style={{ animationDelay: '0.3s' }}>&#x2B50;</text>
            <text x="20" y="28" fontSize="6" className="animate-[sparkle_0.8s_ease-in-out_infinite]" style={{ animationDelay: '0.6s' }}>&#x2728;</text>
          </g>
        )}
      </g>
    </svg>
  );
};
