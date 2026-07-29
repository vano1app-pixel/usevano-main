import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { extractFnError } from '@/lib/fnError';
import { ArrowLeft, MapPin, CheckCircle2, Circle, Loader2, Send, Navigation, Star, X, Bell, ShieldCheck, ShieldAlert, Check, BadgeCheck, GraduationCap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';
import { useToast } from '@/hooks/use-toast';
import { PartnerProgramCard } from '@/components/household/PartnerProgramCard';
import { BeforeAfterCard } from '@/components/household/BeforeAfterCard';
import { BookingEmailCapture } from '@/components/household/BookingEmailCapture';
import { IosInstallTip } from '@/components/IosInstallTip';
import { isTimedCategory, formatCountdown, pendingWaitTier } from '@/lib/householdJob';
import { categoryLabel, categoryEmoji } from '@/lib/bookingLabels';
import { studyLine } from '@/lib/colleges';
import { boundedPhotoUrl } from '@/lib/boundedPhoto';
import { format } from 'date-fns';
import { celebrateBooking, microCelebrate } from '@/lib/celebrate';
import { track } from '@/lib/track';
import logo from '@/assets/logo.png';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, useMap } from 'react-leaflet';
import VanoMapTiles from '@/components/household/VanoMapTiles';

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
  /** Before/after job photos taken by the helper (evidence + the share card) */
  arrival_photo_url: string | null;
  finish_photo_url: string | null;
  /** Capability token for rating — minted at completion, delivered only to the
   *  customer (the anon RPC withholds it from the assigned helper). */
  rating_token: string | null;
  booking_data: {
    service_fee_cents?: number;
    referral_discount_cents?: number;
    /** Direct-pay model (July 2026): Vano charges only its fee; the customer
     *  pays the helper directly. */
    direct_pay?: boolean;
    fee_due_cents?: number;
    cover_opted?: boolean;
    job_price_cents?: number;
    helper_first_name?: string;
    helper_payment_handle?: string | null;
    /** Set by the helper's confirm_paid / report_unpaid review. */
    paid_to_helper?: boolean;
    /** AUTH-AT-BOOKING: fee reserved (held) at booking, captured at accept. */
    fee_auth_required?: boolean;
    fee_authorized_at?: string;
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

// Normalize whatever the helper pasted into payment_handle — "@tag", "tag",
// or a full revolut.me URL — down to the bare Revolut username. Conservative
// on the bare form ({3,16} alnum/underscore, Revolut's username shape) so an
// IBAN or free text never linkifies into a wrong revolut.me page.
function revolutTag(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  const url = t.match(/^(?:https?:\/\/)?(?:www\.)?revolut\.me\/@?([a-z0-9_]{3,16})\/?(?:[?#].*)?$/i);
  if (url) return url[1];
  const bare = t.match(/^@?([a-z0-9_]{3,16})$/i);
  return bare ? bare[1] : null;
}

// Desktop-only QR of the prefilled Revolut link — the customer scans with
// their phone and Revolut opens with recipient + amount ready. Lazy on
// purpose: the qrcode module only loads on viewports wide enough to show it
// (on a phone the pay button IS the path — a QR there is noise).
function RevolutQr({ href }: { href: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia('(min-width: 1024px)').matches) return;
    let alive = true;
    import('qrcode')
      .then((QR) => QR.toDataURL(href, { margin: 1, width: 216 }))
      .then((url) => { if (alive) setSrc(url); })
      .catch(() => { /* QR is a bonus — the button + copy chips remain */ });
    return () => { alive = false; };
  }, [href]);
  if (!src) return null;
  return (
    <div className="hidden lg:flex flex-col items-center gap-1.5 flex-shrink-0">
      <img
        src={src}
        alt="Scan with your phone to pay in Revolut"
        className="w-[108px] h-[108px] rounded-lg border border-border bg-white p-1"
      />
      <p className="text-[10px] text-muted-foreground">Scan with your phone</p>
    </div>
  );
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
    // Radar sweep for the "finding your helper" state.
    '@keyframes vano-radar{0%{transform:scale(.4);opacity:.7}80%{opacity:0}to{transform:scale(2.6);opacity:0}}' +
    '.vano-radar-ring{animation:vano-radar 2.4s cubic-bezier(0,.55,.45,1) infinite}' +
    '.vano-radar-ring-2{animation-delay:.8s}' +
    '.vano-radar-ring-3{animation-delay:1.6s}' +
    // Destination pin — Uber-style square-lollipop: navy head + stem + a
    // little ground shadow, with an optional floating ETA bubble above.
    '.vano-pin{position:relative;width:30px;height:44px;filter:drop-shadow(0 3px 5px rgba(21,27,40,.35))}' +
    '.vano-pin-head{position:absolute;top:2px;left:50%;transform:translateX(-50%);width:24px;height:24px;background:#151b28;border-radius:8px}' +
    '.vano-pin-head::after{content:"";position:absolute;inset:0;margin:auto;width:8px;height:8px;background:#fff;border-radius:50%}' +
    '.vano-pin-stem{position:absolute;top:25px;left:50%;transform:translateX(-50%);width:3px;height:15px;background:#151b28;border-radius:2px}' +
    '.vano-pin-ground{position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:12px;height:4px;background:rgba(21,27,40,.22);border-radius:50%}' +
    '.vano-pin-eta{position:absolute;bottom:100%;left:50%;transform:translateX(-50%);margin-bottom:4px;background:#151b28;color:#fff;font-size:11px;font-weight:700;line-height:1;padding:6px 9px;border-radius:999px;white-space:nowrap;box-shadow:0 4px 12px rgba(21,27,40,.35)}' +
    // Helper puck — white circle with the helper's photo (or a sage dot),
    // breathing a soft sage pulse. Glides between GPS fixes (see
    // LiveJourneyLayer), so it reads as a person moving, not teleporting.
    '.vano-puck{position:relative;width:38px;height:38px}' +
    '.vano-puck-ring{position:absolute;inset:-9px;border-radius:50%;background:rgba(74,124,89,.3);animation:vano-puck-pulse 2.2s cubic-bezier(0,.55,.45,1) infinite}' +
    '.vano-puck-core{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#fff;border-radius:50%;box-shadow:0 3px 12px rgba(21,27,40,.32);overflow:hidden}' +
    '.vano-puck-core img{width:100%;height:100%;object-fit:cover;border-radius:50%}' +
    '.vano-puck-dot{width:15px;height:15px;background:#4a7c59;border-radius:50%}' +
    '@keyframes vano-puck-pulse{0%{transform:scale(.5);opacity:.85}70%{opacity:0}100%{transform:scale(1.12);opacity:0}}' +
    '@media (prefers-reduced-motion: reduce){.vano-puck-ring,.vano-radar-ring{animation:none;opacity:0}}';
  document.head.appendChild(s);
}

// Destination pin, with an optional Uber-style ETA bubble floating above it
// ("3 min"). The label is generated by us — never user text.
function destPinIcon(etaLabel?: string | null): L.DivIcon {
  return L.divIcon({
    className: '',
    html:
      '<div class="vano-pin">' +
      (etaLabel ? `<div class="vano-pin-eta">${etaLabel}</div>` : '') +
      '<div class="vano-pin-head"></div><div class="vano-pin-stem"></div><div class="vano-pin-ground"></div>' +
      '</div>',
    iconSize: [30, 44],
    iconAnchor: [15, 42],
  });
}

// The moving helper — their real photo in a white puck when we have it
// (the same face the customer sees on the helper card), a sage dot otherwise.
function helperPuckIcon(photoUrl?: string | null): L.DivIcon {
  const inner = photoUrl
    ? `<img src="${photoUrl.replace(/"/g, '&quot;')}" alt=""/>`
    : '<span class="vano-puck-dot"></span>';
  return L.divIcon({
    className: '',
    html: `<div class="vano-puck"><span class="vano-puck-ring"></span><span class="vano-puck-core">${inner}</span></div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
}

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

// The whole live layer — destination pin (+ETA bubble), gliding helper puck,
// street-following route line — drawn imperatively with Leaflet primitives so
// the puck can animate at 60fps between GPS fixes without React re-renders.
// The camera fits both points once, then gently flies to re-frame only when
// the puck drifts out of the padded view (throttled, so it never fidgets).
function LiveJourneyLayer({
  helperLat, helperLng, destLat, destLng, helperPhotoUrl, etaLabel, showRoute,
}: {
  helperLat: number | null; helperLng: number | null;
  destLat: number | null; destLng: number | null;
  helperPhotoUrl: string | null;
  etaLabel: string | null;
  showRoute: boolean;
}) {
  const map = useMap();
  const helperMarker = useRef<L.Marker | null>(null);
  const destMarker   = useRef<L.Marker | null>(null);
  const casing       = useRef<L.Polyline | null>(null);
  const line         = useRef<L.Polyline | null>(null);
  const glideRaf     = useRef<number | null>(null);
  // Last successful street route: where it was fetched from and when — reused
  // until the helper strays or it goes stale, so OSRM is polled gently.
  const routeMeta    = useRef<{ from: L.LatLng; at: number } | null>(null);
  const routeAbort   = useRef<AbortController | null>(null);
  const didFit       = useRef(false);
  const lastFlyAt    = useRef(0);

  // The map lives in an animated panel, so its size isn't final on mount.
  // Invalidate once layout settles so tiles don't come up gray.
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 300);
    return () => clearTimeout(t);
  }, [map]);

  // Tear everything down with the map. Refs are NULLED as well as removed —
  // under StrictMode's dev double-mount the effects re-run after this cleanup,
  // and a stale ref would make them mutate detached layers instead of
  // re-adding fresh ones (markers would silently never render).
  useEffect(() => () => {
    if (glideRaf.current) { cancelAnimationFrame(glideRaf.current); glideRaf.current = null; }
    routeAbort.current?.abort();
    helperMarker.current?.remove(); helperMarker.current = null;
    destMarker.current?.remove(); destMarker.current = null;
    casing.current?.remove(); casing.current = null;
    line.current?.remove(); line.current = null;
    routeMeta.current = null;
  }, []);

  // Destination pin — icon is re-minted when the ETA bubble text changes.
  useEffect(() => {
    if (destLat == null || destLng == null) {
      destMarker.current?.remove(); destMarker.current = null;
      return;
    }
    const icon = destPinIcon(etaLabel);
    if (!destMarker.current) {
      destMarker.current = L.marker([destLat, destLng], { icon, interactive: false, zIndexOffset: 200 }).addTo(map);
    } else {
      destMarker.current.setLatLng([destLat, destLng]);
      destMarker.current.setIcon(icon);
    }
  }, [map, destLat, destLng, etaLabel]);

  // Helper puck — GLIDES to each new GPS fix (easeOut, interruptible: a fix
  // arriving mid-glide retargets from wherever the puck currently is).
  useEffect(() => {
    if (helperLat == null || helperLng == null) {
      if (glideRaf.current) { cancelAnimationFrame(glideRaf.current); glideRaf.current = null; }
      helperMarker.current?.remove(); helperMarker.current = null;
      return;
    }
    const target = L.latLng(helperLat, helperLng);
    if (!helperMarker.current) {
      helperMarker.current = L.marker(target, { icon: helperPuckIcon(helperPhotoUrl), interactive: false, zIndexOffset: 400 }).addTo(map);
      return;
    }
    const m = helperMarker.current;
    const from = m.getLatLng();
    if (from.equals(target)) return;
    if (glideRaf.current) cancelAnimationFrame(glideRaf.current);
    const started = performance.now();
    const DURATION = 1400;
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
    const step = (now: number) => {
      const p = Math.min(1, (now - started) / DURATION);
      const e = easeOut(p);
      m.setLatLng([from.lat + (target.lat - from.lat) * e, from.lng + (target.lng - from.lng) * e]);
      glideRaf.current = p < 1 ? requestAnimationFrame(step) : null;
    };
    glideRaf.current = requestAnimationFrame(step);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, helperLat, helperLng]);

  // The photo can land after the marker (helper card fetch) — refresh the puck.
  useEffect(() => {
    helperMarker.current?.setIcon(helperPuckIcon(helperPhotoUrl));
  }, [helperPhotoUrl]);

  // Route — real streets via the public OSRM router, drawn as a navy line on
  // a white casing (the Uber look). Fail-soft: until (or unless) a street
  // route arrives, a subtly dotted straight line connects the two, so the
  // map is never worse than it was. Fetches are throttled: a fresh route is
  // reused until the helper strays >120m from where it was computed or it's
  // older than 45s.
  useEffect(() => {
    const hasBoth = helperLat != null && helperLng != null && destLat != null && destLng != null;
    if (!showRoute || !hasBoth) {
      casing.current?.remove(); casing.current = null;
      line.current?.remove(); line.current = null;
      routeMeta.current = null;
      return;
    }
    const h = L.latLng(helperLat, helperLng);
    const d = L.latLng(destLat, destLng);
    const draw = (pts: L.LatLngExpression[], dashed: boolean) => {
      if (!casing.current) {
        casing.current = L.polyline(pts, { color: '#ffffff', weight: 10, opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map);
      } else casing.current.setLatLngs(pts);
      if (!line.current) {
        line.current = L.polyline(pts, { color: '#151b28', weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map);
      } else line.current.setLatLngs(pts);
      line.current.setStyle({ dashArray: dashed ? '1 9' : undefined });
    };
    const fresh = routeMeta.current
      && Date.now() - routeMeta.current.at < 45_000
      && h.distanceTo(routeMeta.current.from) < 120;
    if (fresh) return;
    draw([h, d], true);
    if (h.distanceTo(d) > 30_000) return; // sanity: never route absurd distances
    routeAbort.current?.abort();
    const ac = new AbortController();
    routeAbort.current = ac;
    const timeout = setTimeout(() => ac.abort(), 6000);
    fetch(
      `https://router.project-osrm.org/route/v1/driving/${h.lng},${h.lat};${d.lng},${d.lat}?overview=full&geometries=geojson`,
      { signal: ac.signal },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { routes?: Array<{ geometry?: { coordinates?: [number, number][] } }> } | null) => {
        const coords = j?.routes?.[0]?.geometry?.coordinates;
        if (Array.isArray(coords) && coords.length > 1) {
          draw(coords.map((c) => [c[1], c[0]] as [number, number]), false);
          routeMeta.current = { from: h, at: Date.now() };
        }
      })
      .catch(() => { /* streets unavailable — the straight line stands */ })
      .finally(() => clearTimeout(timeout));
   
  }, [map, showRoute, helperLat, helperLng, destLat, destLng]);

  // Camera. First frame is instant; afterwards the map only flies (smoothly)
  // when the puck actually leaves the padded frame, at most every 7s.
  useEffect(() => {
    const hasHelper = helperLat != null && helperLng != null;
    const hasDest = destLat != null && destLng != null;
    if (hasHelper && hasDest) {
      const bounds = L.latLngBounds([helperLat, helperLng], [destLat, destLng]);
      if (!didFit.current) {
        map.fitBounds(bounds, { padding: [56, 56], maxZoom: 16, animate: false });
        didFit.current = true;
        lastFlyAt.current = Date.now();
        return;
      }
      const inView = map.getBounds().pad(-0.12).contains(L.latLng(helperLat, helperLng));
      if (!inView && Date.now() - lastFlyAt.current > 7000) {
        map.flyToBounds(bounds, { padding: [56, 56], maxZoom: 16, duration: 0.9 });
        lastFlyAt.current = Date.now();
      }
    } else if (hasHelper) {
      map.panTo([helperLat, helperLng], { animate: true, duration: 0.8 });
    } else if (hasDest && !didFit.current) {
      map.setView([destLat, destLng], 15, { animate: false });
      didFit.current = true;
    }
   
  }, [map, helperLat, helperLng, destLat, destLng]);

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
  if (lower === 'now' || lower === 'asap') return 'As soon as possible';
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
  // AUTH-AT-BOOKING: Stripe's success URL for the booking-time hold. The card
  // was RESERVED, not charged — the banner must say so, not "payment confirmed".
  const justAuthorized = searchParams.get('authorized') === 'true' && !justPaid;

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
    /** The blue tick (email + ID + active plan — DB generated column). */
    vano_verified: boolean;
    age: number | null;
    college: string | null;
    course: string | null;
    study_year: string | null;
    /** "On VANO since May 2026" — a date can't be faked warm, only earned. */
    created_at: string | null;
  } | null>(null);
  // One real review line for the chip — the strongest comfort signal at the
  // "a stranger was just assigned to my home" moment. Absent → renders nothing.
  const [helperQuote, setHelperQuote] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  // Pay-the-helper card: which copy chip just flashed "Copied ✓"
  const [copiedChip, setCopiedChip] = useState<'amount' | 'tag' | null>(null);
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
  // The rating THIS visit submitted (0 = rated earlier/unknown) — a 4-5 star
  // just-submitted rating unlocks the Trustpilot ask at the perfect moment.
  const [submittedRating, setSubmittedRating] = useState(0);
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
    if (!studentId) { setHelperName(null); setHelperCard(null); setHelperQuote(null); return; }
    let cancelled = false;
    const fetch_ = async () => {
      const { data: helper } = await hdb
        .from('household_helpers')
        .select('id, name, photo_url, average_rating, rating_avg, accepted_count, id_verified, vano_verified, age, college, course, study_year, created_at')
        .eq('user_id', studentId)
        .maybeSingle();
      if (cancelled) return;
      if (helper?.name) {
        setHelperName(helper.name.split(' ')[0]);
        // One bounded resolve feeds every surface that shows the face — the
        // chip, the at-your-door card AND the map puck (a full-res decode
        // inside Leaflet's transformed pane is prime iOS black-box territory
        // — see lib/boundedPhoto.ts).
        const safePhoto = (await boundedPhotoUrl(helper.photo_url || null, 256)) ?? (helper.photo_url || null);
        if (cancelled) return;
        setHelperCard({
          id: helper.id,
          photo_url: safePhoto,
          average_rating: helper.average_rating ?? helper.rating_avg ?? null,
          accepted_count: helper.accepted_count ?? 0,
          id_verified: !!helper.id_verified,
          vano_verified: !!helper.vano_verified,
          age: helper.age ?? null,
          college: helper.college ?? null,
          course: helper.course ?? null,
          study_year: helper.study_year ?? null,
          created_at: helper.created_at ?? null,
        });
        // Best recent review line for the chip — fail-soft, purely additive.
        const { data: ratings } = await hdb
          .from('household_ratings')
          .select('rating, comment')
          .eq('helper_id', helper.id)
          .gte('rating', 4)
          .not('comment', 'is', null)
          .order('created_at', { ascending: false })
          .limit(3);
        if (cancelled) return;
        const quote = (ratings as { rating: number; comment: string | null }[] | null)
          ?.map(r => (r.comment ?? '').trim())
          .find(c => c.length >= 12) ?? null;
        setHelperQuote(quote);
        return;
      }
      const { data: profile } = await hdb.from('profiles').select('display_name').eq('user_id', studentId).maybeSingle();
      if (!cancelled) setHelperName(profile?.display_name?.split(' ')[0] ?? null);
    };
    void fetch_();
    return () => { cancelled = true; };
  }, [booking?.student_id]);

  // Keep the chat box pinned to its latest message — scrolling ONLY the chat's
  // own overflow container, and only when a message actually arrives. The old
  // scrollIntoView ran on every 5s poll (each poll sets a fresh array) and
  // scrolled the whole PAGE down to the chat — yanking the customer away from
  // the live map they were watching.
  const chatCountRef = useRef(0);
  useEffect(() => {
    if (messages.length > chatCountRef.current) {
      const list = chatBottomRef.current?.parentElement;
      list?.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
    }
    chatCountRef.current = messages.length;
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
  // who already opted in on this device — but a browser PushSubscription is
  // ONE per origin while push delivery is per-booking (send-household-push
  // filters household_push_subscriptions by booking_id). A returning customer
  // already holds the origin subscription, so on every NEW booking this used to
  // flip straight to 'subscribed', hide the opt-in card, and never register a
  // row for the new booking_id → silently no push. So when a subscription
  // exists, idempotently register it for THIS booking before marking subscribed.
  useEffect(() => {
    if (!pushSupported || !bookingId) return;
    if (Notification.permission === 'denied') { setPushState('denied'); return; }
    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (cancelled || !sub) return;
        const json = sub.toJSON();
        if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
          // ON CONFLICT DO NOTHING via the UNIQUE(booking_id,endpoint) index —
          // safe to run on every mount/reload, no UPDATE policy needed.
          await hdb.from('household_push_subscriptions').upsert({
            booking_id: bookingId,
            endpoint: json.endpoint,
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
          }, { onConflict: 'booking_id,endpoint', ignoreDuplicates: true });
        }
        if (!cancelled) setPushState('subscribed');
      } catch { /* SW not ready — leave idle */ }
    })();
    return () => { cancelled = true; };
  }, [pushSupported, bookingId]);

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
          const rateRes = await supabase.functions.invoke('rate-household-booking', { body: { booking_id: bookingId, rating: selectedRating, comment: ratingComment || undefined, rating_token: booking?.rating_token ?? undefined } });
          if (!rateRes.error && !(rateRes.data as { error?: string } | null)?.error) {
            if (typeof localStorage !== 'undefined') localStorage.setItem(`vano_rated_${bookingId}`, '1');
            setSubmittedRating(selectedRating);
            if (selectedRating >= 4) track('trustpilot_ask_shown', { booking_id: bookingId ?? undefined });
            setAlreadyRated(true);
          }
        } catch { /* rating is best-effort — don't block completion */ }
      }
      setBooking((b) => b ? { ...b, status: 'completed' } : b);
      // Direct-pay: VANO never paid the helper (it only charged its fee) — the
      // customer still owes the helper the job price directly. Saying "your
      // helper has been paid" here would tell them to skip the settle-up that
      // the whole direct-pay model depends on. Only legacy escrow prepaid the
      // helper. (The persistent gold pay card below already carries the amount.)
      toast(
        booking?.booking_data?.direct_pay === true
          ? { title: 'All done — thanks!', description: 'Now settle up with your helper directly — Revolut or cash (see the pay card below).' }
          : { title: 'All done — thanks!', description: 'Your helper has been paid.' },
      );
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
        body: { booking_id: bookingId, rating: selectedRating, comment: ratingComment || undefined, rating_token: booking?.rating_token ?? undefined },
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
      setSubmittedRating(selectedRating);
      if (selectedRating >= 4) track('trustpilot_ask_shown', { booking_id: bookingId ?? undefined });
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

  // The stepper shows the furthest stage reached from EITHER source: the
  // job_updates feed (helper taps) or booking.status itself. A fresh accepted
  // booking often has no job_updates row yet — keying only off updates left
  // the whole timeline un-ticked ("nothing has happened yet") on the same
  // screen that says a helper is confirmed.
  const latestUpdateStatus = updates.at(-1)?.status ?? null;
  const currentStepIndex = Math.max(
    latestUpdateStatus ? STATUS_ORDER.indexOf(latestUpdateStatus) : -1,
    // Widened: booking.status also holds pre-timeline states (pending,
    // awaiting_payment, cancelled) that aren't steps — they indexOf to -1.
    booking ? (STATUS_ORDER as readonly string[]).indexOf(booking.status) : -1,
  );

  if (loading) {
    // Skeleton in the shape of the page (header line, status card, steps) —
    // the customer lands here at their most anxious, so no bare spinner.
    return (
      <div className="min-h-dvh bg-cream">
        <main className="shimmer max-w-lg mx-auto px-4 pt-8 space-y-6" aria-busy="true" aria-label="Loading your booking">
          <div className="space-y-2">
            <div className="h-4 w-28 rounded bg-secondary" />
            <div className="h-7 w-52 rounded bg-secondary" />
          </div>
          <div className="rounded-2xl border border-border/60 p-5 space-y-3">
            <div className="h-5 w-40 rounded bg-secondary" />
            <div className="h-4 w-full rounded bg-secondary" />
            <div className="h-4 w-2/3 rounded bg-secondary" />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-secondary flex-shrink-0" />
              <div className="h-4 rounded bg-secondary" style={{ width: `${60 - i * 12}%` }} />
            </div>
          ))}
        </main>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-4 text-center bg-cream">
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
            className="h-10 px-5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-sage-dark active:scale-[0.97] transition-[background-color,transform] duration-150"
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
    // Cream base + floating white cards — the same warm design language as the
    // booking flow, so the sheet → tracking handoff reads as one product.
    <div className="min-h-dvh bg-cream">
      <SEOHead title="Track your booking" description="Track your VANO booking status in real time." noindex />

      <header className="fixed top-0 inset-x-0 z-50 h-14 flex items-center px-4 bg-cream/95 backdrop-blur-xl border-b border-border/50">
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
                initial={{ scale: 0.4, opacity: 0, rotate: -12 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 15, delay: 0.12 }}
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

        {/* Card-secured banner (AUTH-AT-BOOKING). Reached from the hold's
            success URL — before any helper exists, so the copy is "finding
            your helper", never "confirmed". Restricted to the searching
            states: once a helper accepts, the capture messages own the story
            (and paid_at kills it entirely). */}
        <AnimatePresence>
          {justAuthorized && booking && !booking.paid_at
            && (booking.status === 'awaiting_payment' || booking.status === 'pending') && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as const }}
              className="mt-6 bg-sage-light border border-sage/30 rounded-2xl px-5 py-4 flex items-start gap-3"
            >
              <motion.span
                initial={{ scale: 0.4, opacity: 0, rotate: -12 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 15, delay: 0.12 }}
                className="mt-0.5 flex-shrink-0"
              >
                <CheckCircle2 className="w-6 h-6 text-sage" />
              </motion.span>
              <div className="flex-1">
                <p className="font-semibold text-foreground text-sm">Card secured 🎉 — finding your helper</p>
                <p className="text-foreground/70 text-sm mt-0.5 leading-relaxed">
                  Your fee is reserved, not charged — the charge only happens when a helper accepts. Nothing to do now: watch below, we'll text you the moment someone's confirmed.
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

        {/* Booking summary card — the anchor of the page. Job first (the same
            emoji tile the customer tapped to book), when underneath, price on
            the right. A floating white card on the cream base, rising in as
            the first beat of the page's entrance cascade. */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] as const }}
          className="mt-6 rounded-2xl surface-float border border-black/5 bg-white p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <span
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary/60 text-2xl leading-none flex-shrink-0"
                aria-hidden="true"
              >
                {categoryEmoji(booking.category)}
              </span>
              <div className="min-w-0">
                <p className="text-base font-bold text-foreground leading-snug">
                  {formatCategory(booking.category)}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {formatDate(booking.scheduled_date)}
                </p>
                {formatTimeSlot(booking.time_slot) && (
                  <p className="text-sm text-muted-foreground mt-0.5">{formatTimeSlot(booking.time_slot)}</p>
                )}
              </div>
            </div>
            {booking.price_estimate_cents != null && booking.price_estimate_cents > 0 && (
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
            <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border/40 text-xs text-muted-foreground">
              <MapPin size={12} className="flex-shrink-0" />
              <span className="truncate">{booking.customer_address}</span>
            </div>
          )}
        </motion.div>

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
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] as const }}
            className="mt-4 rounded-2xl overflow-hidden border border-border/60 shadow-lg"
          >
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-border/40">
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
            <div className="relative" style={{ height: 320 }}>
              <MapContainer
                center={[mapLat, mapLng]}
                zoom={14}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
                attributionControl={false}
                scrollWheelZoom={false}
                dragging={false}
              >
                <VanoMapTiles />
                <LiveJourneyLayer
                  helperLat={booking.worker_lat ?? null}
                  helperLng={booking.worker_lng ?? null}
                  destLat={booking.customer_lat ?? null}
                  destLng={booking.customer_lng ?? null}
                  helperPhotoUrl={helperCard?.photo_url ?? null}
                  etaLabel={booking.status === 'on_way' && helperLoc && distanceKm !== null
                    ? `${etaMinutes(distanceKm)} min`
                    : null}
                  showRoute={booking.status === 'on_way'}
                />
              </MapContainer>
              {/* Soft edge fades melt the map into its card (Uber's trick) —
                  above the marker pane so pins dissolve at the very edges
                  instead of clipping hard. */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-white/80 to-transparent z-[610]" aria-hidden="true" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-white/80 to-transparent z-[610]" aria-hidden="true" />
            </div>
          </motion.div>
        )}

        {/* Finish-securing card (AUTH-AT-BOOKING): the customer bounced off the
            Stripe card step — the booking is parked in awaiting_payment and
            nothing dispatches until the hold lands. The session URL on the row
            is the SAME session (Stripe re-opens it), so one tap resumes where
            they left off. The link dies at 60 min; the expiry webhook/sweep
            then quiet-cancels, so this card can't outlive its link by much. */}
        {booking.status === 'awaiting_payment' && booking.stripe_checkout_url && !booking.paid_at && !isCancelled && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as const }}
            className="mt-4 rounded-2xl border-2 border-gold/50 bg-amber-50/70 p-5"
          >
            <p className="font-bold text-foreground text-sm">One tap left — secure your booking</p>
            <p className="text-foreground/70 text-[13px] mt-1 leading-relaxed">
              Your booking isn't live yet. Pop your card in (~30 seconds) and we start pinging helpers — <span className="font-semibold text-foreground">you're only charged when someone accepts</span>{(booking.booking_data?.fee_due_cents ?? 0) > 0 ? <>; this just reserves the €{((booking.booking_data?.fee_due_cents ?? 0) / 100).toFixed(2)} fee</> : null}.
            </p>
            <a
              href={booking.stripe_checkout_url}
              className="mt-3 w-full h-12 rounded-full bg-sage text-white font-semibold text-[15px] flex items-center justify-center gap-2 hover:bg-sage-dark active:scale-[0.98] transition-[background-color,transform] duration-150"
            >
              Finish securing{(booking.booking_data?.fee_due_cents ?? 0) > 0 ? ` — €${((booking.booking_data?.fee_due_cents ?? 0) / 100).toFixed(2)}` : ''} →
            </a>
            <p className="text-center text-xs text-muted-foreground mt-2">
              Apple Pay, Google Pay or card · secured by Stripe · link expires ~1 hour after booking
            </p>
          </motion.div>
        )}

        {/* Pay-after-accept: a helper is confirmed but the booking is unpaid.
            The email/WhatsApp pay link doesn't reach phone-only customers
            reliably — this card is the always-works path, updating live the
            moment notify-household-accepted stores the checkout URL. */}
        {/* status must be past 'pending': a released helper drops the booking back
            to searching but the old checkout URL survives on the row — showing
            "Helper confirmed — secure your booking" then would be a lie. Same
            for 'awaiting_payment' (AUTH-AT-BOOKING): its URL is the booking-time
            hold session and no helper exists yet — the card above owns that state. */}
        {booking.stripe_checkout_url && !booking.paid_at && !isCancelled && !isCompleted && booking.status !== 'pending' && booking.status !== 'awaiting_payment' && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as const }}
            className="mt-4 rounded-2xl border-2 border-sage/40 bg-sage-light p-5"
          >
            <p className="font-bold text-foreground text-sm">
              {helperName ? `${helperName} is confirmed — secure your booking` : 'Helper confirmed — secure your booking'}
            </p>
            {(() => {
              const bd = booking.booking_data ?? {};
              const direct = bd.direct_pay === true;
              const price = booking.price_estimate_cents ?? 0;
              const discount = bd.referral_discount_cents ?? 0;
              const due = direct
                ? Math.max(0, bd.fee_due_cents ?? 0)
                : Math.max(0, price + (bd.service_fee_cents ?? 0) - discount);
              return (
                <>
                  <p className="text-foreground/70 text-[13px] mt-1 leading-relaxed">
                    {direct
                      ? <>A small booking fee confirms {helperName ? helperName : 'your helper'}{bd.cover_opted ? ' (includes your €2 Vano Cover)' : ''}. The job itself — <span className="font-semibold text-foreground">€{(price / 100).toFixed(2)}</span> — is paid to {helperName ? helperName : 'them'} directly (Revolut or cash) when the work's done. They keep 100%.</>
                      : <>Pay now to lock in your helper — your payment's protected until the job's confirmed done, money back if it's not right. No cash needed on the day.</>}
                  </p>
                  {discount > 0 && (
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-sage-dark mt-2">
                      <span aria-hidden="true">🎁</span>
                      €{(discount / 100).toFixed(0)} referral credit applied{direct ? ' to your fee' : ''}
                    </p>
                  )}
                  <a
                    href={booking.stripe_checkout_url!}
                    className="mt-3 w-full h-12 rounded-full bg-sage text-white font-semibold text-[15px] flex items-center justify-center gap-2 hover:bg-sage-dark active:scale-[0.98] transition-[background-color,transform] duration-150"
                  >
                    {direct ? `Confirm booking — €${(due / 100).toFixed(2)} fee →` : `Pay €${(due / 100).toFixed(2)} to confirm →`}
                  </a>
                </>
              );
            })()}
            <p className="text-center text-xs text-muted-foreground mt-2">
              Card, Apple Pay or Google Pay · secured by Stripe · money back guarantee
            </p>
            {/* Contract moment #2 — payment is where the deal is struck, so the
                independent-provider terms ride with the pay button too. Cover
                is only claimed when this booking actually has it (direct-pay
                opt-in, or any legacy booking where it was bundled). */}
            <p className="text-center text-xs leading-relaxed text-muted-foreground mt-1.5">
              By paying you agree to VANO's{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">Terms</a>
              {' '}— the work is carried out by {helperName ? helperName : 'your helper'}, an independent provider
              {(booking.booking_data?.direct_pay !== true || booking.booking_data?.cover_opted === true) ? (
                <>
                  , with{' '}
                  <a href="/cover" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">Vano Cover</a>
                  {' '}up to €250 for accidental damage.
                </>
              ) : '.'}
            </p>
          </motion.div>
        )}

        {/* Get notified — once a helper is confirmed, offer browser push so the
            customer doesn't have to keep the tab open. Anonymous-friendly
            (keyed to booking_id). Graceful when unsupported or denied.
            Deliberately BELOW the pay card: securing the booking is the one
            thing the customer must do — a notifications nag never outranks it. */}
        {booking.student_id && pushSupported && !isCompleted && !isCancelled
          && pushState !== 'subscribed' && pushState !== 'denied' && !pushDismissed && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] as const }}
            className="mt-4 flex items-center gap-3 rounded-2xl border border-border/60 bg-white px-4 py-3"
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
                  <button onClick={() => setCancelConfirm(false)} aria-label="Keep this booking" className="text-muted-foreground -mt-0.5 -mr-0.5 p-1.5 -m-1 rounded-lg transition-colors hover:text-foreground">
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
                    <p className="text-sm font-semibold text-foreground leading-tight flex items-center gap-1">
                      <span className="truncate">
                        {helperName}
                        {helperCard?.age ? <span className="font-normal text-muted-foreground">, {helperCard.age}</span> : null}
                      </span>
                      {helperCard?.vano_verified && (
                        <BadgeCheck className="w-4 h-4 fill-sky-500 text-white flex-shrink-0" aria-label="VANO Verified" />
                      )}
                    </p>
                    {/* The study line — "2nd year Nursing at ATU". This is the
                        whole "trusted local student" pitch made literal at the
                        moment a real person is assigned to their home. */}
                    {helperCard && studyLine(helperCard) && (
                      <p className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                        <GraduationCap className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                        <span className="truncate">{studyLine(helperCard)}</span>
                      </p>
                    )}
                    {helperCard?.id_verified && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sage mt-0.5">
                        <ShieldCheck className="w-3 h-3" aria-hidden="true" /> ID-verified
                      </span>
                    )}
                    {helperCard && (helperCard.average_rating || helperCard.accepted_count > 0 || helperCard.created_at) && (
                      <p className="flex flex-wrap items-center gap-x-1 text-[11px] text-muted-foreground mt-0.5">
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
                        {/* Un-fakeable warmth: the joined date is earned, not
                            written. Shows alone for brand-new helpers too. */}
                        {(helperCard.average_rating || helperCard.accepted_count > 0) && helperCard.created_at ? ' · ' : null}
                        {helperCard.created_at
                          ? `On VANO since ${format(new Date(helperCard.created_at), 'MMM yyyy')}`
                          : null}
                      </p>
                    )}
                    {/* A real customer's words beat any badge — one line, most
                        recent 4★+ review with text. It fades in a beat after
                        the card so the payoff lands last (opacity only —
                        calm, and reduced-motion safe by nature). */}
                    {helperQuote && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.25, ease: 'easeOut' }}
                        className="text-[11px] italic text-muted-foreground/90 mt-1 line-clamp-2"
                      >
                        "{helperQuote}"
                      </motion.p>
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
            {/* The face at the door — she's about to open it to a stranger, so
                the card in her hand must show the same face she was promised.
                Bounded circle (never an unbounded user image — owner rule). */}
            {helperCard?.photo_url && (
              <img
                src={helperCard.photo_url}
                alt={helperName ?? 'Your helper'}
                className="w-16 h-16 rounded-full object-cover object-[center_20%] border-2 border-sage/40 mx-auto mb-3"
              />
            )}
            <p className="font-bold text-foreground text-sm">
              {helperName ? `${helperName} is at your door 👋` : 'Your helper is here 👋'}
            </p>
            <p className="text-xs text-muted-foreground mt-1 mb-3 leading-relaxed">
              {helperCard?.photo_url
                ? 'Check the face, then read them your code:'
                : 'Read this code to your helper so they can start the job:'}
            </p>
            {/* The digits land one at a time — the code being "issued" for
                her to read out. Spans are aria-hidden with a spaced aria-label
                on the row, so screen readers announce the digits cleanly
                instead of one big number. Mount-once: the 5s poll updates
                booking state but never remounts this card, so the pop never
                replays. */}
            <motion.p
              className="text-[2.5rem] leading-none font-extrabold tracking-[0.3em] tabular-nums text-sage"
              aria-label={booking.arrival_code.split('').join(' ')}
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } } }}
            >
              {booking.arrival_code.split('').map((digit, i) => (
                <motion.span
                  key={i}
                  aria-hidden="true"
                  className="inline-block"
                  variants={{
                    hidden: { opacity: 0, scale: 0.7, y: 6 },
                    show:   { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', duration: 0.4, bounce: 0.25 } },
                  }}
                >
                  {digit}
                </motion.span>
              ))}
            </motion.p>
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
              <div className="mt-4 rounded-2xl border border-border/60 bg-white p-5 text-center">
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
              {/* Direct-pay: the customer has only paid the VANO fee — they
                  still settle the job price with the helper directly (the
                  gold Revolut card below). The "you've already paid / we pay
                  them" lines are ONLY true for legacy escrow bookings. */}
              <p className="text-xs text-muted-foreground mt-1 mb-3 leading-relaxed">
                {booking.booking_data?.direct_pay === true
                  ? booking.helper_finished_at
                    ? `${helperName ?? 'Your helper'} has marked the job finished. Rate them and confirm it's done — then settle up with ${helperName ?? 'them'} directly (Revolut or cash) in the card below.`
                    : booking.job_ends_at
                      ? 'Your booked time is up. Rate your helper and confirm it\'s done — the job price goes straight to them, Revolut or cash.'
                      : `Once the work is finished, rate your helper and confirm it's done — then pay ${helperName ?? 'them'} directly (Revolut or cash).`
                  : booking.helper_finished_at
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
                        <Star size={26} className={cn('transition-colors', on ? 'fill-gold text-gold' : 'text-muted-foreground/25')} />
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
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] as const, delay: 0.1 }}
            >
              {/* Uber-style live search: a radar sweep over the job location
                  (or a generic pulse when we have no coordinates), a real count
                  of helpers notified, and a calm reassurance line. Transitions
                  to the helper card automatically when status flips to accepted.
                  Only for status 'pending' — an awaiting_payment booking is NOT
                  dispatched yet (the finish-securing card above owns that state),
                  so "finding your helper" would be untrue. */}
              {booking.status === 'pending' && (
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
                        <VanoMapTiles />
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
                      className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#25D366]/40 text-[#25D366] text-xs font-semibold px-4 py-2 hover:bg-[#25D366]/[0.08] transition-colors"
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
              )}

              {/* Customer cancel — awaiting_payment cancels free too (the hold,
                  if one landed, is released server-side; usually nothing exists yet) */}
              {(booking.status === 'pending' || booking.status === 'awaiting_payment') && (
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
                        <button onClick={() => setCancelConfirm(false)} aria-label="Keep this booking" className="text-muted-foreground -mt-0.5 -mr-0.5 p-1.5 -m-1 rounded-lg transition-colors hover:text-foreground">
                          <X size={16} />
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                        {booking.paid_at
                          ? "You'll receive a full refund within 5–7 business days."
                          : booking.booking_data?.fee_auth_required
                          ? "You haven't been charged — any hold on your card is released straight away."
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
                  : "You weren't charged — with VANO nothing hits your card until a helper accepts. "}
                Questions? WhatsApp{' '}
                <a href="https://wa.me/353899817111" className="text-primary underline">+353 89 981 7111</a>
              </p>
            </div>
          )}

          {!isPending && !isCancelled && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as const, delay: 0.08 }}
              className="space-y-0"
            >
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
            </motion.div>
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
                initial={{ scale: 0.6, opacity: 0, rotate: -20 }}
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
                        aria-label={`${n} star${n === 1 ? '' : 's'}`}
                      >
                        <motion.span className="block" animate={{ scale: on ? 1.18 : 1 }} transition={{ type: 'spring', stiffness: 500, damping: 14 }}>
                          <Star
                            size={28}
                            className={cn('transition-colors', on ? 'fill-gold text-gold' : 'text-muted-foreground/25')}
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
            ) : submittedRating >= 4 ? (
              /* A 5-star moment is the ONLY honest time to ask for a public
                 review — the ask rides the high, never begs after a bad job. */
              <div className="border-t border-sage/20 pt-4 text-center">
                <p className="text-sm font-semibold text-foreground mb-1">Thanks — that made our day ⭐</p>
                <p className="text-xs text-muted-foreground leading-relaxed mb-3 max-w-xs mx-auto">
                  Would you say it publicly? A Trustpilot review takes about 30
                  seconds and helps a small Galway team more than you'd think.
                </p>
                <a
                  href="https://www.trustpilot.com/review/vanojobs.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track('trustpilot_ask_tap', { booking_id: bookingId ?? undefined })}
                  className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-full bg-[#00B67A] text-white font-semibold text-sm active:scale-[0.98] transition-transform"
                >
                  <Star size={16} className="fill-white text-white" />
                  Review us on Trustpilot
                </a>
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
                  {/* Cover is a €2 opt-in — only claim it for bookings that
                      actually bought it (legacy escrow bookings had it bundled). */}
                  <p className="text-xs leading-relaxed text-muted-foreground mb-2">
                    Tell us what went wrong — you’re covered by our money-back guarantee
                    {(booking.booking_data?.direct_pay !== true || booking.booking_data?.cover_opted === true) ? (
                      <>
                        , and accidental damage is covered up to €250 by{' '}
                        <a href="/cover" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">Vano Cover</a>
                      </>
                    ) : null}
                    {' '}(photos help).
                  </p>
                  <textarea
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value.slice(0, 400))}
                    placeholder="e.g. the helper didn’t show, something got damaged, or the job wasn’t done right…"
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

        {/* Direct-pay: the "pay your helper" moment. Appears once the work is
            underway/done and flips to a paid tick when the helper confirms.
            Vano never holds this money — it goes straight to the student.
            REVOLUT-FIRST (owner's call): one big button opens Revolut with the
            recipient AND amount pre-filled via the request-link shape
            revolut.me/<tag>/<amount> — the same URLs Revolut's own "request
            money" flow mints. If an account ignores the amount suffix it still
            opens the helper's profile (old behaviour), and the huge amount +
            copy chips are the backup. OWNER-VERIFY: tap one of these links
            against your own tag once; if the amount doesn't prefill, drop the
            `/${amountStr}` suffix below (one-line revert). */}
        {booking.booking_data?.direct_pay === true && ['in_progress', 'completed'].includes(booking.status) && !isCancelled && (() => {
          const bd = booking.booking_data ?? {};
          const owed = booking.price_estimate_cents ?? bd.job_price_cents ?? 0;
          const name = helperName || bd.helper_first_name || 'your helper';
          const tag = revolutTag(bd.helper_payment_handle);
          const amountStr = (owed / 100).toFixed(2).replace(/\.00$/, '');
          const revolutHref = tag ? `https://revolut.me/${tag}/${amountStr}` : null;
          const copyChip = (chip: 'amount' | 'tag', text: string) => {
            void navigator.clipboard?.writeText(text).catch(() => {});
            setCopiedChip(chip);
            window.setTimeout(() => setCopiedChip((c) => (c === chip ? null : c)), 1600);
          };
          if (bd.paid_to_helper === true) {
            return (
              <div className="mt-4 rounded-2xl border border-sage/30 bg-sage-light px-4 py-3 flex items-center gap-2.5">
                <span className="text-lg leading-none" aria-hidden="true">✓</span>
                <p className="text-sm font-semibold text-foreground">{name} confirmed your payment — all settled. 💚</p>
              </div>
            );
          }
          return (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 rounded-2xl border-2 border-gold/50 bg-amber-50/70 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-foreground/70">
                    {booking.status === 'completed' ? `Job done — time to pay ${name}` : `When the job's done, pay ${name}`}
                  </p>
                  <p className="mt-1.5 text-[34px] leading-none font-bold text-foreground tabular-nums">
                    €{(owed / 100).toFixed(2)}
                  </p>
                  <p className="mt-2 text-[13px] text-foreground/70 leading-relaxed">
                    Straight to {name} — they keep 100%.{' '}
                    {revolutHref
                      ? 'One tap opens Revolut with everything filled in.'
                      : `Revolut or cash in hand — ask ${name} for their tag.`}
                  </p>
                </div>
                {revolutHref && <RevolutQr href={revolutHref} />}
              </div>
              {revolutHref && (
                <a
                  href={revolutHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 w-full h-[52px] rounded-full bg-sage text-white font-semibold text-[15px] flex items-center justify-center gap-2 hover:bg-sage-dark active:scale-[0.98] transition-[background-color,transform] duration-150"
                >
                  Pay {name} €{amountStr} in Revolut →
                </a>
              )}
              <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => copyChip('amount', (owed / 100).toFixed(2))}
                  className="h-9 px-3.5 rounded-full border border-border bg-white text-xs font-semibold text-foreground/80 inline-flex items-center gap-1.5 active:scale-95 transition-transform"
                >
                  {copiedChip === 'amount' ? '✓ Copied' : 'Copy amount'}
                </button>
                {tag && (
                  <button
                    type="button"
                    onClick={() => copyChip('tag', `@${tag}`)}
                    className="h-9 px-3.5 rounded-full border border-border bg-white text-xs font-semibold text-foreground/80 inline-flex items-center gap-1.5 active:scale-95 transition-transform"
                  >
                    {copiedChip === 'tag' ? '✓ Copied' : `Copy @${tag}`}
                  </button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2.5">
                Or cash in hand is grand too. {name} will confirm once they've received it — that wraps the job up for both of you.
              </p>
            </motion.div>
          );
        })()}

        {/* Before/after job photos — the helper's evidence shots, rendered as
            the customer's reveal. On a completed job with both photos it grows
            a share button that carries the €5 referral link. */}
        <BeforeAfterCard
          className="mt-4"
          arrivalUrl={booking.arrival_photo_url}
          finishUrl={booking.finish_photo_url}
          helperName={helperName}
          completed={isCompleted}
        />

        {/* The just-finished customer is the highest-attention moment — spend
            it on the 3% partner programme (the network-effect loop) instead of
            the parked Give €5 Get €5 card. */}
        {isCompleted && <PartnerProgramCard className="mt-4" />}

        {/* Chat — signed-in viewers only. Customers are anonymous BY DESIGN
            (no accounts exist for them), so showing "Sign in to message your
            helper" promised a door that doesn't exist; WhatsApp is their real
            channel and it lives in the help row above. */}
        {booking.student_id && userId && (
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
                          : 'bg-white text-foreground rounded-bl-sm border border-border/40',
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

        {/* Email opt-in — quick-book never collects email, so this is where
            confirmation / pay link / receipt emails get unlocked */}
        {!isCancelled && bookingId && (
          <BookingEmailCapture
            bookingId={bookingId}
            currentEmail={booking.customer_email}
            onSaved={(email) => setBooking(b => (b ? { ...b, customer_email: email } : b))}
          />
        )}

      </main>

      {/* Map panel — helper's live position when shared, else the job location */}
      {showMapPanel && (
        <div className={cn(
          'fixed inset-x-0 z-30 flex justify-center px-4',
          booking.student_id && !isCompleted && !isCancelled && userId ? 'bottom-[68px]' : 'bottom-0 safe-area-bottom',
        )}>
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="w-full max-w-sm md:max-w-lg bg-white border border-border/60 rounded-2xl overflow-hidden shadow-2xl"
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
            <div className="relative" style={{ height: 200 }}>
              <MapContainer
                center={[mapLat, mapLng]}
                zoom={14}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
                attributionControl={false}
                scrollWheelZoom={false}
                dragging={false}
              >
                <VanoMapTiles />
                <LiveJourneyLayer
                  helperLat={booking.worker_lat ?? null}
                  helperLng={booking.worker_lng ?? null}
                  destLat={booking.customer_lat ?? null}
                  destLng={booking.customer_lng ?? null}
                  helperPhotoUrl={helperCard?.photo_url ?? null}
                  etaLabel={null}
                  showRoute={false}
                />
              </MapContainer>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-white/70 to-transparent z-[610]" aria-hidden="true" />
            </div>
          </motion.div>
        </div>
      )}

      {/* Chat input */}
      {booking.student_id && !isCompleted && !isCancelled && userId && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-cream/95 backdrop-blur-xl border-t border-border/50 safe-area-bottom px-4 py-3">
          <div className="max-w-sm md:max-w-lg mx-auto flex items-center gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }}
              placeholder="Message your helper…"
              className="flex-1 h-11 rounded-full bg-white border border-border/50 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
