import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, MapPin, CheckCircle2, Circle, Loader2, Send, Navigation, Star, X, Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';
import { useToast } from '@/hooks/use-toast';
import { ReferralShareCard } from '@/components/household/ReferralShareCard';
import { BookingEmailCapture } from '@/components/household/BookingEmailCapture';
import { IosInstallTip } from '@/components/IosInstallTip';
import { isTimedCategory, formatCountdown } from '@/lib/householdJob';
import { celebrateBooking } from '@/lib/celebrate';
import logo from '@/assets/logo.png';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hdb = supabase as any;

type BookingStatus = 'awaiting_payment' | 'pending' | 'accepted' | 'on_way' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';
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
  customer_email: string | null;
  city: string | null;
  price_estimate_cents: number | null;
  student_id: string | null;
  worker_lat: number | null;
  worker_lng: number | null;
  worker_location_updated_at: string | null;
  customer_lat: number | null;
  customer_lng: number | null;
  /** Pay-after-accept: set by notify-household-accepted when a helper claims */
  stripe_checkout_url: string | null;
  paid_at: string | null;
  /** Arrival handshake: shown to the customer to read out to the helper */
  arrival_code: string | null;
  arrival_verified_at: string | null;
  /** Timed jobs: the booked-time countdown end (a guide; never auto-completes) */
  job_ends_at: string | null;
  /** Set when the helper taps "I've finished" — surfaces the confirm card early */
  helper_finished_at: string | null;
  booking_data: {
    service_fee_cents?: number;
    referral_discount_cents?: number;
  } | null;
}

// VAPID key (base64url) → Uint8Array for pushManager.subscribe. Mirrors the
// helper in usePushNotifications; inlined here because the household tracking
// flow subscribes anonymously (keyed to booking_id, not a user account).
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
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

if (typeof document !== 'undefined' && !document.getElementById('vano-map-css')) {
  const s = document.createElement('style');
  s.id = 'vano-map-css';
  s.textContent =
    '@keyframes vano-dot-pulse{0%{transform:scale(1);opacity:.55}to{transform:scale(2.8);opacity:0}}' +
    '.vano-dot-ring{animation:vano-dot-pulse 1.8s ease-out infinite}' +
    // Radar sweep for the "finding your helper" state.
    '@keyframes vano-radar{0%{transform:scale(.4);opacity:.7}80%{opacity:0}to{transform:scale(2.6);opacity:0}}' +
    '.vano-radar-ring{animation:vano-radar 2.4s cubic-bezier(0,.55,.45,1) infinite}' +
    '.vano-radar-ring-2{animation-delay:.8s}' +
    '.vano-radar-ring-3{animation-delay:1.6s}';
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

const customerDestIcon = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;background:#fff;border:3px solid #4a7c59;border-radius:50%;box-shadow:0 1px 5px rgba(0,0,0,.3)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// Invalidate the map size once layout settles (the map can mount mid-
// animation, otherwise tiles come up gray). Used by the static search map.
function MapAutoResize() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 300);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

