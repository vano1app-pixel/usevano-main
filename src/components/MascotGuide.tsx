import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { WizardMascot } from './WizardMascot';
import { DragonMascot } from './DragonMascot';
import { teamWhatsAppHref } from '@/lib/contact';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuthContext';
import { cn } from '@/lib/utils';

/* ─── Rotating message pools ─── */
const DRAGON_MESSAGES: Record<string, string[]> = {
  '/': [
    'Need help? Text VANO directly!',
    'Hire a freelancer in easy steps!',
    'Just tell us what you need!',
    'Affordable talent, right here!',
    'Find the perfect freelancer!',
    '⚡ Click "Hire now" — they respond in 2hrs!',
  ],
  '/hire': [
    'Describe what you need!',
    'We match you in 24 hours!',
    'Zero commission — you keep it all!',
    'Just tell us what you need!',
    'Need help? Text VANO directly!',
  ],
  '/students': [
    'Browse local talent!',
    'Tap a category to explore!',
    '⚡ Hit "Hire now" to lock someone in!',
    'Freelancers ready to work!',
    'Ask for a quote — no commitment!',
    'Need help? Text VANO directly!',
  ],
  '/auth': [
    'Sign in to hire talent!',
    'It takes 30 seconds!',
    'Need help? Text VANO directly!',
  ],
  '/choose-account-type': [
    'Pick business to hire!',
    'Need help choosing? Tap me!',
  ],
  '/business-dashboard': [
    'Manage your projects here!',
    'Post a new gig!',
    'Need help? Text VANO directly!',
  ],
  '/messages': [
    'Chat with your freelancer!',
    'Need help? Text VANO directly!',
  ],
  _default: [
    'Need help? Text VANO directly!',
    'Hire a freelancer in easy steps!',
    'Questions? Tap me!',
  ],
};

/* ─── Business-specific pools (shown when viewer is confirmed business) ─── */
const DRAGON_BUSINESS_MESSAGES: Record<string, string[]> = {
  '/students': [
    '⚡ See someone good? Hit Hire now!',
    'They have 2 hours to respond!',
    'Lock in a freelancer in one click!',
    'Not sure? Ask for a quote first!',
  ],
  _default: [
    '⚡ Hire now — 2hr response guaranteed!',
    'Ready to hire? Let\'s go!',
  ],
};

/* ─── Business who hasn't hired anyone yet ─── */
const DRAGON_FIRST_HIRE_MESSAGES: string[] = [
  '👋 First time hiring? Easy!',
  '⚡ Tap "Hire now" on anyone!',
  'Your first hire — let\'s do this!',
  'Locals are waiting for you!',
];

const WIZARD_MESSAGES: Record<string, string[]> = {
  '/': [
    'Show your skills to the world!',
    'Join the talent board — it\'s free!',
    'Get discovered by businesses!',
    'Need help? Tap me!',
    'Freelancers are getting gigs daily!',
  ],
  '/auth': [
    'Join as a freelancer!',
    'It takes 30 seconds!',
    'Need help? Tap me!',
  ],
  '/choose-account-type': [
    'Pick freelancer!',
    'Show businesses what you can do!',
  ],
  '/profile': [
    'Make your profile stand out!',
    'Add skills to get discovered!',
    'A good bio gets more gigs!',
    '⚡ Check your hire requests inbox!',
    'Need help? Tap me!',
  ],
  '/complete-profile': [
    'Almost there!',
    'Add your best skills!',
    'Looking good!',
  ],
  '/messages': [
    'Stay connected!',
    'Quick replies get more gigs!',
    'Need help? Tap me!',
  ],
  '/hire-requests': [
    '⚡ Respond fast to win the gig!',
    'Tap Accept if you\'re free!',
    'You have 2 hours — don\'t miss it!',
  ],
  _default: [
    'Need help? Tap me!',
    'Get listed on the talent board!',
    'Questions? Tap me!',
  ],
};

/* ─── URGENT: Freelancer has a pending hire request ─── */
const WIZARD_URGENT_HIRE_MESSAGES: string[] = [
  '🎯 A business wants to hire you — GO!',
  '⚡ Respond in 2hrs or they move on!',
  '🔥 Accept now before someone else does!',
  '⏰ The clock is ticking — open your inbox!',
  '💰 Don\'t lose this gig — respond!',
];

type MascotType = 'wizard' | 'dragon';

interface PageGuide {
  show: MascotType[];
  wizardMessages: string[];
  dragonMessages: string[];
}

