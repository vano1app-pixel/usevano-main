import React from 'react';

interface DragonMascotProps {
  size?: number;
  className?: string;
  animate?: boolean;
}

/**
 * Japanese-style dragon mascot — business/hiring guide.
 * Serpentine body, whiskers, ornate mane, flowing design, friendly face.
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
      {/* Serpentine body — flowing S-curve */}
      <g className={animate ? 'origin-center animate-[float_3s_ease-in-out_infinite]' : ''}>
        {/* Body coil */}
        <path
          d="M 58,55 Q 80,50 88,65 Q 96,80 82,90 Q 68,100 55,95 Q 42,90 38,78 Q 34,66 45,58"
          stroke="#dc2626"
          strokeWidth="12"
          strokeLinecap="round"
          fill="none"
        />
        {/* Body inner highlight */}
        <path
          d="M 58,55 Q 80,50 88,65 Q 96,80 82,90 Q 68,100 55,95 Q 42,90 38,78 Q 34,66 45,58"
          stroke="#fbbf24"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
          opacity="0.3"
        />
        {/* Belly scales — gold underbelly */}
        <path
          d="M 60,58 Q 78,54 84,67 Q 90,78 78,87 Q 66,96 56,92"
          stroke="#fbbf24"
          strokeWidth="2"
          strokeDasharray="4 6"
          fill="none"
          opacity="0.5"
        />

        {/* Tail */}
        <path
          d="M 45,58 Q 35,50 28,55 Q 20,60 18,52"
          stroke="#dc2626"
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
        />
        {/* Tail flame tip */}
        <g className={animate ? 'animate-[sparkle_0.8s_ease-in-out_infinite]' : ''}>
          <path d="M 18,52 Q 14,44 18,40 Q 16,46 20,48" fill="#f59e0b" />
          <path d="M 18,52 Q 22,44 18,38 Q 20,46 16,50" fill="#ef4444" opacity="0.7" />
        </g>

        {/* Back spines */}
        {[
          { x: 72, y: 50, r: -30 },
          { x: 84, y: 58, r: -10 },
          { x: 90, y: 72, r: 15 },
          { x: 82, y: 85, r: 35 },
          { x: 68, y: 94, r: 55 },
        ].map((spine, i) => (
          <g key={i} transform={`rotate(${spine.r} ${spine.x} ${spine.y})`}>
            <path
              d={`M ${spine.x - 3},${spine.y} L ${spine.x},${spine.y - 8} L ${spine.x + 3},${spine.y}`}
              fill="#b91c1c"
              opacity="0.8"
            />
          </g>
        ))}
      </g>

      {/* Head */}
      <g className={animate ? 'origin-[60px_38px] animate-[head-bob_2s_ease-in-out_infinite]' : ''}>
        {/* Mane / flowing hair */}
        <path
          d="M 45,28 Q 38,20 42,12 Q 46,16 48,22"
          stroke="#dc2626"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
          opacity="0.7"
        />
        <path
          d="M 50,25 Q 48,14 54,8 Q 54,16 52,22"
          stroke="#ef4444"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          opacity="0.6"
        />
        <path
          d="M 72,26 Q 80,18 78,10 Q 74,16 72,22"
          stroke="#dc2626"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
          opacity="0.7"
        />
        <path
          d="M 68,24 Q 72,14 68,6 Q 66,14 67,20"
          stroke="#ef4444"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          opacity="0.6"
        />

        {/* Head shape — elongated dragon snout */}
        <ellipse cx="60" cy="38" rx="18" ry="14" fill="#dc2626" />
        {/* Snout */}
        <ellipse cx="60" cy="44" rx="12" ry="8" fill="#ef4444" />

        {/* Horns */}
        <path d="M 46,28 Q 40,18 38,12" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" fill="none" />
        <path d="M 74,28 Q 80,18 82,12" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" fill="none" />
        {/* Horn tips */}
        <circle cx="38" cy="11" r="2" fill="#fbbf24" opacity="0.8" />
        <circle cx="82" cy="11" r="2" fill="#fbbf24" opacity="0.8" />

        {/* Eyes — large, expressive */}
        <ellipse cx="52" cy="35" rx="5" ry="5.5" fill="white" />
        <ellipse cx="68" cy="35" rx="5" ry="5.5" fill="white" />
        <circle cx="53" cy="35.5" r="2.8" fill="#1e293b" />
        <circle cx="69" cy="35.5" r="2.8" fill="#1e293b" />
        {/* Slit pupils */}
        <ellipse cx="53" cy="35.5" rx="1" ry="2.5" fill="#dc2626" opacity="0.6" />
        <ellipse cx="69" cy="35.5" rx="1" ry="2.5" fill="#dc2626" opacity="0.6" />
        {/* Eye sparkle */}
        <circle cx="54.5" cy="34" r="1.2" fill="white" />
        <circle cx="70.5" cy="34" r="1.2" fill="white" />

        {/* Eyebrows — fierce but friendly */}
        <path d="M 47,30 Q 52,28 56,30" stroke="#7f1d1d" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <path d="M 64,30 Q 68,28 73,30" stroke="#7f1d1d" strokeWidth="1.5" fill="none" strokeLinecap="round" />

        {/* Nostrils */}
        <circle cx="56" cy="43" r="1.5" fill="#7f1d1d" opacity="0.5" />
        <circle cx="64" cy="43" r="1.5" fill="#7f1d1d" opacity="0.5" />
        {/* Nostril smoke */}
        {animate && (
          <g>
            <circle cx="55" cy="42" r="1" fill="#94a3b8" opacity="0">
              <animate attributeName="opacity" values="0;0.4;0" dur="3s" repeatCount="indefinite" />
              <animate attributeName="cy" values="42;36;30" dur="3s" repeatCount="indefinite" />
              <animate attributeName="r" values="1;2;3" dur="3s" repeatCount="indefinite" />
            </circle>
            <circle cx="65" cy="42" r="1" fill="#94a3b8" opacity="0">
              <animate attributeName="opacity" values="0;0.3;0" dur="3.5s" begin="0.5s" repeatCount="indefinite" />
              <animate attributeName="cy" values="42;35;28" dur="3.5s" begin="0.5s" repeatCount="indefinite" />
              <animate attributeName="r" values="1;2.5;4" dur="3.5s" begin="0.5s" repeatCount="indefinite" />
            </circle>
          </g>
        )}

        {/* Mouth — friendly grin */}
        <path d="M 52,47 Q 56,44 60,47 Q 64,44 68,47" stroke="#7f1d1d" strokeWidth="1.5" fill="none" strokeLinecap="round" />

        {/* Whiskers — Japanese dragon style */}
        <g className={animate ? 'animate-[float_4s_ease-in-out_infinite]' : ''}>
          <path d="M 44,40 Q 30,36 20,38" stroke="#fbbf24" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.7" />
          <path d="M 44,44 Q 28,44 18,48" stroke="#fbbf24" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.7" />
          <path d="M 76,40 Q 90,36 100,38" stroke="#fbbf24" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.7" />
          <path d="M 76,44 Q 92,44 102,48" stroke="#fbbf24" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.7" />
        </g>

        {/* Cheek blush */}
        <ellipse cx="45" cy="40" rx="4" ry="2.5" fill="#fca5a5" opacity="0.3" />
        <ellipse cx="75" cy="40" rx="4" ry="2.5" fill="#fca5a5" opacity="0.3" />

        {/* Small cloud/orb near dragon — mystical energy */}
        {animate && (
          <g>
            <circle cx="30" cy="28" r="4" fill="#fbbf24" opacity="0">
              <animate attributeName="opacity" values="0;0.3;0" dur="4s" repeatCount="indefinite" />
            </circle>
            <circle cx="90" cy="26" r="3" fill="#ef4444" opacity="0">
              <animate attributeName="opacity" values="0;0.25;0" dur="3.5s" begin="1s" repeatCount="indefinite" />
            </circle>
          </g>
        )}
      </g>
    </svg>
  );
};
