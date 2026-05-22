import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, MapPin, Phone, Loader2, Send, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';
import { useToast } from '@/hooks/use-toast';
import { getUserFriendlyError } from '@/lib/errorMessages';
import logo from '@/assets/logo.png';

// Household tables not yet in generated types — remove once migration is applied and types are regenerated
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hdb = supabase as any;

type JobStatus = 'pending' | 'accepted' | 'on_way' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';
type UpdateStatus = 'accepted' | 'on_way' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';

interface Booking {
  id: string;
  category: string;
  scheduled_date: string;
  time_slot: string;
  is_express: boolean;
  status: JobStatus;
  customer_name: string;
  customer_address: string;
  customer_phone: string;
  price_estimate_cents: number | null;
  booking_data: Record<string, unknown>;
}

interface ChatMessage {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  shopping: 'Shopping run',
  'dog-walk': 'Dog walk',
  garden: 'Garden help',
  moving: 'Moving help',
  cleaning: 'Cleaning',
  other: 'General help',
};

const SLOT_LABELS: Record<string, string> = {
  morning: 'Morning · 8am–12pm',
  afternoon: 'Afternoon · 12–5pm',
  evening: 'Evening · 5–8pm',
};

function formatDate(d: string): string {
  if (d === 'today') return 'Today';
  if (d === 'tomorrow') return 'Tomorrow';
  try {
    return new Date(d).toLocaleDateString('en-IE', { weekday: 'long', month: 'long', day: 'numeric' });
  } catch { return d; }
}

// Status machine: what action advances the job
const NEXT_STATUS: Partial<Record<JobStatus, { status: UpdateStatus; label: string }>> = {
  accepted:    { status: 'on_way',      label: "I'm on my way" },
  on_way:      { status: 'arrived',     label: 'I arrived'     },
  arrived:     { status: 'in_progress', label: 'Starting job'  },
  in_progress: { status: 'completed',   label: 'Job complete'  },
};