function getPageGuide(path: string): PageGuide {
  const getMessages = (pool: Record<string, string[]>, p: string) => {
    if (pool[p]) return pool[p];
    const prefix = Object.keys(pool).find(k => k !== '_default' && p.startsWith(k));
    if (prefix) return pool[prefix];
    return pool._default;
  };

  const wMsgs = getMessages(WIZARD_MESSAGES, path);
  const dMsgs = getMessages(DRAGON_MESSAGES, path);

  if (path === '/') return { show: ['wizard', 'dragon'], wizardMessages: wMsgs, dragonMessages: dMsgs };
  if (path === '/hire') return { show: ['dragon'], wizardMessages: wMsgs, dragonMessages: dMsgs };
  if (path === '/students' || path.startsWith('/students/')) return { show: ['dragon'], wizardMessages: wMsgs, dragonMessages: dMsgs };
  if (path === '/auth') return { show: ['wizard', 'dragon'], wizardMessages: wMsgs, dragonMessages: dMsgs };
  if (path === '/choose-account-type') return { show: ['wizard', 'dragon'], wizardMessages: wMsgs, dragonMessages: dMsgs };
  if (path === '/profile' || path === '/complete-profile') return { show: ['wizard'], wizardMessages: wMsgs, dragonMessages: dMsgs };
  if (path === '/business-dashboard') return { show: ['dragon'], wizardMessages: wMsgs, dragonMessages: dMsgs };
  if (path === '/messages') return { show: ['wizard', 'dragon'], wizardMessages: wMsgs, dragonMessages: dMsgs };
  return { show: ['wizard', 'dragon'], wizardMessages: wMsgs, dragonMessages: dMsgs };
}

/* ─── Single mascot — stays in corner, rotates messages ─── */
interface FloatingMascotProps {
  type: MascotType;
  messages: string[];
  side: 'left' | 'right';
  isAngry?: boolean;
  persistBubble?: boolean;
  /** Overrides the default WhatsApp-open click behaviour (e.g. route to inbox). */
  onTap?: () => void;
  /** Custom tooltip for the mascot. */
  title?: string;
  /**
   * Extra delay (ms) added before the bubble first appears. Used to stagger
   * multiple mascots so their speech bubbles take turns instead of overlapping.
   */
  turnOffsetMs?: number;
  /**
   * When true, lifts the mascot above the ~56px WhatsApp floating button plus
   * an 8px gap. Only relevant on the right side (where WhatsApp lives).
   */
  lift?: boolean;
}

