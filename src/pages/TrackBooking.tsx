import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { extractFnError } from '@/lib/fnError';
import { ArrowLeft, MapPin, CheckCircle2, Circle, Loader2, Send, Navigation, Star, X, Bell, ShieldCheck, ShieldAlert, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';
import { useToast } from '@/hooks/use-toast';
import { ReferralShareCard } from '@/components/household/ReferralShareCard';
import { BookingEmailCapture } from '@/components/household/BookingEmailCapture';
import { IosInstallTip } from '@/components/IosInstallTip';
import { isTimedCategory, formatCountdown, pendingWaitTier } from '@/lib/householdJob';
import { categoryLabel } from '@/lib/bookingLabels';
import { celebrateBooking, microCelebrate } from '@/lib/celebrate';
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
  scheduled_date: string | null;
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
  created_at: string;
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
  // Delegate to the shared labels so the track page never shows a raw slug
  // (e.g. "custom" for search-booked jobs → "Home help", "tutoring" →
  // "Online tutoring"). 'other' keeps its friendlier wording.
  if (cat === 'other') return 'Other task';
  return categoryLabel(cat);
}

function formatTimeSlot(slot: string | null): string | null {
  if (!slot) return null;
  const map: Record<string, string> = {
    morning: 'Morning · 8am–12pm', afternoon: 'Afternoon · 12–5pm', evening: 'Evening · 5–8pm',
  };
  return map[slot] ?? slot;
}

