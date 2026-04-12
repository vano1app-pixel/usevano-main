import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { WizardMascot } from './WizardMascot';
import { DragonMascot } from './DragonMascot';
import { teamWhatsAppHref } from '@/lib/contact';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

/* ─── Rotating message pools ─── */
const DRAGON_MESSAGES: Record<string, string[]> = {
  '/': [
    'Need help? Text VANO directly!',
    'Hire a freelancer in easy steps!',
    'Just tell us what you need!',
    'Affordable talent, right here!',
    'Find the perfect freelancer!',
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
    'Freelancers ready to work!',
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
  _default: [
    'Need help? Tap me!',
    'Get listed on the talent board!',
    'Questions? Tap me!',
  ],
};

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
}

const FloatingMascot: React.FC<FloatingMascotProps> = ({
  type, messages, side, isAngry = false, persistBubble = false,
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

  // Rotate messages: show 4s -> hide 2s -> next -> repeat
  useEffect(() => {
    if (!messages.length) return;
    setShowBubble(false);

    const showDelay = persistBubble ? 800 : 2000;
    const visibleDuration = 4000;
    const hideDuration = 2000;
    const cycleDuration = visibleDuration + hideDuration;

    const t1 = setTimeout(() => setShowBubble(true), showDelay);

    const interval = setInterval(() => {
      setShowBubble(false);
      setTimeout(() => {
        setMsgIndex(prev => {
          const next = (prev + 1) % messages.length;
          setCurrentMessage(messages[next]);
          return next;
        });
        setShowBubble(true);
      }, hideDuration);
    }, cycleDuration);

    return () => { clearTimeout(t1); clearInterval(interval); };
  }, [messages, persistBubble]);

  const handleClick = () => {
    const msgText = type === 'wizard'
      ? "Hi! I'm a freelancer interested in joining VANO!"
      : "Hi! I'm looking to hire a freelancer on VANO!";
    window.open(`${teamWhatsAppHref}?text=${encodeURIComponent(msgText)}`, '_blank');
  };

  return (
    <div
      className="fixed z-[2100] cursor-pointer group"
      style={{
        ...(side === 'left' ? { left: isMobile ? 8 : 20 } : { right: isMobile ? 8 : 20 }),
        bottom: isMobile ? 80 : 100,
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

  // Update guide config
  useEffect(() => {
    const base = getPageGuide(location.pathname);

    if (isUnlistedFreelancer) {
      const quietPages = ['/complete-profile', '/choose-account-type', '/auth'];
      const isQuiet = quietPages.some(p => location.pathname.startsWith(p));
      if (!isQuiet) {
        if (!base.show.includes('wizard')) base.show.push('wizard');
        base.wizardMessages = [NAG_MESSAGES[nagIndex]];
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
          messages={guide.wizardMessages}
          side="left"
          isAngry={isAngry}
          persistBubble={isUnlistedFreelancer}
        />
      )}
      {showDragon && (
        <FloatingMascot
          type="dragon"
          messages={guide.dragonMessages}
          side="right"
        />
      )}
    </>
  );
};