function FitBoundsOrFollow({
  helperLat, helperLng, customerLat, customerLng,
}: { helperLat: number | null; helperLng: number | null; customerLat: number | null; customerLng: number | null }) {
  const map = useMap();
  const fitted = useRef(false);
  // The map lives in a spring-animated panel, so its size isn't final on mount.
  // Invalidate once layout settles so tiles don't come up gray.
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 300);
    return () => clearTimeout(t);
  }, [map]);
  useEffect(() => {
    const hasHelper = helperLat != null && helperLng != null;
    const hasCustomer = customerLat != null && customerLng != null;
    if (!fitted.current && hasHelper && hasCustomer) {
      // Both points known — frame the helper and the job together.
      map.fitBounds(
        L.latLngBounds([[helperLat!, helperLng!], [customerLat!, customerLng!]]),
        { padding: [44, 44], maxZoom: 16, animate: false },
      );
      fitted.current = true;
    } else if (hasHelper) {
      map.setView([helperLat!, helperLng!], map.getZoom(), { animate: true, duration: 0.8 });
    } else if (hasCustomer) {
      // No live helper position yet — just centre on the job location so the
      // customer always has a map to look at.
      map.setView([customerLat!, customerLng!], 15, { animate: false });
      fitted.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [helperLat, helperLng, customerLat, customerLng]);
  return null;
}

const STATUS_STEPS: { key: UpdateStatus; label: string; detail: string }[] = [
  { key: 'accepted',    label: 'Booking confirmed',  detail: 'A helper has accepted your job'   },
  { key: 'on_way',      label: 'Helper on the way',  detail: 'Your helper is heading to you'    },
  { key: 'arrived',     label: 'Helper arrived',     detail: 'They are at your address'         },
  { key: 'in_progress', label: 'Job in progress',    detail: 'Work has started'                 },
  { key: 'completed',   label: 'All done',           detail: 'Job completed successfully'       },
];

const STATUS_ORDER: UpdateStatus[] = ['accepted', 'on_way', 'arrived', 'in_progress', 'completed'];

function formatCategory(cat: string): string {
  const map: Record<string, string> = {
    shopping: 'Laundry', 'dog-walk': 'Dog walk', garden: 'Garden help',
    moving: 'Moving help', cleaning: 'Cleaning', tutoring: 'Tutoring', other: 'Other task',
  };
  return map[cat] ?? cat;
}

function formatTimeSlot(slot: string | null): string | null {
  if (!slot) return null;
  const map: Record<string, string> = {
    morning: 'Morning · 8am–12pm', afternoon: 'Afternoon · 12–5pm', evening: 'Evening · 5–8pm',
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

function formatLocationAge(seconds: number): string {
  if (seconds < 30) return 'Live';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

// Uber-style ETA from the live distance. The codebase approximates travel
// minutes as distanceKm*3 (≈20 km/h door-to-door in town); reuse that so the
// arrival clock and the "N min" label always agree.
function etaMinutes(distanceKm: number): number {
  return Math.max(1, Math.round(distanceKm * 3));
}

function formatArrivalClock(distanceKm: number): string {
  const arrival = new Date(Date.now() + etaMinutes(distanceKm) * 60_000);
  return arrival.toLocaleTimeString('en-IE', { hour: 'numeric', minute: '2-digit' });
}

const TrackBooking = () => {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const justPaid = searchParams.get('paid') === 'true';

  const [booking, setBooking] = useState<Booking | null>(null);
  const [updates, setUpdates] = useState<JobUpdate[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [helperName, setHelperName] = useState<string | null>(null);
  const [helperCard, setHelperCard] = useState<{
    id: string;
    photo_url: string | null;
    average_rating: number | null;
    accepted_count: number;
  } | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [locationAge, setLocationAge] = useState(0);
  const locationUpdatedAt = useRef<number>(Date.now());

  // "Finding your helper" — real count of helpers we've offered the job to.
  const [offerCount, setOfferCount] = useState<number | null>(null);

  // Push notifications (per status step). Customers are usually anonymous, so
  // subscriptions are keyed to booking_id, not a user account.
  const pushSupported = typeof window !== 'undefined'
    && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const [pushState, setPushState] = useState<'idle' | 'subscribing' | 'subscribed' | 'denied'>('idle');
  const [pushDismissed, setPushDismissed] = useState(false);

  // Cancel state
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // "Mark done" (one-off jobs) + live timer tick (timed jobs)
  const [markingDone, setMarkingDone] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Rating state
  const [hoverRating, setHoverRating] = useState(0);
  const [selectedRating, setSelectedRating] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [alreadyRated, setAlreadyRated] = useState(false);

  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bookingId) return;
    if (typeof localStorage !== 'undefined') {
      setAlreadyRated(!!localStorage.getItem(`vano_rated_${bookingId}`));
    }
  }, [bookingId]);

  // 🎉 Celebrate the moment they land back booked & paid (once per mount).
  const celebratedRef = useRef(false);
  useEffect(() => {
    if (justPaid && !celebratedRef.current) {
      celebratedRef.current = true;
      celebrateBooking();
    }
  }, [justPaid]);

  // ?rate=N deep link from the completion email — pre-select that star and
  // bring the rating card into view once the booking has loaded.
  const ratingCardRef = useRef<HTMLDivElement>(null);
  const rateParamApplied = useRef(false);
  useEffect(() => {
    if (rateParamApplied.current || alreadyRated) return;
    const n = parseInt(searchParams.get('rate') ?? '', 10);
    if (!Number.isInteger(n) || n < 1 || n > 5) return;
    if (booking?.status !== 'completed') return;
    rateParamApplied.current = true;
    setSelectedRating(n);
    window.setTimeout(() => {
      ratingCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 450);
  }, [booking?.status, alreadyRated, searchParams]);

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
  }, [bookingId]);

  useEffect(() => {
    if (!bookingId) return;
    const channel = supabase
      .channel(`hh-booking-${bookingId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'household_bookings', filter: `id=eq.${bookingId}` },
        (payload) => setBooking(payload.new as Booking),
      ).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [bookingId]);

  useEffect(() => {
    if (!bookingId) return;
    const channel = supabase
      .channel(`hh-updates-${bookingId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'household_job_updates', filter: `booking_id=eq.${bookingId}` },
        (payload) => setUpdates((prev) => [...prev, payload.new as JobUpdate]),
      ).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [bookingId]);

  useEffect(() => {
    if (!bookingId) return;
    const channel = supabase
      .channel(`hh-chat-${bookingId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'household_chat', filter: `booking_id=eq.${bookingId}` },
        (payload) => setMessages((prev) => [...prev, payload.new as ChatMessage]),
      ).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [bookingId]);

  useEffect(() => {
    const studentId = booking?.student_id;
    if (!studentId) { setHelperName(null); setHelperCard(null); return; }
    let cancelled = false;
    const fetch_ = async () => {
      const { data: helper } = await hdb
        .from('household_helpers')
        .select('id, name, photo_url, average_rating, rating_avg, accepted_count')
        .eq('user_id', studentId)
        .maybeSingle();
      if (cancelled) return;
      if (helper?.name) {
        setHelperName(helper.name.split(' ')[0]);
        setHelperCard({
          id: helper.id,
          photo_url: helper.photo_url || null,
          average_rating: helper.average_rating ?? helper.rating_avg ?? null,
          accepted_count: helper.accepted_count ?? 0,
        });
        return;
      }
      const { data: profile } = await hdb.from('profiles').select('display_name').eq('user_id', studentId).maybeSingle();
      if (!cancelled) setHelperName(profile?.display_name?.split(' ')[0] ?? null);
    };
    void fetch_();
    return () => { cancelled = true; };
  }, [booking?.student_id]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Location age — use DB timestamp when available for accuracy across page reloads
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
    const dbTs = booking?.worker_location_updated_at;
    if (dbTs) {
      locationUpdatedAt.current = new Date(dbTs).getTime();
      setLocationAge(Math.floor((Date.now() - locationUpdatedAt.current) / 1000));
    } else {
      locationUpdatedAt.current = Date.now();
      setLocationAge(0);
    }
  }, [booking?.worker_lat, booking?.worker_lng, booking?.customer_lat, booking?.customer_lng, booking?.worker_location_updated_at]);

  useEffect(() => {
    const id = setInterval(() => {
      setLocationAge(Math.floor((Date.now() - locationUpdatedAt.current) / 1000));
    }, 15_000);
    return () => clearInterval(id);
  }, []);

  // Tick once a second while a timed job is running, for the countdown UI.
  useEffect(() => {
    if (booking?.status !== 'in_progress' || !booking.job_ends_at) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [booking?.status, booking?.job_ends_at]);

  // While searching, fetch (and gently poll) the real number of helpers we've
  // offered the job to. Backed by a SECURITY DEFINER RPC so anonymous trackers
  // can read just the count without seeing the offer rows.
  const isSearching = booking?.status === 'pending' || booking?.status === 'awaiting_payment';
  useEffect(() => {
    if (!bookingId || !isSearching) return;
    let cancelled = false;
    const fetchCount = async () => {
      const { data, error } = await hdb.rpc('household_offer_count', { p_booking_id: bookingId });
      if (cancelled || error || data == null) return;
      setOfferCount(typeof data === 'number' ? data : Number(data));
    };
    void fetchCount();
    const id = setInterval(fetchCount, 12_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [bookingId, isSearching]);

  // Reflect any existing push subscription so we don't re-prompt a customer
  // who already opted in on this device.
  useEffect(() => {
    if (!pushSupported) return;
    if (Notification.permission === 'denied') { setPushState('denied'); return; }
    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled && sub) setPushState('subscribed');
      } catch { /* SW not ready — leave idle */ }
    })();
    return () => { cancelled = true; };
  }, [pushSupported]);

  // The customer confirms the work is finished — completes the booking and
  // auto-releases the helper's payout. Any rating chosen on the same card is
  // submitted alongside (best-effort).
  const handleMarkDone = async () => {
    if (!bookingId || markingDone) return;
    setMarkingDone(true);
    try {
      const { error } = await supabase.functions.invoke('complete-household-job', { body: { booking_id: bookingId } });
      if (error) throw error;
      if (selectedRating > 0) {
        try {
          await supabase.functions.invoke('rate-household-booking', { body: { booking_id: bookingId, rating: selectedRating, comment: ratingComment || undefined } });
          if (typeof localStorage !== 'undefined') localStorage.setItem(`vano_rated_${bookingId}`, '1');
          setAlreadyRated(true);
        } catch { /* rating is best-effort — don't block completion */ }
      }
      setBooking((b) => b ? { ...b, status: 'completed' } : b);
      toast({ title: 'All done — thanks!', description: 'Your helper has been paid.' });
    } catch {
      toast({ title: 'Could not mark done', description: 'Please try again, or WhatsApp +353 89 981 7111', variant: 'destructive' });
    } finally {
      setMarkingDone(false);
    }
  };

  const handleCancel = async () => {
    if (!bookingId || cancelling) return;
    setCancelling(true);
    try {
      const { error } = await supabase.functions.invoke('cancel-household-booking', {
        body: { booking_id: bookingId, type: 'customer_cancel' },
      });
      if (error) throw error;
      const wasPaid = !!booking?.paid_at;
      setBooking((b) => b ? { ...b, status: 'cancelled' } : b);
      toast({
        title: 'Booking cancelled',
        description: wasPaid ? 'Your refund will arrive in 5–7 business days.' : "You weren't charged.",
      });
      setCancelConfirm(false);
    } catch {
      toast({ title: 'Could not cancel', description: 'Please WhatsApp us on +353 89 981 7111', variant: 'destructive' });
    } finally {
      setCancelling(false);
    }
  };

  const handleRate = async () => {
    if (!bookingId || selectedRating === 0 || submittingRating) return;
    setSubmittingRating(true);
    try {
      const { error } = await supabase.functions.invoke('rate-household-booking', {
        body: { booking_id: bookingId, rating: selectedRating, comment: ratingComment || undefined },
      });
      if (error) throw error;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`vano_rated_${bookingId}`, '1');
      }
      setAlreadyRated(true);
      toast({ title: 'Thanks for your rating!' });
    } catch {
      toast({ title: 'Could not save rating', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setSubmittingRating(false);
    }
  };

  // Subscribe this device to push updates for the booking. Stores the
  // subscription keyed to booking_id (the customer is usually anonymous).
  // Best-effort throughout — any failure just leaves the prompt as-is.
  const enablePush = async () => {
    if (!bookingId || !pushSupported || pushState === 'subscribing') return;
    setPushState('subscribing');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setPushState(perm === 'denied' ? 'denied' : 'idle'); return; }

      const { data, error } = await supabase.functions.invoke<{ publicKey?: string }>('get-vapid-key');
      if (error || !data?.publicKey) { setPushState('idle'); return; }

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(data.publicKey) as BufferSource,
        });
      }
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) { setPushState('idle'); return; }
      await hdb.from('household_push_subscriptions').insert({
        booking_id: bookingId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      });
      setPushState('subscribed');
      toast({ title: "You're all set", description: "We'll ping you when your helper's on the move." });
    } catch {
      setPushState('idle');
    }
  };

  const sendMessage = async () => {
    if (!draft.trim() || !bookingId || !userId) return;
    setSending(true);
    const body = draft.trim().slice(0, 1000);
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
  const currentStepIndex = latestUpdateStatus ? STATUS_ORDER.indexOf(latestUpdateStatus) : -1;

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

  const isPending    = booking.status === 'pending' || booking.status === 'awaiting_payment';
  const isCompleted  = booking.status === 'completed';
  const isCancelled  = booking.status === 'cancelled';
  // The customer should always have a map during an active job: show the
  // helper's live position when they're sharing it, otherwise centre on the job
  // location itself (so the map is never just blank if GPS isn't shared yet).
  const helperLoc    = booking.worker_lat != null && booking.worker_lng != null;
  const customerLoc  = booking.customer_lat != null && booking.customer_lng != null;
  const jobActive    = ['accepted', 'on_way', 'arrived', 'in_progress'].includes(booking.status);
  // While the helper is on the way (or just arrived), promote the map to a big
  // hero near the top — the Uber/Deliveroo "watch them approach" moment. Other
  // active states keep the compact fixed bottom panel.
  const showHeroMap  = ['on_way', 'arrived'].includes(booking.status) && (helperLoc || customerLoc);
  const showMapPanel = jobActive && !showHeroMap && (helperLoc || customerLoc);
  const mapLat = (helperLoc ? booking.worker_lat : booking.customer_lat) as number;
  const mapLng = (helperLoc ? booking.worker_lng : booking.customer_lng) as number;

  return (
    <div className="min-h-dvh bg-background">
      <SEOHead title="Track your booking" description="Track your VANO booking status in real time." noindex />

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

      <main className={cn('pt-14 max-w-sm mx-auto px-4', showMapPanel ? 'pb-[320px]' : 'pb-40')}>

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
              <CheckCircle2 className="w-5 h-5 text-sage mt-0.5 flex-shrink-0" />
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
              <div className="flex flex-col items-end flex-shrink-0">
                <span className="text-lg font-bold text-foreground tabular-nums">
                  €{(booking.price_estimate_cents / 100).toFixed(0)}
                </span>
                {booking.paid_at && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-sage mt-0.5">
                    <CheckCircle2 className="w-3 h-3" /> Paid
                  </span>
                )}
              </div>
            )}
          </div>
          {booking.customer_address && booking.customer_address !== 'Not provided' && (
            <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground">
              <MapPin size={12} className="flex-shrink-0" />
              <span className="truncate">{booking.customer_address}</span>
            </div>
          )}
        </div>

        {/* iOS add-to-home-screen nudge — only shows on iOS Safari when not yet
            installed; makes web-push live updates reliable. Purely additive. */}
        {!isCancelled && !isCompleted && <IosInstallTip />}

        {/* Hero live-tracking map — the prominent "watch your helper approach"
            view while they're on the way. Helper + destination markers, a line
            between them, distance + ETA + live freshness. Falls back to the job
            location when GPS isn't shared yet (matches the always-show-a-map
            behaviour of the bottom panel). */}
        {showHeroMap && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] as const }}
            className="mt-4 rounded-2xl overflow-hidden border border-border/60 shadow-lg"
          >
            <div className="flex items-center justify-between px-4 py-3 bg-background border-b border-border/40">
              <div className="flex items-center gap-2 min-w-0">
                <Navigation size={15} className="text-sage flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-tight truncate">
                    {booking.status === 'arrived'
                      ? `${helperName ?? 'Your helper'} has arrived`
                      : helperLoc && distanceKm !== null
                        ? `Arriving ~${formatArrivalClock(distanceKm)} · ${etaMinutes(distanceKm)} min`
                        : `${helperName ?? 'Your helper'} is on the way`}
                  </p>
                  {booking.status === 'on_way' && helperLoc && distanceKm !== null && (
                    <p className="text-xs text-muted-foreground leading-tight mt-0.5">
                      {distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m away` : `${distanceKm.toFixed(1)} km away`}
                    </p>
                  )}
                </div>
              </div>
              {helperLoc && booking.status === 'on_way' && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                  <span className={cn('w-1.5 h-1.5 rounded-full', locationAge < 30 ? 'bg-sage animate-pulse' : 'bg-muted-foreground/40')} />
                  {formatLocationAge(locationAge)}
                </span>
              )}
            </div>
            <div style={{ height: 300 }}>
              <MapContainer
                center={[mapLat, mapLng]}
                zoom={14}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
                attributionControl={false}
                scrollWheelZoom={false}
                dragging={false}
              >
                <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" subdomains="abcd" detectRetina />
                {helperLoc && customerLoc && (
                  <Polyline
                    positions={[
                      [booking.worker_lat as number, booking.worker_lng as number],
                      [booking.customer_lat as number, booking.customer_lng as number],
                    ]}
                    pathOptions={{ color: '#4a7c59', weight: 3, opacity: 0.7, dashArray: '8 8' }}
                  />
                )}
                {helperLoc && (
                  <Marker position={[booking.worker_lat as number, booking.worker_lng as number]} icon={helperMarkerIcon} />
                )}
                {customerLoc && (
                  <Marker position={[booking.customer_lat as number, booking.customer_lng as number]} icon={customerDestIcon} />
                )}
                <FitBoundsOrFollow
                  helperLat={booking.worker_lat ?? null}
                  helperLng={booking.worker_lng ?? null}
                  customerLat={booking.customer_lat ?? null}
                  customerLng={booking.customer_lng ?? null}
                />
              </MapContainer>
            </div>
          </motion.div>
        )}

        {/* Get notified — once a helper is confirmed, offer browser push so the
            customer doesn't have to keep the tab open. Anonymous-friendly
            (keyed to booking_id). Graceful when unsupported or denied. */}
        {booking.student_id && pushSupported && !isCompleted && !isCancelled
          && pushState !== 'subscribed' && pushState !== 'denied' && !pushDismissed && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] as const }}
            className="mt-4 flex items-center gap-3 rounded-2xl border border-border/60 bg-secondary/30 px-4 py-3"
          >
            <div className="w-9 h-9 rounded-full bg-sage/15 flex items-center justify-center flex-shrink-0">
              <Bell size={16} className="text-sage" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground leading-tight">Get notified</p>
              <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                We'll ping you when {helperName ?? 'your helper'} is on the way and arrives.
              </p>
            </div>
            <button
              onClick={() => void enablePush()}
              disabled={pushState === 'subscribing'}
              className="flex-shrink-0 h-9 px-4 rounded-full bg-sage text-white text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-sage-dark disabled:opacity-50 transition-[background-color,opacity] duration-150"
            >
              {pushState === 'subscribing' ? <Loader2 size={14} className="animate-spin" /> : 'Turn on'}
            </button>
            <button
              onClick={() => setPushDismissed(true)}
              aria-label="Dismiss"
              className="flex-shrink-0 text-muted-foreground -mr-1"
            >
              <X size={15} />
            </button>
          </motion.div>
        )}

        {/* Pay-after-accept: a helper is confirmed but the booking is unpaid.
            The email/WhatsApp pay link doesn't reach phone-only customers
            reliably — this card is the always-works path, updating live the
            moment notify-household-accepted stores the checkout URL. */}
        {booking.stripe_checkout_url && !booking.paid_at && !isCancelled && !isCompleted && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as const }}
            className="mt-4 rounded-2xl border-2 border-sage/40 bg-sage-light p-5"
          >
            <p className="font-bold text-foreground text-sm">
              {helperName ? `${helperName} is confirmed — secure your booking` : 'Helper confirmed — secure your booking'}
            </p>
            <p className="text-foreground/65 text-xs mt-1 leading-relaxed">
              Pay now to lock in your helper. No cash needed on the day.
            </p>
            {(() => {
              const price = booking.price_estimate_cents ?? 0;
              const fee = booking.booking_data?.service_fee_cents ?? 0;
              const discount = booking.booking_data?.referral_discount_cents ?? 0;
              const due = Math.max(0, price + fee - discount);
              return (
                <>
                  {discount > 0 && (
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-sage-dark mt-2">
                      <span aria-hidden="true">🎁</span>
                      €{(discount / 100).toFixed(0)} referral discount applied
                    </p>
                  )}
                  <a
                    href={booking.stripe_checkout_url!}
                    className="mt-3 w-full h-12 rounded-full bg-sage text-white font-semibold text-[15px] flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-[opacity,transform] duration-150"
                  >
                    Pay €{(due / 100).toFixed(2)} to confirm →
                  </a>
                </>
              );
            })()}
            <p className="text-center text-[11px] text-muted-foreground mt-2">
              Card, Apple Pay or Google Pay · secured by Stripe · money back guarantee
            </p>
          </motion.div>
        )}

        {/* Self-serve cancel — available right up until the helper starts the
            job (accepted/on_way/arrived). Paid bookings get a full refund; unpaid
            ones just cancel. Once in_progress/completed it switches to the
            "message us" WhatsApp path below. */}
        {['accepted', 'on_way', 'arrived'].includes(booking.status) && (
          <div className="mt-3">
            {!cancelConfirm ? (
              <button
                onClick={() => setCancelConfirm(true)}
                className="w-full text-xs text-muted-foreground py-2 underline underline-offset-2 text-center"
              >
                {booking.paid_at ? 'Cancel this booking?' : 'Cancel this booking'}
              </button>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <p className="text-sm font-semibold text-foreground">Cancel this booking?</p>
                  <button onClick={() => setCancelConfirm(false)} className="text-muted-foreground -mt-0.5 -mr-0.5">
                    <X size={16} />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                  {booking.paid_at
                    ? 'Free cancellation with full refund (before your helper starts). Your refund arrives within 5–7 business days.'
                    : "You haven't been charged — cancelling now is free."}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCancelConfirm(false)}
                    className="flex-1 h-10 rounded-xl bg-secondary text-sm font-semibold text-foreground transition-colors hover:bg-secondary/70"
                  >
                    Keep it
                  </button>
                  <button
                    onClick={() => void handleCancel()}
                    disabled={cancelling}
                    className="flex-1 h-10 rounded-xl bg-destructive text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5 transition-opacity"
                  >
                    {cancelling ? <Loader2 size={15} className="animate-spin" /> : 'Yes, cancel'}
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        )}

        {/* Helper is already working — cancellation is manual from here. */}
        {['in_progress', 'completed'].includes(booking.status) && (
          <a
            href="https://wa.me/353899817111"
            className="mt-3 block text-center text-xs text-muted-foreground underline underline-offset-2 py-2"
          >
            Need to cancel? Message us
          </a>
        )}

        {/* Helper chip — links to the helper's public profile when we have one */}
        {booking.student_id && helperName && !isPending && !isCancelled && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] as const }}
            className="mt-4"
          >
            {(() => {
              const inner = (
                <>
                  {helperCard?.photo_url ? (
                    <img
                      src={helperCard.photo_url}
                      alt={helperName}
                      className="w-11 h-11 rounded-full object-cover flex-shrink-0 border border-sage/25"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-sage/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-sage font-bold text-base">{helperName[0].toUpperCase()}</span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground font-medium">Your helper</p>
                    <p className="text-sm font-semibold text-foreground leading-tight">{helperName}</p>
                    {helperCard && (helperCard.average_rating || helperCard.accepted_count > 0) && (
                      <p className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                        {helperCard.average_rating ? (
                          <>
                            <Star className="w-3 h-3 fill-gold text-gold flex-shrink-0" />
                            {Number(helperCard.average_rating).toFixed(1)}
                          </>
                        ) : null}
                        {helperCard.average_rating && helperCard.accepted_count > 0 ? ' · ' : null}
                        {helperCard.accepted_count > 0
                          ? `${helperCard.accepted_count} task${helperCard.accepted_count === 1 ? '' : 's'} done`
                          : null}
                      </p>
                    )}
                  </div>
                  {helperCard && (
                    <span className="text-xs font-semibold text-sage flex-shrink-0">View profile →</span>
                  )}
                </>
              );
              const chipClass = 'flex items-center gap-3 bg-sage-light border border-sage/20 rounded-2xl px-4 py-3';
              return helperCard ? (
                <Link
                  to={`/helpers/${helperCard.id}`}
                  className={cn(chipClass, 'transition-[background-color,border-color] duration-150 hover:bg-sage/15 hover:border-sage/35 active:scale-[0.99]')}
                >
                  {inner}
                </Link>
              ) : (
                <div className={chipClass}>{inner}</div>
              );
            })()}
          </motion.div>
        )}

        {/* Arrival code — the helper tapped "I've reached"; read this out to them
            so they can start the job. Disappears once they've entered it. */}
        {booking.status === 'arrived' && booking.arrival_code && !booking.arrival_verified_at && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as const }}
            className="mt-4 rounded-2xl border-2 border-sage/40 bg-sage-light p-5 text-center"
          >
            <p className="font-bold text-foreground text-sm">
              {helperName ? `${helperName} is at your door 👋` : 'Your helper is here 👋'}
            </p>
            <p className="text-xs text-muted-foreground mt-1 mb-3 leading-relaxed">
              Read this code to your helper so they can start the job:
            </p>
            <p className="text-[2.5rem] leading-none font-extrabold tracking-[0.3em] tabular-nums text-sage">
              {booking.arrival_code}
            </p>
          </motion.div>
        )}

        {/* Job in progress. Timed jobs count down to the booked end time; once
            that's up (and for one-off jobs straight away) the customer gets a
            rate + "mark complete" card that confirms the job and pays the helper. */}
        {booking.status === 'in_progress' && (() => {
          const endMs = booking.job_ends_at ? new Date(booking.job_ends_at).getTime() : 0;
          // Show the countdown for a running timed job — unless the helper has
          // already flagged they're finished, in which case jump to confirm.
          const counting = isTimedCategory(booking.category) && booking.job_ends_at && endMs > nowTick && !booking.helper_finished_at;
          if (counting) {
            return (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as const }}
                className="mt-4 rounded-2xl border border-sage/30 bg-sage-light p-5 text-center"
              >
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  {helperName ? `${helperName} is working` : 'Job in progress'}
                </p>
                <p className="text-[2.5rem] leading-none font-extrabold tabular-nums text-sage my-2">
                  {formatCountdown(endMs - nowTick)}
                </p>
                <p className="text-xs text-muted-foreground">left on your booked time</p>
              </motion.div>
            );
          }
          // Don't offer "mark complete" (which pays the helper) until the
          // booking is paid — the pay-to-confirm card above prompts that first.
          if (!booking.paid_at) return null;
          return (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as const }}
              className="mt-4 rounded-2xl border-2 border-sage/40 bg-sage-light p-5 text-center"
            >
              <p className="font-bold text-foreground text-sm">
                {helperName ? `How was ${helperName}?` : 'How did it go?'}
              </p>
              <p className="text-xs text-muted-foreground mt-1 mb-3 leading-relaxed">
                {booking.helper_finished_at
                  ? `${helperName ?? 'Your helper'} has marked the job finished. Rate them and confirm to release their payment.`
                  : booking.job_ends_at
                    ? 'Your booked time is up. Rate your helper and confirm to release their payment.'
                    : 'Once the work is finished, rate your helper and confirm — this releases their payment.'}
              </p>
              <div className="flex gap-1 justify-center mb-4">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onMouseEnter={() => setHoverRating(n)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setSelectedRating(n)}
                    className="p-1 transition-transform active:scale-90"
                    aria-label={`${n} star${n === 1 ? '' : 's'}`}
                  >
                    <Star size={26} className={cn('transition-colors', n <= (hoverRating || selectedRating) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/25')} />
                  </button>
                ))}
              </div>
              <button
                onClick={() => void handleMarkDone()}
                disabled={markingDone}
                className="w-full h-12 rounded-full bg-sage text-white font-semibold text-[15px] flex items-center justify-center gap-2 hover:bg-sage-dark disabled:opacity-50 transition-[background-color,opacity] duration-150"
              >
                {markingDone ? <Loader2 size={16} className="animate-spin" /> : <><CheckCircle2 size={16} />Mark complete &amp; pay{helperName ? ` ${helperName}` : ''}</>}
              </button>
              <p className="text-center text-[11px] text-muted-foreground mt-2">Rating is optional — you can confirm without it.</p>
            </motion.div>
          );
        })()}

        {/* Status area */}
        <div className="mt-6">
          {isPending && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              {/* Uber-style live search: a radar sweep over the job location
                  (or a generic pulse when we have no coordinates), a real count
                  of helpers notified, and a calm reassurance line. Transitions
                  to the helper card automatically when status flips to accepted. */}
              <div className="relative overflow-hidden rounded-2xl bg-sage-light border border-sage/20 p-5">
                <div className="relative flex flex-col items-center text-center">
                  {/* Radar over a faint map of the job location when we have it */}
                  <div className="relative w-full h-36 mb-4 rounded-xl overflow-hidden">
                    {customerLoc ? (
                      <MapContainer
                        center={[booking.customer_lat as number, booking.customer_lng as number]}
                        zoom={14}
                        style={{ height: '100%', width: '100%' }}
                        zoomControl={false}
                        attributionControl={false}
                        scrollWheelZoom={false}
                        dragging={false}
                        doubleClickZoom={false}
                      >
                        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" subdomains="abcd" detectRetina />
                        <MapAutoResize />
                      </MapContainer>
                    ) : (
                      <div className="absolute inset-0 bg-sage/10" />
                    )}
                    {/* Pulse / radar rings, centred */}
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="relative w-16 h-16">
                        <div className="vano-radar-ring absolute inset-0 rounded-full bg-sage/30" />
                        <div className="vano-radar-ring vano-radar-ring-2 absolute inset-0 rounded-full bg-sage/30" />
                        <div className="vano-radar-ring vano-radar-ring-3 absolute inset-0 rounded-full bg-sage/30" />
                        <div className="absolute inset-[38%] rounded-full bg-sage shadow-[0_2px_10px_rgba(74,124,89,.5)]" />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-sage animate-pulse" />
                    <p className="text-sm font-semibold text-foreground">Finding your helper</p>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {offerCount && offerCount > 0
                      ? `${offerCount} helper${offerCount === 1 ? '' : 's'} nearby notified · usually matched within minutes`
                      : 'Notifying helpers near you… usually matched within minutes'}
                  </p>

                  {/* Subtle indeterminate progress to keep it feeling alive */}
                  <div className="mt-4 w-full h-1 rounded-full bg-sage/15 overflow-hidden">
                    <motion.div
                      className="h-full w-1/3 rounded-full bg-sage/70"
                      animate={{ x: ['-110%', '320%'] }}
                      transition={{ duration: 1.8, ease: 'easeInOut', repeat: Infinity }}
                    />
                  </div>
                </div>
              </div>

              {/* Customer cancel */}
              {booking.status === 'pending' && (
                <div className="mt-3">
                  {!cancelConfirm ? (
                    <button
                      onClick={() => setCancelConfirm(true)}
                      className="w-full text-xs text-muted-foreground py-2 underline underline-offset-2 text-center"
                    >
                      Need to cancel this booking?
                    </button>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-sm font-semibold text-foreground">Cancel this booking?</p>
                        <button onClick={() => setCancelConfirm(false)} className="text-muted-foreground -mt-0.5 -mr-0.5">
                          <X size={16} />
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                        {booking.paid_at
                          ? "You'll receive a full refund within 5–7 business days."
                          : "You haven't been charged — cancelling now is free."}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setCancelConfirm(false)}
                          className="flex-1 h-10 rounded-xl bg-secondary text-sm font-semibold text-foreground transition-colors hover:bg-secondary/70"
                        >
                          Keep it
                        </button>
                        <button
                          onClick={() => void handleCancel()}
                          disabled={cancelling}
                          className="flex-1 h-10 rounded-xl bg-destructive text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5 transition-opacity"
                        >
                          {cancelling ? <Loader2 size={15} className="animate-spin" /> : 'Yes, cancel'}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {isCancelled && (
            <div className="rounded-2xl bg-destructive/5 border border-destructive/20 p-5">
              <p className="text-sm font-semibold text-foreground">Booking cancelled</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Your refund will appear within 5–7 business days. Questions? WhatsApp{' '}
                <a href="https://wa.me/353899817111" className="text-primary underline">+353 89 981 7111</a>
              </p>
            </div>
          )}

          {!isPending && !isCancelled && (
            <div className="space-y-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">Progress</p>
              {STATUS_STEPS.map((step, i) => {
                const done   = i <= currentStepIndex;
                const active = i === currentStepIndex;
                const isLast = i === STATUS_STEPS.length - 1;
                return (
                  <div key={step.key} className="flex gap-3">
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

        {/* Completed: thank-you + rating */}
        {isCompleted && (
          <motion.div
            ref={ratingCardRef}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-8 rounded-2xl bg-sage-light border border-sage/20 p-5"
          >
            <div className="text-center mb-4">
              <CheckCircle2 size={28} className="text-sage mx-auto mb-2" strokeWidth={1.5} />
              <p className="font-semibold text-foreground">All done!</p>
              <p className="text-xs text-muted-foreground mt-1">Thanks for using VANO</p>
            </div>

            {/* Rating */}
            {!alreadyRated ? (
              <div className="border-t border-sage/20 pt-4">
                <p className="text-xs font-semibold text-foreground text-center mb-3">
                  How was {helperName ?? 'your helper'}?
                </p>
                <div className="flex gap-1 justify-center mb-3">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onMouseEnter={() => setHoverRating(n)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setSelectedRating(n)}
                      className="p-1 transition-transform active:scale-90"
                    >
                      <Star
                        size={28}
                        className={cn(
                          'transition-colors',
                          n <= (hoverRating || selectedRating) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/25',
                        )}
                      />
                    </button>
                  ))}
                </div>
                <AnimatePresence>
                  {selectedRating > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <textarea
                        value={ratingComment}
                        onChange={(e) => setRatingComment(e.target.value.slice(0, 300))}
                        placeholder="Leave a comment (optional)…"
                        className="w-full p-3 rounded-xl border border-border/60 bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring mb-2"
                        rows={2}
                      />
                      <button
                        onClick={() => void handleRate()}
                        disabled={submittingRating}
                        className="w-full h-11 rounded-full bg-sage text-white font-semibold text-sm flex items-center justify-center disabled:opacity-50 transition-opacity"
                      >
                        {submittingRating ? <Loader2 size={16} className="animate-spin" /> : 'Submit rating'}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <p className="text-center text-xs text-muted-foreground border-t border-sage/20 pt-4">
                Thanks for your feedback! ⭐
              </p>
            )}
          </motion.div>
        )}

        {/* Chat */}
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

        {/* Email opt-in — quick-book never collects email, so this is where
            confirmation / pay link / receipt emails get unlocked */}
        {!isCancelled && bookingId && (
          <BookingEmailCapture
            bookingId={bookingId}
            currentEmail={booking.customer_email}
            onSaved={(email) => setBooking(b => (b ? { ...b, customer_email: email } : b))}
          />
        )}

        {/* Give €5, get €5 — the post-booking wait is the highest-intent
            sharing moment; renders only when this device has booking memory */}
        <ReferralShareCard className="mt-8" />
      </main>

      {/* Map panel — helper's live position when shared, else the job location */}
      {showMapPanel && (
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
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
              <div className="flex items-center gap-2">
                <Navigation size={13} className="text-sage flex-shrink-0" />
                <span className="text-sm font-semibold text-foreground">
                  {helperLoc && booking.status === 'on_way'
                    ? (distanceKm !== null
                        ? `${distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`} away`
                        : 'Helper on the way')
                    : booking.status === 'arrived'
                    ? 'Helper has arrived'
                    : booking.status === 'in_progress'
                    ? 'Job in progress'
                    : helperLoc
                    ? 'Helper on the way'
                    : 'Job location'}
                </span>
                {helperLoc && booking.status === 'on_way' && distanceKm !== null && (
                  <span className="text-xs text-muted-foreground">
                    · ~{Math.max(1, Math.round(distanceKm * 3))} min
                  </span>
                )}
              </div>
              {helperLoc && booking.status === 'on_way' && (
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {formatLocationAge(locationAge)}
                </span>
              )}
            </div>
            <div style={{ height: 200 }}>
              <MapContainer
                center={[mapLat, mapLng]}
                zoom={14}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
                attributionControl={false}
                scrollWheelZoom={false}
                dragging={false}
              >
                <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" subdomains="abcd" detectRetina />
                {helperLoc && (
                  <Marker position={[booking.worker_lat as number, booking.worker_lng as number]} icon={helperMarkerIcon} />
                )}
                {customerLoc && (
                  <Marker position={[booking.customer_lat as number, booking.customer_lng as number]} icon={customerDestIcon} />
                )}
                <FitBoundsOrFollow
                  helperLat={booking.worker_lat ?? null}
                  helperLng={booking.worker_lng ?? null}
                  customerLat={booking.customer_lat ?? null}
                  customerLng={booking.customer_lng ?? null}
                />
              </MapContainer>
            </div>
          </motion.div>
        </div>
      )}

      {/* Chat input */}
      {booking.student_id && !isCompleted && !isCancelled && userId && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur-xl border-t border-border/50 safe-area-bottom px-4 py-3">
          <div className="max-w-sm mx-auto flex items-center gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
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
