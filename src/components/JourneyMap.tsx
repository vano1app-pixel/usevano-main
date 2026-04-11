import React, { useEffect, useRef, useState } from 'react';
import { JourneyCharacter, type CharacterPose } from './JourneyCharacter';
import { gsap } from '@/lib/gsapSetup';
import { cn } from '@/lib/utils';

interface JourneyStep {
  label: string;
  sublabel: string;
  icon: string;
  narrative: string;
}

interface JourneyMapProps {
  currentStep: number;
  steps: JourneyStep[];
  className?: string;
}

const STEP_POSES: Record<number, CharacterPose> = {
  1: 'thinking',
  2: 'walking',
  3: 'celebrating',
};

/**
 * Immersive illustrated journey map with living landscape.
 * Features: animated clouds, drifting fireflies, glowing checkpoints,
 * character that walks between stops, and narrative story text.
 */
export const JourneyMap: React.FC<JourneyMapProps> = ({
  currentStep,
  steps,
  className,
}) => {
  const characterRef = useRef<HTMLDivElement>(null);
  const prevStep = useRef(currentStep);
  const [narrativeText, setNarrativeText] = useState(steps[0]?.narrative || '');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const prefersReduced = typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Animate character sliding to current step + update narrative
  useEffect(() => {
    if (!characterRef.current) return;

    const stepPositions = isMobile ? [14, 50, 86] : [15, 50, 85];
    const targetX = stepPositions[currentStep - 1] ?? stepPositions[0];
    prevStep.current = currentStep;

    if (prefersReduced) {
      gsap.set(characterRef.current, { left: `${targetX}%` });
      setNarrativeText(steps[currentStep - 1]?.narrative || '');
      return;
    }

    setIsTransitioning(true);

    gsap.to(characterRef.current, {
      left: `${targetX}%`,
      duration: 1,
      ease: 'power3.inOut',
      onStart: () => {
        gsap.to(characterRef.current, {
          y: -10,
          duration: 0.25,
          yoyo: true,
          repeat: 3,
          ease: 'sine.inOut',
        });
      },
      onComplete: () => {
        setIsTransitioning(false);
        setNarrativeText(steps[currentStep - 1]?.narrative || '');
      },
    });
  }, [currentStep, isMobile, prefersReduced, steps]);

  return (
    <div className={cn('relative w-full select-none', className)}>
      {/* Narrative story text */}
      <div className="relative mx-auto max-w-md md:max-w-lg mb-2">
        <p className={cn(
          'text-center text-xs sm:text-sm font-medium text-foreground/80 italic transition-all duration-500 min-h-[1.5em]',
          isTransitioning ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0',
        )}>
          "{narrativeText}"
        </p>
      </div>

      {/* Map container */}
      <div className="relative mx-auto max-w-md md:max-w-lg h-40 sm:h-44 rounded-2xl overflow-hidden border border-border/30 bg-gradient-to-b from-sky-100/40 via-transparent to-emerald-50/30 dark:from-sky-900/10 dark:to-emerald-900/10">

        {/* Living landscape SVG */}
        <svg
          viewBox="0 0 400 120"
          className="absolute inset-0 w-full h-full"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
        >
          <defs>
            <linearGradient id="jm-path-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#d4a373" />
              <stop offset="50%" stopColor="#c9956e" />
              <stop offset="100%" stopColor="#d4a373" />
            </linearGradient>
            <radialGradient id="jm-glow">
              <stop offset="0%" stopColor="hsl(221 83% 53%)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="hsl(221 83% 53%)" stopOpacity="0" />
            </radialGradient>
            <filter id="jm-soft-glow">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>

          {/* Animated clouds — drift slowly */}
          <g opacity="0.35">
            <ellipse cx="60" cy="22" rx="25" ry="9" fill="white">
              {!prefersReduced && <animateTransform attributeName="transform" type="translate" values="0,0;15,0;0,0" dur="20s" repeatCount="indefinite" />}
            </ellipse>
            <ellipse cx="72" cy="19" rx="18" ry="7" fill="white">
              {!prefersReduced && <animateTransform attributeName="transform" type="translate" values="0,0;15,0;0,0" dur="20s" repeatCount="indefinite" />}
            </ellipse>
            <ellipse cx="280" cy="18" rx="22" ry="8" fill="white">
              {!prefersReduced && <animateTransform attributeName="transform" type="translate" values="0,0;-12,0;0,0" dur="25s" repeatCount="indefinite" />}
            </ellipse>
            <ellipse cx="296" cy="15" rx="14" ry="6" fill="white">
              {!prefersReduced && <animateTransform attributeName="transform" type="translate" values="0,0;-12,0;0,0" dur="25s" repeatCount="indefinite" />}
            </ellipse>
          </g>

          {/* Sun with gentle pulse */}
          <circle cx="360" cy="22" r="14" fill="#fbbf24" opacity="0.2">
            {!prefersReduced && <animate attributeName="opacity" values="0.2;0.35;0.2" dur="4s" repeatCount="indefinite" />}
          </circle>
          <circle cx="360" cy="22" r="9" fill="#fbbf24" opacity="0.4" />
          {/* Sun rays */}
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
            <line
              key={angle}
              x1={360 + Math.cos(angle * Math.PI / 180) * 16}
              y1={22 + Math.sin(angle * Math.PI / 180) * 16}
              x2={360 + Math.cos(angle * Math.PI / 180) * 22}
              y2={22 + Math.sin(angle * Math.PI / 180) * 22}
              stroke="#fbbf24"
              strokeWidth="1"
              opacity="0.2"
              strokeLinecap="round"
            />
          ))}

          {/* Mountains - layered depth */}
          <path d="M 0,60 L 40,30 L 80,55 L 120,25 L 160,50 L 200,35 L 240,55 L 280,28 L 320,48 L 360,32 L 400,50 L 400,120 L 0,120 Z" fill="hsl(210 20% 85%)" fillOpacity="0.3" />
          <path d="M 0,68 L 50,45 L 100,62 L 160,40 L 220,58 L 290,42 L 350,55 L 400,48 L 400,120 L 0,120 Z" fill="hsl(142 25% 78%)" fillOpacity="0.4" />

          {/* Rolling hills */}
          <path d="M 0,78 Q 50,68 100,76 Q 150,70 200,74 Q 280,68 350,73 Q 380,70 400,72 L 400,120 L 0,120 Z" fill="hsl(142 30% 72%)" fillOpacity="0.5" />
          <path d="M 0,85 Q 60,78 120,82 Q 180,86 250,80 Q 320,84 400,79 L 400,120 L 0,120 Z" fill="hsl(82 35% 68%)" fillOpacity="0.6" />

          {/* Winding path with glow */}
          <path
            d="M 20,92 Q 60,80 100,88 Q 160,96 200,84 Q 260,74 300,82 Q 340,90 380,84"
            stroke="url(#jm-path-grad)"
            strokeWidth="10"
            strokeLinecap="round"
            fill="none"
            opacity="0.5"
          />
          {/* Path center line */}
          <path
            d="M 20,92 Q 60,80 100,88 Q 160,96 200,84 Q 260,74 300,82 Q 340,90 380,84"
            stroke="white"
            strokeWidth="2"
            strokeDasharray="6 10"
            strokeLinecap="round"
            fill="none"
            opacity="0.4"
          />

          {/* Trees with variety */}
          {[
            { x: 35, y: 72, h: 16, r: 9, color: 'hsl(142 40% 45%)' },
            { x: 85, y: 70, h: 12, r: 7, color: 'hsl(150 35% 40%)' },
            { x: 145, y: 76, h: 14, r: 8, color: 'hsl(142 38% 48%)' },
            { x: 180, y: 68, h: 10, r: 6, color: 'hsl(155 30% 42%)' },
            { x: 250, y: 66, h: 15, r: 9, color: 'hsl(142 35% 44%)' },
            { x: 315, y: 72, h: 12, r: 7, color: 'hsl(148 40% 46%)' },
            { x: 370, y: 68, h: 13, r: 8, color: 'hsl(140 32% 40%)' },
          ].map((tree, i) => (
            <g key={i}>
              <rect x={tree.x - 2} y={tree.y} width="4" height={tree.h} fill="#7c5b3a" rx="1.5" />
              <circle cx={tree.x} cy={tree.y - 2} r={tree.r} fill={tree.color} opacity="0.7">
                {!prefersReduced && (
                  <animate
                    attributeName="r"
                    values={`${tree.r};${tree.r + 1};${tree.r}`}
                    dur={`${3 + i * 0.5}s`}
                    repeatCount="indefinite"
                  />
                )}
              </circle>
              {/* Tree highlight */}
              <circle cx={tree.x - 2} cy={tree.y - 4} r={tree.r * 0.5} fill="white" opacity="0.1" />
            </g>
          ))}

          {/* Fireflies — tiny glowing dots that drift */}
          {!prefersReduced && [
            { cx: 70, cy: 60, delay: 0 },
            { cx: 150, cy: 55, delay: 1.5 },
            { cx: 230, cy: 50, delay: 0.8 },
            { cx: 310, cy: 58, delay: 2.2 },
            { cx: 120, cy: 48, delay: 3 },
            { cx: 280, cy: 45, delay: 1 },
          ].map((ff, i) => (
            <circle key={i} cx={ff.cx} cy={ff.cy} r="1.5" fill="#fbbf24" opacity="0">
              <animate attributeName="opacity" values="0;0.8;0" dur="3s" begin={`${ff.delay}s`} repeatCount="indefinite" />
              <animateTransform attributeName="transform" type="translate" values="0,0;3,-5;-2,-8;0,0" dur="4s" begin={`${ff.delay}s`} repeatCount="indefinite" />
            </circle>
          ))}

          {/* Checkpoint glows */}
          {(isMobile ? [14, 50, 86] : [15, 50, 85]).map((pos, idx) => {
            const isActive = currentStep === idx + 1;
            const isComplete = currentStep > idx + 1;
            const cx = pos * 4;
            const cy = 86;
            return isActive ? (
              <circle key={idx} cx={cx} cy={cy} r="18" fill="url(#jm-glow)" filter="url(#jm-soft-glow)">
                <animate attributeName="opacity" values="0.4;0.8;0.4" dur="2s" repeatCount="indefinite" />
              </circle>
            ) : null;
          })}
        </svg>

        {/* Step checkpoint markers (HTML overlay for better styling) */}
        <div className="absolute inset-0 flex items-end pb-3 px-3 sm:px-5">
          {steps.map((step, idx) => {
            const positions = isMobile ? [14, 50, 86] : [15, 50, 85];
            const isActive = currentStep === idx + 1;
            const isComplete = currentStep > idx + 1;

            return (
              <div
                key={idx}
                className="absolute flex flex-col items-center"
                style={{ left: `${positions[idx]}%`, transform: 'translateX(-50%)', bottom: '10px' }}
              >
                {/* Checkpoint marker */}
                <div className={cn(
                  'relative flex items-center justify-center w-9 h-9 sm:w-11 sm:h-11 rounded-full border-2 transition-all duration-500 text-sm sm:text-base z-10',
                  isActive && 'bg-primary border-primary text-primary-foreground scale-110 shadow-lg shadow-primary/40 ring-4 ring-primary/20',
                  isComplete && 'bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-500/30',
                  !isActive && !isComplete && 'bg-card/90 border-border text-muted-foreground shadow-sm backdrop-blur-sm',
                )}>
                  {isComplete ? '✓' : step.icon}
                  {/* Pulse ring on active */}
                  {isActive && !prefersReduced && (
                    <span className="absolute inset-0 rounded-full border-2 border-primary animate-pulse-ring" />
                  )}
                </div>
                {/* Label */}
                <p className={cn(
                  'mt-1.5 text-[9px] sm:text-[10px] font-medium text-center max-w-[72px] sm:max-w-[90px] leading-tight transition-all duration-400',
                  isActive ? 'text-foreground font-bold' : isComplete ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground/60',
                )}>
                  {step.label}
                </p>
              </div>
            );
          })}
        </div>

        {/* Animated character */}
        <div
          ref={characterRef}
          className="absolute z-20"
          style={{
            left: `${(isMobile ? [14, 50, 86] : [15, 50, 85])[currentStep - 1]}%`,
            bottom: '44px',
            transform: 'translateX(-50%)',
          }}
        >
          <JourneyCharacter
            pose={isTransitioning ? 'walking' : (STEP_POSES[currentStep] || 'idle')}
            size={isMobile ? 50 : 64}
            flip={currentStep === 2}
          />
        </div>

        {/* Gradient overlays for depth */}
        <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background/30 to-transparent pointer-events-none" />
        <div className="absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background/20 to-transparent pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background/20 to-transparent pointer-events-none" />
      </div>
    </div>
  );
};

/* ─── Preset journey configs ─── */

export const HIRE_JOURNEY_STEPS: JourneyStep[] = [
  { label: 'Describe quest', sublabel: 'What do you need?', icon: '📝', narrative: 'Every great adventure starts with a vision...' },
  { label: 'Plan journey', sublabel: 'Timeline & budget', icon: '🗺️', narrative: 'Charting the path to find your perfect match...' },
  { label: 'Find champion', sublabel: 'Get matched', icon: '🏆', narrative: 'Your champion awaits at journey\'s end!' },
];

export const ONBOARDING_JOURNEY_STEPS: JourneyStep[] = [
  { label: 'Begin journey', sublabel: 'Create account', icon: '🚪', narrative: 'A new story begins here...' },
  { label: 'Choose path', sublabel: 'Pick your role', icon: '🔀', narrative: 'Two paths diverge — which calls to you?' },
  { label: 'Set up camp', sublabel: 'Build profile', icon: '⛺', narrative: 'Build your story, let the world see you!' },
];