const StudentJobDetail = () => {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { navigate('/auth', { replace: true }); return; }
      if (!cancelled) setUserId(session.user.id);

      const [bookingRes, msgRes] = await Promise.all([
        hdb.from('household_bookings').select('*').eq('id', bookingId).maybeSingle(),
        hdb.from('household_chat').select('*').eq('booking_id', bookingId).order('created_at'),
      ]);

      if (cancelled) return;
      if (bookingRes.data) setBooking(bookingRes.data as Booking);
      if (msgRes.data) setMessages(msgRes.data as ChatMessage[]);
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [bookingId, navigate]);

  useEffect(() => {
    if (!bookingId) return;
    const channel = supabase
      .channel(`student-chat-${bookingId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'household_chat', filter: `booking_id=eq.${bookingId}` },
        (payload) => setMessages((prev) => [...prev, payload.new as ChatMessage]),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [bookingId]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const advanceStatus = async () => {
    if (!booking || !bookingId) return;
    const next = NEXT_STATUS[booking.status];
    if (!next) return;

    const isComplete = next.status === 'completed';

    if (isComplete) {
      setCapturing(true);
      try {
        const { error } = await supabase.functions.invoke('capture-household-payment', {
          body: { booking_id: bookingId },
        });
        if (error) throw error;
        setBooking((b) => b ? { ...b, status: 'completed' } : b);
        toast({ title: 'Job complete — payment captured' });
      } catch (err) {
        toast({ title: 'Could not complete job', description: getUserFriendlyError(err), variant: 'destructive' });
      } finally {
        setCapturing(false);
      }
      return;
    }

    setAdvancing(true);
    const [updateRes] = await Promise.all([
      hdb.from('household_bookings').update({ status: next.status }).eq('id', bookingId),
      hdb.from('household_job_updates').insert({ booking_id: bookingId, status: next.status }),
    ]);
    if (updateRes.error) {
      toast({ title: 'Update failed', description: getUserFriendlyError(updateRes.error), variant: 'destructive' });
    } else {
      setBooking((b) => b ? { ...b, status: next.status as JobStatus } : b);
    }
    setAdvancing(false);
  };

  const sendMessage = async () => {
    if (!draft.trim() || !bookingId || !userId) return;
    setSending(true);
    const body = draft.trim();
    setDraft('');
    await hdb.from('household_chat').insert({ booking_id: bookingId, sender_id: userId, body });
    setSending(false);
  };

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
        <p className="text-lg font-semibold text-foreground">Job not found</p>
        <button onClick={() => navigate('/student-dashboard')} className="text-sm text-muted-foreground underline">
          Back to dashboard
        </button>
      </div>
    );
  }

  const next = NEXT_STATUS[booking.status];
  const isComplete = booking.status === 'completed';
  const isCancelled = booking.status === 'cancelled';

  return (
    <div className="min-h-dvh bg-background">
      <SEOHead title="Active job — VANO" description="Manage your active VANO job." noindex />

      <header className="fixed top-0 inset-x-0 z-50 h-14 flex items-center px-4 bg-background/95 backdrop-blur-xl border-b border-border/50">
        <button
          onClick={() => navigate('/student-dashboard')}
          className="flex items-center justify-center w-8 h-8 -ml-1 rounded-full hover:bg-secondary transition-colors"
          aria-label="Back"
        >
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <img src={logo} alt="VANO" className="h-6 w-auto mx-auto" />
        <div className="w-8" />
      </header>

      <main className="pt-14 pb-40 max-w-sm mx-auto px-4">
        {/* Job card */}
        <div className="mt-6 rounded-2xl border border-border/60 bg-secondary/30 p-5 mb-6">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
                {CATEGORY_LABELS[booking.category] ?? booking.category}
              </p>
              <p className="text-base font-semibold text-foreground">{formatDate(booking.scheduled_date)}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{SLOT_LABELS[booking.time_slot]}</p>
            </div>
            {booking.price_estimate_cents && (
              <div className="text-right flex-shrink-0">
                <p className="text-lg font-bold tabular-nums">
                  €{((booking.price_estimate_cents * 0.95) / 100).toFixed(0)}
                </p>
                <p className="text-[11px] text-muted-foreground">your earnings</p>
              </div>
            )}
          </div>
          <div className="space-y-2 pt-3 border-t border-border/40">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <MapPin size={14} className="text-muted-foreground flex-shrink-0" />
              <span>{booking.customer_address}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Phone size={14} className="text-muted-foreground flex-shrink-0" />
              <a href={`tel:${booking.customer_phone}`} className="underline underline-offset-2">
                {booking.customer_phone}
              </a>
            </div>
          </div>
        </div>

        {/* Status action button */}
        {!isComplete && !isCancelled && next && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => void advanceStatus()}
            disabled={advancing || capturing}
            className={cn(
              'w-full h-14 rounded-full font-semibold text-base flex items-center justify-center gap-2 mb-6',
              'transition-[background-color,opacity] duration-150',
              next.status === 'completed'
                ? 'bg-sage text-white hover:bg-sage-dark disabled:opacity-50'
                : 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
            )}
          >
            {(advancing || capturing) ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              next.label
            )}
          </motion.button>
        )}

        {isComplete && (
          <div className="flex flex-col items-center text-center py-4 mb-6">
            <CheckCircle2 size={32} className="text-sage mb-2" strokeWidth={1.5} />
            <p className="font-semibold text-foreground">Job complete</p>
            <p className="text-sm text-muted-foreground mt-0.5">Payment has been captured and will be transferred shortly.</p>
          </div>
        )}

        {/* Chat */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Chat with customer</p>
          <div className="flex flex-col gap-2 mb-3 min-h-[80px] max-h-[300px] overflow-y-auto">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">No messages yet.</p>
            )}
            {messages.map((msg) => {
              const isMe = msg.sender_id === userId;
              return (
                <div key={msg.id} className={cn('flex', isMe ? 'justify-end' : 'justify-start')}>
                  <div className={cn(
                    'max-w-[78%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed',
                    isMe
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-secondary text-foreground rounded-bl-sm border border-border/40',
                  )}>
                    {msg.body}
                  </div>
                </div>
              );
            })}
            <div ref={chatBottomRef} />
          </div>
        </div>
      </main>

      {/* Chat input */}
      {!isComplete && !isCancelled && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur-xl border-t border-border/50 safe-area-bottom px-4 py-3">
          <div className="max-w-sm mx-auto flex items-center gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }}
              placeholder="Message customer…"
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

export default StudentJobDetail;
