import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { WizardMascot } from './WizardMascot';
import { DragonMascot } from './DragonMascot';
import { teamWhatsAppHref } from '@/lib/contact';
import { gsap } from '@/lib/gsapSetup';
import { cn } from '@/lib/utils';

/* ─── Page-aware guide messages ─── */
interface GuideConfig {
  wizard: { message: string; target?: string };
  dragon: { message: string; target?: string };
}

function getGuideConfig(path: string): GuideConfig {
  if (path === '/') return {
    wizard: { message: 'Show your skills to the world!', target: '[data-mascot="freelancer-cta"]' },
    dragon: { message: 'Find the perfect freelancer!', target: '[data-mascot="hire-cta"]' },
  };
  if (path === '/hire') return {
    wizard: { message: "I'll help them find you!" },
    dragon: { message: 'Tell us what you need!', target: '[data-mascot="hire-submit"]' },
  };
  if (path === '/students' || path.startsWith('/students/')) return {
    wizard: { message: 'Get discovered here!' },
    dragon: { message: 'Browse the talent!', target: '[data-mascot="browse-cta"]' },
  };
  if (path === '/auth') return {
    wizard: { message: 'Join as a freelancer!', target: '[data-mascot="signup-cta"]' },
    dragon: { message: 'Sign in to hire!', target: '[data-mascot="signup-cta"]' },
  };
  if (path === '/profile' || path === '/complete-profile') return {
    wizard: { message: 'Make your profile shine!' },
    dragon: { message: 'Looking good!' },
  };
  if (path === '/business-dashboard') return {
    wizard: { message: "I'm ready for gigs!" },
    dragon: { message: 'Manage your projects!' },
  };
  if (path === '/messages') return {
    wizard: { message: 'Stay connected!' },
    dragon: { message: 'Chat with talent!' },
  };
  if (path === '/choose-account-type') return {
    wizard: { message: 'Pick freelancer!', target: '[data-mascot="choose-student"]' },
    dragon: { message: 'Pick business!', target: '[data-mascot="choose-business"]' },
  };
  return {
    wizard: { message: 'Need help? Tap me!' },
    dragon: { message: 'Questions? Tap me!' },
  };
}

/* ─── Single mascot component ─── */
interface FloatingMascotProps {
  type: 'wizard' | 'dragon';
  message: string;
  targetSelector?: string;
  side: 'left' | 'right';
}

