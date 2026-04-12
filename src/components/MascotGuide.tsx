import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { WizardMascot } from './WizardMascot';
import { DragonMascot } from './DragonMascot';
import { teamWhatsAppHref } from '@/lib/contact';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuthContext';
import { cn } from '@/lib/utils';

/**
 * Calmer, role-locked mascots.
 *
 *  - Wizard (bottom-left, purple) appears ONLY for signed-in freelancers
 *  - Knight (bottom-right, red — internally still "dragon" for back-compat
 *    with the SVG component name) appears ONLY for signed-in businesses
 *  - Neither shows for unauthenticated visitors or during onboarding
 *    (/auth, /choose-account-type, /complete-profile)
 *
 * Speech bubbles are deliberately slow — 6s visible / 18s hidden / 24s cycle
 * so they read as ambient presence rather than alerts competing with the
 * page's real CTAs.
 */

/* ─── Message pools — wizard = freelancer-facing only ─── */
const WIZARD_MESSAGES: Record<string, string[]> = {
  '/': [
    'Welcome back! 👋',
    'Keep your profile fresh to stand out.',
    'More skills = more gigs.',
  ],
  '/profile': [
    'A good bio wins more gigs.',
    'Fresh portfolio photos get clicks.',
    'List on the talent board to get discovered.',
  ],
  '/messages': [
    'Quick replies win the gig.',
    'Stay friendly — first impressions matter.',
  ],
  '/hire-requests': [
    'Respond fast to win the gig.',
    'Tap Accept if you\'re free.',
  ],
  '/students': [
    'Checking out the talent board?',
    'Your own listing lives on /profile.',
  ],
  _default: [
    'Tap me if you need a hand.',
    'Keep your profile up to date.',
  ],
};

/* ─── Message pools — knight = business-facing only ─── */
const KNIGHT_MESSAGES: Record<string, string[]> = {
  '/': [
    'Welcome back! 👋',
    'Local talent is just a tap away.',
    'Need something done? Head to /hire.',
  ],
  '/hire': [
    'Describe what you need — we\'ll match you.',
    'Zero commission, always.',
  ],
  '/students': [
    'See someone good? Tap Hire now.',
    'Not sure? Ask for a quote first.',
  ],
  '/business-dashboard': [
    'Manage your projects here.',
    'Post a new gig anytime.',
  ],
  '/messages': [
    'Lock in the details here.',
    'Freelancers love a clear brief.',
  ],
  _default: [
    'Tap me if you need a hand.',
    'Ready to hire? Head to /hire.',
  ],
};

/* ─── First-time business nudge (no hires yet) ─── */
const KNIGHT_FIRST_HIRE_MESSAGES: string[] = [
  '👋 First time hiring? Easy.',
  'Tap "Hire now" on anyone you like.',
  'Locals are ready to work.',
];

type MascotType = 'wizard' | 'knight';

interface PageGuide {
  /** Which mascot to show on this page, if any. Null means no mascot at all. */
  show: MascotType | null;
  messages: string[];
}

/**
 * Given the current path and authenticated user role, return the single
 * mascot to show (or null) plus the message pool for this page.
 */
function getPageGuide(
  path: string,
  userType: 'student' | 'business' | null,
): PageGuide {
  // Quiet during onboarding and auth — don't pester people mid-signup.
  const quietPrefixes = ['/auth', '/choose-account-type', '/complete-profile'];
  if (quietPrefixes.some((p) => path === p || path.startsWith(`${p}/`))) {
    return { show: null, messages: [] };
  }
  // Unauthenticated visitors and anyone without a user_type yet see nothing.
  if (!userType) return { show: null, messages: [] };

  const pickMessages = (pool: Record<string, string[]>): string[] => {
    if (pool[path]) return pool[path];
    const prefix = Object.keys(pool).find(
      (k) => k !== '_default' && path.startsWith(k),
    );
    return prefix ? pool[prefix] : pool._default;
  };

  if (userType === 'student') {
    return { show: 'wizard', messages: pickMessages(WIZARD_MESSAGES) };
  }
  if (userType === 'business') {
    return { show: 'knight', messages: pickMessages(KNIGHT_MESSAGES) };
  }
  return { show: null, messages: [] };
}

