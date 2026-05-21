import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, MapPin, Clock, CheckCircle2, Circle, Loader2, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';
import logo from '@/assets/logo.png';

type BookingStatus = 'pending' | 'accepted' | 'on_way' | 'in_progress' | 'completed' | 'cancelled';
type UpdateStatus = 'accepted' | 'on_way' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';

interface Booking {
  id: string;
  category: string;
  scheduled_date: string;
  time_slot: string;
  is_express: boolean;
  status: BookingStatus;
  customer_name: string;
  customer_address: string;
  price_estimate_cents: number | null;
  student_id: string | null;
}

interface JobUpdate {
  id: string;
  status: UpdateStatus;
  note: string | null;
  created_at: string;
}

interface ChatMessage {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

const STATUS_STEPS: { key: UpdateStatus; label: string; detail: string }[] = [
  { key: 'accepted',    label: 'Booking confirmed',   detail: 'A student has accepted your job' },
  { key: 'on_way',      label: 'Student on the way',  detail: 'Your helper is heading to you'   },
  { key: 'arrived',     label: 'Student arrived',     detail: 'They are at your address'        },
  { key: 'in_progress', label: 'Job in progress',     detail: 'Work has started'                },
  { key: 'completed',   label: 'All done',            detail: 'Job completed successfully'      },
];

const STATUS_ORDER: UpdateStatus[] = ['accepted', 'on_way', 'arrived', 'in_progress', 'completed'];

function formatCategory(cat: string): string {
  const map: Record<string, string> = {
    shopping: 'Shopping run',
    'dog-walk': 'Dog walk',
    garden: 'Garden help',
    moving: 'Moving help',
    cleaning: 'Cleaning',
    other: 'Other task',
  };
  return map[cat] ?? cat;
}

function formatTimeSlot(slot: string): string {
  const map: Record<string, string> = {
    morning: 'Morning · 8am–12pm',
    afternoon: 'Afternoon · 12–5pm',
    evening: 'Evening · 5–8pm',
  };
  return map[slot] ?? slot;
}

function formatDate(d: string): string {
  if (d === 'today') return 'Today';
  if (d === 'tomorrow') return 'Tomorrow';
  try {
    return new Date(d).toLocaleDateString('en-IE', { weekday: 'long', month: 'long', day: 'numeric' });
  } catch {
    return d;
  }
}

const TrackBooking = () => {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [updates, setUpdates] = useState<JobUpdate[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Fetch booking + updates + messages
  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;

    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { navigate('/auth', { replace: true }); return; }
      if (!cancelled) setUserId(session.user.id);

      const [bookingRes, updatesRes, messagesRes] = await Promise.all([
        supabase.from('household_bookings').select('*').eq('id', bookingId).maybeSingle(),
        supabase.from('household_job_updates').select('*').eq('booking_id', bookingId).order('created_at'),
        supabase.from('household_chat').select('*').eq('booking_id', bookingId).order('created_at'),
      ]);

      if (cancelled) return;
      if (bookingRes.data) setBooking(bookingRes.data as Booking);
      if (updatesRes.data) setUpdates(updatesRes.data as JobUpdate[]);
      if (messagesRes.data) setMessages(messagesRes.data as ChatMessage[]);
      setLoading(false);
    };

    void load();
    return () => { cancelled = true; };
  }, [bookingId, navigate]);

  // Realtime chat subscription
  useEffect(() => {
    if (!bookingId) return;
    const channel = supabase
      .channel(`hh-chat-${bookingId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'household_chat', filter: `booking_id=eq.${bookingId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as ChatMessage]);
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [bookingId]);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!draft.trim() || !bookingId || !userId) return;
    setSending(true);
    const body = draft.trim();
    setDraft('');
    await supabase.from('household_chat').insert({ booking_id: bookingId, sender_id: userId, body });
    setSending(false);
  };

  const latestUpdateStatus = updates.at(-1)?.status ?? null;
  const currentStepIndex = latestUpdateStatus
    ? STATUS_ORDER.indexOf(latestUpdateStatus)
    : -1;

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-lg font-semibold text-foreground">Booking not found</p>
        <button onClick={() => navigate('/home')} className="text-sm text-muted-foreground underline underline-offset-2">
          Back to home
        </button>
      </div>
    );
  }

  const isPending = booking.status === 'pending';
  const isCompleted = booking.status === 'completed';
  const isCancelled = booking.status === 'cancelled';

  return (
    <div className="min-h-dvh bg-background">
      <SEOHead title="Track your booking" noindex />

      {/* Nav */}
      <header className="fixed top-0 inset-x-0 z-50 h-14 flex items-center px-4 bg-background/95 backdrop-blur-xl border-b border-border/50">
        <button
          onClick={() => navigate('/home')}
          className="flex items-center justify-center w-8 h-8 -ml-1 rounded-full hover:bg-secondary transition-colors"
          aria-label="Back"
        >
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <img src={logo} alt="VANO" className="h-6 w-auto mx-auto" />
        <div className="w-8" />
      </header>

      <main className="pt-14 pb-40 max-w-sm mx-auto px-4">

        {/* Booking summary card */}
        <div className="mt-6 rounded-2xl border border-border/60 bg-secondary/30 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
                {formatCategory(booking.category)}
              </p>
              <p className="text-base font-semibold text-foreground leading-snug">
                {formatDate(booking.scheduled_date)}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">{formatTimeSlot(booking.time_slot)}</p>
            </div>
            {booking.price_estimate_cents && (
              <span className="text-lg font-bold text-foreground tabular-nums flex-shrink-0">
                €{(booking.price_estimate_cents / 100).toFixed(0)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground">
            <MapPin size={12} className="flex-shrink-0" />
            <span className="truncate">{booking.customer_address}</span>
          </div>
        </div>

        {/* Status area */}
        <div className="mt-6">
          {isPending && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl bg-sage-light border border-sage/20 p-5"
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-sage animate-pulse" />
                <p className="text-sm font-semibold text-foreground">Finding your helper</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                We're matching you with an available ATU student. You'll get a message when they accept.
              </p>
            </motion.div>
          )}

          {isCancelled && (
            <div className="rounded-2xl bg-destructive/5 border border-destructive/20 p-5">
              <p className="text-sm font-semibold text-foreground">Booking cancelled</p>
              <p className="text-xs text-muted-foreground mt-0.5">This booking was cancelled.</p>
            </div>
          )}

          {!isPending && !isCancelled && (
            <div className="space-y-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">Progress</p>
              {STATUS_STEPS.map((step, i) => {
                const done = i <= currentStepIndex;
                const active = i === currentStepIndex;
                const isLast = i === STATUS_STEPS.length - 1;
                return (
                  <div key={step.key} className="flex gap-3">
                    {/* Line + dot column */}
                    <div className="flex flex-col items-center w-5 flex-shrink-0">
                      <div className={cn(
                        'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                        done ? 'bg-sage' : 'bg-secondary border border-border/60',
                      )}>
                        {done
                          ? <CheckCircle2 size={12} className="text-white" strokeWidth={2.5} />
                          : <Circle size={8} className="text-muted-foreground/40" />
                        }
                      </div>
                      {!isLast && (
                        <div className={cn('w-[2px] flex-1 my-1', done ? 'bg-sage/40' : 'bg-border/40')} />
                      )}
                    </div>
                    {/* Text */}
                    <div className={cn('pb-4', isLast && 'pb-0')}>
                      <p className={cn('text-sm font-semibold leading-snug', done ? 'text-foreground' : 'text-muted-foreground/60')}>
                        {step.label}
                      </p>
                      {active && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="text-xs text-muted-foreground mt-0.5 leading-relaxed"
                        >
                          {step.detail}
                        </motion.p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Chat — only show when a student is assigned */}
        {booking.student_id && (
          <div className="mt-8">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Messages</p>
            <div className="flex flex-col gap-2 mb-3 min-h-[80px] max-h-[320px] overflow-y-auto">
              <AnimatePresence initial={false}>
                {messages.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">No messages yet. Say hi!</p>
                )}
                {messages.map((msg) => {
                  const isMe = msg.sender_id === userId;
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className={cn('flex', isMe ? 'justify-end' : 'justify-start')}
                    >
                      <div className={cn(
                        'max-w-[78%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed',
                        isMe
                          ? 'bg-primary text-primary-foreground rounded-br-sm'
                          : 'bg-secondary text-foreground rounded-bl-sm border border-border/40',
                      )}>
                        {msg.body}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              <div ref={chatBottomRef} />
            </div>
          </div>
        )}

        {isCompleted && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-8 rounded-2xl bg-sage-light border border-sage/20 p-5 text-center"
          >
            <CheckCircle2 size={28} className="text-sage mx-auto mb-2" strokeWidth={1.5} />
            <p className="font-semibold text-foreground">Job complete</p>
            <p className="text-xs text-muted-foreground mt-1">Payment will be released to your helper.</p>
          </motion.div>
        )}
      </main>

      {/* Chat input — fixed bottom when student assigned */}
      {booking.student_id && !isCompleted && !isCancelled && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur-xl border-t border-border/50 safe-area-bottom px-4 py-3">
          <div className="max-w-sm mx-auto flex items-center gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }}
              placeholder="Message your helper…"
              className="flex-1 h-11 rounded-full bg-secondary border border-border/50 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={() => void sendMessage()}
              disabled={!draft.trim() || sending}
              className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 disabled:opacity-40 transition-opacity active:scale-95"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrackBooking;
