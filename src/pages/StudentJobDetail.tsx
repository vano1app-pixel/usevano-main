import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuthContext';
import { ArrowLeft, MapPin, Phone, Loader2, Send, CheckCircle2, Navigation, AlertTriangle, Zap, KeyRound } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';
import { useToast } from '@/hooks/use-toast';
import { getUserFriendlyError } from '@/lib/errorMessages';
import { microCelebrate } from '@/lib/celebrate';
import { isTimedCategory, formatCountdown } from '@/lib/householdJob';
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

function formatDate(d: string): string {
  if (d === 'today') return 'Today';
  if (d === 'tomorrow') return 'Tomorrow';
  try {
    return new Date(d).toLocaleDateString('en-IE', { weekday: 'long', month: 'long', day: 'numeric' });
  } catch { return d; }
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
  const [capturing, setCapturing] = useState(false);
  const [sending, setSending] = useState(false);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [releaseConfirm, setReleaseConfirm] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  // Arrival-code handshake
  const [reaching, setReaching] = useState(false);
  const [arrivalCode, setArrivalCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState(false);
  // Timed-job countdown (display only — the customer marks the job done)
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [finishing, setFinishing] = useState(false);
  // Set when the browser refuses geolocation while on_way — the customer's
  // live map silently shows nothing, so the helper deserves to know.
  const [locationDenied, setLocationDenied] = useState(false);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  // Geolocation watch handle — kept while status is on_way
  const watchIdRef = useRef<number | null>(null);
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

      const [bookingRes, msgRes] = await Promise.all([
        // Explicit columns — never select arrival_code, so the customer's code
        // can't be read out of the helper's app and the handshake stays honest.
        hdb.from('household_bookings')
          .select('id, category, scheduled_date, time_slot, is_express, status, student_id, customer_name, customer_address, customer_phone, customer_lat, customer_lng, price_estimate_cents, paid_at, booking_data, arrival_verified_at, job_ends_at, helper_finished_at')
          .eq('id', bookingId).maybeSingle(),
        hdb.from('household_chat').select('*').eq('booking_id', bookingId).order('created_at'),
      ]);

      if (cancelled) return;
      if (bookingRes.data) {
        const b = bookingRes.data as Booking;
        setBooking(b);
        // Restore live tracking if the page is reloaded while on_way
        if (b.status === 'on_way') startLocationWatch(bookingId);
      }
      if (msgRes.data) setMessages(msgRes.data as ChatMessage[]);
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, navigate, authLoading, authSession]);

  // Clear the geolocation watch on unmount
  useEffect(() => {
    return () => stopLocationWatch();
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
          const next = payload.new as Partial<Booking>;
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

  function startLocationWatch(bid: string) {
    if (!('geolocation' in navigator)) return;
    if (watchIdRef.current !== null) return; // already watching

    setSharingLocation(true);
    const id = navigator.geolocation.watchPosition(
      (pos) => {
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
        if (err.code === err.PERMISSION_DENIED) {
          setLocationDenied(true);
          stopLocationWatch();
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    watchIdRef.current = id;
  }

  function stopLocationWatch() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setSharingLocation(false);
  }

  // Claim straight from this page — the dispatch email deep-links here, so
  // "View & Accept" must actually offer Accept. Same atomic guard as the
  // dashboard: only one helper can flip pending → accepted.
  const claimJob = async () => {
    if (!booking || !bookingId || !userId || claiming) return;
    setClaiming(true);
    const { data: claimed, error } = await hdb
      .from('household_bookings')
      .update({ student_id: userId, status: 'accepted' })
      .eq('id', bookingId)
      .eq('status', 'pending')
      .is('student_id', null)
      .select('id');

    if (error || !claimed?.length) {
      toast({ title: 'Job just taken', description: 'Someone else got there first — keep an eye out for the next one.', variant: 'destructive' });
      // Re-fetch so the page reflects whoever actually has it
      const { data: fresh } = await hdb.from('household_bookings').select('*').eq('id', bookingId).maybeSingle();
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
      toast({ title: 'Could not mark arrival', description: getUserFriendlyError(err), variant: 'destructive' });
    } finally {
      setReaching(false);
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
        toast({ title: 'Too many attempts', description: 'Please wait a minute, then re-check the 4-digit code with the customer.', variant: 'destructive' });
      } else {
        setCodeError(true);
      }
    } catch (err) {
      toast({ title: 'Could not confirm code', description: getUserFriendlyError(err), variant: 'destructive' });
    } finally {
      setVerifying(false);
    }
  };

  // Timed jobs show a live countdown; completion itself is the customer's call
  // (they tap "mark complete" once the time's up), so this just ticks the clock.
  useEffect(() => {
    if (booking?.status !== 'in_progress' || !booking.job_ends_at) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [booking?.status, booking?.job_ends_at]);

  // "I've finished" — flags the job done and asks the customer to confirm.
  // Does NOT pay the helper; the customer still has to mark complete.
  const handleFinished = async () => {
    if (!bookingId || finishing) return;
    setFinishing(true);
    try {
      const { error } = await supabase.functions.invoke('household-arrival', { body: { booking_id: bookingId, action: 'finished' } });
      if (error) throw error;
      setBooking((b) => b ? { ...b, helper_finished_at: new Date().toISOString() } : b);
      toast({ title: 'Marked as finished', description: "We've asked the customer to confirm so you get paid." });
    } catch (err) {
      toast({ title: 'Could not mark finished', description: getUserFriendlyError(err), variant: 'destructive' });
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
      toast({ title: 'Could not release job', description: getUserFriendlyError(err), variant: 'destructive' });
    } finally {
      setReleasing(false);
      setReleaseConfirm(false);
    }
  };

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
        stopLocationWatch();
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

    const bookingUpdate: Record<string, unknown> = { status: next.status };

    if (next.status === 'on_way') {
      // Get initial location snapshot, then start continuous watch
      if ('geolocation' in navigator) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 6000, maximumAge: 10000 }),
          );
          bookingUpdate.worker_lat = pos.coords.latitude;
          bookingUpdate.worker_lng = pos.coords.longitude;
          lastLocationPushRef.current = Date.now();
        } catch {
          // Denied — proceed without location
        }
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

    // Ping admin when helper arrives so they know the job has started
    if (!updateRes.error && next.status === 'arrived') {
      supabase.functions.invoke('notify-admin-whatsapp', {
        body: {
          type: 'helper_arrived',
          booking_id: bookingId,
          category: booking.category,
          customer_name: booking.customer_name,
          city: (booking.booking_data?.city as string | undefined) ?? '',
        },
      }).catch(() => {});
    }

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
  // Helper keeps the price minus Vano's 15% cut (PLATFORM_FEE_BPS = 1500 in
  // capture-household-payment) — must match the ACTUAL payout, not 5%.
  const earnCents = booking.price_estimate_cents ? Math.floor(booking.price_estimate_cents * 0.85) : null;

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
            {mine && !isComplete && !isCancelled && (
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
              </p>
            )}
            <p className="text-xs text-muted-foreground mb-4">
              This job is still open — first to accept gets it.
            </p>
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
            <p className="font-bold text-foreground text-sm mb-3">✅ This job is yours — here's how it works</p>
            <ol className="space-y-2.5">
              {[
                ['1', 'The customer is being asked to pay now — that locks the booking in.'],
                ['2', "When you head out, tap “I'm on my way”. Directions open and the customer sees you on a live map until you arrive."],
                ['3', 'At the door, tap “I’ve reached”, ask the customer for their 4-digit code, and enter it to start.'],
                ['4', 'Timed jobs run a countdown; when the work’s done the customer rates you and taps “Mark complete” — and you’re paid instantly.'],
              ].map(([n, text]) => (
                <li key={n} className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-sage text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{n}</span>
                  <span className="text-xs text-foreground/80 leading-relaxed">{text}</span>
                </li>
              ))}
            </ol>
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

        {/* Location denied — the customer's map is blank and the helper should know */}
        {locationDenied && booking.status === 'on_way' && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-4 dark:bg-amber-950/20 dark:border-amber-800/40">
            <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-foreground/80 leading-relaxed">
              Location is off, so the customer can't see you on their map. Allow location access in your browser settings, then reload this page.
            </p>
          </div>
        )}

        {/* Waiting for the customer to pay (pay-after-accept). Block starting
            work until then so nobody does an unpaid job. */}
        {needsPayment && ['accepted', 'on_way', 'arrived', 'in_progress'].includes(booking.status) && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 dark:bg-amber-950/20 dark:border-amber-800/40">
            <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-foreground/80 leading-relaxed">
              Waiting for the customer to pay. You'll be able to start the job once their payment lands — we've sent them the link and they can also pay from their tracking screen.
            </p>
          </div>
        )}

        {/* I've reached — generates the customer's arrival code. Available from
            'accepted' too, so a helper who's already on site (or skipped the
            "on my way" step) can still start the arrival-code handshake. Gated
            on payment so no one starts an unpaid job. */}
        {mine && !needsPayment && (booking.status === 'accepted' || booking.status === 'on_way') && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => void handleReached()}
            disabled={reaching}
            className="w-full h-14 rounded-full bg-primary text-primary-foreground font-semibold text-base flex items-center justify-center gap-2 mb-6 hover:bg-primary/90 disabled:opacity-50 transition-[background-color,opacity] duration-150"
          >
            {reaching ? <Loader2 size={18} className="animate-spin" /> : <><MapPin size={18} />I've reached</>}
          </motion.button>
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
                <button
                  onClick={() => { setCodeError(false); setArrivalCode(''); void handleReached(); }}
                  className="mt-1 text-xs text-sage underline underline-offset-2"
                >
                  Code not working? Get a fresh one for the customer
                </button>
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
          </motion.div>
        )}

        {/* Job underway — timed jobs show a countdown (a guide, nothing auto-
            completes). The helper flags "I've finished"; the customer confirms
            to release payment. */}
        {mine && booking.status === 'in_progress' && (
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
                  Waiting for the customer to confirm — you’re paid the moment they do. We’ve nudged them.
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

        {/* Status action button */}
        {mine && !isComplete && !isCancelled && next && (
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
            <p className="text-sm text-muted-foreground mt-0.5">You'll be paid out to your bank or Revolut shortly.</p>
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
