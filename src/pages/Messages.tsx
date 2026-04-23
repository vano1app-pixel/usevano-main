import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Navbar } from '@/components/Navbar';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ReviewForm } from '@/components/ReviewForm';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MessageCircle, Send, Image, Check, CheckCheck, Mail, Phone, Instagram, SquarePen, Search, BadgeCheck, Loader2, Banknote, Sparkles, ArrowRight, ShieldCheck, AlertTriangle, RotateCcw, Star, TrendingUp } from 'lucide-react';
import { createHireAgreement, getActiveHireAgreement, HireAgreementError } from '@/lib/hireAgreement';
import { VanoPayModal } from '@/components/VanoPayModal';
import { BusinessDealsPanel } from '@/components/BusinessDealsPanel';
import { VANO_PAY_VISIBLE } from '@/lib/featureFlags';
import { formatDistanceToNow, format, isToday, isYesterday, isThisWeek } from 'date-fns';
import {
  TEAM_CONTACT_EMAIL,
  TEAM_INSTAGRAM_HANDLE,
  TEAM_INSTAGRAM_URL,
  TEAM_PHONE_DISPLAY,
  teamMailtoHref,
  teamTelHref,
} from '@/lib/contact';
import { getSupabaseProjectRef } from '@/lib/supabaseEnv';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { StatusChip } from '@/components/ui/StatusChip';
import { EmptyState } from '@/components/ui/EmptyState';

interface Conversation {
  id: string;
  job_id: string | null;
  participant_1: string;
  participant_2: string;
  updated_at: string;
  /** Set when this conversation is part of a multi-send broadcast. NULL for normal 1:1s. */
  broadcast_id?: string | null;
  otherUserId?: string;
  otherName?: string;
  otherAvatar?: string | null;
  jobTitle?: string;
  lastMessageText?: string;
  lastMessageTime?: string;
  unreadCount?: number;
  /** Broadcast summary denormalised into the list item so the chip can render
   *  without a per-row RPC. Populated in loadConversations when broadcast_id is set. */
  broadcastStatus?: 'open' | 'filled' | 'cancelled' | 'expired';
  broadcastTargetCount?: number;
  broadcastFilledBy?: string | null;
}

/** Resolved view of a quote_broadcasts row plus the winner's display name. */
interface BroadcastInfo {
  id: string;
  requesterId: string;
  status: 'open' | 'filled' | 'cancelled' | 'expired';
  targetCount: number;
  filledBy: string | null;
  filledByName: string | null;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  read: boolean;
  created_at: string;
  image_url?: string | null;
  optimistic?: boolean;
}

const TypingIndicator = () => (
  <div className="flex justify-start">
    <div className="bg-secondary text-secondary-foreground rounded-2xl rounded-bl-md px-4 py-2.5">
      <div className="flex gap-1 items-center h-4">
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  </div>
);

const playNotificationSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch {}
};

function formatConvoTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return 'Yesterday';
  if (isThisWeek(date)) return format(date, 'EEE');
  return format(date, 'dd MMM');
}

/**
 * Tap-to-fill quick replies shown above the compose textarea once a
 * conversation is selected. The freelancer side is a single universal set
 * that fits almost any incoming hire message. The business side is keyed
 * to the freelancer's community category so the suggestion matches the
 * actual trade on the other end of the conversation (a videography-shop
 * opener doesn't make sense for a websites freelancer).
 *
 * Chips never auto-send — tapping fills the textarea and focuses it, the
 * user still hits Enter / Send.
 */
const QUICK_REPLIES_FREELANCER = [
  'Thanks — interested, tell me more',
  'Can you share more details?',
  "I'll send a quote by end of day",
];

const QUICK_REPLIES_BUSINESS_BY_CATEGORY: Record<string, string[]> = {
  videography: [
    'Can I see a recent reel?',
    "What's your turnaround on a 30s edit?",
    'Do you film events?',
  ],
  websites: [
    "Can I see a site you've built?",
    'How long for a 3-page site?',
    'Do you work in Next.js / Webflow / WordPress?',
  ],
  digital_sales: [
    "What's your typical close rate?",
    'Outbound or inbound?',
    'Can you work on commission?',
  ],
  social_media: [
    "Can you show me UGC you've made?",
    'Do you manage content calendars?',
    "What's your rate for 10 TikToks a month?",
  ],
};

