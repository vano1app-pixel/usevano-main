import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { WizardMascot } from './WizardMascot';
import { DragonMascot } from './DragonMascot';
import { teamWhatsAppHref } from '@/lib/contact';
import { supabase } from '@/integrations/supabase/client';
import { gsap } from '@/lib/gsapSetup';
import { cn } from '@/lib/utils';

/* ─── Page-aware guide config ─── */
type MascotType = 'wizard' | 'dragon';

interface PageGuide {
  show: MascotType[];
  wizard: { message: string; target?: string };
  dragon: { message: string; target?: string };
}

function getPageGuide(path: string): PageGuide {
  // Landing: both — wizard near freelancer CTA, dragon near hire CTA
  if (path === '/') return {
    show: ['wizard', 'dragon'],
    wizard: { message: 'Show your skills!', target: '[data-mascot="freelancer-cta"]' },
    dragon: { message: 'Find talent here!', target: '[data-mascot="hire-cta"]' },
  };
  // Hire flow: dragon only
  if (path === '/hire') return {
    show: ['dragon'],
    wizard: { message: '' },
    dragon: { message: 'Tell us what you need!', target: '[data-mascot="hire-submit"]' },
  };
  // Talent browsing: dragon only
  if (path === '/students' || path.startsWith('/students/')) return {
    show: ['dragon'],
    wizard: { message: '' },
    dragon: { message: 'Browse the talent!', target: '[data-mascot="browse-cta"]' },
  };
  // Auth: both
  if (path === '/auth') return {
    show: ['wizard', 'dragon'],
    wizard: { message: 'Join as a freelancer!' },
    dragon: { message: 'Sign in to hire!' },
  };
  // Choose account type: both — each points to their side
  if (path === '/choose-account-type') return {
    show: ['wizard', 'dragon'],
    wizard: { message: 'Pick freelancer!', target: '[data-mascot="choose-student"]' },
    dragon: { message: 'Pick business!', target: '[data-mascot="choose-business"]' },
  };
  // Freelancer profile/onboarding: wizard only
  if (path === '/profile' || path === '/complete-profile') return {
    show: ['wizard'],
    wizard: { message: 'Make your profile shine!' },
    dragon: { message: '' },
  };
  // Business dashboard: dragon only
  if (path === '/business-dashboard') return {
    show: ['dragon'],
    wizard: { message: '' },
    dragon: { message: 'Manage your projects!' },
  };
  // Messages: both
  if (path === '/messages') return {
    show: ['wizard', 'dragon'],
    wizard: { message: 'Stay connected!' },
    dragon: { message: 'Chat with talent!' },
  };
  // Default: both with generic help
  return {
    show: ['wizard', 'dragon'],
    wizard: { message: 'Need help? Tap me!' },
    dragon: { message: 'Questions? Tap me!' },
  };
}

/* ─── Single mascot component ─── */
interface FloatingMascotProps {
  type: MascotType;
  message: string;
  targetSelector?: string;
  side: 'left' | 'right';
  isAngry?: boolean;
  persistBubble?: boolean;
}

