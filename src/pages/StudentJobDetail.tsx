import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuthContext';
import { ArrowLeft, MapPin, Phone, Loader2, Send, CheckCircle2, Navigation, AlertTriangle, Zap, KeyRound, ShieldCheck, Camera } from 'lucide-react';
import { uploadJobPhoto } from '@/lib/jobPhotos';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';
import { useToast } from '@/hooks/use-toast';
import { getUserFriendlyError } from '@/lib/errorMessages';
import { extractFnError } from '@/lib/fnError';
import { microCelebrate } from '@/lib/celebrate';
import { isTimedCategory, formatCountdown } from '@/lib/householdJob';
import { getCurrentPosition, watchPosition, clearWatch, isPermissionDenied, type WatchId } from '@/lib/native/geolocation';
import logo from '@/assets/logo.png';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Leaflet reads the container size on mount. Inside the app's PageTransition
// the map mounts mid-animation, so without this it renders as gray tiles until
// something forces a redraw. Invalidating once the layout settles fixes it.
function MapAutoResize() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 300);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

// Fix default Leaflet marker icons broken by bundlers
const customerIcon = L.divIcon({
  className: '',
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#4a7c59;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

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
  student_id: string | null;
  customer_name: string;
  customer_address: string;
  customer_phone: string;
  customer_lat: number | null;
  customer_lng: number | null;
  price_estimate_cents: number | null;
  // Pay-after-accept: null until the customer pays. The helper shouldn't start
  // the job (arrival code) until this is set.
  paid_at: string | null;
  booking_data: Record<string, unknown>;
  // Set once the helper enters the customer's arrival code. The code itself is
  // deliberately NOT fetched here — it lives only on the customer's screen.
  arrival_verified_at: string | null;
  // For timed jobs: the booked-time countdown end (a guide; never auto-completes).
  job_ends_at: string | null;
  // Set when the helper taps "I've finished" — asks the customer to confirm.
  helper_finished_at: string | null;
  // Before/after job photos (uploaded via the job-photo function). Evidence
  // for Vano Cover/disputes + the customer's shareable before/after card.
  arrival_photo_url: string | null;
  finish_photo_url: string | null;
}

interface ChatMessage {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  shopping: 'Laundry',
  'dog-walk': 'Dog walk',
  garden: 'Garden help',
  moving: 'Moving help',
  cleaning: 'Cleaning',
  tutoring: 'Tutoring',
  handyman: 'Handyman',
  plumbing: 'Plumbing help',
  'furniture-assembly': 'Furniture assembly',
  'tech-help': 'Tech help',
  'wait-delivery': 'Wait for delivery',
  'post-office': 'Post office run',
  'pharmacy-run': 'Pharmacy run',
  other: 'General help',
};

const SLOT_LABELS: Record<string, string> = {
  morning: 'Morning · 8am–12pm',
  afternoon: 'Afternoon · 12–5pm',
  evening: 'Evening · 5–8pm',
};

function formatDate(d: string | null): string {
  // scheduled_date holds the human "when" label ('Now', '1pm', 'Tomorrow 9am',
  // 'flexible'), not always a date — new Date('1pm') is Invalid Date and
  // toLocaleDateString doesn't throw, so the old try/catch still rendered
  // "Invalid Date" as the job date. Show the label as-is unless it's a real date.
  if (!d || d.toLowerCase() === 'flexible') return 'Flexible';
  const lower = d.toLowerCase();
  if (lower === 'now') return 'As soon as possible';
  if (lower === 'today') return 'Today';
  if (lower === 'tomorrow') return 'Tomorrow';
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString('en-IE', { weekday: 'long', month: 'long', day: 'numeric' });
}

// Great-circle distance in metres — drives the "I'm at the door" GPS-start
// button (mirror of the server check in functions/household-arrival).
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function googleMapsUrl(address: string, lat?: number | null, lng?: number | null) {
  const dest = (lat != null && lng != null) ? `${lat},${lng}` : encodeURIComponent(address);
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
}

function wazeUrl(address: string, lat?: number | null, lng?: number | null) {
  return (lat != null && lng != null)
    ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
    : `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
}

// "What needs doing" — the task specifics the customer entered, surfaced from
// booking_data per category so the worker knows the job before/after claiming.
function jobDetailLines(category: string, d: Record<string, unknown>): { label: string; value: string }[] {
  const lines: { label: string; value: string }[] = [];
  const add = (label: string, v: unknown) => {
    if (v === undefined || v === null || v === '') return;
    const value = Array.isArray(v) ? v.filter(Boolean).join(', ') : String(v);
    if (value.trim()) lines.push({ label, value: value.trim() });
  };
  switch (category) {
    case 'shopping':
      add('Store', d.store); add('Shopping list', d.shoppingList); break;
    case 'dog-walk':
      add('Dogs', d.dogCount); add('Walk length', d.walkDuration); break;
    case 'garden':
      add('Tasks', d.gardenTasks); add('Time needed', d.gardenDuration); break;
    case 'moving':
      add('Helpers needed', d.helperCount); add('Duration', d.movingDuration);
      add('From', d.fromAddress); add('To', d.toAddress); add('Details', d.movingDescription); break;
    case 'cleaning':
      add('Tasks', d.cleaningTasks); add('Time needed', d.cleaningDuration); break;
  }
  add('Notes', d.description);
  return lines;
}

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.startsWith('353') && d.length >= 12) return `+353 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  if (d.startsWith('0') && d.length >= 9) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  return raw;
}

// Status machine: only the "I'm on my way" step is a generic advance button.
// on_way → arrived and arrived → in_progress run through the arrival-code flow
// ("I've reached" + code entry). Completion is never a helper tap and never
// automatic — the customer marks the job complete to pay the helper.
const NEXT_STATUS: Partial<Record<JobStatus, { status: UpdateStatus; label: string }>> = {
  accepted: { status: 'on_way', label: "I'm on my way" },
};

// How often (ms) to push location updates to Supabase while on the way
const LOCATION_UPDATE_INTERVAL_MS = 15_000;

const StudentJobDetail = () => {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const justClaimed = new URLSearchParams(location.search).get('claimed') === '1';
  const { session: authSession, loading: authLoading } = useAuth();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [sending, setSending] = useState(false);
  const [sharingLocation, setSharingLocation] = useState(false);
  // GPS-verified arrival: true while the streamed position is within ~120m of
  // the customer's address — unlocks the no-code "I'm at the door" start.
  const [atDoor, setAtDoor] = useState(false);
  const [gpsStarting, setGpsStarting] = useState(false);
  const lastPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [releaseConfirm, setReleaseConfirm] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  // First-job ID gate: false = definitely unverified (accept is replaced by a
  // verify CTA). null = unknown (row still loading / fetch hiccup) — the
  // server is the real gate (dispatch + accept-job both filter id_verified),
  // this state only drives honest UI.
  const [helperIdVerified, setHelperIdVerified] = useState<boolean | null>(null);
  // Arrival-code handshake
  const [reaching, setReaching] = useState(false);
  const [arrivalCode, setArrivalCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState(false);
  // Wrong-code count this visit — the first miss is almost always a typo, so
  // the retry is the only affordance shown; the "get a fresh code" escape
  // hatch appears from the second miss.
  const [codeAttempts, setCodeAttempts] = useState(0);
  // The 4-step "how it works" explainer teaches the FIRST job, then collapses
  // to one line with a "How it works" toggle — a repeat helper knows the
  // drill, and the lecture was sitting above their primary button. localStorage
  // remembers which booking it was first shown on (so revisiting job #1 keeps
  // it open; any later job starts collapsed).
  const [howOpen, setHowOpen] = useState<boolean>(() => {
    try {
      const seenOn = localStorage.getItem('vano-job-explainer-first');
      return !seenOn || seenOn === bookingId;
    } catch { return true; }
  });
  // Stamp the first booking the explainer was shown on (raw state only — the
  // derived `mine` lives below the early returns, out of hook reach).
  useEffect(() => {
    if (!bookingId || !booking || !userId) return;
    if (booking.status !== 'accepted' || booking.student_id !== userId) return;
    try {
      if (!localStorage.getItem('vano-job-explainer-first')) {
        localStorage.setItem('vano-job-explainer-first', bookingId);
      }
    } catch { /* private mode — the explainer simply stays open every time */ }
  }, [bookingId, booking, userId]);
  // "Customer not available" — start the job without the arrival code.
  const [skipConfirm, setSkipConfirm] = useState(false);
  const [skipping, setSkipping] = useState(false);
  // Timed-job countdown (display only — the customer marks the job done)
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [finishing, setFinishing] = useState(false);
  // Before/after job photos — which slot is mid-upload (fail-soft: an upload
  // error never blocks the job flow, it just toasts and lets them retry).
  const [photoUploading, setPhotoUploading] = useState<'arrival' | 'finish' | null>(null);
  // Direct-pay two-way review: "did the customer pay you?" state
  const [paidStars, setPaidStars] = useState(0);
  const [paidSubmitting, setPaidSubmitting] = useState(false);
  const [unpaidWarn, setUnpaidWarn] = useState(false);
  // Set when the browser refuses geolocation while on_way — the customer's
  // live map silently shows nothing, so the helper deserves to know.
  const [locationDenied, setLocationDenied] = useState(false);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  // Geolocation watch handle — kept while status is on_way
  const watchIdRef = useRef<WatchId | null>(null);
  // Guards the async gap while a native watch is being set up (prevents double-watch)
  const watchStartingRef = useRef(false);
  // Timestamp of last DB location push — throttles writes
  const lastLocationPushRef = useRef<number>(0);

  // Redirect unauthenticated users only after auth state is known (avoids
  // race where getSession() returns null briefly while the context hydrates)
  useEffect(() => {
    if (authLoading) return;
    // Carry the deep link so the dispatch-email journey survives sign-in
    if (!authSession?.user) navigate('/auth', { replace: true, state: { from: location.pathname } });
  }, [authLoading, authSession, navigate, location.pathname]);

  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;
    const load = async () => {
      // Wait for auth context to resolve before checking session
      if (authLoading) return;
      const uid = authSession?.user?.id ?? null;
      if (!uid) return; // redirect handled by the effect above
      if (!cancelled) setUserId(uid);

      const [bookingRes, msgRes, helperRes] = await Promise.all([
        // Explicit columns — never select arrival_code, so the customer's code
        // can't be read out of the helper's app and the handshake stays honest.
        hdb.from('household_bookings')
          .select('id, category, scheduled_date, time_slot, is_express, status, student_id, customer_name, customer_address, customer_phone, customer_lat, customer_lng, price_estimate_cents, paid_at, booking_data, arrival_verified_at, job_ends_at, helper_finished_at, arrival_photo_url, finish_photo_url')
          .eq('id', bookingId).maybeSingle(),
        hdb.from('household_chat').select('*').eq('booking_id', bookingId).order('created_at'),
        // First-job gate: only ID-verified helpers may accept (matches the
        // dispatch filter + accept-job's server check).
        hdb.from('household_helpers').select('id_verified').eq('user_id', uid).maybeSingle(),
      ]);

      if (cancelled) return;
      if (bookingRes.data) {
        const b = bookingRes.data as Booking;
        setBooking(b);
        // Restore live tracking if the page is reloaded while on_way
        if (b.status === 'on_way') startLocationWatch(bookingId);
      }
      if (msgRes.data) setMessages(msgRes.data as ChatMessage[]);
      if (helperRes.data) setHelperIdVerified(!!(helperRes.data as { id_verified: boolean | null }).id_verified);
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, navigate, authLoading, authSession]);

  // Clear the geolocation watch on unmount
  useEffect(() => {
    return () => { void stopLocationWatch(); };
  }, []);

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

  // Keep the helper's view in sync with server-side changes — the customer
  // paying, marking complete, or an admin cancelling. Without this the screen
  // goes stale and the helper can act on an outdated status.
  useEffect(() => {
    if (!bookingId) return;
    const channel = supabase
      .channel(`student-booking-${bookingId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'household_bookings', filter: `id=eq.${bookingId}` },
        (payload) => {
          // Realtime UPDATE payloads carry the ENTIRE new row (row-level RLS
          // only — no column narrowing), including the customer's secret
          // arrival_code AND rating_token. The initial fetch and the polling RPC
          // both withhold these from the helper on purpose; merging payload.new
          // wholesale would hand the assigned helper their own arrival code (to
          // self-verify off DevTools) and the rating token (to rate their own
          // job). Strip both before merging.
          const { arrival_code: _omitCode, rating_token: _omitTok, ...next } = payload.new as Partial<Booking> & { arrival_code?: string; rating_token?: string };
          setBooking((b) => (b ? { ...b, ...next } : b));
          if (next.status === 'completed' || next.status === 'cancelled') stopLocationWatch();
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [bookingId]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (justClaimed) {
      microCelebrate();
      toast({ title: '🎉 Job claimed!', description: "You got it. Head over when you're ready." });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startLocationWatch(bid: string) {
    if (watchIdRef.current !== null || watchStartingRef.current) return; // already watching / starting
    watchStartingRef.current = true;
    setSharingLocation(true);
    // Customer coords are fixed at booking time, so capturing them here is safe
    // for the lifetime of the watch.
    const custLat = booking?.customer_lat ?? null;
    const custLng = booking?.customer_lng ?? null;
    try {
      // Native app uses @capacitor/geolocation; web uses the browser API.
      const id = await watchPosition(
        (pos) => {
          // Proximity runs on EVERY tick (before the 15s stream throttle) so
          // the "I'm at the door" button appears the moment they're close.
          // setState with an unchanged boolean is a React no-op — no churn.
          lastPosRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          if (custLat != null && custLng != null) {
            setAtDoor(haversineMeters(pos.coords.latitude, pos.coords.longitude, custLat, custLng) <= 120);
          }
          const now = Date.now();
          if (now - lastLocationPushRef.current < LOCATION_UPDATE_INTERVAL_MS) return;
          lastLocationPushRef.current = now;
          hdb.from('household_bookings').update({
            worker_lat: pos.coords.latitude,
            worker_lng: pos.coords.longitude,
            worker_location_updated_at: new Date().toISOString(),
          }).eq('id', bid).then(() => {/* fire and forget */});
        },
        (err) => {
          // Permission denied means the customer's live map shows nothing —
          // surface it instead of failing silently.
          if (isPermissionDenied(err)) {
            setLocationDenied(true);
            void stopLocationWatch();
          }
        },
        { enableHighAccuracy: true, maximumAge: 5000 },
      );
      if (id !== null) watchIdRef.current = id;
      else setSharingLocation(false); // couldn't start (denied) — onError already fired
    } finally {
      watchStartingRef.current = false;
    }
  }

  async function stopLocationWatch() {
    const id = watchIdRef.current;
    watchIdRef.current = null;
    setSharingLocation(false);
    if (id !== null) {
      try { await clearWatch(id); } catch { /* best effort */ }
    }
  }

  // Claim straight from this page — the dispatch email deep-links here, so
  // "View & Accept" must actually offer Accept. Same atomic guard as the
  // dashboard: only one helper can flip pending → accepted.
  const claimJob = async () => {
    if (!booking || !bookingId || !userId || claiming) return;
    // First-job ID gate (mirrors accept-job's server check): the button is
    // already swapped for a verify CTA when unverified, this is belt+braces.
    if (helperIdVerified === false) {
      toast({ title: 'Verify your ID first', description: 'A free 2-minute ID check unlocks your first job.', variant: 'destructive' });
      navigate('/verify-helper');
      return;
    }
    setClaiming(true);
    const { data: claimed, error } = await hdb
      .from('household_bookings')
      // Stamp accepted_at like accept-job does — sweep-stalled-jobs clocks a
      // ghosting helper from acceptance, and filters on accepted_at IS NOT
      // NULL, so an in-app claim that omitted it was invisible to the sweep.
      .update({ student_id: userId, status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', bookingId)
      .eq('status', 'pending')
      .is('student_id', null)
      .select('id');

    if (error || !claimed?.length) {
      toast({ title: 'Job just taken', description: 'Someone else got there first — keep an eye out for the next one.', variant: 'destructive' });
      // Re-fetch so the page reflects whoever actually has it. Explicit columns
      // — never select('*'): the row carries the customer's secret arrival_code
      // and this runs in the (losing) helper's browser.
      const { data: fresh } = await hdb.from('household_bookings')
        .select('id, category, scheduled_date, time_slot, is_express, status, student_id, customer_name, customer_address, customer_phone, customer_lat, customer_lng, price_estimate_cents, paid_at, booking_data, arrival_verified_at, job_ends_at, helper_finished_at, arrival_photo_url, finish_photo_url')
        .eq('id', bookingId).maybeSingle();
      if (fresh) setBooking(fresh as Booking);
      setClaiming(false);
      return;
    }

    // Log accepted update so TrackBooking stepper shows "Booking confirmed" immediately
    void hdb.from('household_job_updates').insert({ booking_id: bookingId, status: 'accepted' });
    // Email + SMS the customer their pay link, fire-and-forget
    void supabase.functions.invoke('notify-household-accepted', { body: { booking_id: bookingId } });

    setBooking((b) => b ? { ...b, status: 'accepted', student_id: userId } : b);
    setClaiming(false);
    microCelebrate();
    toast({ title: '🎉 Job claimed!', description: 'The customer is being asked to pay to confirm you.' });
  };

  // "I've reached" — ask the server to generate the arrival code (shown only on
  // the customer's screen) and move the job to 'arrived'. Stops location sharing.
  const handleReached = async () => {
    if (!bookingId || reaching) return;
    setReaching(true);
    try {
      const { error } = await supabase.functions.invoke('household-arrival', {
        body: { booking_id: bookingId, action: 'request' },
      });
      if (error) throw error;
      stopLocationWatch();
      setBooking((b) => b ? { ...b, status: 'arrived' } : b);
      toast({ title: "You're at the door", description: 'Ask the customer for their 4-digit code, then enter it to start.' });
    } catch (err) {
      toast({ title: 'Could not mark arrival', description: await extractFnError(null, err, getUserFriendlyError(err)), variant: 'destructive' });
    } finally {
      setReaching(false);
    }
  };

  // GPS-verified start — no code ritual. The server re-checks the distance
  // (and corroborates against the streamed track), flips the job to
  // in_progress and tells the customer. Falls back to the code path on any
  // miss, so this can only ever remove friction, never add it.
  const handleGpsStart = async () => {
    if (!bookingId || gpsStarting) return;
    const pos = lastPosRef.current;
    if (!pos) return;
    setGpsStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke('household-arrival', {
        body: { booking_id: bookingId, action: 'start_gps', lat: pos.lat, lng: pos.lng },
      });
      if (error) throw error;
      if (data?.started) {
        stopLocationWatch();
        setBooking((b) => b ? { ...b, status: 'in_progress', arrival_verified_at: new Date().toISOString(), job_ends_at: data.job_ends_at ?? null } : b);
        microCelebrate();
        toast({ title: 'Arrival confirmed — job started! ⏱️' });
      } else {
        // too_far / no coords on the booking — the code path always works.
        setAtDoor(false);
        toast({ title: "Couldn't confirm you're at the address", description: 'No harm — tap “I’ve reached” and use the customer’s 4-digit code instead.' });
      }
    } catch (err) {
      toast({ title: 'Could not start by GPS', description: await extractFnError(null, err, 'Tap “I’ve reached” and use the 4-digit code instead.'), variant: 'destructive' });
    } finally {
      setGpsStarting(false);
    }
  };

  // Helper types the code the customer reads out. A match starts the job.
  const handleVerifyCode = async () => {
    if (!bookingId || verifying || arrivalCode.length !== 4) return;
    setVerifying(true);
    setCodeError(false);
    try {
      const { data, error } = await supabase.functions.invoke('household-arrival', {
        body: { booking_id: bookingId, action: 'verify', code: arrivalCode },
      });
      if (error) throw error;
      if (data?.verified) {
        // Carry job_ends_at back from the server so the timed countdown shows
        // immediately.
        setBooking((b) => b ? { ...b, status: 'in_progress', arrival_verified_at: new Date().toISOString(), job_ends_at: data.job_ends_at ?? null } : b);
        setArrivalCode('');
        microCelebrate();
        toast({ title: 'Code confirmed — job started! ⏱️' });
      } else if (data?.locked) {
        // Too many wrong attempts — anti-brute-force lockout from the server.
        setCodeError(true);
        setCodeAttempts((n) => n + 1);
        toast({ title: 'Too many attempts', description: 'Please wait a minute, then re-check the 4-digit code with the customer.', variant: 'destructive' });
      } else {
        setCodeError(true);
        setCodeAttempts((n) => n + 1);
      }
    } catch (err) {
      toast({ title: 'Could not confirm code', description: await extractFnError(null, err, getUserFriendlyError(err)), variant: 'destructive' });
    } finally {
      setVerifying(false);
    }
  };

  // "Customer not available" — start the job without the arrival code. Only
  // for a helper who's at the address and genuinely can't reach the customer;
  // the customer and admin are notified. Carries job_ends_at back like verify.
  const handleStartWithoutCode = async () => {
    if (!bookingId || skipping) return;
    setSkipping(true);
    try {
      const { data, error } = await supabase.functions.invoke('household-arrival', {
        body: { booking_id: bookingId, action: 'start_without_code' },
      });
      if (error) throw error;
      setBooking((b) => b ? { ...b, status: 'in_progress', arrival_verified_at: new Date().toISOString(), job_ends_at: data?.job_ends_at ?? null } : b);
      setSkipConfirm(false);
      setArrivalCode('');
      microCelebrate();
      toast({ title: 'Job started', description: "The customer has been notified that you started without their code." });
    } catch (err) {
      toast({ title: 'Could not start job', description: await extractFnError(null, err, getUserFriendlyError(err)), variant: 'destructive' });
    } finally {
      setSkipping(false);
    }
  };

  // Timed jobs show a live countdown; completion itself is the customer's call
  // (they tap "mark complete" once the time's up), so this just ticks the clock.
  useEffect(() => {
    if (booking?.status !== 'in_progress' || !booking.job_ends_at) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [booking?.status, booking?.job_ends_at]);

  // Before/after job photos: resize + upload (fail-soft), then reflect the
  // fresh URL locally. Evidence for Vano Cover/disputes AND the customer's
  // shareable before/after card — worth the extra tap, never worth blocking on.
  const handleJobPhoto = async (kind: 'arrival' | 'finish', file: File | undefined) => {
    if (!file || !bookingId || photoUploading) return;
    setPhotoUploading(kind);
    const url = await uploadJobPhoto(bookingId, kind, file);
    setPhotoUploading(null);
    if (url) {
      setBooking((b) => b ? { ...b, [kind === 'arrival' ? 'arrival_photo_url' : 'finish_photo_url']: url } : b);
      toast({ title: kind === 'arrival' ? 'Before photo saved' : 'After photo saved', description: 'It protects you if anything about the job is ever questioned.' });
    } else {
      toast({ title: "Photo didn't upload", description: 'No harm done — you can try again any time from this screen.', variant: 'destructive' });
    }
  };

  // Direct-pay two-way review: the helper confirms they were paid (optional
  // star rating for the customer) or reports an unpaid job — a strike that
  // alerts the owner and, at two strikes, blocks the customer from booking.
  const submitPaidReview = async (paid: boolean) => {
    if (!bookingId || paidSubmitting) return;
    setPaidSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke('household-arrival', {
        body: { booking_id: bookingId, action: paid ? 'confirm_paid' : 'report_unpaid', ...(paid && paidStars > 0 ? { rating: paidStars } : {}) },
      });
      if (error) throw error;
      setBooking((b) => b ? { ...b, booking_data: { ...(b.booking_data ?? {}), paid_to_helper: paid } } : b);
      if (paid) {
        toast({ title: 'Payment confirmed ✓', description: 'Nice one — job fully wrapped up.' });
      } else {
        toast({ title: "We're on it", description: 'The owner has been alerted. This customer will be blocked from booking if it happens again — you\'ll hear from us.' });
      }
    } catch (err) {
      toast({ title: 'Could not save', description: await extractFnError(null, err, getUserFriendlyError(err)), variant: 'destructive' });
    } finally {
      setPaidSubmitting(false);
      setUnpaidWarn(false);
    }
  };

  // "I've finished" — flags the job done and asks the customer to confirm.
  // Does NOT pay the helper; the customer still has to mark complete.
  const handleFinished = async () => {
    if (!bookingId || finishing) return;
    setFinishing(true);
    try {
      const { error } = await supabase.functions.invoke('household-arrival', { body: { booking_id: bookingId, action: 'finished' } });
      if (error) throw error;
      setBooking((b) => b ? { ...b, helper_finished_at: new Date().toISOString() } : b);
      toast({
        title: 'Marked as finished',
        description: (booking?.booking_data as Record<string, unknown> | null)?.direct_pay === true
          ? 'Collect your money from the customer (Revolut or cash), then confirm it below.'
          : "We've asked the customer to confirm so you get paid.",
      });
    } catch (err) {
      toast({ title: 'Could not mark finished', description: await extractFnError(null, err, getUserFriendlyError(err)), variant: 'destructive' });
    } finally {
      setFinishing(false);
    }
  };

  const handleRelease = async () => {
    if (!bookingId || releasing) return;
    setReleasing(true);
    try {
      const { error } = await supabase.functions.invoke('cancel-household-booking', {
        body: { booking_id: bookingId, type: 'helper_release' },
      });
      if (error) throw error;
      stopLocationWatch();
      toast({ title: 'Job released', description: 'The customer has been notified. We are finding another helper.' });
      navigate('/student-dashboard');
    } catch (err) {
      toast({ title: 'Could not release job', description: await extractFnError(null, err, getUserFriendlyError(err)), variant: 'destructive' });
    } finally {
      setReleasing(false);
      setReleaseConfirm(false);
    }
  };

  // Re-prompt for location after a denial/failure. getCurrentPosition will
  // re-trigger the browser prompt if the user has since allowed it (or cleared
  // the block); on success we clear the banner and resume the live watch so the
  // customer's map fills in. Best-effort — a fresh denial just re-shows the card.
  const handleEnableLocation = async () => {
    if (!bookingId) return;
    try {
      const pos = await getCurrentPosition({ enableHighAccuracy: true, timeout: 8000, maximumAge: 0 });
      // Push the position immediately so the map updates without waiting for the watch.
      lastLocationPushRef.current = Date.now();
      void hdb.from('household_bookings').update({
        worker_lat: pos.coords.latitude,
        worker_lng: pos.coords.longitude,
        worker_location_updated_at: new Date().toISOString(),
      }).eq('id', bookingId);
      setLocationDenied(false);
      startLocationWatch(bookingId);
      toast({ title: 'Location on', description: 'The customer can now see you on the map.' });
    } catch {
      setLocationDenied(true);
      toast({ title: "Location still blocked", description: 'Allow location for this site in your browser settings, then try again.', variant: 'destructive' });
    }
  };

  const advanceStatus = async () => {
    if (!booking || !bookingId) return;
    const next = NEXT_STATUS[booking.status];
    if (!next) return;

    setAdvancing(true);

    const bookingUpdate: Record<string, unknown> = { status: next.status };

    if (next.status === 'on_way') {
      // Get initial location snapshot, then start continuous watch.
      // Native app uses @capacitor/geolocation; web uses the browser API.
      try {
        const pos = await getCurrentPosition({ timeout: 6000, maximumAge: 10000 });
        bookingUpdate.worker_lat = pos.coords.latitude;
        bookingUpdate.worker_lng = pos.coords.longitude;
        lastLocationPushRef.current = Date.now();
      } catch {
        // Denied — proceed without location
      }
      // Open Google Maps navigation to customer's address
      window.open(googleMapsUrl(booking.customer_address, booking.customer_lat, booking.customer_lng), '_blank');
      // Start live location tracking
      startLocationWatch(bookingId);
    }

    if (next.status === 'arrived') {
      stopLocationWatch();
    }

    const [updateRes] = await Promise.all([
      hdb.from('household_bookings').update(bookingUpdate).eq('id', bookingId),
      hdb.from('household_job_updates').insert({ booking_id: bookingId, status: next.status }),
    ]);

    // Notify customer when helper is on the way — fire and forget, never blocks UI
    if (!updateRes.error && next.status === 'on_way') {
      supabase.functions.invoke('notify-household-on-way', {
        body: { booking_id: bookingId },
      }).catch(() => {});
    }

    // (Admin arrival ping is handled server-side by household-arrival now; the
    // old client call here was dead — this status machine only advances to
    // 'on_way' — and notify-admin-whatsapp is service-role-only.)

    if (updateRes.error) {
      // The on_way transition started the GPS watch BEFORE this write. If the
      // write failed, the status stays 'accepted' but the watch would keep
      // streaming worker_lat/lng every 15s — the customer's map would show a
      // live location for a job the helper never actually started. Stop it.
      if (next.status === 'on_way') stopLocationWatch();
      toast({ title: 'Update failed', description: getUserFriendlyError(updateRes.error), variant: 'destructive' });
    } else {
      setBooking((b) => b ? { ...b, status: next.status as JobStatus } : b);
    }
    setAdvancing(false);
  };

  const sendMessage = async () => {
    if (!draft.trim() || !bookingId || !userId) return;
    setSending(true);
    const body = draft.trim().slice(0, 1000);
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
  const mine = !!userId && booking.student_id === userId;
  // Pay-after-accept: don't let the helper start the job (arrival code) until
  // the customer has paid. Zero-price jobs (none today) are exempt.
  const needsPayment = mine && (booking.price_estimate_cents ?? 0) > 0 && !booking.paid_at;
  const isUnclaimed = booking.status === 'pending' && !booking.student_id;
  const claimedByOther = !!booking.student_id && booking.student_id !== userId;
  const bd = (booking.booking_data ?? {}) as Record<string, unknown>;
  // DIRECT-PAY (July 2026): the customer pays the helper the full job price
  // directly (Revolut/cash) — the helper keeps 100%. Legacy escrow bookings
  // (pre-deploy, still in flight) keep the old 85% payout figure.
  const directPay = bd.direct_pay === true;
  const helperPayBase = Math.max(
    booking.price_estimate_cents ?? 0,
    Number(bd.helper_pay_base_cents) || 0,
  );
  const earnCents = helperPayBase > 0 ? (directPay ? helperPayBase : Math.floor(helperPayBase * 0.85)) : null;
  // Customer reputation snapshot stamped at booking (checkout) — shown before
  // accepting so the helper knows who they're dealing with.
  const rep = (bd.customer_rep ?? null) as { paid_jobs?: number; unpaid_reports?: number; stars?: number } | null;
  // Two-way review state: has this helper confirmed/denied being paid yet?
  const paidToHelper = bd.paid_to_helper as boolean | undefined;

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
              {booking.time_slot && (
                <p className="text-sm text-muted-foreground mt-0.5">{SLOT_LABELS[booking.time_slot] ?? booking.time_slot}</p>
              )}
            </div>
            {booking.price_estimate_cents && (
              <div className="text-right flex-shrink-0">
                <p className="text-lg font-bold tabular-nums">
                  €{(booking.price_estimate_cents / 100).toFixed(0)}
                </p>
              </div>
            )}
          </div>
          <div className="space-y-2 pt-3 border-t border-border/40">
            {/* Address — tappable to open Google Maps */}
            <a
              href={googleMapsUrl(booking.customer_address, booking.customer_lat, booking.customer_lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors"
            >
              <MapPin size={14} className="text-muted-foreground flex-shrink-0" />
              <span className="underline underline-offset-2">{booking.customer_address}</span>
            </a>
            {booking.student_id === userId && (
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Phone size={14} className="text-muted-foreground flex-shrink-0" />
                <a href={`tel:${booking.customer_phone}`} className="underline underline-offset-2">
                  {formatPhone(booking.customer_phone)}
                </a>
              </div>
            )}
          </div>

          {/* What needs doing — the task specifics from booking_data */}
          {(() => {
            const lines = jobDetailLines(booking.category, booking.booking_data ?? {});
            return lines.length > 0 ? (
              <div className="space-y-1.5 pt-3 mt-3 border-t border-border/40">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wide">What needs doing</p>
                {lines.map((l, i) => (
                  <div key={i} className="flex gap-2 text-sm">
                    <span className="text-muted-foreground flex-shrink-0">{l.label}:</span>
                    <span className="text-foreground break-words">{l.value}</span>
                  </div>
                ))}
              </div>
            ) : null;
          })()}
        </div>

        {/* Customer location map + directions — so the helper can see the job
            location and tap straight through to turn-by-turn navigation. */}
        {booking.customer_lat && booking.customer_lng && (
          <div className="mb-4">
            <div className="rounded-2xl overflow-hidden border border-border/60" style={{ height: 200 }}>
              <MapContainer
                center={[booking.customer_lat, booking.customer_lng]}
                zoom={15}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
                attributionControl={false}
                dragging={false}
                scrollWheelZoom={false}
                doubleClickZoom={false}
              >
                <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" subdomains="abcd" detectRetina />
                <Marker position={[booking.customer_lat, booking.customer_lng]} icon={customerIcon} />
                <MapAutoResize />
              </MapContainer>
            </div>
            {/* Directions pills only while actually travelling — at 'accepted'
                the one primary is "I'm on my way" (which opens directions
                itself), so showing Maps/Waze early just competes with it. */}
            {mine && ['on_way', 'arrived'].includes(booking.status) && (
              <div className="mt-2 flex gap-2">
                <a
                  href={googleMapsUrl(booking.customer_address, booking.customer_lat, booking.customer_lng)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 h-11 rounded-full bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
                >
                  <Navigation size={15} /> Google Maps
                </a>
                <a
                  href={wazeUrl(booking.customer_address, booking.customer_lat, booking.customer_lng)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 h-11 rounded-full bg-secondary text-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-secondary/70 transition-colors"
                >
                  <Navigation size={15} /> Waze
                </a>
              </div>
            )}
          </div>
        )}

        {/* Unclaimed — the dispatch email lands here, so Accept lives here too */}
        {isUnclaimed && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl border-2 border-sage/40 bg-sage-light p-5 mb-6"
          >
            {earnCents && (
              <p className="text-2xl font-extrabold text-foreground mb-0.5">
                Earn €{(earnCents / 100).toFixed(2)}
                {directPay && <span className="ml-2 align-middle inline-block rounded-full bg-sage text-white text-[10px] font-bold px-2 py-0.5">you keep 100%</span>}
              </p>
            )}
            {directPay && (
              <p className="text-[11px] text-muted-foreground mb-1">Paid straight to you by the customer (Revolut or cash) when the job's done.</p>
            )}
            {/* Who you're dealing with — the customer's two-way-review record */}
            {rep && (
              <p className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold mb-2',
                (rep.unpaid_reports ?? 0) > 0
                  ? 'border-amber-300 bg-amber-50 text-amber-800'
                  : (rep.paid_jobs ?? 0) > 0
                    ? 'border-sage/40 bg-sage-light text-sage-dark'
                    : 'border-border bg-secondary/40 text-muted-foreground',
              )}>
                {(rep.unpaid_reports ?? 0) > 0
                  ? `⚠ ${rep.unpaid_reports} unpaid report${(rep.unpaid_reports ?? 0) === 1 ? '' : 's'} from helpers`
                  : (rep.paid_jobs ?? 0) > 0
                    ? `✓ Pays promptly · ${rep.paid_jobs} job${(rep.paid_jobs ?? 0) === 1 ? '' : 's'}${rep.stars ? ` · ★ ${rep.stars}` : ''}`
                    : 'New customer'}
              </p>
            )}
            <p className="text-xs text-muted-foreground mb-4">
              This job is still open — first to accept gets it.
            </p>
            {helperIdVerified === false ? (
              /* First-job ID gate — customers are promised every helper is
                 ID-verified before their first job, so the accept button only
                 renders for verified helpers. */
              <>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigate('/verify-helper')}
                  className="w-full h-14 rounded-full bg-sage text-white font-semibold text-base flex items-center justify-center gap-2 hover:bg-sage-dark transition-[background-color] duration-150"
                >
                  <ShieldCheck size={18} />Verify your ID to accept jobs
                </motion.button>
                <p className="text-center text-[11px] text-muted-foreground mt-2">
                  One free 2-minute check before your first job — customers are told every helper is ID-verified
                </p>
              </>
            ) : (
              <>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => void claimJob()}
                  disabled={claiming}
                  className="w-full h-14 rounded-full bg-sage text-white font-semibold text-base flex items-center justify-center gap-2 hover:bg-sage-dark disabled:opacity-50 transition-[background-color,opacity] duration-150"
                >
                  {claiming ? <Loader2 size={18} className="animate-spin" /> : <><Zap size={18} />Accept this job</>}
                </motion.button>
                <p className="text-center text-[11px] text-muted-foreground mt-2">
                  Accepting asks the customer to pay and confirms you as their helper
                </p>
              </>
            )}
          </motion.div>
        )}

        {/* Someone else got it */}
        {claimedByOther && !isCancelled && (
          <div className="rounded-2xl border border-border/60 bg-secondary/30 px-4 py-3.5 mb-6 flex items-start gap-2.5">
            <AlertTriangle size={15} className="text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              Another helper claimed this job. Keep an eye on your dashboard for the next one.
            </p>
          </div>
        )}

        {/* Just claimed — walk the helper through what happens next */}
        {mine && booking.status === 'accepted' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl border border-sage/25 bg-sage-light p-5 mb-6"
          >
            {!howOpen ? (
              /* Repeat helpers know the drill — one line + a way back to the
                 steps, so the primary button below is immediately in view. */
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold text-foreground text-sm">✅ This job is yours</p>
                <button
                  type="button"
                  onClick={() => setHowOpen(true)}
                  className="flex-shrink-0 text-xs font-semibold text-sage-dark underline underline-offset-2"
                >
                  How it works
                </button>
              </div>
            ) : (
            <>
            <p className="font-bold text-foreground text-sm mb-3">✅ This job is yours — here's how it works</p>
            <ol className="space-y-2.5">
              {(directPay
                ? [
                    ['1', 'The customer is confirming the booking now (a small VANO fee locks it in).'],
                    ['2', "When you head out, tap “I'm on my way”. Directions open and the customer sees you on a live map until you arrive."],
                    ['3', 'At the door, tap “I’ve reached”, ask the customer for their 4-digit code, and enter it to start.'],
                    ['4', `When the work's done, the customer pays YOU directly — €${earnCents ? (earnCents / 100).toFixed(2) : '…'} by Revolut or cash. You keep 100%. Then confirm you were paid here.`],
                  ]
                : [
                    ['1', 'The customer is being asked to pay now — that locks the booking in.'],
                    ['2', "When you head out, tap “I'm on my way”. Directions open and the customer sees you on a live map until you arrive."],
                    ['3', 'At the door, tap “I’ve reached”, ask the customer for their 4-digit code, and enter it to start.'],
                    ['4', 'Timed jobs run a countdown; when the work’s done the customer rates you and taps “Mark complete” — and you’re paid instantly.'],
                  ]
              ).map(([n, text]) => (
                <li key={n} className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-sage text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{n}</span>
                  <span className="text-xs text-foreground/80 leading-relaxed">{text}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 flex items-start gap-1.5 text-[11px] text-foreground/60 leading-relaxed">
              <Navigation size={12} className="text-sage flex-shrink-0 mt-0.5" />
              When you head out, you'll share live location so the customer can track you.
            </p>
            </>
            )}
          </motion.div>
        )}

        {/* Live location sharing indicator */}
        {sharingLocation && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 bg-sage-light border border-sage/30 rounded-xl px-4 py-2.5 mb-4"
          >
            <Navigation size={14} className="text-sage flex-shrink-0" />
            <p className="text-xs text-foreground font-medium">Sharing your live location with the customer — stops when you arrive</p>
          </motion.div>
        )}

        {/* Location denied — prominent + actionable. The customer's live map is
            blank, so make turning it back on a one-tap action (re-prompts the
            browser; on success we resume the live watch). */}
        {locationDenied && booking.status === 'on_way' && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 mb-4 dark:bg-amber-950/20 dark:border-amber-800/50"
          >
            <div className="flex items-start gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                <Navigation size={16} className="text-amber-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight">Turn on location</p>
                <p className="text-xs text-foreground/75 leading-relaxed mt-0.5">
                  Turn on location so your customer can see you on the map — they're expecting it.
                </p>
              </div>
            </div>
            <button
              onClick={() => void handleEnableLocation()}
              className="w-full h-11 rounded-full bg-amber-500 text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-amber-600 transition-colors"
            >
              <Navigation size={15} /> Enable location
            </button>
          </motion.div>
        )}

        {/* Waiting for the customer to pay (pay-after-accept). Block starting
            work until then so nobody does an unpaid job. */}
        {needsPayment && ['accepted', 'on_way', 'arrived', 'in_progress'].includes(booking.status) && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 dark:bg-amber-950/20 dark:border-amber-800/40">
            <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-foreground/80 leading-relaxed">
              Waiting for the customer to pay. You'll be able to start the job once their payment lands — we've sent them the link and they can also pay from their tracking screen.
              {' '}If they don't pay soon you'll be automatically freed up for other jobs.
            </p>
          </div>
        )}

        {/* Status action button — the ONE thing to do right now, so it sits
            directly under the job card/explainer instead of below the photo
            grid (where first-timers had to scroll to find it). Gated on
            payment: while the fee is unpaid the amber banner above says
            "you can't start yet", so an active On-my-way button here would
            contradict it (and send a helper travelling to a job that may
            auto-release if the customer never pays). */}
        {mine && !isComplete && !isCancelled && next && !needsPayment && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => void advanceStatus()}
            disabled={advancing}
            className={cn(
              'w-full h-14 rounded-full font-semibold text-base flex items-center justify-center gap-2 mb-6',
              'transition-[background-color,opacity] duration-150',
              'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
            )}
          >
            {advancing ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              next.label
            )}
          </motion.button>
        )}

        {/* Why "on my way" matters + the already-on-site shortcut. The primary
            button above starts live GPS sharing — that's what powers the
            customer's watch-them-approach map, so it leads and this follows. */}
        {mine && !needsPayment && booking.status === 'accepted' && (
          <div className="-mt-3 mb-6">
            <p className="text-center text-[11px] text-muted-foreground mb-2">
              Starts live tracking — the customer watches you approach on their map
            </p>
            <button
              onClick={() => void handleReached()}
              disabled={reaching}
              className="w-full h-11 rounded-full border border-border bg-background text-sm font-semibold text-foreground/80 flex items-center justify-center gap-2 hover:bg-secondary/60 disabled:opacity-50 transition-[background-color,opacity] duration-150"
            >
              {reaching ? <Loader2 size={15} className="animate-spin" /> : <><MapPin size={15} />Already at the door? I've reached</>}
            </button>
          </div>
        )}

        {/* I've reached — generates the customer's arrival code. Primary only
            once the helper is on the way; at 'accepted' it appears as a quiet
            shortcut BELOW "I'm on my way" (see the status button), so the
            live-tracking step doesn't get skipped just because this button
            rendered first. Gated on payment so no one starts an unpaid job. */}
        {mine && !needsPayment && booking.status === 'on_way' && (
          atDoor ? (
            /* GPS says they're at the address — one tap starts the job, no
               code ritual. The code path stays one line below as the opt-out. */
            <div className="mb-6">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => void handleGpsStart()}
                disabled={gpsStarting}
                className="w-full h-14 rounded-full bg-sage text-white font-semibold text-base flex items-center justify-center gap-2 hover:bg-sage-dark disabled:opacity-50 transition-[background-color,opacity] duration-150"
              >
                {gpsStarting ? <Loader2 size={18} className="animate-spin" /> : <><MapPin size={18} />I'm at the door — start the job</>}
              </motion.button>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Your location matches the address — no code needed
              </p>
              <button
                onClick={() => void handleReached()}
                disabled={reaching}
                className="mt-1 w-full text-center text-xs text-muted-foreground underline underline-offset-2 py-1.5 disabled:opacity-50"
              >
                {reaching ? 'One sec…' : 'Customer wants to give you a code instead?'}
              </button>
            </div>
          ) : (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => void handleReached()}
              disabled={reaching}
              className="w-full h-14 rounded-full bg-primary text-primary-foreground font-semibold text-base flex items-center justify-center gap-2 mb-6 hover:bg-primary/90 disabled:opacity-50 transition-[background-color,opacity] duration-150"
            >
              {reaching ? <Loader2 size={18} className="animate-spin" /> : <><MapPin size={18} />I've reached</>}
            </motion.button>
          )
        )}

        {/* Arrival code entry — the customer reads out the 4-digit code on their
            screen and the helper types it here to start the job */}
        {mine && booking.status === 'arrived' && !booking.arrival_verified_at && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl border border-sage/30 bg-sage-light p-5 mb-6"
          >
            <div className="flex items-center gap-2 mb-1">
              <KeyRound size={16} className="text-sage flex-shrink-0" />
              <p className="font-bold text-foreground text-sm">Enter the customer's code</p>
            </div>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              Ask the customer for the 4-digit code on their screen, then type it in to start the job.
            </p>
            <input
              inputMode="numeric"
              pattern="\d*"
              maxLength={4}
              value={arrivalCode}
              onChange={(e) => { setArrivalCode(e.target.value.replace(/\D/g, '').slice(0, 4)); setCodeError(false); }}
              placeholder="0000"
              className={cn(
                'w-full h-14 rounded-xl bg-background border text-center text-2xl font-bold tracking-[0.5em] tabular-nums focus:outline-none focus:ring-2 focus:ring-ring',
                codeError ? 'border-destructive' : 'border-border/60',
              )}
            />
            {codeError && (
              <>
                <p className="text-xs text-destructive mt-2">That code didn't match — double-check with the customer.</p>
                {/* Regenerate only from the SECOND miss — one wrong entry is
                    nearly always a typo, and offering a reset immediately
                    nudges people away from simply re-typing it right. */}
                {codeAttempts >= 2 && (
                  <button
                    onClick={() => { setCodeError(false); setArrivalCode(''); void handleReached(); }}
                    className="mt-1 text-xs text-sage underline underline-offset-2"
                  >
                    Code not working? Get a fresh one for the customer
                  </button>
                )}
              </>
            )}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => void handleVerifyCode()}
              disabled={verifying || arrivalCode.length !== 4}
              className="mt-4 w-full h-12 rounded-full bg-sage text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-sage-dark disabled:opacity-50 transition-[background-color,opacity] duration-150"
            >
              {verifying ? <Loader2 size={16} className="animate-spin" /> : 'Confirm & start job'}
            </motion.button>

            {/* Customer not available — lower-emphasis escape hatch for when the
                helper is at the address but can't reach the customer. */}
            {!skipConfirm ? (
              <button
                onClick={() => setSkipConfirm(true)}
                className="mt-3 w-full text-xs text-muted-foreground py-1.5 underline underline-offset-2 text-center"
              >
                Customer not available?
              </button>
            ) : (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/40 p-3"
              >
                <p className="text-xs text-foreground/80 leading-relaxed mb-3">
                  Only do this if you're at the address and can't reach them — they'll be notified.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSkipConfirm(false)}
                    className="flex-1 h-9 rounded-lg bg-secondary text-xs font-semibold transition-colors hover:bg-secondary/70"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => void handleStartWithoutCode()}
                    disabled={skipping}
                    className="flex-1 h-9 rounded-lg bg-amber-500 text-white text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5 transition-opacity"
                  >
                    {skipping ? <Loader2 size={14} className="animate-spin" /> : 'Start without code'}
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Job underway — timed jobs show a countdown (a guide, nothing auto-
            completes). The helper flags "I've finished"; the customer confirms
            to release payment. Direct-pay: once finished, this card yields
            entirely to the gold "Did they pay you?" card below — two stacked
            cards both describing "you're finished" made the money step easy
            to miss. */}
        {mine && booking.status === 'in_progress' && !(directPay && booking.helper_finished_at) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl border border-sage/25 bg-sage-light p-5 mb-6 text-center"
          >
            {booking.helper_finished_at ? (
              <>
                <CheckCircle2 size={24} className="text-sage mx-auto mb-1.5" strokeWidth={1.5} />
                <p className="text-sm font-semibold text-foreground">Marked as finished</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {directPay
                    ? 'Collect your money from the customer (Revolut or cash) and confirm it below. We’ve nudged them to wrap up too.'
                    : 'Waiting for the customer to confirm — you’re paid the moment they do. We’ve nudged them.'}
                </p>
              </>
            ) : (
              <>
                {booking.job_ends_at && new Date(booking.job_ends_at).getTime() > nowTick ? (
                  <>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Job in progress</p>
                    <p className="text-[2.5rem] leading-none font-extrabold tabular-nums text-sage my-2">
                      {formatCountdown(new Date(booking.job_ends_at).getTime() - nowTick)}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-4">left on the booked time</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-foreground">{booking.job_ends_at ? "Time's up" : 'Job underway'}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 mb-4 leading-relaxed">
                      When you’re done, tap below — the customer confirms and you’re paid.
                    </p>
                  </>
                )}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => void handleFinished()}
                  disabled={finishing}
                  className="w-full h-12 rounded-full bg-sage text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-sage-dark disabled:opacity-50 transition-[background-color,opacity] duration-150"
                >
                  {finishing ? <Loader2 size={16} className="animate-spin" /> : "I've finished"}
                </motion.button>
              </>
            )}
          </motion.div>
        )}

        {/* Direct-pay: did the customer pay you? Confirm (optional stars for
            the customer) or report unpaid — a strike that alerts the owner
            and blocks repeat offenders from booking. */}
        {mine && directPay && (booking.helper_finished_at || isComplete) && !isCancelled && paidToHelper !== true && (
          <div className="rounded-2xl border-2 border-gold/50 bg-amber-50/60 p-5 mb-6">
            {/* Absorbs the old separate "Marked as finished" card — one card
                now owns the whole finish-and-get-paid moment. */}
            {booking.helper_finished_at && !isComplete && (
              <p className="text-[11px] font-semibold text-sage-dark mb-1.5 flex items-center gap-1">
                <CheckCircle2 size={12} className="flex-shrink-0" /> Marked as finished — we've nudged the customer to wrap up
              </p>
            )}
            <p className="text-sm font-bold text-foreground mb-1">
              Did {booking.customer_name && booking.customer_name !== 'Guest' ? booking.customer_name.split(' ')[0] : 'the customer'} pay you{earnCents ? ` €${(earnCents / 100).toFixed(2)}` : ''}?
            </p>
            <p className="text-xs text-muted-foreground mb-3">Revolut or cash — you keep all of it. Confirming closes the job out properly.</p>
            {/* Optional star rating for the customer — two-way reviews */}
            <div className="flex items-center gap-1.5 mb-3" role="group" aria-label="Rate this customer (optional)">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPaidStars(n === paidStars ? 0 : n)}
                  aria-label={`${n} star${n === 1 ? '' : 's'}`}
                  className="text-2xl leading-none active:scale-90 transition-transform"
                >
                  <span className={n <= paidStars ? 'grayscale-0' : 'grayscale opacity-40'}>⭐</span>
                </button>
              ))}
              <span className="text-[11px] text-muted-foreground ml-1">rate them (optional)</span>
            </div>
            <button
              type="button"
              onClick={() => void submitPaidReview(true)}
              disabled={paidSubmitting}
              className="w-full h-12 rounded-full bg-sage text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-sage-dark disabled:opacity-50 transition-[background-color,opacity] duration-150"
            >
              {paidSubmitting ? <Loader2 size={16} className="animate-spin" /> : <>💶 Yes — I've been paid</>}
            </button>
            {unpaidWarn ? (
              <div className="mt-2.5 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-xs text-foreground/80 mb-2">Only report this if the job is done and they're refusing to pay — the owner is alerted immediately and repeat offenders are blocked from booking.</p>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setUnpaidWarn(false)} className="flex-1 h-9 rounded-full border border-border text-xs font-semibold text-foreground/70">Go back</button>
                  <button type="button" onClick={() => void submitPaidReview(false)} disabled={paidSubmitting} className="flex-1 h-9 rounded-full bg-destructive text-white text-xs font-semibold disabled:opacity-50">Report unpaid</button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setUnpaidWarn(true)}
                className="mt-2 w-full text-center text-[11px] font-medium text-muted-foreground underline underline-offset-2 py-1.5"
              >
                They haven't paid me
              </button>
            )}
          </div>
        )}
        {mine && directPay && paidToHelper === true && (
          <div className="rounded-2xl border border-sage/30 bg-sage-light px-4 py-3 mb-6 flex items-center gap-2.5">
            <CheckCircle2 size={18} className="text-sage flex-shrink-0" />
            <p className="text-sm font-semibold text-foreground">Payment confirmed — job wrapped up ✓</p>
          </div>
        )}

        {/* Before/after job photos — the evidence layer. A "before" shot once
            you're at the job, an "after" shot when finished. Protects the
            helper in disputes/Vano Cover claims, and the customer gets a
            shareable before/after card. Entirely fail-soft and optional. */}
        {mine && ['arrived', 'in_progress', 'completed'].includes(booking.status) && (
          <div className="rounded-2xl border border-border/60 bg-background p-4 mb-6">
            <div className="flex items-center gap-2 mb-1">
              <Camera size={15} className="text-sage flex-shrink-0" />
              <p className="text-sm font-bold text-foreground">Job photos</p>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
              A quick before + after of the work area (no people in shot). They protect you if anything is ever questioned — and customers love the reveal.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {([['arrival', 'Before', booking.arrival_photo_url], ['finish', 'After', booking.finish_photo_url]] as const).map(([kind, label, url]) => {
                // "Before" stops being offerable once the job is over; "After"
                // unlocks when they flag finished (or the customer completes).
                const offerable = kind === 'arrival'
                  ? booking.status !== 'completed'
                  : !!booking.helper_finished_at || booking.status === 'completed';
                return (
                  <div key={kind}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{label}</p>
                    {url ? (
                      <div className="relative">
                        <img src={url} alt={`${label} photo`} className="w-full aspect-[4/3] object-cover rounded-xl border border-border/60" />
                        <label className="absolute bottom-1.5 right-1.5 h-7 px-2.5 rounded-full bg-black/55 text-white text-[10px] font-semibold flex items-center gap-1 cursor-pointer">
                          {photoUploading === kind ? <Loader2 size={11} className="animate-spin" /> : <><Camera size={11} />Retake</>}
                          <input type="file" accept="image/*" capture="environment" className="hidden" disabled={photoUploading !== null}
                            onChange={(e) => { void handleJobPhoto(kind, e.target.files?.[0]); e.target.value = ''; }} />
                        </label>
                      </div>
                    ) : offerable ? (
                      <label className={cn(
                        'w-full aspect-[4/3] rounded-xl border-2 border-dashed border-sage/40 bg-sage-light/50 flex flex-col items-center justify-center gap-1.5 cursor-pointer text-sage-dark',
                        photoUploading !== null && 'opacity-50 pointer-events-none',
                      )}>
                        {photoUploading === kind
                          ? <Loader2 size={18} className="animate-spin" />
                          : <><Camera size={18} /><span className="text-[11px] font-semibold">Add {label.toLowerCase()} photo</span></>}
                        <input type="file" accept="image/*" capture="environment" className="hidden" disabled={photoUploading !== null}
                          onChange={(e) => { void handleJobPhoto(kind, e.target.files?.[0]); e.target.value = ''; }} />
                      </label>
                    ) : (
                      <div className="w-full aspect-[4/3] rounded-xl border border-border/50 bg-secondary/30 flex items-center justify-center px-3">
                        <span className="text-[10.5px] text-muted-foreground text-center leading-snug">
                          {kind === 'finish' ? 'Unlocks when you tap "I\'ve finished"' : 'Job\'s over — no before photo taken'}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Safety — report a problem during a live job (straight to a person) */}
        {mine && !isComplete && !isCancelled && (
          <a
            href={`https://wa.me/353899817111?text=${encodeURIComponent(`Hi VANO, I need help with a job I'm on${booking?.id ? ` (ref ${booking.id.slice(-8).toUpperCase()})` : ''}.`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="-mt-2 mb-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            <AlertTriangle size={13} className="flex-shrink-0" /> Report a problem
          </a>
        )}

        {/* Release-job option — only for the helper who owns the job */}
        {mine && !isComplete && !isCancelled && (
          <div className="mb-6">
            {!releaseConfirm ? (
              <button
                onClick={() => setReleaseConfirm(true)}
                className="w-full text-xs text-muted-foreground py-2 underline underline-offset-2 text-center"
              >
                I can't make it
              </button>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/40 p-4"
              >
                <div className="flex items-start gap-2 mb-2">
                  <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm font-semibold text-foreground">Release this job?</p>
                </div>
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                  The customer will be notified and we'll find another helper as soon as possible.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setReleaseConfirm(false)}
                    className="flex-1 h-10 rounded-xl bg-secondary text-sm font-semibold transition-colors hover:bg-secondary/70"
                  >
                    Stay on job
                  </button>
                  <button
                    onClick={() => void handleRelease()}
                    disabled={releasing}
                    className="flex-1 h-10 rounded-xl bg-amber-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5 transition-opacity"
                  >
                    {releasing ? <Loader2 size={15} className="animate-spin" /> : 'Release job'}
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        )}

        {isComplete && (
          <div className="flex flex-col items-center text-center py-4 mb-6">
            <CheckCircle2 size={32} className="text-sage mb-2" strokeWidth={1.5} />
            <p className="font-semibold text-foreground">Job complete</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {directPay
                ? (paidToHelper === true ? 'Paid and wrapped up — nice work.' : 'The customer pays you directly — confirm it above once you have it.')
                : "You'll be paid out to your bank or Revolut shortly."}
            </p>
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

      {/* Chat input — only once the job is yours */}
      {mine && !isComplete && !isCancelled && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur-xl border-t border-border/50 safe-area-bottom px-4 py-3">
          <div className="max-w-sm mx-auto flex items-center gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
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