const Messages = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvo, setSelectedConvo] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [otherTyping, setOtherTyping] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  // Multi-send broadcast view of the currently-selected conversation. NULL when
  // the conversation is a normal 1:1. Used to render the "1 of N — first to
  // reply wins" / "✓ {Name} replied first" badge under the thread header.
  const [broadcastInfo, setBroadcastInfo] = useState<BroadcastInfo | null>(null);
  // Active hire agreement for the selected conversation (one row in
  // hire_agreements). When set, the "Mark as hired" button swaps for a
  // "✓ Hired" chip and the thread is considered formally closed.
  const [hireAgreement, setHireAgreement] = useState<{ id: string; business_id: string; freelancer_id: string; created_at: string } | null>(null);
  const [hiringInProgress, setHiringInProgress] = useState(false);
  const [vanoPayOpen, setVanoPayOpen] = useState(false);

  // Held / released / refunded Vano Pay rows for the active thread.
  // Drives the in-thread payment receipt banner so both parties can
  // see the state of any held escrow payment + the hirer can release
  // or flag a dispute without leaving the chat. Fetched when the
  // selected conversation changes.
  type ThreadPayment = {
    id: string;
    business_id: string;
    freelancer_id: string;
    amount_cents: number;
    fee_cents: number;
    currency: string;
    status: 'awaiting_payment' | 'paid' | 'transferred' | 'failed' | 'refunded';
    auto_release_at: string | null;
    released_at: string | null;
    refunded_at: string | null;
    dispute_reason: string | null;
    description: string | null;
    /** Populated for payouts that originated from the digital-sales
     *  pipeline — surfaces a "Bonus" badge on the receipt so the
     *  row is distinguishable from a generic hourly/project payment
     *  without opening the deal. */
    sales_deal_id: string | null;
    created_at: string;
  };
  const [threadPayments, setThreadPayments] = useState<ThreadPayment[]>([]);
  // Per-row in-flight flags so a double-click doesn't fire two
  // release / refund calls. Keyed by payment id.
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  // Dispute dialog state — opens with a payment id, collects an
  // optional free-text reason, posts to refund-vano-payment.
  const [disputeForPaymentId, setDisputeForPaymentId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState('');

  // Review dialog state — opens ReviewForm scoped to a released
  // vano_payment so the hirer can rate the freelancer. The id set
  // below is the hirer's already-reviewed payments so the "Leave a
  // review" button hides after the write lands; the reviews INSERT
  // RLS also blocks duplicates via the UNIQUE partial on
  // (vano_payment_id, reviewer_id).
  const [reviewForPaymentId, setReviewForPaymentId] = useState<string | null>(null);
  const [reviewedPaymentIds, setReviewedPaymentIds] = useState<Set<string>>(new Set());

  // Viewer's user_type so we can gate the "Mark as hired" button to businesses.
  const [viewerUserType, setViewerUserType] = useState<string | null>(null);
  // "Work is done" detector — when the freelancer's latest message
  // contains a done-ish phrase within the last 24h, we surface a small
  // nudge inside the held-payment card so the hirer can act without
  // re-reading the whole thread. Word-boundary regex so "I'm done for
  // the day" triggers but "doneness" wouldn't. Memoised on messages +
  // viewerUserType so it doesn't re-run on every keystroke. Placed
  // here (after viewerUserType declaration) to satisfy the
  // block-scoped dependency.
  const DONE_PHRASES_RE = useMemo(() =>
    /\b(done|finished|finishing|completed?|delivered|ready|wrapped up|all set|sent over|here you go|here'?s the)\b/i,
  []);
  const freelancerSaidDone = useMemo(() => {
    if (!user?.id || viewerUserType !== 'business') return false;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m.sender_id === user.id) continue;
      // Only surface if recent (< 24h) — a month-old "done" is
      // noise, not a nudge.
      const ageMs = Date.now() - new Date(m.created_at).getTime();
      if (ageMs > 24 * 60 * 60 * 1000) return false;
      return DONE_PHRASES_RE.test(m.content);
    }
    return false;
  }, [messages, user?.id, viewerUserType, DONE_PHRASES_RE]);
  // Freelancer's own Vano Pay readiness — drives the in-thread "Enable
  // Vano Pay" banner shown to students who have a chat with a business
  // but haven't linked a Stripe account yet. Null while loading so the
  // banner doesn't flash before we know.
  const [viewerPayoutsEnabled, setViewerPayoutsEnabled] = useState<boolean | null>(null);
  const [vanoPayBannerDismissed, setVanoPayBannerDismissed] = useState(false);
  // Other-party metadata for the active conversation — used by the
  // quick-reply chip row to pick the right suggestion bucket. Business
  // viewers get category-keyed opener chips keyed to this; freelancer
  // viewers ignore it.
  const [otherUserType, setOtherUserType] = useState<string | null>(null);
  const [otherCategory, setOtherCategory] = useState<string | null>(null);
  // Other party's Vano Pay readiness — drives the "Pay via Vano" button
  // gating for businesses. null = unknown (button hidden until we know
  // so businesses don't click into a confusing error toast).
  const [otherPayoutsEnabled, setOtherPayoutsEnabled] = useState<boolean | null>(null);
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Per-tab suffix on every realtime channel name. Without it, opening the
  // same conversation in two tabs collides on channel names like
  // `messages-${convoId}` — closing one tab unsubscribes the shared channel
  // and the other tab stops receiving realtime events.
  const sessionSuffixRef = useRef(Math.random().toString(36).slice(2, 10));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [contactTeamOpen, setContactTeamOpen] = useState(false);
  const [newConvoOpen, setNewConvoOpen] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<{ user_id: string; display_name: string | null; avatar_url: string | null }[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  useEffect(() => { loadUser(); }, []);

  useEffect(() => {
    if (selectedConvo) {
      loadMessages(selectedConvo);
      markAsRead(selectedConvo);
    }
  }, [selectedConvo]);

  // Fetch the viewer's user_type once so we can gate the "Mark as hired"
  // button — only businesses see it.
  useEffect(() => {
    if (!user?.id) { setViewerUserType(null); return; }
    void supabase
      .from('profiles')
      .select('user_type')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          if (import.meta.env.DEV) console.warn('[Messages] viewer user_type fetch failed', error);
          setViewerUserType(null);
          return;
        }
        setViewerUserType(data?.user_type || null);
      });
  }, [user?.id]);

  // Pull the viewer's own stripe_payouts_enabled so the "Enable Vano
  // Pay" banner can gate itself. Only relevant for students; skip the
  // round-trip entirely for business viewers.
  useEffect(() => {
    if (!user?.id || viewerUserType !== 'student') {
      setViewerPayoutsEnabled(null);
      return;
    }
    void supabase
      .from('student_profiles')
      .select('stripe_payouts_enabled')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          if (import.meta.env.DEV) console.warn('[Messages] stripe_payouts_enabled fetch failed', error);
          setViewerPayoutsEnabled(null);
          return;
        }
        setViewerPayoutsEnabled(!!data?.stripe_payouts_enabled);
      });
  }, [user?.id, viewerUserType]);

  // Fetch other-party metadata for the quick-reply chip row. Runs in parallel
  // so we don't stack two round trips. Reset state immediately on convo
  // change so a chip set from a previous thread doesn't flash into view on
  // the new one before this effect settles.
  useEffect(() => {
    if (!selectedConvo) {
      setOtherUserType(null);
      setOtherCategory(null);
      setOtherPayoutsEnabled(null);
      return;
    }
    const conv = conversations.find((c) => c.id === selectedConvo);
    const otherId = conv?.otherUserId;
    if (!otherId) {
      setOtherUserType(null);
      setOtherCategory(null);
      setOtherPayoutsEnabled(null);
      return;
    }
    setOtherUserType(null);
    setOtherCategory(null);
    setOtherPayoutsEnabled(null);
    let cancelled = false;
    void (async () => {
      const [profileRes, postRes, payoutsRes] = await Promise.all([
        supabase.from('profiles').select('user_type').eq('user_id', otherId).maybeSingle(),
        supabase.from('community_posts').select('category').eq('user_id', otherId).limit(1).maybeSingle(),
        // We need this only when viewer is business, but it's a single
        // tiny query and gates a destructive UX (clicking into an error
        // toast) so we always fetch and let the render decide.
        supabase.from('student_profiles').select('stripe_payouts_enabled').eq('user_id', otherId).maybeSingle(),
      ]);
      if (cancelled) return;
      setOtherUserType((profileRes.data?.user_type as string | null) ?? null);
      setOtherCategory((postRes.data?.category as string | null) ?? null);
      setOtherPayoutsEnabled(!!payoutsRes.data?.stripe_payouts_enabled);
    })();
    return () => { cancelled = true; };
  }, [selectedConvo, conversations]);

  // Active hire agreement lookup for the selected conversation. Realtime on
  // the table so the chip updates the moment the business hits the button
  // in another tab or the trigger fires.
  useEffect(() => {
    if (!selectedConvo) { setHireAgreement(null); return; }
    let cancelled = false;
    void (async () => {
      const agreement = await getActiveHireAgreement(selectedConvo);
      if (!cancelled) setHireAgreement(agreement);
    })();
    const channel = supabase
      .channel(`hire-agreement-${selectedConvo}-${sessionSuffixRef.current}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'hire_agreements',
        filter: `conversation_id=eq.${selectedConvo}`,
      }, async () => {
        const agreement = await getActiveHireAgreement(selectedConvo);
        if (!cancelled) setHireAgreement(agreement);
      })
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [selectedConvo]);

  // Held + released + refunded Vano Pay rows for the selected
  // conversation. Drives the in-thread payment receipt card and the
  // hirer's Release / Flag-a-problem actions. Fetches on selection
  // change + on the Stripe-return query param so a hirer landing back
  // from Checkout sees the fresh "held" state immediately.
  useEffect(() => {
    if (!selectedConvo) { setThreadPayments([]); setReviewedPaymentIds(new Set()); return; }
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from('vano_payments')
        .select('id, business_id, freelancer_id, amount_cents, fee_cents, currency, status, auto_release_at, released_at, refunded_at, dispute_reason, description, sales_deal_id, created_at')
        .eq('conversation_id', selectedConvo)
        .in('status', ['paid', 'transferred', 'refunded'])
        .order('created_at', { ascending: false });
      if (cancelled) return;
      // sales_deal_id was added by migration 20260421140000; the
      // generated DB types haven't picked it up yet so we cast
      // through unknown. The migration has run server-side — this
      // is only a build-time typing gap.
      const payments = (data ?? []) as unknown as ThreadPayment[];
      setThreadPayments(payments);

      // Load which of THIS viewer's reviews already exist for the
      // released payments in this thread, so the "Leave a review"
      // nudge hides once they've left one. RLS makes this safe: a
      // non-reviewer viewer (freelancer side) still gets to read
      // reviews (they're public), but the filter on reviewer_id
      // scopes to what the hirer has submitted themselves.
      if (!user) return;
      const transferredIds = payments.filter((p) => p.status === 'transferred').map((p) => p.id);
      if (transferredIds.length === 0) {
        if (!cancelled) setReviewedPaymentIds(new Set());
        return;
      }
      const { data: reviewRows } = await supabase
        .from('reviews')
        .select('vano_payment_id')
        .eq('reviewer_id', user.id)
        .in('vano_payment_id', transferredIds);
      if (cancelled) return;
      setReviewedPaymentIds(new Set((reviewRows ?? []).map((r) => r.vano_payment_id as string).filter(Boolean)));
    };
    void load();

    // Realtime refresh so the receipt flips to "released" / "refunded"
    // the instant the webhook or edge function writes — hirer clicks
    // Release on desktop and sees the state change on their phone
    // without reloading.
    const channel = supabase
      .channel(`vano-payments-${selectedConvo}-${sessionSuffixRef.current}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'vano_payments',
        filter: `conversation_id=eq.${selectedConvo}`,
      }, () => { void load(); })
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [selectedConvo]);

  // Pull broadcast metadata for the selected conversation so the thread can
  // show "1 of N being asked" / "✓ {Name} replied first" badges. Fetched on
  // demand (per selection) to keep the conversation list payload small.
  useEffect(() => {
    if (!selectedConvo) { setBroadcastInfo(null); return; }
    const convo = conversations.find((c) => c.id === selectedConvo);
    const broadcastId = convo?.broadcast_id || null;
    if (!broadcastId) { setBroadcastInfo(null); return; }
    let cancelled = false;
    void (async () => {
      const { data: bRow } = await supabase
        .from('quote_broadcasts' as any)
        .select('id, requester_id, status, target_count, filled_by')
        .eq('id', broadcastId)
        .maybeSingle();
      if (cancelled || !bRow) return;
      const row = bRow as any;
      let filledByName: string | null = null;
      if (row.filled_by) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('user_id', row.filled_by)
          .maybeSingle();
        filledByName = prof?.display_name || null;
      }
      if (cancelled) return;
      setBroadcastInfo({
        id: row.id,
        requesterId: row.requester_id,
        status: row.status,
        targetCount: row.target_count ?? 0,
        filledBy: row.filled_by ?? null,
        filledByName,
      });
    })();
    return () => { cancelled = true; };
  }, [selectedConvo, conversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [newMessage]);

  // Realtime: new messages + read receipts
  useEffect(() => {
    if (!selectedConvo || !user) return;
    const channel = supabase
      .channel(`messages-${selectedConvo}-${sessionSuffixRef.current}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedConvo}` }, (payload) => {
        const newMsg = payload.new as Message;
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        if (newMsg.sender_id !== user.id) {
          playNotificationSound();
          markAsRead(selectedConvo);
        }
        // Update last message preview in sidebar
        setConversations((prev) => prev.map((c) =>
          c.id === selectedConvo
            ? { ...c, lastMessageText: newMsg.content, lastMessageTime: newMsg.created_at, updated_at: newMsg.created_at }
            : c
        ));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedConvo}` }, (payload) => {
        const updated = payload.new as Message;
        setMessages((prev) => prev.map((m) => m.id === updated.id ? { ...m, read: updated.read } : m));
      })
      .subscribe();

    const typingChannel = supabase
      .channel(`typing-${selectedConvo}`)
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload?.user_id !== user.id) {
          setOtherTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setOtherTyping(false), 2500);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); supabase.removeChannel(typingChannel); };
  }, [selectedConvo, user]);

  const sendTypingEvent = useCallback(() => {
    if (!selectedConvo || !user) return;
    supabase.channel(`typing-${selectedConvo}`).send({ type: 'broadcast', event: 'typing', payload: { user_id: user.id } });
  }, [selectedConvo, user]);

  const searchUsers = async (q: string) => {
    if (!q.trim() || !user) { setUserResults([]); return; }
    setSearchingUsers(true);
    const { data } = await supabase.from('profiles').select('user_id, display_name, avatar_url').ilike('display_name', `%${q.trim()}%`).neq('user_id', user.id).limit(8);
    setUserResults(data || []);
    setSearchingUsers(false);
  };

  const startConvoWith = async (otherUserId: string) => {
    if (!user) return;
    const { data: existing } = await supabase
      .from('conversations').select('id')
      .or(`and(participant_1.eq.${user.id},participant_2.eq.${otherUserId}),and(participant_1.eq.${otherUserId},participant_2.eq.${user.id})`)
      .limit(1);
    let convoId = existing?.[0]?.id as string | undefined;
    if (!convoId) {
      const { data: ins } = await supabase.from('conversations').insert({ participant_1: user.id, participant_2: otherUserId }).select('id').single();
      convoId = ins?.id;
    }
    if (convoId) {
      setNewConvoOpen(false);
      setUserSearch('');
      setUserResults([]);
      await loadConversations(user.id);
      setSelectedConvo(convoId);
    }
  };

  const loadConversations = useCallback(async (userId: string) => {
    const { data: convos } = await supabase
      .from('conversations').select('*')
      .or(`participant_1.eq.${userId},participant_2.eq.${userId}`)
      .order('updated_at', { ascending: false });

    if (!convos || convos.length === 0) { setConversations([]); return; }

    const otherIds = convos.map((c) => c.participant_1 === userId ? c.participant_2 : c.participant_1);
    const convoIds = convos.map((c) => c.id);

    // Parallel: profiles, jobs, last messages, unread counts
    const [{ data: profiles }, { data: jobs }, { data: lastMsgs }, { data: unreadMsgs }] = await Promise.all([
      supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', otherIds),
      convos.some((c) => c.job_id)
        ? supabase.from('jobs').select('id, title').in('id', convos.filter((c) => c.job_id).map((c) => c.job_id!))
        : Promise.resolve({ data: [] }),
      supabase.from('messages').select('conversation_id, content, created_at, image_url').in('conversation_id', convoIds).order('created_at', { ascending: false }),
      supabase.from('messages').select('conversation_id').in('conversation_id', convoIds).neq('sender_id', userId).eq('read', false),
    ]);

    // Last message per convo
    const lastMsgMap: Record<string, { content: string; created_at: string; image_url?: string | null }> = {};
    for (const msg of lastMsgs || []) {
      if (!lastMsgMap[msg.conversation_id]) lastMsgMap[msg.conversation_id] = msg;
    }

    // Unread count per convo
    const unreadMap: Record<string, number> = {};
    for (const msg of unreadMsgs || []) {
      unreadMap[msg.conversation_id] = (unreadMap[msg.conversation_id] || 0) + 1;
    }

    // Batch-fetch the broadcast rows referenced by these conversations so we
    // can render a "Broadcast · 1 of N" / "Replied first ✓" chip in the list
    // view without firing an RPC per row. NULL broadcast_id conversations
    // contribute nothing here.
    const broadcastIds = Array.from(
      new Set((convos as any[]).map((c) => c.broadcast_id).filter(Boolean) as string[]),
    );
    let broadcastMap: Record<string, { status: string; target_count: number; filled_by: string | null }> = {};
    if (broadcastIds.length > 0) {
      const { data: bRows } = await supabase
        .from('quote_broadcasts' as any)
        .select('id, status, target_count, filled_by')
        .in('id', broadcastIds);
      for (const b of (bRows as any[]) || []) {
        broadcastMap[b.id] = { status: b.status, target_count: b.target_count, filled_by: b.filled_by };
      }
    }

    const enriched = convos.map((c) => {
      const otherId = c.participant_1 === userId ? c.participant_2 : c.participant_1;
      const prof = profiles?.find((p) => p.user_id === otherId);
      const last = lastMsgMap[c.id];
      const lastText = last
        ? (last.image_url ? '📷 Photo' : last.content)
        : '';
      const bId = (c as any).broadcast_id as string | null | undefined;
      const bSummary = bId ? broadcastMap[bId] : undefined;
      return {
        ...c,
        otherUserId: otherId,
        otherName: prof?.display_name || 'User',
        otherAvatar: prof?.avatar_url || null,
        jobTitle: (jobs as any[])?.find((j) => j.id === c.job_id)?.title || '',
        lastMessageText: lastText,
        lastMessageTime: last?.created_at || c.updated_at,
        unreadCount: unreadMap[c.id] || 0,
        broadcastStatus: bSummary?.status as Conversation['broadcastStatus'],
        broadcastTargetCount: bSummary?.target_count,
        broadcastFilledBy: bSummary?.filled_by ?? null,
      };
    });
    setConversations(enriched);
  }, []);

  const loadUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate('/auth'); return; }
    setUser(session.user);
    await loadConversations(session.user.id);
    setLoading(false);
  };

  const withOpenParam = searchParams.get('with');
  const draftOpenParam = searchParams.get('draft');

  useEffect(() => {
    if (loading || !user || !withOpenParam || withOpenParam === user.id) return;
    let cancelled = false;
    (async () => {
      const { data: rows } = await supabase.from('conversations').select('id')
        .or(`and(participant_1.eq.${user.id},participant_2.eq.${withOpenParam}),and(participant_1.eq.${withOpenParam},participant_2.eq.${user.id})`)
        .limit(1);
      let convoId = rows?.[0]?.id as string | undefined;
      if (!convoId) {
        const { data: ins, error } = await supabase.from('conversations').insert({ participant_1: user.id, participant_2: withOpenParam }).select('id').single();
        if (error || !ins) {
          if (!cancelled) setSearchParams((prev) => { const next = new URLSearchParams(prev); next.delete('with'); next.delete('draft'); return next; }, { replace: true });
          return;
        }
        convoId = ins.id;
      }
      if (cancelled || !convoId) return;
      setSelectedConvo(convoId);
      if (draftOpenParam) { try { setNewMessage(decodeURIComponent(draftOpenParam)); } catch { setNewMessage(draftOpenParam); } }
      await loadConversations(user.id);
      setSearchParams((prev) => { const next = new URLSearchParams(prev); next.delete('with'); next.delete('draft'); return next; }, { replace: true });
    })();
    return () => { cancelled = true; };
  }, [loading, user, withOpenParam, draftOpenParam, loadConversations, setSearchParams]);

  // Post-Stripe-Checkout return handler. When the hirer lands back on
  // /messages?payment=<id>&status=success, show a confirming toast so
  // the 1–3s gap between redirect and the stripe-webhook flipping the
  // row to 'paid' (which realtime-pops the receipt card) doesn't feel
  // like nothing happened. Also surface the cancel case. Params are
  // stripped so a refresh doesn't re-toast.
  const paymentParam = searchParams.get('payment');
  const paymentStatusParam = searchParams.get('status');
  useEffect(() => {
    if (!paymentParam || !paymentStatusParam) return;
    // Strip params FIRST so a refresh / back nav can't re-toast — even
    // if the toast call throws, the URL is already clean. The captured
    // status string is used below to decide which toast to fire.
    const status = paymentStatusParam;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('payment');
      next.delete('status');
      return next;
    }, { replace: true });
    if (status === 'success') {
      toast({
        title: 'Payment held on Vano',
        description: "We'll release it to the freelancer when you click Release here in the thread.",
      });
    } else if (status === 'cancel') {
      toast({
        title: 'Payment cancelled',
        description: 'No money moved. Try again whenever you like.',
      });
    }
  }, [paymentParam, paymentStatusParam, setSearchParams, toast]);

  const loadMessages = async (convoId: string) => {
    const { data } = await supabase.from('messages').select('*').eq('conversation_id', convoId).order('created_at', { ascending: true });
    setMessages(data || []);
  };

  const markAsRead = async (convoId: string) => {
    if (!user) return;
    // Clear unread locally immediately
    setConversations((prev) => prev.map((c) => c.id === convoId ? { ...c, unreadCount: 0 } : c));
    await supabase.from('messages').update({ read: true }).eq('conversation_id', convoId).neq('sender_id', user.id);
  };

  const sendMessage = async (imageUrl?: string) => {
    const content = newMessage.trim();
    if ((!content && !imageUrl) || !selectedConvo || !user) return;

    // Optimistic: show message instantly
    const tempId = `opt-${Date.now()}`;
    const tempMsg: Message = {
      id: tempId,
      conversation_id: selectedConvo,
      sender_id: user.id,
      content: content || (imageUrl ? '📷 Photo' : ''),
      read: false,
      created_at: new Date().toISOString(),
      image_url: imageUrl || null,
      optimistic: true,
    };
    setMessages((prev) => [...prev, tempMsg]);
    setNewMessage('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // Insert to DB
    const insertData: any = { conversation_id: selectedConvo, sender_id: user.id, content: tempMsg.content };
    if (imageUrl) insertData.image_url = imageUrl;

    const { data: realMsg, error } = await supabase.from('messages').insert(insertData).select().single();

    if (error || !realMsg) {
      // Rollback: yank the optimistic bubble, restore the draft in the
      // textarea, and surface the failure so the user doesn't think their
      // message made it through (it didn't — RLS, network, or similar).
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setNewMessage(content);
      toast({
        title: "Couldn't send message",
        description: 'Check your connection and try again.',
        variant: 'destructive',
      });
      return;
    }

    // Replace temp with confirmed message
    setMessages((prev) => prev.map((m) => m.id === tempId ? { ...realMsg, optimistic: false } : m));

    // Update conversation preview
    setConversations((prev) => prev.map((c) =>
      c.id === selectedConvo
        ? { ...c, lastMessageText: tempMsg.content, lastMessageTime: realMsg.created_at, updated_at: realMsg.created_at }
        : c
    ));

    // Update conversation timestamp + fire push notification (both fire-and-forget)
    supabase.from('conversations').update({ updated_at: realMsg.created_at }).eq('id', selectedConvo).then(() => {});

    const convo = conversations.find((c) => c.id === selectedConvo);
    if (convo) {
      const recipientId = convo.participant_1 === user.id ? convo.participant_2 : convo.participant_1;
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session?.access_token) return;
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || getSupabaseProjectRef();
        if (!projectId) return;
        fetch(`https://${projectId}.supabase.co/functions/v1/notify-new-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ recipient_id: recipientId, message_preview: tempMsg.content }),
        }).catch((err) => {
          // Message already landed in DB — recipient will see it on
          // next chat open. Push notification is extra; log so we can
          // spot a broken VAPID setup without hiding it from the user.
          if (import.meta.env.DEV) console.warn('[Messages] notify-new-message failed', err);
        });
      });

      // Notify admin about business↔freelancer messages (in-app + email)
      (async () => {
        try {
          const [{ data: senderProfile }, { data: recipientProfile }] = await Promise.all([
            supabase.from('profiles').select('user_type, display_name').eq('user_id', user.id).single(),
            supabase.from('profiles').select('user_type, display_name').eq('user_id', recipientId).single(),
          ]);
          const isBizToFreelancer = senderProfile?.user_type === 'business' && recipientProfile?.user_type === 'student';
          const isFreelancerToBiz = senderProfile?.user_type === 'student' && recipientProfile?.user_type === 'business';
          if (isBizToFreelancer || isFreelancerToBiz) {
            // In-app notification for admins
            const { data: adminIds } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
            if (adminIds?.length) {
              const title = isBizToFreelancer
                ? `${senderProfile!.display_name} messaged ${recipientProfile!.display_name}`
                : `${senderProfile!.display_name} responded to ${recipientProfile!.display_name}`;
              await supabase.from('notifications').insert(
                adminIds
                  .filter((a) => a.user_id !== user.id)
                  .map((a) => ({ user_id: a.user_id, title, message: tempMsg.content.slice(0, 100) }))
              );
            }

            // Email notification to admin via Resend
            const freelancerUid = isBizToFreelancer ? recipientId : user.id;
            const { data: spPhone } = await supabase.from('student_profiles').select('phone').eq('user_id', freelancerUid).maybeSingle();

            const sess = await supabase.auth.getSession();
            const token = sess.data.session?.access_token;
            if (token) {
              const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || getSupabaseProjectRef();
              if (projectId) {
                fetch(`https://${projectId}.supabase.co/functions/v1/notify-admin-message`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                  body: JSON.stringify({
                    sender_name: senderProfile!.display_name,
                    recipient_name: recipientProfile!.display_name,
                    sender_type: senderProfile!.user_type,
                    recipient_type: recipientProfile!.user_type,
                    message_preview: tempMsg.content,
                    freelancer_phone: spPhone?.phone || null,
                  }),
                }).catch((err) => {
                  if (import.meta.env.DEV) console.warn('[Messages] notify-admin-message failed', err);
                });
              }
            }
          }
        } catch {}
      })();
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !selectedConvo) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: 'Invalid file type', description: 'Upload JPEG, PNG, WebP, or GIF.', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 5MB.', variant: 'destructive' });
      return;
    }
    setUploadingImage(true);
    const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('chat-images').upload(path, file);
    if (!error) {
      const { data: urlData } = supabase.storage.from('chat-images').getPublicUrl(path);
      await sendMessage(urlData.publicUrl);
    }
    setUploadingImage(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
    sendTypingEvent();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (loading) return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );

  const selectedConversation = conversations.find((c) => c.id === selectedConvo);

  return (
    <div className="min-h-[100dvh] bg-background pb-16 md:pb-0">
      <SEOHead title="Messages – VANO" description="Chat with businesses and students on VANO." noindex />
      <Navbar />
      <div className="max-w-5xl mx-auto px-0 sm:px-4 md:px-8 pt-16 sm:pt-20 pb-0 sm:pb-4">
        <div className="flex h-[calc(100dvh-4rem)] sm:h-[calc(100dvh-6rem)] overflow-hidden border-0 bg-card sm:rounded-2xl sm:border sm:border-border">

          {/* ── Conversation list ── */}
          <div className={cn('w-full shrink-0 flex-col border-r border-border md:flex md:w-80', selectedConvo ? 'hidden md:flex' : 'flex')}>
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3.5">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <MessageCircle size={18} strokeWidth={2} /> Messages
              </h2>
              <button
                type="button"
                onClick={() => setNewConvoOpen(true)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                title="New conversation"
              >
                <SquarePen size={16} />
              </button>
            </div>

            {/* New conversation dialog */}
            <Dialog open={newConvoOpen} onOpenChange={(o) => { setNewConvoOpen(o); if (!o) { setUserSearch(''); setUserResults([]); } }}>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>New conversation</DialogTitle>
                  <DialogDescription>Search for someone by name to start a chat.</DialogDescription>
                </DialogHeader>
                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input autoFocus value={userSearch} onChange={(e) => { setUserSearch(e.target.value); searchUsers(e.target.value); }} placeholder="Search by name…" className="w-full rounded-xl border border-input bg-background py-2.5 pl-9 pr-4 text-base focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div className="min-h-[4rem] space-y-1">
                  {searchingUsers && <p className="py-4 text-center text-sm text-muted-foreground">Searching…</p>}
                  {!searchingUsers && userSearch.trim() && userResults.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No users found.</p>}
                  {userResults.map((u) => (
                    <button key={u.user_id} type="button" onClick={() => startConvoWith(u.user_id)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-secondary">
                      {u.avatar_url
                        ? <img src={u.avatar_url} alt={u.display_name || 'User'} className="h-9 w-9 shrink-0 rounded-full object-cover" loading="lazy" decoding="async" />
                        : <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">{(u.display_name || '?')[0].toUpperCase()}</div>
                      }
                      <span className="text-sm font-medium">{u.display_name || 'User'}</span>
                    </button>
                  ))}
                </div>
              </DialogContent>
            </Dialog>

            <div className="flex-1 overflow-y-auto">
              {/* Start a Vano Match — persistent sidebar entry for
                   hirers so they can kick off a fresh match from inside
                   the inbox without bouncing back to home. Hidden for
                   freelancers since the €1 flow is hirer-only. */}
              {viewerUserType !== 'student' && (
                <button
                  type="button"
                  onClick={() => navigate('/hire')}
                  className="group flex w-full items-center gap-3 border-b border-border/60 bg-primary/[0.04] px-4 py-3 text-left transition-colors hover:bg-primary/[0.08]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
                    <Sparkles size={15} className="text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">Start a Vano Match</p>
                    <p className="truncate text-xs text-muted-foreground">Hand-picked freelancer in 60 seconds</p>
                  </div>
                  <ArrowRight size={14} className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </button>
              )}

              {/* Contact team */}
              <button type="button" onClick={() => setContactTeamOpen(true)} className="flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-secondary/50">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Mail size={15} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Contact VANO</p>
                  <p className="truncate text-xs text-muted-foreground">Email, phone &amp; Instagram</p>
                </div>
              </button>

              <Dialog open={contactTeamOpen} onOpenChange={setContactTeamOpen}>
                <DialogContent className="max-h-[min(90dvh,32rem)] overflow-y-auto sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Contact team</DialogTitle>
                    <DialogDescription>Choose how you'd like to reach us.</DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-3 pt-2">
                    <a href={teamMailtoHref} onClick={() => setContactTeamOpen(false)} className="flex items-start gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10"><Mail size={20} className="text-primary" /></span>
                      <div className="min-w-0 pt-0.5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</p><p className="mt-1 break-all text-base font-medium">{TEAM_CONTACT_EMAIL}</p></div>
                    </a>
                    <a href={teamTelHref} onClick={() => setContactTeamOpen(false)} className="flex items-start gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10"><Phone size={20} className="text-primary" /></span>
                      <div className="min-w-0 pt-0.5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Phone</p><p className="mt-1 text-base font-medium">{TEAM_PHONE_DISPLAY}</p></div>
                    </a>
                    <a href={TEAM_INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" onClick={() => setContactTeamOpen(false)} className="flex items-start gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10"><Instagram size={20} className="text-primary" /></span>
                      <div className="min-w-0 pt-0.5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Instagram</p><p className="mt-1 text-base font-medium">@{TEAM_INSTAGRAM_HANDLE}</p></div>
                    </a>
                  </div>
                </DialogContent>
              </Dialog>

              {conversations.length === 0 ? (
                <div className="px-4 py-8">
                  <EmptyState
                    icon={MessageCircle}
                    title="No messages yet"
                    description={viewerUserType === 'student'
                      // Freelancers on Vano don't apply to gigs — clients
                      // message them first after finding their listing or
                      // being matched by AI Find. Old copy said "apply to
                      // a gig" which is the wrong mental model.
                      ? "Once a client finds your listing we'll open the chat here. You'll also get a text when it happens."
                      : "Start a Vano Match — we hand-pick someone for your brief, or message a freelancer directly from the talent board."}
                    action={viewerUserType !== 'student' ? {
                      label: 'Start a Vano Match',
                      onClick: () => navigate('/hire'),
                    } : undefined}
                  />
                </div>
              ) : (
                conversations.map((convo) => {
                  const isActive = selectedConvo === convo.id;
                  const hasUnread = (convo.unreadCount || 0) > 0;
                  return (
                    <button
                      key={convo.id}
                      onClick={() => setSelectedConvo(convo.id)}
                      className={cn(
                        'flex w-full items-center gap-3 border-b border-border/50 px-4 py-3 text-left transition-colors',
                        isActive ? 'bg-secondary' : 'hover:bg-secondary/50'
                      )}
                    >
                      {/* Avatar */}
                      {convo.otherAvatar
                        ? <img src={convo.otherAvatar} alt={convo.otherName || 'User'} className="h-11 w-11 shrink-0 rounded-full object-cover" loading="lazy" />
                        : <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground">{(convo.otherName || '?')[0].toUpperCase()}</div>
                      }
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className={cn('truncate text-sm', hasUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground/90')}>
                            {convo.otherName}
                          </p>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {formatConvoTime(convo.lastMessageTime || convo.updated_at)}
                          </span>
                        </div>
                        {/* Broadcast chip — scannable at-a-glance state for multi-send
                            threads. Previously users had to open each of three
                            broadcast convos to figure out who replied first. */}
                        {convo.broadcastStatus && (() => {
                          const isViewerWinner =
                            convo.broadcastStatus === 'filled' &&
                            convo.broadcastFilledBy &&
                            convo.broadcastFilledBy === user?.id;
                          const isOtherWinner =
                            convo.broadcastStatus === 'filled' &&
                            convo.broadcastFilledBy &&
                            convo.broadcastFilledBy === convo.otherUserId;
                          let chip: { label: string; className: string };
                          if (convo.broadcastStatus === 'open') {
                            chip = {
                              label: `Broadcast · 1 of ${convo.broadcastTargetCount ?? '?'}`,
                              className: 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
                            };
                          } else if (isOtherWinner) {
                            chip = { label: 'Replied first ✓', className: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200' };
                          } else if (isViewerWinner) {
                            chip = { label: 'You replied first ✓', className: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200' };
                          } else {
                            chip = { label: 'Filled by another', className: 'bg-muted text-muted-foreground' };
                          }
                          return (
                            <span className={cn('mt-0.5 inline-flex w-fit items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold', chip.className)}>
                              {chip.label}
                            </span>
                          );
                        })()}
                        <div className="flex items-center justify-between gap-1 mt-0.5">
                          <p className={cn('truncate text-xs', hasUnread ? 'font-medium text-foreground/80' : 'text-muted-foreground')}>
                            {convo.lastMessageText || (convo.jobTitle ? `Re: ${convo.jobTitle}` : 'Start of conversation')}
                          </p>
                          {hasUnread && (
                            <span className="ml-1 flex h-4 min-w-[1rem] shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground">
                              {convo.unreadCount! > 9 ? '9+' : convo.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* ── Chat area ── */}
          <div className={cn('flex flex-1 flex-col', !selectedConvo ? 'hidden md:flex' : 'flex')}>
            {selectedConvo ? (
              <>
                {/* Header */}
                <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                  <button onClick={() => setSelectedConvo(null)} className="text-sm text-muted-foreground transition-colors hover:text-foreground md:hidden">← Back</button>
                  {selectedConversation?.otherAvatar
                    ? <img src={selectedConversation.otherAvatar} alt={selectedConversation.otherName || 'User'} className="h-8 w-8 rounded-full object-cover" />
                    : <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold">{(selectedConversation?.otherName || '?')[0].toUpperCase()}</div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight truncate">{selectedConversation?.otherName}</p>
                    {selectedConversation?.jobTitle && <p className="text-xs text-primary leading-tight truncate">Re: {selectedConversation.jobTitle}</p>}
                  </div>
                  {/* Hire finalization — the one click that turns "chatting"
                      into "formally hired." Business-only, hidden once an
                      agreement exists. The DB trigger posts a system message
                      when they hit it, so both sides see the confirmation
                      land in-thread without refresh. */}
                  {selectedConversation && user && viewerUserType === 'business' && !hireAgreement && (
                    <button
                      type="button"
                      disabled={hiringInProgress}
                      onClick={async () => {
                        if (!selectedConversation || hiringInProgress) return;
                        setHiringInProgress(true);
                        try {
                          await createHireAgreement({
                            businessId: user.id,
                            freelancerId: selectedConversation.otherUserId || (
                              selectedConversation.participant_1 === user.id
                                ? selectedConversation.participant_2
                                : selectedConversation.participant_1
                            ),
                            conversationId: selectedConversation.id,
                          });
                          toast({
                            title: 'Marked as hired ✓',
                            description: `Confirmation message posted in the thread. Leave a review when the work wraps up.`,
                          });
                        } catch (err) {
                          toast({
                            title: 'Could not mark as hired',
                            description: err instanceof HireAgreementError ? err.message : 'Please try again.',
                            variant: 'destructive',
                          });
                        } finally {
                          setHiringInProgress(false);
                        }
                      }}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {hiringInProgress ? <Loader2 size={12} className="animate-spin" /> : <BadgeCheck size={12} strokeWidth={2.5} />}
                      Mark as hired
                    </button>
                  )}
                  {hireAgreement && (
                    <StatusChip tone="success" icon={BadgeCheck} className="shrink-0">Hired</StatusChip>
                  )}
                  {/* Pay via Vano — only makes sense for businesses
                      paying freelancers whose Stripe Connect account is
                      ready. The modal still re-validates server-side,
                      but gating the button up here means we don't hand
                      users a confusing error toast after a click on a
                      freelancer who hasn't enabled Vano Pay yet. */}
                  {VANO_PAY_VISIBLE && selectedConversation && user && viewerUserType === 'business' && otherUserType === 'student' && (
                    otherPayoutsEnabled ? (
                      <button
                        type="button"
                        onClick={() => setVanoPayOpen(true)}
                        className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground shadow-sm transition-colors hover:brightness-110"
                      >
                        <Banknote size={12} strokeWidth={2.5} />
                        Pay via Vano
                      </button>
                    ) : otherPayoutsEnabled === false ? (
                      <button
                        type="button"
                        title={`${selectedConversation.otherName || 'This freelancer'} hasn't enabled Vano Pay yet — tap to ask them to set it up.`}
                        onClick={() => {
                          // Drop a friendly, templated ask into the textbox so
                          // the business can send it with one more tap. This
                          // is the shortest path from "I want to pay safely"
                          // to an activated freelancer (= future commission).
                          const name = selectedConversation.otherName?.split(' ')[0] || 'there';
                          const draft = `Hey ${name}! Could you enable Vano Pay on your profile when you get a minute? It's a quick one-off Stripe setup and lets me pay you safely through Vano — money lands in your bank in 1–2 days. Thanks!`;
                          setNewMessage(draft);
                          requestAnimationFrame(() => {
                            const ta = textareaRef.current;
                            if (ta) {
                              ta.focus();
                              ta.selectionStart = ta.selectionEnd = draft.length;
                            }
                          });
                        }}
                        className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
                      >
                        <Banknote size={12} strokeWidth={2.5} />
                        Ask to enable Vano Pay
                      </button>
                    ) : null
                  )}
                </div>

                {/* Digital-sales deal pipeline — business-side view.
                     Lives above the Vano Pay receipts so the "what's in
                     play" context loads before the "money I've already
                     committed" context. Gated to businesses talking to
                     digital-sales freelancers; the panel itself handles
                     the empty state so an un-logged pipeline isn't
                     obtrusive. */}
                {selectedConversation
                  && user
                  && viewerUserType === 'business'
                  && otherUserType === 'student'
                  && otherCategory === 'digital_sales'
                  && selectedConversation.otherUserId && (
                  <div className="border-b border-border/60 bg-muted/20 px-4 py-3">
                    <BusinessDealsPanel
                      businessId={user.id}
                      freelancerId={selectedConversation.otherUserId}
                      freelancerName={selectedConversation.otherName || 'Your freelancer'}
                    />
                  </div>
                )}

                {/* Vano Pay escrow receipts — renders one row per Vano
                     Pay payment attached to this conversation in a
                     non-transient state (held / released / refunded).
                     Hirer gets a Release button + Flag-a-problem link
                     on held rows; freelancer gets a countdown. Both
                     sides see the terminal chips. Realtime-refreshed,
                     so a release by one side flips state on the other
                     without reload. */}
                {threadPayments.length > 0 && (
                  <div className="space-y-2 border-b border-border/60 bg-muted/20 px-4 py-3">
                    {threadPayments.map((p) => {
                      const amountEuro = `€${(p.amount_cents / 100).toFixed(2)}`;
                      const feeEuro = `€${(p.fee_cents / 100).toFixed(2)}`;
                      const netEuro = `€${((p.amount_cents - p.fee_cents) / 100).toFixed(2)}`;
                      const isHirer = !!user && p.business_id === user.id;
                      // Days countdown to auto-release — reads as active
                      // ("in 12 days") vs a static date which felt stale
                      // the moment the page rendered. Negative values
                      // (past-due rows not yet swept by the cron) read
                      // as "any moment" rather than confusing negatives.
                      const autoReleaseDays = p.auto_release_at
                        ? Math.max(0, Math.ceil((new Date(p.auto_release_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                        : null;
                      const autoReleaseCopy = autoReleaseDays === null
                        ? null
                        : autoReleaseDays === 0
                          ? 'auto-releases any moment'
                          : `auto-releases in ${autoReleaseDays} ${autoReleaseDays === 1 ? 'day' : 'days'}`;
                      const doneDate = (p.released_at || p.refunded_at)
                        ? new Date((p.released_at || p.refunded_at)!).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
                        : null;

                      if (p.status === 'paid') {
                        return (
                          <div key={p.id} className="rounded-xl border border-border bg-card px-3.5 py-3 shadow-sm">
                            <div className="flex items-start gap-3">
                              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <ShieldCheck size={15} />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-[13.5px] font-semibold text-foreground" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {amountEuro} <span className="font-medium text-muted-foreground">held on Vano</span>
                                </p>
                                {(p.description || p.sales_deal_id) && (
                                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
                                    {p.sales_deal_id && (
                                      <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                                        <TrendingUp size={9} strokeWidth={2.75} />
                                        Bonus
                                      </span>
                                    )}
                                    {p.description && (
                                      <span className="truncate">{p.description}</span>
                                    )}
                                  </p>
                                )}
                                {/* Fee split — the freelancer needs to
                                     know what actually lands in their
                                     bank (amount - 3% Vano fee); the
                                     hirer sees the same split so the
                                     3% isn't a surprise on the receipt
                                     after release. Kept tight + mono
                                     so the two rows align. */}
                                <p className="mt-1 text-[11.5px] text-muted-foreground" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {isHirer
                                    ? `Freelancer receives ${netEuro} · Vano fee ${feeEuro}`
                                    : `You receive ${netEuro} · Vano fee ${feeEuro}`}
                                </p>
                                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                                  {isHirer
                                    ? `Release when the work is done${autoReleaseCopy ? ` · ${autoReleaseCopy}` : ''}.`
                                    : `Your client will release it${autoReleaseCopy ? ` · ${autoReleaseCopy}` : ''}.`}
                                </p>
                                {isHirer && freelancerSaidDone && (
                                  // Nudge above the Release button —
                                  // only renders when the freelancer's
                                  // latest message (within 24h) reads
                                  // like "work delivered." Single line,
                                  // amber tint so it reads as a prompt,
                                  // not an alert; tapping acts as a
                                  // soft cue, the button stays the
                                  // action. Deliberately doesn't
                                  // auto-release — a nudge, not a rule.
                                  <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-1.5 text-[11.5px] leading-relaxed text-amber-800 dark:text-amber-200">
                                    <Sparkles size={11} strokeWidth={2.5} className="mt-[2px] shrink-0 text-amber-600 dark:text-amber-400" />
                                    <span>
                                      <span className="font-semibold">Looks like the work is done.</span>{' '}
                                      <span className="text-amber-800/75 dark:text-amber-200/75">Release {amountEuro} below when you&apos;re ready.</span>
                                    </span>
                                  </div>
                                )}
                                {isHirer && (
                                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={releasingId === p.id || refundingId === p.id}
                                      onClick={async () => {
                                        if (releasingId || refundingId) return;
                                        setReleasingId(p.id);
                                        try {
                                          const { data, error } = await supabase.functions.invoke('release-vano-payment', {
                                            body: { payment_id: p.id },
                                          });
                                          if (error) throw error;
                                          const result = data as { ok?: boolean; already_released?: boolean } | null;
                                          if (!result?.ok) throw new Error('Release did not return ok');
                                          toast({
                                            title: 'Payment released',
                                            description: `${amountEuro} sent to the freelancer.`,
                                          });
                                        } catch (err) {
                                          const ctxErr = (err as { context?: { error?: string } })?.context?.error;
                                          toast({
                                            title: "Couldn't release payment",
                                            description: ctxErr || 'Please try again in a moment.',
                                            variant: 'destructive',
                                          });
                                        } finally {
                                          setReleasingId(null);
                                        }
                                      }}
                                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground shadow-sm transition-colors hover:brightness-110 disabled:opacity-60"
                                    >
                                      {releasingId === p.id
                                        ? <><Loader2 size={12} className="animate-spin" /> Releasing…</>
                                        : <>Release {amountEuro}</>}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={releasingId === p.id || refundingId === p.id}
                                      onClick={() => {
                                        setDisputeForPaymentId(p.id);
                                        setDisputeReason('');
                                      }}
                                      className="inline-flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-destructive hover:underline disabled:opacity-60"
                                    >
                                      <AlertTriangle size={11} /> Flag a problem
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      if (p.status === 'transferred') {
                        const canReview = isHirer && !reviewedPaymentIds.has(p.id);
                        return (
                          <div key={p.id} className="flex flex-wrap items-center gap-2">
                            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/5 px-3.5 py-1.5 text-[12px] text-emerald-900 dark:text-emerald-200" style={{ fontVariantNumeric: 'tabular-nums' }}>
                              <Check size={13} className="text-emerald-600 dark:text-emerald-400" strokeWidth={3} />
                              <span className="font-semibold">{amountEuro} paid</span>
                              {doneDate && <span className="text-emerald-900/75 dark:text-emerald-200/75">· {doneDate}</span>}
                            </div>
                            {canReview && (
                              // Review nudge — only shown to the hirer,
                              // only for payments they haven't reviewed
                              // yet. The button opens ReviewForm scoped
                              // to this Vano Pay row; the submit feeds
                              // the Vano Match ranker's review signal
                              // (avg_rating × log(count+1) at 20%).
                              <button
                                type="button"
                                onClick={() => setReviewForPaymentId(p.id)}
                                className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/[0.06] px-3 py-1 text-[11.5px] font-semibold text-primary transition hover:bg-primary/10"
                              >
                                <Star size={11} strokeWidth={2.5} />
                                Leave a review
                              </button>
                            )}
                          </div>
                        );
                      }

                      if (p.status === 'refunded') {
                        return (
                          <div key={p.id} className="flex items-center gap-2 rounded-full border border-border bg-muted px-3.5 py-1.5 text-[12px] text-muted-foreground" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            <RotateCcw size={12} />
                            <span className="font-semibold text-foreground">{amountEuro} refunded</span>
                            {doneDate && <span>· {doneDate}</span>}
                          </div>
                        );
                      }

                      return null;
                    })}
                  </div>
                )}

                {/* Broadcast banner — only renders for multi-send conversations.
                    Wording adapts to viewer (hirer vs freelancer) and status
                    (open vs filled). Hidden for normal 1:1 threads. */}
                {broadcastInfo && (() => {
                  const viewerIsRequester = user?.id === broadcastInfo.requesterId;
                  const filled = broadcastInfo.status === 'filled' && broadcastInfo.filledBy;
                  const winnerIsThisFreelancer =
                    filled && broadcastInfo.filledBy === selectedConversation?.otherUserId;
                  const filledHere = filled && !viewerIsRequester && broadcastInfo.filledBy === user?.id;

                  let label: string;
                  let tone: 'open' | 'won' | 'lost';
                  if (!filled) {
                    tone = 'open';
                    label = viewerIsRequester
                      ? `Sent to ${broadcastInfo.targetCount} freelancers — waiting on first reply`
                      : `You're 1 of ${broadcastInfo.targetCount} being asked — be the first to reply`;
                  } else if (viewerIsRequester) {
                    tone = 'won';
                    label = winnerIsThisFreelancer
                      ? `✓ ${selectedConversation?.otherName || 'They'} replied first`
                      : `Filled — ${broadcastInfo.filledByName || 'another freelancer'} replied first (you can still chat here)`;
                  } else if (filledHere) {
                    tone = 'won';
                    label = '✓ You replied first — this brief is yours to win';
                  } else {
                    tone = 'lost';
                    label = `${broadcastInfo.filledByName || 'Another freelancer'} replied first — feel free to chat anyway`;
                  }

                  const toneClasses =
                    tone === 'won'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                      : tone === 'lost'
                      ? 'border-border bg-muted text-muted-foreground'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200';

                  return (
                    <div className={cn('flex items-start gap-2 border-b px-4 py-2 text-[11px] font-medium', toneClasses)}>
                      <span>{label}</span>
                    </div>
                  );
                })()}

                {/* Vano Pay nudge — shown only to freelancers who are
                    chatting with a business but haven't linked a Stripe
                    payout account yet. Progressive onboarding so they
                    don't set it up until the money is actually close. */}
                {viewerUserType === 'student'
                  && otherUserType === 'business'
                  && viewerPayoutsEnabled === false
                  && !vanoPayBannerDismissed ? (
                  <div className="flex items-start gap-3 border-b border-amber-200/60 bg-amber-50/70 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-900/20">
                    <Banknote size={16} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                        Want to get paid through Vano?
                      </p>
                      <p className="mt-0.5 text-[11px] text-amber-800/90 dark:text-amber-300/80 leading-relaxed">
                        Set up once (about 5 minutes) and this client can tap a
                        "Pay via Vano" button — money lands in your bank in
                        1–2 days, 3% fee.
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => navigate('/profile')}
                          className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-amber-700"
                        >
                          Set up Vano Pay
                        </button>
                        <button
                          type="button"
                          onClick={() => setVanoPayBannerDismissed(true)}
                          className="text-[11px] font-medium text-amber-800/80 transition hover:text-amber-900 dark:text-amber-300/70 dark:hover:text-amber-200"
                        >
                          Not now
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Messages */}
                <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
                  {messages.map((msg) => {
                    const isMine = msg.sender_id === user?.id;
                    return (
                      <div key={msg.id} className={cn('flex', isMine ? 'justify-end' : 'justify-start')}>
                        <div className={cn(
                          'max-w-[78%] rounded-2xl px-4 py-2.5 text-sm',
                          isMine ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-secondary text-secondary-foreground',
                          msg.optimistic && 'opacity-75'
                        )}>
                          {msg.image_url && (
                            <img src={msg.image_url} alt="Shared" className="mb-1.5 max-h-52 max-w-full cursor-pointer rounded-xl object-cover" onClick={() => window.open(msg.image_url!, '_blank')} />
                          )}
                          {msg.content && msg.content !== '📷 Image' && msg.content !== '📷 Photo' && <p className="leading-relaxed">{msg.content}</p>}
                          <div className={cn('mt-1 flex items-center gap-1', isMine ? 'justify-end' : '')}>
                            <p className={cn('text-[10px]', isMine ? 'text-primary-foreground/55' : 'text-muted-foreground')}>
                              {format(new Date(msg.created_at), 'HH:mm')}
                            </p>
                            {isMine && !msg.optimistic && (
                              msg.read
                                ? <CheckCheck size={11} className="text-primary-foreground/70" />
                                : <Check size={11} className="text-primary-foreground/45" />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {otherTyping && <TypingIndicator />}
                  <div ref={messagesEndRef} />
                </div>

                {/* Quick-reply chips — audience-aware. Freelancers get a
                    universal follow-up bucket; businesses get openers keyed
                    to the freelancer's community category. Renders nothing
                    when no bucket applies (e.g. business↔business, or
                    before the other-party fetch resolves). Tap → fills the
                    compose box and focuses it; user still hits Send. */}
                {(() => {
                  let chips: string[] | null = null;
                  if (viewerUserType === 'student') {
                    chips = QUICK_REPLIES_FREELANCER;
                  } else if (viewerUserType === 'business' && otherUserType === 'student' && otherCategory) {
                    chips = QUICK_REPLIES_BUSINESS_BY_CATEGORY[otherCategory] ?? null;
                  }
                  if (!chips || chips.length === 0) return null;
                  const handleChip = (text: string) => {
                    setNewMessage(text);
                    // Focus the textarea and drop the caret at the end so
                    // the user can keep typing to append. Running after a
                    // microtask so React's state flush lands before we set
                    // selection — otherwise the caret snaps back to 0 on
                    // some browsers.
                    queueMicrotask(() => {
                      const ta = textareaRef.current;
                      if (!ta) return;
                      ta.focus();
                      const end = text.length;
                      try { ta.setSelectionRange(end, end); } catch { /* no-op */ }
                    });
                  };
                  return (
                    <div
                      role="group"
                      aria-label="Quick replies"
                      className="border-t border-border/60 bg-background px-3 py-2 flex flex-wrap gap-1.5"
                    >
                      {chips.map((text) => (
                        <button
                          key={text}
                          type="button"
                          onClick={() => handleChip(text)}
                          className="rounded-full border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:border-foreground/20 hover:bg-muted/60"
                        >
                          {text}
                        </button>
                      ))}
                    </div>
                  );
                })()}

                {/* Input */}
                <div className="border-t border-border px-3 py-3">
                  <div className="flex items-end gap-2">
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                      className="mb-0.5 rounded-xl p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
                      title="Send image"
                    >
                      <Image size={18} />
                    </button>
                    <textarea
                      ref={textareaRef}
                      rows={1}
                      value={newMessage}
                      onChange={handleTextareaChange}
                      onKeyDown={handleKeyDown}
                      placeholder="Message…"
                      className="flex-1 resize-none overflow-hidden rounded-2xl border border-input bg-background px-4 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
                      style={{ maxHeight: 120 }}
                    />
                    <button
                      type="button"
                      onClick={() => sendMessage()}
                      disabled={!newMessage.trim() && !uploadingImage}
                      className="mb-0.5 rounded-xl bg-primary p-2.5 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
                    >
                      <Send size={17} strokeWidth={2.2} />
                    </button>
                  </div>
                  <p className="mt-1.5 text-center text-[10px] text-muted-foreground/50">Enter to send · Shift+Enter for new line</p>
                </div>
              </>
            ) : (
              // Desktop right-pane empty state — previously a bare line
              // of muted text that read as "dead app" on first-visit
              // screenshots. Now a proper premium empty state that
              // gives the viewer something to do. Audience-aware:
              // hirers see "Start a Vano Match" as the primary path
              // back into the funnel; freelancers see a browse-gigs
              // nudge instead.
              <div className="flex flex-1 items-center justify-center px-6 py-12">
                <div className="flex max-w-sm flex-col items-center text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <MessageCircle size={20} />
                  </div>
                  <h2 className="mt-4 text-[18px] font-semibold leading-tight tracking-tight text-foreground">
                    Pick a conversation
                  </h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                    {viewerUserType === 'student'
                      ? 'Your chats with businesses land here. Apply to a gig or reply to a client to get started.'
                      : 'Your chats with freelancers land here. Kick off a Vano Match and we\'ll drop you straight into a thread.'}
                  </p>
                  {viewerUserType !== 'student' && (
                    <button
                      type="button"
                      onClick={() => navigate('/hire')}
                      className="mt-5 inline-flex items-center gap-1.5 rounded-2xl bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.5)] transition-all duration-150 hover:-translate-y-[1px] hover:brightness-[1.05] active:translate-y-0 active:scale-[0.99]"
                    >
                      <Sparkles size={13} /> Start a Vano Match
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Vano Pay modal. Keyed on selectedConversation.id so changing
          conversations while the modal is open cleanly resets state. */}
      {selectedConversation && (
        <VanoPayModal
          key={selectedConversation.id}
          open={vanoPayOpen}
          onClose={() => setVanoPayOpen(false)}
          conversationId={selectedConversation.id}
          freelancerName={selectedConversation.otherName || 'this freelancer'}
        />
      )}

      {/* Review dialog — hirer clicks "Leave a review" on a released
           Vano Pay receipt, lands the rating + comment against the
           payment row, feedback cascades into the Vano Match ranker
           via the 20%-weighted review signal. Only the hirer sees
           this trigger; RLS blocks doubles via a UNIQUE partial on
           (vano_payment_id, reviewer_id). */}
      {(() => {
        const target = reviewForPaymentId ? threadPayments.find((p) => p.id === reviewForPaymentId) : null;
        return (
          <Dialog
            open={reviewForPaymentId !== null}
            onOpenChange={(open) => { if (!open) setReviewForPaymentId(null); }}
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Leave a review</DialogTitle>
                <DialogDescription>
                  How was the work? Your rating helps Vano hand-pick better matches next time.
                </DialogDescription>
              </DialogHeader>
              {target && user ? (
                <ReviewForm
                  vanoPaymentId={target.id}
                  reviewerId={user.id}
                  revieweeId={target.freelancer_id}
                  onReviewSubmitted={() => {
                    setReviewedPaymentIds((prev) => {
                      const next = new Set(prev);
                      next.add(target.id);
                      return next;
                    });
                    setReviewForPaymentId(null);
                  }}
                />
              ) : null}
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Dispute / refund dialog — hirer clicks "Flag a problem" on a
           held payment row, confirms with an optional free-text reason,
           and we refund the card via refund-vano-payment. v1 is
           full-refund only; partial refunds require admin handling. */}
      <Dialog
        open={disputeForPaymentId !== null}
        onOpenChange={(open) => { if (!open) { setDisputeForPaymentId(null); setDisputeReason(''); } }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Flag a problem with this payment</DialogTitle>
            <DialogDescription>
              Refunds the full amount to your card. The freelancer will see the payment was refunded.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <label className="block text-[12px] font-semibold text-foreground">
              What happened? (optional)
              <textarea
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="Work wasn't delivered, quality wasn't what we agreed, etc."
                rows={3}
                maxLength={500}
                className="mt-1.5 w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground/70 transition-colors focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10"
              />
            </label>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setDisputeForPaymentId(null); setDisputeReason(''); }}
                disabled={!!refundingId}
                className="rounded-xl px-4 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!disputeForPaymentId || !!refundingId}
                onClick={async () => {
                  if (!disputeForPaymentId || refundingId) return;
                  const paymentId = disputeForPaymentId;
                  setRefundingId(paymentId);
                  try {
                    const { data, error } = await supabase.functions.invoke('refund-vano-payment', {
                      body: {
                        payment_id: paymentId,
                        dispute_reason: disputeReason.trim() || undefined,
                      },
                    });
                    if (error) throw error;
                    const result = data as { ok?: boolean; already_refunded?: boolean } | null;
                    if (!result?.ok) throw new Error('Refund did not return ok');
                    toast({
                      title: 'Payment refunded',
                      description: 'Money is on its way back to your card (usually 3–5 days).',
                    });
                    setDisputeForPaymentId(null);
                    setDisputeReason('');
                  } catch (err) {
                    const ctxErr = (err as { context?: { error?: string } })?.context?.error;
                    toast({
                      title: "Couldn't process refund",
                      description: ctxErr || 'Please try again in a moment.',
                      variant: 'destructive',
                    });
                  } finally {
                    setRefundingId(null);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-destructive px-4 py-2 text-[13px] font-semibold text-destructive-foreground shadow-sm transition-colors hover:brightness-110 disabled:opacity-60"
              >
                {refundingId === disputeForPaymentId
                  ? <><Loader2 size={13} className="animate-spin" /> Refunding…</>
                  : 'Refund payment'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Messages;
