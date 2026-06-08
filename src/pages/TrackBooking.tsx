import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, MapPin, CheckCircle2, Circle, Loader2, Send, Navigation } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';
import logo from '@/assets/logo.png';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';

// Household tables not yet in generated types — remove once migration is applied and types are regenerated
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hdb = supabase as any;

type BookingStatus = 'awaiting_payment' | 'pending' | 'accepted' | 'on_way' | 'in_progress' | 'completed' | 'cancelled';
type UpdateStatus = 'accepted' | 'on_way' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';

interface Booking {
  id: string;
  category: string;
  scheduled_date: string;
  time_slot: string | null;
  is_express: boolean;
  status: BookingStatus;
  customer_name: string;
  customer_address: string;
  city: string | null;
  price_estimate_cents: number | null;
  student_id: string | null;
  worker_lat: number | null;
  worker_lng: number | null;
  customer_lat: number | null;
  customer_lng: number | null;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

// Inject custom marker animation once on module load
if (typeof document !== 'undefined' && !document.getElementById('vano-map-css')) {
  const s = document.createElement('style');
  s.id = 'vano-map-css';
  s.textContent =
    '@keyframes vano-dot-pulse{0%{transform:scale(1);opacity:.55}to{transform:scale(2.8);opacity:0}}' +
    '.vano-dot-ring{animation:vano-dot-pulse 1.8s ease-out infinite}';
  document.head.appendChild(s);
}

const helperMarkerIcon = L.divIcon({
  className: '',
  html:
    '<div style="position:relative;width:18px;height:18px">' +
    '<div class="vano-dot-ring" style="position:absolute;inset:-6px;border:2px solid #4a7c59;border-radius:50%"></div>' +
    '<div style="width:18px;height:18px;background:#4a7c59;border:2.5px solid #fff;border-radius:50%;box-shadow:0 1px 6px rgba(74,124,89,.45)"></div>' +
    '</div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// Customer destination pin — white circle with green border
const customerDestIcon = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;background:#fff;border:3px solid #4a7c59;border-radius:50%;box-shadow:0 1px 5px rgba(0,0,0,.3)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// Auto-fits both helper + customer in view, then follows helper on updates
function FitBoundsOrFollow({
  helperLat, helperLng, customerLat, customerLng,
}: { helperLat: number; helperLng: number; customerLat: number | null; customerLng: number | null }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current && customerLat && customerLng) {
      map.fitBounds(
        L.latLngBounds([[helperLat, helperLng], [customerLat, customerLng]]),
        { padding: [44, 44], maxZoom: 16, animate: false },
      );
      fitted.current = true;
    } else {
      map.setView([helperLat, helperLng], map.getZoom(), { animate: true, duration: 0.8 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [helperLat, helperLng]);
  return null;
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
    tutoring: 'Tutoring',
    other: 'Other task',
  };
  return map[cat] ?? cat;
}

function formatTimeSlot(slot: string | null): string | null {
  if (!slot) return null;
  const map: Record<string, string> = {
    morning: 'Morning · 8am–12pm',
    afternoon: 'Afternoon · 12–5pm',
    evening: 'Evening · 5–8pm',
  };
  return map[slot] ?? slot;
}

function formatDate(d: string): string {
  const lower = d.toLowerCase();
  if (lower === 'today') return 'Today';
  if (lower === 'tomorrow') return 'Tomorrow';
  if (lower === 'flexible' || lower === 'this weekend' || lower === 'next week') return d;
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString('en-IE', { weekday: 'long', month: 'long', day: 'numeric' });
}

const TrackBooking = () => {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const justPaid = searchParams.get('paid') === 'true';

  const [booking, setBooking] = useState<Booking | null>(null);
  const [updates, setUpdates] = useState<JobUpdate[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [helperName, setHelperName] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [locationAge, setLocationAge] = useState(0); // seconds since last worker position update
  const locationUpdatedAt = useRef<number>(Date.now());

  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Fetch booking + updates + messages
  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;

    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!cancelled) setUserId(session?.user?.id ?? null);

      const [bookingRes, updatesRes, messagesRes] = await Promise.all([
        hdb.from('household_bookings').select('*').eq('id', bookingId).maybeSingle(),
        hdb.from('household_job_updates').select('*').eq('booking_id', bookingId).order('created_at'),
        hdb.from('household_chat').select('*').eq('booking_id', bookingId).order('created_at'),
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

  // Realtime booking status subscription — keeps status badge / progress live
  useEffect(() => {
    if (!bookingId) return;
    const channel = supabase
      .channel(`hh-booking-${bookingId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'household_bookings', filter: `id=eq.${bookingId}` },
        (payload) => {
          setBooking(payload.new as Booking);
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [bookingId]);

  // Realtime job updates subscription — drives the progress timeline
  useEffect(() => {
    if (!bookingId) return;
    const channel = supabase
      .channel(`hh-updates-${bookingId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'household_job_updates', filter: `booking_id=eq.${bookingId}` },
        (payload) => {
          setUpdates((prev) => [...prev, payload.new as JobUpdate]);
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [bookingId]);

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

  // Fetch helper name when a student is assigned
  useEffect(() => {
    const studentId = booking?.student_id;
    if (!studentId) { setHelperName(null); return; }
    let cancelled = false;
    const fetch_ = async () => {
      const { data: helper } = await hdb
        .from('household_helpers')
        .select('name')
        .eq('user_id', studentId)
        .maybeSingle();
      if (cancelled) return;
      if (helper?.name) { setHelperName(helper.name.split(' ')[0]); return; }
      const { data: profile } = await hdb
        .from('profiles')
        .select('display_name')
        .eq('user_id', studentId)
        .maybeSingle();
      if (!cancelled) setHelperName(profile?.display_name?.split(' ')[0] ?? null);
    };
    void fetch_();
    return () => { cancelled = true; };
  }, [booking?.student_id]);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Recalculate distance when helper moves
  useEffect(() => {
    const wLat = booking?.worker_lat;
    const wLng = booking?.worker_lng;
    const cLat = booking?.customer_lat;
    const cLng = booking?.customer_lng;
    if (wLat && wLng && cLat && cLng) {
      setDistanceKm(haversineKm(wLat, wLng, cLat, cLng));
    } else {
      setDistanceKm(null);
    }
    locationUpdatedAt.current = Date.now();
    setLocationAge(0);
  }, [booking?.worker_lat, booking?.worker_lng, booking?.customer_lat, booking?.customer_lng]);

  // Tick location age every 15s so the "updated X ago" label stays fresh
  useEffect(() => {
    const id = setInterval(() => {
      setLocationAge(Math.floor((Date.now() - locationUpdatedAt.current) / 1000));
    }, 15_000);
    return () => clearInterval(id);
  }, []);

  const sendMessage = async () => {
    if (!draft.trim() || !bookingId || !userId) return;
    setSending(true);
    const body = draft.trim();
    setDraft('');
    try {
      const { error } = await hdb.from('household_chat').insert({ booking_id: bookingId, sender_id: userId, body });
      if (error) throw error;
    } catch {
      setDraft(body);
    } finally {
      setSending(false);
    }
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

  const isPending = booking.status === 'pending' || booking.status === 'awaiting_payment';
  const isCompleted = booking.status === 'completed';
  const isCancelled = booking.status === 'cancelled';

  return (
    <div className="min-h-dvh bg-background">
      <SEOHead title="Track your booking" description="Track your VANO booking status in real time." noindex />

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

      <main className={cn('pt-14 max-w-sm mx-auto px-4', booking.status === 'on_way' && booking.worker_lat ? 'pb-[320px]' : 'pb-40')}>

        {/* Payment success banner */}
        <AnimatePresence>
          {justPaid && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as const }}
              className="mt-6 bg-sage-light border border-sage/30 rounded-2xl px-5 py-4 flex items-start gap-3"
            >
              <CheckCircle2 className="w-5 h-5 text-sage mt-0.5 flex-shrink-0" aria-hidden="true" />
              <div className="flex-1">
                <p className="font-semibold text-foreground text-sm">You're booked — we're on it!</p>
                <p className="text-foreground/70 text-sm mt-0.5 leading-relaxed">
                  We're finding your helper right now. You'll get a text with their name and photo within minutes.
                </p>
                {bookingId && (
                  <p className="text-muted-foreground text-xs mt-2 font-mono tracking-wide">
                    Ref: {bookingId.slice(-8).toUpperCase()}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
              {formatTimeSlot(booking.time_slot) && (
                <p className="text-sm text-muted-foreground mt-0.5">{formatTimeSlot(booking.time_slot)}</p>
              )}
            </div>
            {booking.price_estimate_cents && (
              <span className="text-lg font-bold text-foreground tabular-nums flex-shrink-0">
                €{(booking.price_estimate_cents / 100).toFixed(0)}
              </span>
            )}
          </div>
          {booking.customer_address && booking.customer_address !== 'Not provided' && (
            <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground">
              <MapPin size={12} className="flex-shrink-0" />
              <span className="truncate">{booking.customer_address}</span>
            </div>
          )}
        </div>

        {/* Helper name — shown once a student is assigned */}
        {booking.student_id && helperName && !isPending && !isCancelled && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] as const }}
            className="mt-4 flex items-center gap-2.5 bg-sage-light border border-sage/20 rounded-2xl px-4 py-3"
          >
            <div className="w-8 h-8 rounded-full bg-sage/20 flex items-center justify-center flex-shrink-0">
              <span className="text-sage font-bold text-sm">{helperName[0].toUpperCase()}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Your helper</p>
              <p className="text-sm font-semibold text-foreground leading-tight">{helperName}</p>
            </div>
          </motion.div>
        )}

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
                We're on it — you'll get a text with your helper's name and photo within minutes.
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
                  <p className="text-xs text-muted-foreground text-center py-6">No messages yet.</p>
                )}
                {messages.map((msg) => {
                  const isMe = userId ? msg.sender_id === userId : false;
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
            {!userId && (
              <p className="text-xs text-muted-foreground text-center py-2">
                <a href="/auth" className="underline underline-offset-2">Sign in</a> to message your helper.
              </p>
            )}
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

      {/* Fixed bottom map panel — shown when helper is on the way */}
      {booking.status === 'on_way' && booking.worker_lat && booking.worker_lng && (
        <div className={cn(
          'fixed inset-x-0 z-30 flex justify-center px-4',
          booking.student_id && !isCompleted && !isCancelled && userId ? 'bottom-[68px]' : 'bottom-0 pb-safe',
        )}>
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="w-full max-w-sm bg-background border border-border/60 rounded-2xl overflow-hidden shadow-2xl"
          >
            {/* Map header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-sage animate-pulse flex-shrink-0" />
                <span className="text-sm font-semibold text-foreground">
                  {distanceKm !== null
                    ? `${distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`} away`
                    : 'Helper on the way'}
                </span>
                {distanceKm !== null && (
                  <span className="text-xs text-muted-foreground">
                    · ~{Math.max(1, Math.round(distanceKm * 3))} min
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {locationAge < 30 ? 'Live' : locationAge < 120 ? `${Math.floor(locationAge / 60)}m ago` : `${Math.floor(locationAge / 60)}m ago`}
              </span>
            </div>
            {/* Map */}
            <div style={{ height: 200 }}>
              <MapContainer
                center={[booking.worker_lat, booking.worker_lng]}
                zoom={14}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
                attributionControl={false}
                scrollWheelZoom={false}
                dragging={false}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Marker position={[booking.worker_lat, booking.worker_lng]} icon={helperMarkerIcon} />
                {booking.customer_lat && booking.customer_lng && (
                  <Marker position={[booking.customer_lat, booking.customer_lng]} icon={customerDestIcon} />
                )}
                <FitBoundsOrFollow
                  helperLat={booking.worker_lat}
                  helperLng={booking.worker_lng}
                  customerLat={booking.customer_lat ?? null}
                  customerLng={booking.customer_lng ?? null}
                />
              </MapContainer>
            </div>
          </motion.div>
        </div>
      )}

      {/* Chat input — fixed bottom when student assigned and user is logged in */}
      {booking.student_id && !isCompleted && !isCancelled && userId && (
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