// Nullable in the DB — ASAP quick-books can land without a date (dispatch
// falls back to 'flexible' for the same reason), and a null here used to
// crash the whole tracking page at .toLowerCase().
function formatDate(d: string | null): string {
  if (!d) return 'As soon as possible';
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
    id_verified: boolean;
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

  // Report-a-problem (money-back) state
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportDone, setReportDone] = useState(false);

  // "Mark done" (one-off jobs) + live timer tick (timed jobs)
  const [markingDone, setMarkingDone] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  // Minutes the booking has waited for a helper (drives the time-aware pending
  // copy below). placedCelebratedRef gates the one-shot "fresh placement" pop.
  const [pendingMin, setPendingMin] = useState(0);
  const placedCelebratedRef = useRef(false);
  const waitTier = pendingWaitTier(pendingMin);

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

  // How long the booking has waited for a helper, so the "finding your helper"
  // copy stops pretending it's always "within minutes" and reflects the team
  // escalation the backend really does once offers expire (redispatch-stale-jobs
  // / no-helper-fallback).
  useEffect(() => {
    if (booking?.status !== 'pending' || !booking?.created_at) { setPendingMin(0); return; }
    const compute = () => setPendingMin(Math.max(0, Math.floor((Date.now() - new Date(booking.created_at).getTime()) / 60000)));
    compute();
    const id = window.setInterval(compute, 20000);
    return () => window.clearInterval(id);
  }, [booking?.status, booking?.created_at]);

  // Celebrate a *fresh* placement (booking under ~90s old) once — acknowledges
  // the submit without re-firing when revisiting an older pending booking.
  useEffect(() => {
    if (placedCelebratedRef.current) return;
    if (booking?.status === 'pending' && booking?.created_at
        && (Date.now() - new Date(booking.created_at).getTime()) < 90_000) {
      placedCelebratedRef.current = true;
      microCelebrate();
    }
  }, [booking?.status, booking?.created_at]);

  // 🎉 Celebrate the moment they land back booked & paid (once per mount).
  const celebratedRef = useRef(false);
  useEffect(() => {
    if (justPaid && !celebratedRef.current) {
      celebratedRef.current = true;
      celebrateBooking();
    }
  }, [justPaid]);

  // Celebrate live status changes while the page is open — the helper arriving
  // (small) and the job completing (big). Only on a real transition, so
  // revisiting a finished booking never re-fires confetti.
  const prevStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const s = booking?.status;
    if (!s) return;
    const prev = prevStatusRef.current;
    prevStatusRef.current = s;
    if (prev === null || prev === s) return;
    if (s === 'arrived') microCelebrate();
    else if (s === 'completed') celebrateBooking();
  }, [booking?.status]);

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
    // Poll control lives in refs (not state) so the interval body stays a pure
    // function — no side effects inside a setState updater. pollStatus tracks
    // the latest status for the terminal check; missCount stops the poll for a
    // booking that keeps coming back empty (a stale/mistyped link).
    let pollStatus: string | null = null;
    let missCount = 0;

    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!cancelled) setUserId(session?.user?.id ?? null);

      // Booking + chat go through SECURITY DEFINER RPCs keyed on the booking id
      // (the id is the bearer secret). The anon role can no longer read these
      // tables in bulk — the RPC hands back only this one booking. job_updates
      // (status + notes, no PII) is still read directly.
      const [bookingRes, updatesRes, messagesRes] = await Promise.all([
        hdb.rpc('get_household_booking', { p_booking_id: bookingId }),
        hdb.from('household_job_updates').select('*').eq('booking_id', bookingId).order('created_at'),
        hdb.rpc('get_household_chat', { p_booking_id: bookingId }),
      ]);

      if (cancelled) return;
      const bookingRow = Array.isArray(bookingRes.data) ? bookingRes.data[0] : bookingRes.data;
      if (bookingRow) {
        setBooking(bookingRow as Booking);
        pollStatus = (bookingRow as Booking).status;
        missCount = 0;
      } else if (!bookingRes.error) {
        // RPC succeeded but returned no row — the booking doesn't exist.
        missCount += 1;
      }
      // Array-guarded like bookingRow above: a malformed response (proxy,
      // captive portal, API hiccup) must degrade to "no updates yet", not
      // crash the whole tracking page at `updates.at(-1)`.
      if (Array.isArray(updatesRes.data)) setUpdates(updatesRes.data as JobUpdate[]);
      if (Array.isArray(messagesRes.data)) setMessages(messagesRes.data as ChatMessage[]);
      setLoading(false);
    };

    void load();
    // Anonymous customers can't receive realtime once the bulk-read policy is
    // removed, so poll while the job is live to keep status/pay/map/chat fresh.
    // (The realtime subscriptions below still serve signed-in helpers.)
    const poll = setInterval(() => {
      // Stop once terminal, or once the booking has come back empty a few times
      // (stale link) — never poll a non-existent booking forever.
      if (pollStatus === 'completed' || pollStatus === 'cancelled' || missCount >= 3) {
        clearInterval(poll);
        return;
      }
      void load();
    }, 5000);
    return () => { cancelled = true; clearInterval(poll); };
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
        .select('id, name, photo_url, average_rating, rating_avg, accepted_count, id_verified')
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
          id_verified: !!helper.id_verified,
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
      const { data, error } = await supabase.functions.invoke('complete-household-job', { body: { booking_id: bookingId } });
      if (error || (data as { error?: string } | null)?.error) {
        throw new Error(await extractFnError(data, error, 'Please try again, or WhatsApp +353 89 981 7111'));
      }
      if (selectedRating > 0) {
        try {
          // invoke() reports HTTP failures via the returned error — it doesn't
          // throw — so the old fire-and-forget marked the booking "rated" even
          // when the rating never saved. Only mark rated on genuine success;
          // otherwise leave the rating card up so the customer can retry.
          const rateRes = await supabase.functions.invoke('rate-household-booking', { body: { booking_id: bookingId, rating: selectedRating, comment: ratingComment || undefined } });
          if (!rateRes.error && !(rateRes.data as { error?: string } | null)?.error) {
            if (typeof localStorage !== 'undefined') localStorage.setItem(`vano_rated_${bookingId}`, '1');
            setAlreadyRated(true);
          }
        } catch { /* rating is best-effort — don't block completion */ }
      }
      setBooking((b) => b ? { ...b, status: 'completed' } : b);
      toast({ title: 'All done — thanks!', description: 'Your helper has been paid.' });
    } catch (e) {
      toast({ title: 'Could not mark done', description: e instanceof Error ? e.message : 'Please try again, or WhatsApp +353 89 981 7111', variant: 'destructive' });
    } finally {
      setMarkingDone(false);
    }
  };

  const handleCancel = async () => {
    if (!bookingId || cancelling) return;
    setCancelling(true);
    try {
      const { data, error } = await supabase.functions.invoke('cancel-household-booking', {
        body: { booking_id: bookingId, type: 'customer_cancel' },
      });
      if (error || (data as { error?: string } | null)?.error) {
        // Surface the server's real reason — e.g. "Your helper has already
        // started — message us…" (409) or the refund-failed 502 — instead of
        // the generic robot toast that left the customer at a dead end when the
        // cancel block silently unmounted on the next poll.
        throw new Error(await extractFnError(data, error, 'Please WhatsApp us on +353 89 981 7111'));
      }
      const wasPaid = !!booking?.paid_at;
      setBooking((b) => b ? { ...b, status: 'cancelled' } : b);
      toast({
        title: 'Booking cancelled',
        description: wasPaid ? 'Your refund will arrive in 5–7 business days.' : "You weren't charged.",
      });
      setCancelConfirm(false);
    } catch (e) {
      toast({ title: 'Could not cancel', description: e instanceof Error ? e.message : 'Please WhatsApp us on +353 89 981 7111', variant: 'destructive' });
    } finally {
      setCancelling(false);
    }
  };

  // Money-back: files a dispute server-side. If the helper hasn't been paid yet
  // it auto-refunds; otherwise it pages the team. Either way the customer gets a
  // clear, honest outcome instead of a bare WhatsApp link.
  const handleReportProblem = async () => {
    if (!bookingId || reportSubmitting) return;
    setReportSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke<{ refunded?: boolean; needs_admin?: boolean }>(
        'report-household-problem',
        { body: { booking_id: bookingId, reason: reportReason.trim() || undefined } },
      );
      if (error) throw error;
      setReportDone(true);
      toast(
        data?.refunded
          ? { title: 'Refund on its way', description: 'You’ve been fully refunded — it’ll show on your card in 5–7 days.' }
          : { title: 'We’re on it', description: 'Our team has been alerted and will sort this out with you shortly.' },
      );
    } catch {
      // Never leave them stuck — fall back to the human channel.
      toast({ title: 'Couldn’t submit automatically', description: 'Please message us on WhatsApp and we’ll sort it.', variant: 'destructive' });
      window.open(`https://wa.me/353899817111?text=${encodeURIComponent(`Hi VANO, I need help with my booking (ref ${bookingId.slice(-8).toUpperCase()}).`)}`, '_blank', 'noopener,noreferrer');
    } finally {
      setReportSubmitting(false);
    }
  };

  const handleRate = async () => {
    if (!bookingId || selectedRating === 0 || submittingRating) return;
    setSubmittingRating(true);
    try {
      const { data, error } = await supabase.functions.invoke('rate-household-booking', {
        body: { booking_id: bookingId, rating: selectedRating, comment: ratingComment || undefined },
      });
      if (error || (data as { error?: string } | null)?.error) {
        const msg = await extractFnError(data, error, 'Could not save rating — please try again.');
        // A duplicate (rated on another device) shouldn't loop "try again"
        // forever — it IS rated; reflect that and stop asking.
        if (/already/i.test(msg)) {
          if (typeof localStorage !== 'undefined') localStorage.setItem(`vano_rated_${bookingId}`, '1');
          setAlreadyRated(true);
          toast({ title: 'Already rated', description: 'This booking has a rating — thanks!' });
          return;
        }
        toast({ title: 'Could not save rating', description: msg, variant: 'destructive' });
        return;
      }
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
    // Skeleton in the shape of the page (header line, status card, steps) —
    // the customer lands here at their most anxious, so no bare spinner.
    return (
      <div className="min-h-dvh bg-background">
        <main className="max-w-lg mx-auto px-4 pt-8 space-y-6" aria-busy="true" aria-label="Loading your booking">
          <div className="space-y-2">
            <div className="h-4 w-28 rounded bg-secondary animate-pulse" />
            <div className="h-7 w-52 rounded bg-secondary animate-pulse" />
          </div>
          <div className="rounded-2xl border border-border/60 p-5 space-y-3">
            <div className="h-5 w-40 rounded bg-secondary animate-pulse" />
            <div className="h-4 w-full rounded bg-secondary animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-secondary animate-pulse" />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-secondary animate-pulse flex-shrink-0" />
              <div className="h-4 rounded bg-secondary animate-pulse" style={{ width: `${60 - i * 12}%` }} />
            </div>
          ))}
        </main>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-4 text-center">
        <span className="text-3xl" aria-hidden="true">🔍</span>
        <div>
          <p className="text-lg font-semibold text-foreground">We couldn't find that booking</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            The link may be old or mistyped. Your recent bookings are saved under your phone number.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/bookings')}
            className="h-10 px-5 rounded-full bg-primary text-primary-foreground text-sm font-semibold"
          >
            Find my bookings
          </button>
          <button onClick={() => navigate('/home')} className="text-sm text-muted-foreground underline underline-offset-2 px-2 py-2">
            Back to home
          </button>
        </div>
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
          className="flex items-center justify-center w-11 h-11 -ml-2.5 rounded-full hover:bg-secondary active:scale-90 transition-[transform,background-color]"
          aria-label="Back"
        >
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <img src={logo} alt="VANO" className="h-6 w-auto mx-auto" />
        <div className="w-11" />
      </header>

      <main className={cn('pt-14 max-w-sm md:max-w-lg mx-auto px-4', showMapPanel ? 'pb-[320px]' : 'pb-40')}>

        {/* Payment success banner. ?paid=true only ever comes from the Stripe
            success URL, which is reached AFTER a helper accepted (pay-after-
            accept), so the copy is post-accept — not "we're finding a helper".
            Gated off once the job is completed/cancelled so it can't linger. */}
        <AnimatePresence>
          {justPaid && booking && booking.status !== 'completed' && booking.status !== 'cancelled' && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as const }}
              className="mt-6 bg-sage-light border border-sage/30 rounded-2xl px-5 py-4 flex items-start gap-3"
            >
              <motion.span
                initial={{ scale: 0, rotate: -25 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 13, delay: 0.12 }}
                className="mt-0.5 flex-shrink-0"
              >
                <CheckCircle2 className="w-6 h-6 text-sage" />
              </motion.span>
              <div className="flex-1">
                <p className="font-semibold text-foreground text-sm">Payment confirmed 🎉</p>
                <p className="text-foreground/70 text-sm mt-0.5 leading-relaxed">
                  Your helper is confirmed and on the job. Follow their progress below — we'll text you every update.
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
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground flex-shrink-0">
                  {locationAge < 30 ? (
                    <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-sage opacity-75 animate-ping" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sage" />
                    </span>
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                  )}
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
              className="flex-shrink-0 h-10 px-4 rounded-full bg-sage text-white text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-sage-dark active:scale-[0.97] disabled:opacity-50 transition-[background-color,opacity,transform] duration-150"
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
        {/* status must be past 'pending': a released helper drops the booking back
            to searching but the old checkout URL survives on the row — showing
            "Helper confirmed — secure your booking" then would be a lie. */}
        {booking.stripe_checkout_url && !booking.paid_at && !isCancelled && !isCompleted && booking.status !== 'pending' && (
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
              Pay now to lock in your helper — your payment's protected until the job's confirmed done, money back if it's not right. No cash needed on the day.
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

        {/* Safety — report a problem at any point during an active job. Goes
            straight to a person on WhatsApp with the booking ref attached. */}
        {['accepted', 'on_way', 'arrived', 'in_progress'].includes(booking.status) && (
          <a
            href={`https://wa.me/353899817111?text=${encodeURIComponent(`Hi VANO, I need help with my booking${bookingId ? ` (ref ${bookingId.slice(-8).toUpperCase()})` : ''}.`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
          >
            <ShieldAlert size={13} className="flex-shrink-0" /> Report a problem
          </a>
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
                    {helperCard?.id_verified && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sage mt-0.5">
                        <ShieldCheck className="w-3 h-3" aria-hidden="true" /> ID-verified
                      </span>
                    )}
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
          if (!booking.paid_at) {
            // The pay card above only renders when a checkout link exists; if it
            // doesn't yet, don't leave the customer staring at a blank screen
            // mid-job — reassure them there's nothing to do right now.
            if (booking.stripe_checkout_url) return null;
            return (
              <div className="mt-4 rounded-2xl border border-border/60 bg-secondary/30 p-5 text-center">
                <p className="text-sm font-semibold text-foreground">
                  {helperName ? `${helperName} is on the job` : 'Your helper is on the job'}
                </p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Nothing to do right now — you'll confirm it's done and pay once they finish.
                </p>
              </div>
            );
          }
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
                  ? `${helperName ?? 'Your helper'} has marked the job finished. Rate them and confirm it's done — you've already paid, this just lets us pay ${helperName ?? 'them'}.`
                  : booking.job_ends_at
                    ? "Your booked time is up. Rate your helper and confirm it's done — you've already paid, there's nothing more to pay."
                    : `Once the work is finished, rate your helper and confirm it's done. You've already paid — confirming just lets us pay ${helperName ?? 'them'}.`}
              </p>
              <div className="flex gap-1 justify-center mb-4">
                {[1, 2, 3, 4, 5].map((n) => {
                  const on = n <= (hoverRating || selectedRating);
                  return (
                    <button
                      key={n}
                      onMouseEnter={() => setHoverRating(n)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setSelectedRating(n)}
                      className="p-2 active:scale-90 transition-transform"
                      aria-label={`${n} star${n === 1 ? '' : 's'}`}
                    >
                      <motion.span className="block" animate={{ scale: on ? 1.18 : 1 }} transition={{ type: 'spring', stiffness: 500, damping: 14 }}>
                        <Star size={26} className={cn('transition-colors', on ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/25')} />
                      </motion.span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => void handleMarkDone()}
                disabled={markingDone}
                className="w-full h-12 rounded-full bg-sage text-white font-semibold text-[15px] flex items-center justify-center gap-2 hover:bg-sage-dark disabled:opacity-50 transition-[background-color,opacity] duration-150"
              >
                {markingDone ? <Loader2 size={16} className="animate-spin" /> : <><CheckCircle2 size={16} />Confirm it's done</>}
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

                  {/* Fresh placements get a quick "received" acknowledgement;
                      after a few minutes the copy escalates to match what the
                      backend is really doing (re-dispatch → team). */}
                  {waitTier === 'fresh' && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold px-2.5 py-1 mb-2">
                      <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> Booking received
                    </span>
                  )}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="relative flex h-2 w-2" aria-hidden="true">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-sage opacity-75 animate-ping" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-sage" />
                    </span>
                    <p className="text-sm font-semibold text-foreground">
                      {waitTier === 'team' ? 'Our team is on it' : waitTier === 'searching' ? 'Still searching' : 'Finding your helper'}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {waitTier === 'team'
                      ? "Taking a little longer than usual — our Galway team is now finding someone for you. We'll WhatsApp you the moment they're confirmed."
                      : waitTier === 'searching'
                        ? 'Pinging more helpers near you — hang tight, this can take a few minutes.'
                        : offerCount && offerCount > 0
                          ? `${offerCount} helper${offerCount === 1 ? '' : 's'} nearby notified · usually matched within minutes`
                          : 'Notifying helpers near you… usually matched within minutes'}
                  </p>
                  {waitTier === 'team' && (
                    <a
                      href={`https://wa.me/353899817111?text=${encodeURIComponent("Hi VANO, I'm still waiting on a helper for my booking. Can you help?")}`}
                      target="_blank" rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#25D366]/40 text-[#25D366] text-xs font-semibold px-4 py-2 hover:bg-[#25D366]/8 transition-colors"
                    >
                      <span aria-hidden="true">💬</span> Message the team
                    </a>
                  )}

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
                {booking.paid_at
                  ? 'Your refund will appear within 5–7 business days. '
                  : "You weren't charged — with VANO you only pay once a helper accepts. "}
                Questions? WhatsApp{' '}
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
                        'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors duration-300',
                        done ? 'bg-sage' : 'bg-secondary border border-border/60',
                      )}>
                        {/* The completed tick springs in — each status change is a
                            moment, not a silent class swap. A gentle per-step
                            stagger reads as a cascade on load. */}
                        <AnimatePresence mode="popLayout" initial={false}>
                          {done ? (
                            <motion.span
                              key="check"
                              initial={{ scale: 0.3, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ type: 'spring', stiffness: 520, damping: 15, delay: i * 0.04 }}
                              className="inline-flex"
                            >
                              <CheckCircle2 size={12} className="text-white" strokeWidth={2.5} />
                            </motion.span>
                          ) : (
                            <motion.span key="circle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="inline-flex">
                              <Circle size={8} className="text-muted-foreground/40" />
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </div>
                      {!isLast && (
                        <div className="w-[2px] flex-1 my-1 bg-border/40 relative overflow-hidden rounded-full">
                          {/* Sage fill draws downward as this step completes. */}
                          <motion.div
                            className="absolute inset-0 bg-sage/50 origin-top"
                            initial={{ scaleY: 0 }}
                            animate={{ scaleY: done ? 1 : 0 }}
                            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1], delay: i * 0.04 }}
                          />
                        </div>
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
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 13, delay: 0.15 }}
                className="mb-2"
              >
                <CheckCircle2 size={28} className="text-sage mx-auto" strokeWidth={1.5} />
              </motion.div>
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
                  {[1, 2, 3, 4, 5].map((n) => {
                    const on = n <= (hoverRating || selectedRating);
                    return (
                      <button
                        key={n}
                        onMouseEnter={() => setHoverRating(n)}
                        onMouseLeave={() => setHoverRating(0)}
                        onClick={() => setSelectedRating(n)}
                        className="p-2 active:scale-90 transition-transform"
                      >
                        <motion.span className="block" animate={{ scale: on ? 1.18 : 1 }} transition={{ type: 'spring', stiffness: 500, damping: 14 }}>
                          <Star
                            size={28}
                            className={cn('transition-colors', on ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/25')}
                          />
                        </motion.span>
                      </button>
                    );
                  })}
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

            {/* Repeat is the cheapest growth — give a just-completed, happy
                customer a one-tap path straight back into the booking flow,
                instead of dead-ending at "refer a friend". */}
            <Link
              to="/home#category-grid"
              className="mt-4 flex items-center justify-center gap-1.5 w-full h-11 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:-translate-y-px hover:shadow-primary-glow transition-[transform,box-shadow] duration-150"
            >
              Book another job <span aria-hidden="true">→</span>
            </Link>

            {/* Money-back guarantee — a real action, not a dead WhatsApp link.
                Files a dispute server-side (auto-refunds when possible). */}
            <div className="mt-3 border-t border-sage/20 pt-3">
              {reportDone ? (
                <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                  <Check size={12} className="text-sage" /> Thanks — we’ve got it from here.
                </p>
              ) : !reportOpen ? (
                <button
                  type="button"
                  onClick={() => setReportOpen(true)}
                  className="flex items-center justify-center gap-1.5 w-full text-[11px] text-muted-foreground hover:text-foreground transition-colors py-1"
                >
                  <ShieldAlert size={12} className="flex-shrink-0" /> Something wrong? Report a problem
                </button>
              ) : (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
                  <p className="text-[11px] text-muted-foreground mb-2">Tell us what went wrong — you’re covered by our money-back guarantee.</p>
                  <textarea
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value.slice(0, 400))}
                    placeholder="e.g. the helper didn’t show, or the job wasn’t done right…"
                    rows={2}
                    className="w-full p-3 rounded-xl border border-border/60 bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring mb-2"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setReportOpen(false); setReportReason(''); }}
                      className="flex-1 h-10 rounded-full border border-border text-sm font-medium text-muted-foreground active:scale-[0.98] transition-transform"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleReportProblem()}
                      disabled={reportSubmitting}
                      className="flex-1 h-10 rounded-full bg-foreground text-background text-sm font-semibold flex items-center justify-center disabled:opacity-50 active:scale-[0.98] transition-transform"
                    >
                      {reportSubmitting ? <Loader2 size={15} className="animate-spin" /> : 'Submit'}
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}

        {/* The just-finished customer is the highest-intent sharer — the €5
            referral rides directly under the completion card (named after
            their helper), not buried below the chat thread. */}
        {isCompleted && (
          <ReferralShareCard
            className="mt-4"
            heading={helperName ? `Loved ${helperName}'s work? Give €5, get €5` : 'Happy with the job? Give €5, get €5'}
          />
        )}

        {/* Chat */}
        {booking.student_id && (
          <div className="mt-8">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Messages</p>
            <div className="flex flex-col gap-2 mb-3 min-h-[80px] max-h-[320px] overflow-y-auto overscroll-contain">
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

        {/* Give €5, get €5 during the wait — once the job completes, the card
            moves up beside the rating (see above) so it isn't rendered twice */}
        {!isCompleted && <ReferralShareCard className="mt-8" />}
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
            className="w-full max-w-sm md:max-w-lg bg-background border border-border/60 rounded-2xl overflow-hidden shadow-2xl"
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
          <div className="max-w-sm md:max-w-lg mx-auto flex items-center gap-2">
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