const FloatingMascot: React.FC<FloatingMascotProps> = ({ type, message, targetSelector, side }) => {
  const mascotRef = useRef<HTMLDivElement>(null);
  const [showBubble, setShowBubble] = useState(false);
  const [isNearTarget, setIsNearTarget] = useState(false);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const prefersReduced = typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Idle floating position
  const idlePos = {
    left: side === 'left'
      ? (isMobile ? 8 : 20)
      : (isMobile ? undefined : undefined),
    right: side === 'right'
      ? (isMobile ? 8 : 20)
      : undefined,
    bottom: isMobile ? 80 : 100,
  };

  // Move toward target CTA button
  const moveToTarget = useCallback(() => {
    if (!mascotRef.current || !targetSelector || prefersReduced) return;

    const target = document.querySelector(targetSelector);
    if (!target) return;

    const targetRect = target.getBoundingClientRect();
    const mascotSize = isMobile ? 52 : 64;

    // Position mascot near the target button
    const targetX = side === 'left'
      ? targetRect.left - mascotSize - 8
      : targetRect.right + 8;
    const targetY = targetRect.top + targetRect.height / 2 - mascotSize / 2;

    // Only move if target is visible on screen
    if (targetRect.top < 0 || targetRect.bottom > window.innerHeight) {
      returnToIdle();
      return;
    }

    setIsNearTarget(true);

    gsap.to(mascotRef.current, {
      position: 'fixed',
      left: side === 'left' ? targetX : 'auto',
      right: side === 'right' ? (window.innerWidth - targetX - mascotSize) : 'auto',
      bottom: 'auto',
      top: targetY,
      duration: 1.2,
      ease: 'power3.inOut',
      onComplete: () => {
        // Bounce near the target
        if (mascotRef.current && !prefersReduced) {
          gsap.to(mascotRef.current, {
            y: -6,
            duration: 0.4,
            yoyo: true,
            repeat: -1,
            ease: 'sine.inOut',
          });
        }
      },
    });
  }, [targetSelector, side, isMobile, prefersReduced]);

  const returnToIdle = useCallback(() => {
    if (!mascotRef.current) return;
    setIsNearTarget(false);

    gsap.killTweensOf(mascotRef.current);
    gsap.to(mascotRef.current, {
      top: 'auto',
      bottom: idlePos.bottom,
      left: side === 'left' ? (idlePos.left ?? 'auto') : 'auto',
      right: side === 'right' ? (idlePos.right ?? 'auto') : 'auto',
      y: 0,
      duration: 0.8,
      ease: 'power2.out',
    });
  }, [side, idlePos]);

  // Try to find and move to target on mount and route change
  useEffect(() => {
    const timer = setTimeout(() => {
      moveToTarget();
    }, 800); // Wait for page to render

    return () => {
      clearTimeout(timer);
      if (mascotRef.current) gsap.killTweensOf(mascotRef.current);
    };
  }, [moveToTarget]);

  // Show bubble periodically
  useEffect(() => {
    setShowBubble(false);
    const showTimer = setTimeout(() => setShowBubble(true), 1500);
    const hideTimer = setTimeout(() => setShowBubble(false), 6000);
    const reshowTimer = setTimeout(() => setShowBubble(true), 12000);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      clearTimeout(reshowTimer);
    };
  }, [message]);

  const mascotSize = isMobile ? 52 : 64;

  const handleClick = () => {
    const msgText = type === 'wizard'
      ? "Hi! I'm a freelancer interested in joining VANO!"
      : "Hi! I'm looking to hire a freelancer on VANO!";
    window.open(`${teamWhatsAppHref}?text=${encodeURIComponent(msgText)}`, '_blank');
  };

  return (
    <div
      ref={mascotRef}
      className="fixed z-[1900] cursor-pointer group"
      style={{
        ...(side === 'left' ? { left: idlePos.left } : { right: idlePos.right }),
        bottom: idlePos.bottom,
        width: mascotSize,
        height: mascotSize,
      }}
      onClick={handleClick}
      title={type === 'wizard' ? 'Chat with us about freelancing!' : 'Chat with us about hiring!'}
    >
      {/* Speech bubble */}
      <div className={cn(
        'absolute whitespace-nowrap px-3 py-1.5 rounded-xl text-[10px] sm:text-[11px] font-semibold shadow-lg border transition-all duration-500 pointer-events-none',
        side === 'left'
          ? 'left-full ml-2 rounded-bl-sm'
          : 'right-full mr-2 rounded-br-sm',
        type === 'wizard'
          ? 'bg-violet-50 dark:bg-violet-950/80 border-violet-200 dark:border-violet-800 text-violet-800 dark:text-violet-200'
          : 'bg-red-50 dark:bg-red-950/80 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200',
        showBubble
          ? 'opacity-100 translate-y-0 scale-100'
          : 'opacity-0 translate-y-2 scale-95',
      )}
        style={{
          bottom: mascotSize / 2,
          ...(isNearTarget && side === 'right' ? { right: 'auto', left: '100%', marginLeft: '8px', marginRight: 0 } : {}),
        }}
      >
        {message}
        {/* Pointer arrow on active guide */}
        {isNearTarget && (
          <span className={cn(
            'inline-block ml-1',
            side === 'left' ? 'animate-[arm-swing-right_0.6s_ease-in-out_infinite]' : 'animate-[arm-swing-left_0.6s_ease-in-out_infinite]',
          )}>
            {side === 'left' ? '👉' : '👈'}
          </span>
        )}
      </div>

      {/* Mascot SVG */}
      <div className={cn(
        'transition-transform duration-200',
        'group-hover:scale-110 group-active:scale-95',
        !prefersReduced && !isNearTarget && 'animate-[float_4s_ease-in-out_infinite]',
      )}>
        {type === 'wizard' ? (
          <WizardMascot size={mascotSize} animate={!prefersReduced} />
        ) : (
          <DragonMascot size={mascotSize} animate={!prefersReduced} />
        )}
      </div>

      {/* Click hint ring */}
      {!prefersReduced && (
        <div className={cn(
          'absolute inset-0 rounded-full border-2 animate-pulse-ring pointer-events-none',
          type === 'wizard' ? 'border-violet-400/30' : 'border-red-400/30',
        )} />
      )}
    </div>
  );
};

/* ─── Main persistent guide rendered in App.tsx ─── */

export const MascotGuide: React.FC = () => {
  const location = useLocation();
  const [config, setConfig] = useState<GuideConfig>(getGuideConfig('/'));

  const prefersReduced = typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Update guide config when route changes
  useEffect(() => {
    setConfig(getGuideConfig(location.pathname));
  }, [location.pathname]);

  if (prefersReduced) return null;

  return (
    <>
      <FloatingMascot
        type="wizard"
        message={config.wizard.message}
        targetSelector={config.wizard.target}
        side="left"
      />
      <FloatingMascot
        type="dragon"
        message={config.dragon.message}
        targetSelector={config.dragon.target}
        side="right"
      />
    </>
  );
};