const FloatingMascot: React.FC<FloatingMascotProps> = ({
  type, messages, side, isAngry = false, persistBubble = false, onTap, title, turnOffsetMs = 0, lift = false,
}) => {
  const [showBubble, setShowBubble] = useState(false);
  const [currentMessage, setCurrentMessage] = useState(messages[0] || '');
  const [msgIndex, setMsgIndex] = useState(0);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const prefersReduced = typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const mascotSize = isMobile ? 52 : 64;

  // Reset messages when pool changes (route change)
  useEffect(() => {
    setMsgIndex(0);
    setCurrentMessage(messages[0] || '');
  }, [messages]);

  // Rotate messages. Visible + hidden durations are kept equal so two mascots
  // with a half-cycle turnOffsetMs alternate cleanly without their bubbles
  // overlapping. Cycle = 7000ms (3500ms visible → 3500ms hidden → next).
  useEffect(() => {
    if (!messages.length) return;
    setShowBubble(false);

    const baseDelay = persistBubble ? 800 : 1500;
    const visibleDuration = 3500;
    const hideDuration = 3500;
    const cycleDuration = visibleDuration + hideDuration;
    const showDelay = baseDelay + Math.max(0, turnOffsetMs);

    const t1 = setTimeout(() => setShowBubble(true), showDelay);
    // Auto-hide after visibleDuration so two mascots can take turns.
    const t2 = setTimeout(() => setShowBubble(false), showDelay + visibleDuration);

    const interval = setInterval(() => {
      setMsgIndex(prev => {
        const next = (prev + 1) % messages.length;
        setCurrentMessage(messages[next]);
        return next;
      });
      setShowBubble(true);
      // Hide again after visible window
      window.setTimeout(() => setShowBubble(false), visibleDuration);
    }, cycleDuration);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearInterval(interval);
    };
  }, [messages, persistBubble, turnOffsetMs]);

  const handleClick = () => {
    if (onTap) { onTap(); return; }
    const msgText = type === 'wizard'
      ? "Hi! I'm a freelancer interested in joining VANO!"
      : "Hi! I'm looking to hire a freelancer on VANO!";
    window.open(`${teamWhatsAppHref}?text=${encodeURIComponent(msgText)}`, '_blank');
  };

  // Lift the mascot above the WhatsApp floating button when it's present.
  // WhatsApp is 56px tall; add a small gap so they sit stacked cleanly.
  const baseBottom = isMobile ? 80 : 100;
  const liftedBottom = baseBottom + 56 + 8;
  return (
    <div
      className="fixed z-[2100] cursor-pointer group"
      style={{
        ...(side === 'left' ? { left: isMobile ? 8 : 20 } : { right: isMobile ? 8 : 20 }),
        bottom: lift ? liftedBottom : baseBottom,
        width: mascotSize,
        height: mascotSize,
        transition: 'bottom 200ms ease-out',
      }}
      onClick={handleClick}
      title={title ?? (type === 'wizard' ? 'Chat with us about freelancing!' : 'Chat with us about hiring!')}
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
        style={{ bottom: mascotSize / 2 }}
      >
        {currentMessage}
      </div>

      {/* Mascot SVG — floats in corner, shakes when angry */}
      <div className={cn(
        'transition-transform duration-200 group-hover:scale-110 group-active:scale-95',
        !prefersReduced && !isAngry && 'animate-[float_4s_ease-in-out_infinite]',
        isAngry && 'animate-[shake_0.5s_ease-in-out_infinite]',
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
  const navigate = useNavigate();
  // userType comes from the shared AuthProvider so we don't re-fetch profiles
  // here — Navbar, WhatsApp button and the hire-inbox link all share the same cached value.
  const { user: sessionUser, userType: rawUserType } = useAuth();
  const userType = (rawUserType as 'student' | 'business' | null) ?? null;
  const [guide, setGuide] = useState<PageGuide>(getPageGuide('/'));
  const [isUnlistedFreelancer, setIsUnlistedFreelancer] = useState(false);
  const [pendingHireCount, setPendingHireCount] = useState(0);
  const [businessHasHired, setBusinessHasHired] = useState<boolean | null>(null);
  const [nagIndex, setNagIndex] = useState(0);

  const prefersReduced = typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Fetch only the extras we need beyond user_type: unlisted status + pending
  // hire count for freelancers, or has-ever-hired status for businesses.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!sessionUser) {
        if (!cancelled) {
          setIsUnlistedFreelancer(false);
          setPendingHireCount(0);
          setBusinessHasHired(null);
        }
        return;
      }

      if (userType === 'student') {
        const [{ data: sp }, { count: pendingCount }] = await Promise.all([
          supabase
            .from('student_profiles')
            .select('community_board_status')
            .eq('user_id', sessionUser.id)
            .maybeSingle(),
          supabase
            .from('hire_requests' as any)
            .select('id', { count: 'exact', head: true })
            .eq('kind', 'direct')
            .eq('target_freelancer_id', sessionUser.id)
            .eq('status', 'pending')
            .gt('expires_at', new Date().toISOString()),
        ]);
        if (!cancelled) {
          setIsUnlistedFreelancer(sp?.community_board_status !== 'approved');
          setPendingHireCount(pendingCount ?? 0);
          setBusinessHasHired(null);
        }
      } else if (userType === 'business') {
        const { count: totalHires } = await supabase
          .from('hire_requests' as any)
          .select('id', { count: 'exact', head: true })
          .eq('requester_id', sessionUser.id);
        if (!cancelled) {
          setIsUnlistedFreelancer(false);
          setPendingHireCount(0);
          setBusinessHasHired((totalHires ?? 0) > 0);
        }
      } else if (!cancelled) {
        setIsUnlistedFreelancer(false);
        setPendingHireCount(0);
        setBusinessHasHired(null);
      }
    };
    check();
    return () => { cancelled = true; };
    // Re-run when the signed-in user changes, userType resolves, or the user
    // navigates (so e.g. a freelancer who just responded on /hire-requests
    // sees the urgent mascot go away when they return to /).
  }, [sessionUser, userType, location.pathname]);

  // Escalate "you're unlisted" nag messages (only when no urgent hire is pending).
  useEffect(() => {
    if (!isUnlistedFreelancer || pendingHireCount > 0) return;
    const interval = setInterval(() => {
      setNagIndex(prev => Math.min(prev + 1, NAG_MESSAGES.length - 1));
    }, 20000);
    return () => clearInterval(interval);
  }, [isUnlistedFreelancer, pendingHireCount]);

  // Update guide config with priority:
  //   1. Urgent: pending hire request waiting (wizard screams to respond)
  //   2. Nag: freelancer not listed yet
  //   3. Business-specific: hire now / first hire prompts
  //   4. Default: route-based messages
  useEffect(() => {
    const base = getPageGuide(location.pathname);
    const quietPages = ['/complete-profile', '/choose-account-type', '/auth'];
    const isQuiet = quietPages.some(p => location.pathname.startsWith(p));

    // 1. URGENT — freelancer has a pending hire waiting. Overrides everything.
    if (userType === 'student' && pendingHireCount > 0 && !isQuiet) {
      if (!base.show.includes('wizard')) base.show.push('wizard');
      const countLabel = pendingHireCount === 1
        ? '🎯 1 hire request waiting — respond NOW!'
        : `🎯 ${pendingHireCount} hire requests waiting — respond NOW!`;
      base.wizardMessages = [countLabel, ...WIZARD_URGENT_HIRE_MESSAGES];
      // Don't show the dragon/knight on top — the freelancer has one job right now.
      base.show = ['wizard'];
      setGuide(base);
      return;
    }

    // 2. Unlisted-freelancer nag
    if (isUnlistedFreelancer && !isQuiet) {
      if (!base.show.includes('wizard')) base.show.push('wizard');
      base.wizardMessages = [NAG_MESSAGES[nagIndex]];
    }

    // 3. Business-specific messaging (only when user is confirmed business)
    if (userType === 'business' && !isQuiet) {
      const path = location.pathname;
      // First-time business (no hire yet) on talent board / home / hire — make it obvious
      if (businessHasHired === false && (path === '/' || path === '/hire' || path.startsWith('/students'))) {
        base.dragonMessages = DRAGON_FIRST_HIRE_MESSAGES;
        if (!base.show.includes('dragon')) base.show.push('dragon');
      } else if (path.startsWith('/students')) {
        base.dragonMessages = DRAGON_BUSINESS_MESSAGES['/students'];
        if (!base.show.includes('dragon')) base.show.push('dragon');
      } else if (!DRAGON_MESSAGES[path]) {
        base.dragonMessages = DRAGON_BUSINESS_MESSAGES._default;
      }
    }

    setGuide(base);
  }, [location.pathname, isUnlistedFreelancer, nagIndex, pendingHireCount, userType, businessHasHired]);

  if (prefersReduced) return null;

  const hasUrgentHire = userType === 'student' && pendingHireCount > 0;
  const isAngry = hasUrgentHire || (isUnlistedFreelancer && nagIndex >= 3);
  const showWizard = guide.show.includes('wizard');
  const showDragon = guide.show.includes('dragon');

  // Wire contextual tap handlers:
  // - Urgent pending hire → open inbox
  // - Unlisted freelancer → open /profile to list
  // - First-time business on talent board → scroll to top (stay in flow), default WhatsApp elsewhere
  const wizardOnTap = hasUrgentHire
    ? () => navigate('/hire-requests')
    : isUnlistedFreelancer
      ? () => navigate('/profile')
      : undefined;
  const wizardTitle = hasUrgentHire
    ? 'You have hire requests waiting!'
    : isUnlistedFreelancer
      ? 'Finish your profile to get listed!'
      : undefined;

  const dragonOnTap =
    userType === 'business' && businessHasHired === false && location.pathname === '/'
      ? () => navigate('/students')
      : undefined;
  const dragonTitle =
    userType === 'business' && businessHasHired === false
      ? 'Browse freelancers now!'
      : undefined;

  // When both mascots are visible, stagger their bubbles by half a cycle so
  // they speak back-to-back instead of overlapping in the middle of the screen.
  const bothVisible = showWizard && showDragon;
  const wizardOffset = 0;
  const dragonOffset = bothVisible ? 3500 : 0;

  // The WhatsApp floating button (bottom-right) is shown for authenticated
  // users with a user_type set, everywhere except the talent board. Mirror
  // that condition here so the knight slides up above it instead of hiding
  // behind it. Only applies to the right-side mascot ("dragon"/knight).
  const isTalentBoard =
    location.pathname === '/students' || location.pathname.startsWith('/students/');
  const whatsappVisible = Boolean(userType) && !isTalentBoard;
  const dragonLift = whatsappVisible;

  return (
    <>
      {showWizard && (
        <FloatingMascot
          type="wizard"
          messages={guide.wizardMessages}
          side="left"
          isAngry={isAngry}
          persistBubble={isUnlistedFreelancer || hasUrgentHire}
          onTap={wizardOnTap}
          title={wizardTitle}
          turnOffsetMs={wizardOffset}
        />
      )}
      {showDragon && (
        <FloatingMascot
          type="dragon"
          messages={guide.dragonMessages}
          side="right"
          onTap={dragonOnTap}
          title={dragonTitle}
          turnOffsetMs={dragonOffset}
          lift={dragonLift}
        />
      )}
    </>
  );
};