/* ─── Single mascot — stays in its corner, texts slowly ─── */
interface FloatingMascotProps {
  type: MascotType;
  messages: string[];
  side: 'left' | 'right';
  /** Keeps a single message pinned instead of rotating. Used for pending-hire. */
  persistBubble?: boolean;
  /** Overrides the default WhatsApp-open click behaviour. */
  onTap?: () => void;
  /** Custom tooltip. */
  title?: string;
  /**
   * Lifts the mascot above the 56px WhatsApp floating button when that button
   * is visible. Only the right-side (knight) uses this — WhatsApp lives in the
   * bottom-right corner too and we don't want them overlapping.
   */
  lift?: boolean;
}

// Timing constants — deliberately slow. Bubbles read as ambient presence,
// not alerts fighting for attention with the page's real CTAs.
const FIRST_BUBBLE_DELAY_MS = 4000;
const BUBBLE_VISIBLE_MS = 6000;
const BUBBLE_HIDDEN_MS = 18000;
const CYCLE_MS = BUBBLE_VISIBLE_MS + BUBBLE_HIDDEN_MS; // 24s

const FloatingMascot: React.FC<FloatingMascotProps> = ({
  type,
  messages,
  side,
  persistBubble = false,
  onTap,
  title,
  lift = false,
}) => {
  const [showBubble, setShowBubble] = useState(false);
  const [currentMessage, setCurrentMessage] = useState(messages[0] || '');
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const mascotSize = isMobile ? 52 : 64;

  // Reset to the first message when the pool changes (e.g. user navigates).
  useEffect(() => {
    setCurrentMessage(messages[0] || '');
  }, [messages]);

  // Slow rotation: wait, show, hide, repeat.
  useEffect(() => {
    if (!messages.length) return;
    setShowBubble(false);

    // Persistent mode: single message pinned on-screen (used for the pending
    // hire badge). Fade in after a short delay and stay.
    if (persistBubble) {
      const t = setTimeout(() => setShowBubble(true), 800);
      return () => clearTimeout(t);
    }

    let idx = 0;
    setCurrentMessage(messages[0]);

    const t1 = setTimeout(() => setShowBubble(true), FIRST_BUBBLE_DELAY_MS);
    const t2 = setTimeout(
      () => setShowBubble(false),
      FIRST_BUBBLE_DELAY_MS + BUBBLE_VISIBLE_MS,
    );

    const interval = setInterval(() => {
      idx = (idx + 1) % messages.length;
      setCurrentMessage(messages[idx]);
      setShowBubble(true);
      window.setTimeout(() => setShowBubble(false), BUBBLE_VISIBLE_MS);
    }, CYCLE_MS);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearInterval(interval);
    };
  }, [messages, persistBubble]);

  const handleClick = () => {
    if (onTap) {
      onTap();
      return;
    }
    const msgText =
      type === 'wizard'
        ? "Hi! I'm a freelancer interested in joining VANO!"
        : "Hi! I'm looking to hire a freelancer on VANO!";
    window.open(
      `${teamWhatsAppHref}?text=${encodeURIComponent(msgText)}`,
      '_blank',
    );
  };

  const baseBottom = isMobile ? 80 : 100;
  // WhatsApp button is 56px tall; 8px gap above it.
  const liftedBottom = baseBottom + 56 + 8;

  return (
    <div
      className="fixed z-[2100] cursor-pointer group"
      style={{
        ...(side === 'left'
          ? { left: isMobile ? 8 : 20 }
          : { right: isMobile ? 8 : 20 }),
        bottom: lift ? liftedBottom : baseBottom,
        width: mascotSize,
        height: mascotSize,
        transition: 'bottom 200ms ease-out',
      }}
      onClick={handleClick}
      title={
        title ??
        (type === 'wizard'
          ? 'Chat with us about freelancing!'
          : 'Chat with us about hiring!')
      }
    >
      {/* Speech bubble — long 500ms fade matches the calmer cadence */}
      <div
        className={cn(
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
        style={{ bottom: mascotSize / 2 }}
      >
        {currentMessage}
      </div>

      {/* Mascot SVG — gentle float only, no shake */}
      <div
        className={cn(
          'transition-transform duration-200 group-hover:scale-110 group-active:scale-95',
          !prefersReduced && 'animate-[float_4s_ease-in-out_infinite]',
        )}
      >
        {type === 'wizard' ? (
          <WizardMascot size={mascotSize} animate={!prefersReduced} />
        ) : (
          <DragonMascot size={mascotSize} animate={!prefersReduced} />
        )}
      </div>
    </div>
  );
};

/* ─── Main persistent guide rendered in App.tsx ─── */
export const MascotGuide: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  // userType comes from the shared AuthProvider — one subscription, one
  // profile fetch, shared across Navbar / WhatsApp button / hire-inbox link.
  const { user: sessionUser, userType: rawUserType } = useAuth();
  const userType = (rawUserType as 'student' | 'business' | null) ?? null;

  const [pendingHireCount, setPendingHireCount] = useState(0);
  const [businessHasHired, setBusinessHasHired] = useState<boolean | null>(null);

  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Light per-role data: pending hire count (freelancers) or has-ever-hired
  // status (businesses) so the mascot's tap-behaviour and message set can
  // adapt. No unlisted-freelancer nag — that was the aggressive UX we removed.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!sessionUser) {
        if (!cancelled) {
          setPendingHireCount(0);
          setBusinessHasHired(null);
        }
        return;
      }

      if (userType === 'student') {
        const { count } = await supabase
          .from('hire_requests' as any)
          .select('id', { count: 'exact', head: true })
          .eq('kind', 'direct')
          .eq('target_freelancer_id', sessionUser.id)
          .eq('status', 'pending')
          .gt('expires_at', new Date().toISOString());
        if (!cancelled) {
          setPendingHireCount(count ?? 0);
          setBusinessHasHired(null);
        }
      } else if (userType === 'business') {
        const { count } = await supabase
          .from('hire_requests' as any)
          .select('id', { count: 'exact', head: true })
          .eq('requester_id', sessionUser.id);
        if (!cancelled) {
          setPendingHireCount(0);
          setBusinessHasHired((count ?? 0) > 0);
        }
      } else if (!cancelled) {
        setPendingHireCount(0);
        setBusinessHasHired(null);
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [sessionUser, userType, location.pathname]);

  if (prefersReduced) return null;

  const guide = getPageGuide(location.pathname, userType);
  if (!guide.show) return null;

  const hasUrgentHire =
    userType === 'student' && pendingHireCount > 0 && guide.show === 'wizard';

  // Softened urgent-hire message — a calm single line pinned to the bubble
  // rather than the old screaming carousel of "RESPOND NOW!" / "CLOCK IS TICKING!".
  let effectiveMessages = guide.messages;
  if (hasUrgentHire) {
    const label =
      pendingHireCount === 1
        ? 'You have 1 hire request waiting.'
        : `You have ${pendingHireCount} hire requests waiting.`;
    effectiveMessages = [label];
  }

  // First-time business on the landing / hire / talent pages gets the
  // encouraging pool; everyone else gets the route's normal pool.
  if (
    guide.show === 'knight' &&
    businessHasHired === false &&
    (location.pathname === '/' ||
      location.pathname === '/hire' ||
      location.pathname.startsWith('/students'))
  ) {
    effectiveMessages = KNIGHT_FIRST_HIRE_MESSAGES;
  }

  // Tap handlers — urgent freelancer hire routes to inbox; first-time
  // business nudge routes to talent board. Otherwise defaults to WhatsApp.
  const wizardOnTap = hasUrgentHire ? () => navigate('/hire-requests') : undefined;
  const wizardTitle = hasUrgentHire ? 'You have hire requests waiting!' : undefined;
  const knightOnTap =
    userType === 'business' && businessHasHired === false && location.pathname === '/'
      ? () => navigate('/students')
      : undefined;
  const knightTitle =
    userType === 'business' && businessHasHired === false
      ? 'Browse freelancers now!'
      : undefined;

  // Lift the knight above the WhatsApp floating button when both are visible.
  const isTalentBoard =
    location.pathname === '/students' || location.pathname.startsWith('/students/');
  const whatsappVisible = Boolean(userType) && !isTalentBoard;

  if (guide.show === 'wizard') {
    return (
      <FloatingMascot
        type="wizard"
        messages={effectiveMessages}
        side="left"
        persistBubble={hasUrgentHire}
        onTap={wizardOnTap}
        title={wizardTitle}
      />
    );
  }
  return (
    <FloatingMascot
      type="knight"
      messages={effectiveMessages}
      side="right"
      onTap={knightOnTap}
      title={knightTitle}
      lift={whatsappVisible}
    />
  );
};
