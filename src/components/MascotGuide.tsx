import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { WizardMascot } from './WizardMascot';
import { DragonMascot } from './DragonMascot';
import { teamWhatsAppHref } from '@/lib/contact';
import { supabase } from '@/integrations/supabase/client';
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
  /** Wizard gets angry — shakes, bubble stays visible */
  isAngry?: boolean;
  /** Keep speech bubble visible most of the time (for nagging) */
  persistBubble?: boolean;
}

const FloatingMascot: React.FC<FloatingMascotProps> = ({ type, message, targetSelector, side, isAngry = false, persistBubble = false }) => {
  const mascotRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<gsap.core.Timeline | null>(null);
  const [showBubble, setShowBubble] = useState(false);
  const [isNearTarget, setIsNearTarget] = useState(false);
  const [isWalking, setIsWalking] = useState(false);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const prefersReduced = typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Idle floating position (pixels)
  const idleLeft = side === 'left' ? (isMobile ? 8 : 20) : undefined;
  const idleRight = side === 'right' ? (isMobile ? 8 : 20) : undefined;
  const idleBottom = isMobile ? 80 : 100;

  // Stop any running orbit
  const stopOrbit = useCallback(() => {
    if (orbitRef.current) {
      orbitRef.current.kill();
      orbitRef.current = null;
    }
  }, []);

  /**
   * Orbit/circle around the target button continuously.
   * Creates an elliptical path around the button center.
   */
  const startOrbit = useCallback((targetRect: DOMRect) => {
    if (!mascotRef.current || prefersReduced) return;
    stopOrbit();

    const mSize = isMobile ? 52 : 64;
    const centerX = targetRect.left + targetRect.width / 2 - mSize / 2;
    const centerY = targetRect.top + targetRect.height / 2 - mSize / 2;
    // Orbit radius — wider horizontally, tighter vertically
    const radiusX = isMobile ? 40 : 60;
    const radiusY = isMobile ? 24 : 32;
    const duration = isMobile ? 4 : 5;

    const tl = gsap.timeline({ repeat: -1, ease: 'none' });
    // Create a circular orbit using 4 keyframes
    tl.to(mascotRef.current, {
      left: centerX + radiusX,
      top: centerY,
      duration: duration * 0.25,
      ease: 'sine.inOut',
    })
    .to(mascotRef.current, {
      left: centerX,
      top: centerY - radiusY,
      duration: duration * 0.25,
      ease: 'sine.inOut',
    })
    .to(mascotRef.current, {
      left: centerX - radiusX,
      top: centerY,
      duration: duration * 0.25,
      ease: 'sine.inOut',
    })
    .to(mascotRef.current, {
      left: centerX,
      top: centerY + radiusY,
      duration: duration * 0.25,
      ease: 'sine.inOut',
    });

    orbitRef.current = tl;
  }, [isMobile, prefersReduced, stopOrbit]);

  // Walk toward target CTA button with hopping motion, then orbit it
  const moveToTarget = useCallback(() => {
    if (!mascotRef.current || !targetSelector || prefersReduced) return;

    const target = document.querySelector(targetSelector);
    if (!target) return;

    const targetRect = target.getBoundingClientRect();
    const mSize = isMobile ? 52 : 64;

    // Only move if target is visible on screen
    if (targetRect.top < 0 || targetRect.bottom > window.innerHeight) {
      returnToIdle();
      return;
    }

    // Target: arrive at the side of the button
    const arriveY = targetRect.top + targetRect.height / 2 - mSize / 2;
    let arriveX: number;
    if (side === 'left') {
      arriveX = Math.max(4, targetRect.left - mSize - 16);
    } else {
      arriveX = targetRect.right + 16;
    }

    setIsWalking(true);
    setIsNearTarget(true);
    stopOrbit();

    // Walk toward the target with hopping steps
    const walkTl = gsap.timeline({
      onComplete: () => {
        setIsWalking(false);
        // Once arrived, start orbiting the button
        const freshRect = target.getBoundingClientRect();
        startOrbit(freshRect);
      },
    });

    // Hop-walk: move forward while bouncing up and down
    const hopCount = isMobile ? 4 : 6;
    const totalDuration = 1.5;
    const hopDuration = totalDuration / hopCount;

    // Get current position
    const currentRect = mascotRef.current.getBoundingClientRect();
    const startX = currentRect.left;
    const startY = currentRect.top;

    for (let i = 0; i < hopCount; i++) {
      const progress = (i + 1) / hopCount;
      const hopX = startX + (arriveX - startX) * progress;
      const hopY = startY + (arriveY - startY) * progress;
      const isUp = i % 2 === 0;

      walkTl.to(mascotRef.current, {
        left: hopX,
        right: 'auto',
        bottom: 'auto',
        top: hopY + (isUp ? -12 : 0),
        position: 'fixed',
        duration: hopDuration,
        ease: isUp ? 'power2.out' : 'power2.in',
      });
    }
  }, [targetSelector, side, isMobile, prefersReduced, startOrbit, stopOrbit]);

  const returnToIdle = useCallback(() => {
    if (!mascotRef.current) return;
    setIsNearTarget(false);
    setIsWalking(false);
    stopOrbit();

    gsap.killTweensOf(mascotRef.current);
    gsap.to(mascotRef.current, {
      top: 'auto',
      bottom: idleBottom,
      left: side === 'left' ? (idleLeft ?? 'auto') : 'auto',
      right: side === 'right' ? (idleRight ?? 'auto') : 'auto',
      y: 0,
      duration: 0.8,
      ease: 'power2.out',
    });
  }, [side, idleLeft, idleRight, idleBottom, stopOrbit]);

  // Walk to target on mount and route change, re-check on scroll
  useEffect(() => {
    const timer = setTimeout(() => {
      moveToTarget();
    }, 800); // Wait for page to render

    // Re-check target position on scroll (target may scroll in/out of view)
    let scrollRaf: number;
    const onScroll = () => {
      cancelAnimationFrame(scrollRaf);
      scrollRaf = requestAnimationFrame(() => {
        if (!targetSelector) return;
        const target = document.querySelector(targetSelector);
        if (!target) return;
        const rect = target.getBoundingClientRect();
        const visible = rect.top >= 0 && rect.bottom <= window.innerHeight;
        if (visible && !isNearTarget) {
          moveToTarget();
        } else if (!visible && isNearTarget) {
          returnToIdle();
        }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(scrollRaf);
      window.removeEventListener('scroll', onScroll);
      stopOrbit();
      if (mascotRef.current) gsap.killTweensOf(mascotRef.current);
    };
  }, [moveToTarget, targetSelector, isNearTarget, returnToIdle, stopOrbit]);

  // Show bubble periodically — persistent mode for nagging
  useEffect(() => {
    setShowBubble(false);

    if (persistBubble) {
      // Nagging mode: show quickly, brief hide, show again — always visible
      const showTimer = setTimeout(() => setShowBubble(true), 800);
      const hideTimer = setTimeout(() => setShowBubble(false), 8000);
      const reshowTimer = setTimeout(() => setShowBubble(true), 9500);
      return () => { clearTimeout(showTimer); clearTimeout(hideTimer); clearTimeout(reshowTimer); };
    }

    // Normal mode: show briefly, hide, occasional reshow
    const showTimer = setTimeout(() => setShowBubble(true), 1500);
    const hideTimer = setTimeout(() => setShowBubble(false), 6000);
    const reshowTimer = setTimeout(() => setShowBubble(true), 12000);
    return () => { clearTimeout(showTimer); clearTimeout(hideTimer); clearTimeout(reshowTimer); };
  }, [message, persistBubble]);

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
      className="fixed z-[2100] cursor-pointer group"
      style={{
        ...(side === 'left' ? { left: idleLeft } : { right: idleRight }),
        bottom: idleBottom,
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
          ...(isNearTarget && side === 'left' ? { left: 'auto', right: '100%', marginRight: '8px', marginLeft: 0 } : {}),
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

      {/* Mascot SVG — walks during transit, floats when idle, shakes when angry */}
      <div className={cn(
        'transition-transform duration-200',
        'group-hover:scale-110 group-active:scale-95',
        !prefersReduced && !isNearTarget && !isWalking && !isAngry && 'animate-[float_4s_ease-in-out_infinite]',
        isWalking && 'animate-[walk-left_0.3s_ease-in-out_infinite]',
        isAngry && !isWalking && 'animate-[shake_0.5s_ease-in-out_infinite]',
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

/* ─── Nag messages for unlisted freelancers — escalate over time ─── */
const NAG_MESSAGES = [
  '👻 You\'re invisible! Get on the talent board!',
  '😤 Businesses can\'t find you. List yourself!',
  '⏰ Still not listed? It takes 2 minutes!',
  '🔥 Your competitors are getting gigs. You\'re not.',
  '😠 I\'m NOT leaving until you list yourself!',
  '💀 Seriously?! STILL not listed?!',
  '👇 The button is RIGHT THERE. Click it.',
  '🏠 I live here now. List yourself or I stay forever.',
];

/* ─── Main persistent guide rendered in App.tsx ─── */

export const MascotGuide: React.FC = () => {
  const location = useLocation();
  const [config, setConfig] = useState<GuideConfig>(getGuideConfig('/'));
  const [isUnlistedFreelancer, setIsUnlistedFreelancer] = useState(false);
  const [nagIndex, setNagIndex] = useState(0);
  const [nagDismissCount, setNagDismissCount] = useState(0);

  const prefersReduced = typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Check if user is an unlisted freelancer
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { if (!cancelled) setIsUnlistedFreelancer(false); return; }

      const { data: profile } = await supabase
        .from('profiles')
        .select('user_type')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (!profile || profile.user_type !== 'student') {
        if (!cancelled) setIsUnlistedFreelancer(false);
        return;
      }

      const { data: sp } = await supabase
        .from('student_profiles')
        .select('community_board_status')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (!cancelled) {
        setIsUnlistedFreelancer(sp?.community_board_status !== 'approved');
      }
    };
    check();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => check());
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, [location.pathname]);

  // Escalate nag messages over time
  useEffect(() => {
    if (!isUnlistedFreelancer) return;
    const interval = setInterval(() => {
      setNagIndex(prev => Math.min(prev + 1, NAG_MESSAGES.length - 1));
    }, 20000);
    return () => clearInterval(interval);
  }, [isUnlistedFreelancer]);

  // Update guide config when route changes — override wizard message if nagging
  useEffect(() => {
    const base = getGuideConfig(location.pathname);

    if (isUnlistedFreelancer) {
      // Skip nagging on pages where they're already taking action
      const quietPages = ['/complete-profile', '/choose-account-type', '/auth'];
      const isQuiet = quietPages.some(p => location.pathname.startsWith(p));

      if (!isQuiet) {
        base.wizard.message = NAG_MESSAGES[nagIndex];
        // On profile page, target the "Get Listed" button
        if (location.pathname === '/profile') {
          base.wizard.target = '[data-mascot="get-listed"]';
        }
      }
    }

    setConfig(base);
  }, [location.pathname, isUnlistedFreelancer, nagIndex]);

  if (prefersReduced) return null;

  // Wizard gets angrier the longer they ignore it
  const isAngry = isUnlistedFreelancer && nagIndex >= 3;

  return (
    <>
      <FloatingMascot
        type="wizard"
        message={config.wizard.message}
        targetSelector={config.wizard.target}
        side="left"
        isAngry={isAngry}
        persistBubble={isUnlistedFreelancer}
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