const FloatingMascot: React.FC<FloatingMascotProps> = ({
  type, message, targetSelector, side, isAngry = false, persistBubble = false,
}) => {
  const mascotRef = useRef<HTMLDivElement>(null);
  const [showBubble, setShowBubble] = useState(false);
  const [isNearTarget, setIsNearTarget] = useState(false);
  const [isWalking, setIsWalking] = useState(false);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const prefersReduced = typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const idleLeft = side === 'left' ? (isMobile ? 8 : 20) : undefined;
  const idleRight = side === 'right' ? (isMobile ? 8 : 20) : undefined;
  const idleBottom = isMobile ? 80 : 100;

  /**
   * Gentle float near the target — NOT orbit, just a soft hover beside it
   * with a slow up-down bobbing motion.
   */
  const startGentleFloat = useCallback(() => {
    if (!mascotRef.current || prefersReduced) return;
    gsap.to(mascotRef.current, {
      y: '-=8',
      duration: 1.5,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    });
  }, [prefersReduced]);

  // Walk toward target CTA button, then float gently beside it
  const moveToTarget = useCallback(() => {
    if (!mascotRef.current || !targetSelector || prefersReduced) return;

    const target = document.querySelector(targetSelector);
    if (!target) return;

    const targetRect = target.getBoundingClientRect();
    const mSize = isMobile ? 52 : 64;

    if (targetRect.top < 0 || targetRect.bottom > window.innerHeight) {
      returnToIdle();
      return;
    }

    // Position ABOVE the button, offset to the side — never on top of it
    const gap = isMobile ? 6 : 14;
    const arriveY = Math.max(4, targetRect.top - mSize - gap);
    let arriveX: number;
    if (side === 'left') {
      arriveX = Math.max(4, targetRect.left);
    } else {
      arriveX = Math.min(window.innerWidth - mSize - 4, targetRect.right - mSize);
    }

    setIsWalking(true);
    setIsNearTarget(true);

    // Hop-walk toward the target
    const hopCount = isMobile ? 3 : 4;
    const hopDuration = 1.2 / hopCount;
    const currentRect = mascotRef.current.getBoundingClientRect();
    const startX = currentRect.left;
    const startY = currentRect.top;

    const walkTl = gsap.timeline({
      onComplete: () => {
        setIsWalking(false);
        startGentleFloat();
      },
    });

    for (let i = 0; i < hopCount; i++) {
      const progress = (i + 1) / hopCount;
      const hopX = startX + (arriveX - startX) * progress;
      const hopY = startY + (arriveY - startY) * progress;
      const isUp = i % 2 === 0;

      walkTl.to(mascotRef.current, {
        left: hopX,
        right: 'auto',
        bottom: 'auto',
        top: hopY + (isUp ? -10 : 0),
        position: 'fixed',
        duration: hopDuration,
        ease: isUp ? 'power2.out' : 'power2.in',
      });
    }
  }, [targetSelector, side, isMobile, prefersReduced, startGentleFloat]);

  const returnToIdle = useCallback(() => {
    if (!mascotRef.current) return;
    setIsNearTarget(false);
    setIsWalking(false);

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
  }, [side, idleLeft, idleRight, idleBottom]);

  // Move to target on mount/route change, follow on scroll
  // Wait 5 seconds before walking to target — let users see the page first
  useEffect(() => {
    const timer = setTimeout(() => moveToTarget(), 5000);

    let scrollRaf: number;
    const onScroll = () => {
      cancelAnimationFrame(scrollRaf);
      scrollRaf = requestAnimationFrame(() => {
        if (!targetSelector) return;
        const target = document.querySelector(targetSelector);
        if (!target) return;
        const rect = target.getBoundingClientRect();
        const visible = rect.top >= 0 && rect.bottom <= window.innerHeight;
        if (visible && !isNearTarget) moveToTarget();
        else if (!visible && isNearTarget) returnToIdle();
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(scrollRaf);
      window.removeEventListener('scroll', onScroll);
      if (mascotRef.current) gsap.killTweensOf(mascotRef.current);
    };
  }, [moveToTarget, targetSelector, isNearTarget, returnToIdle]);

  // Speech bubble timing
  useEffect(() => {
    setShowBubble(false);
    if (persistBubble) {
      const t1 = setTimeout(() => setShowBubble(true), 800);
      const t2 = setTimeout(() => setShowBubble(false), 8000);
      const t3 = setTimeout(() => setShowBubble(true), 9500);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
    const t1 = setTimeout(() => setShowBubble(true), 1500);
    const t2 = setTimeout(() => setShowBubble(false), 6000);
    const t3 = setTimeout(() => setShowBubble(true), 14000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
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
        side === 'left' ? 'left-full ml-2 rounded-bl-sm' : 'right-full mr-2 rounded-br-sm',
        type === 'wizard'
          ? 'bg-violet-50 dark:bg-violet-950/80 border-violet-200 dark:border-violet-800 text-violet-800 dark:text-violet-200'
          : 'bg-red-50 dark:bg-red-950/80 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200',
        showBubble ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2 scale-95',
      )}
        style={{
          bottom: mascotSize / 2,
          ...(isNearTarget && side === 'left' ? { left: 'auto', right: '100%', marginRight: 8, marginLeft: 0 } : {}),
          ...(isNearTarget && side === 'right' ? { right: 'auto', left: '100%', marginLeft: 8, marginRight: 0 } : {}),
        }}
      >
        {message}
        {isNearTarget && (
          <span className="inline-block ml-1 animate-[arm-swing-right_0.6s_ease-in-out_infinite]">
            {side === 'left' ? '👉' : '👈'}
          </span>
        )}
      </div>

      {/* Mascot SVG */}
      <div className={cn(
        'transition-transform duration-200 group-hover:scale-110 group-active:scale-95',
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
    </div>
  );
};

/* ─── Nag messages for unlisted freelancers ─── */
const NAG_MESSAGES = [
  "\u{1F47B} You're invisible! Get on the talent board!",
  "\u{1F624} Businesses can't find you. List yourself!",
  "\u{23F0} Still not listed? It takes 2 minutes!",
  "\u{1F525} Your competitors are getting gigs. You're not.",
  "\u{1F620} I'm NOT leaving until you list yourself!",
  "\u{1F480} Seriously?! STILL not listed?!",
  "\u{1F447} The button is RIGHT THERE. Click it.",
  "\u{1F3E0} I live here now. List yourself or I stay forever.",
];

/* ─── Main persistent guide rendered in App.tsx ─── */
export const MascotGuide: React.FC = () => {
  const location = useLocation();
  const [guide, setGuide] = useState<PageGuide>(getPageGuide('/'));
  const [isUnlistedFreelancer, setIsUnlistedFreelancer] = useState(false);
  const [nagIndex, setNagIndex] = useState(0);

  const prefersReduced = typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Check if user is an unlisted freelancer
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { if (!cancelled) setIsUnlistedFreelancer(false); return; }

      const { data: profile } = await supabase
        .from('profiles').select('user_type').eq('user_id', session.user.id).maybeSingle();
      if (!profile || profile.user_type !== 'student') {
        if (!cancelled) setIsUnlistedFreelancer(false); return;
      }

      const { data: sp } = await supabase
        .from('student_profiles').select('community_board_status').eq('user_id', session.user.id).maybeSingle();
      if (!cancelled) setIsUnlistedFreelancer(sp?.community_board_status !== 'approved');
    };
    check();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => check());
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, [location.pathname]);

  // Escalate nag messages
  useEffect(() => {
    if (!isUnlistedFreelancer) return;
    const interval = setInterval(() => {
      setNagIndex(prev => Math.min(prev + 1, NAG_MESSAGES.length - 1));
    }, 20000);
    return () => clearInterval(interval);
  }, [isUnlistedFreelancer]);

  // Update guide config — override wizard if nagging
  useEffect(() => {
    const base = getPageGuide(location.pathname);

    if (isUnlistedFreelancer) {
      const quietPages = ['/complete-profile', '/choose-account-type', '/auth'];
      const isQuiet = quietPages.some(p => location.pathname.startsWith(p));
      if (!isQuiet) {
        // Force wizard to show on every page for nagging
        if (!base.show.includes('wizard')) base.show.push('wizard');
        base.wizard.message = NAG_MESSAGES[nagIndex];
        if (location.pathname === '/profile') {
          base.wizard.target = '[data-mascot="get-listed"]';
        }
      }
    }

    setGuide(base);
  }, [location.pathname, isUnlistedFreelancer, nagIndex]);

  if (prefersReduced) return null;

  const isAngry = isUnlistedFreelancer && nagIndex >= 3;
  const showWizard = guide.show.includes('wizard');
  const showDragon = guide.show.includes('dragon');

  return (
    <>
      {showWizard && (
        <FloatingMascot
          type="wizard"
          message={guide.wizard.message}
          targetSelector={guide.wizard.target}
          side="left"
          isAngry={isAngry}
          persistBubble={isUnlistedFreelancer}
        />
      )}
      {showDragon && (
        <FloatingMascot
          type="dragon"
          message={guide.dragon.message}
          targetSelector={guide.dragon.target}
          side="right"
        />
      )}
    </>
  );
};
