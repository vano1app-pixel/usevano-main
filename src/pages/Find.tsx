import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Search, Loader2, Navigation, ShieldCheck, Star, Wrench } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/haptics';
import { useToast } from '@/hooks/use-toast';
import { hasSupabaseSession } from '@/lib/helperSession';
import { findOpenOrders, claimOrder, formatEuro, formatKm, type OpenOrder } from '@/lib/openOrders';
import { getCurrentPosition } from '@/lib/native/geolocation';
import { SKILL_GROUPS } from '@/lib/helperSkills';
import { setMode } from '@/lib/mode';

const OrderMap = lazy(() => import('@/components/household/OrderMap'));

/**
 * FIND — the helper's home (2026-09-06). Open orders near them, on a map and
 * in a list, searchable ("cleaning tonight", "dog walk salthill"), one tap to
 * claim. No application, nobody assigns: first qualified claim wins.
 *
 * Location is asked for on this screen only, with a one-line reason, and is
 * never read in the background. Declining keeps the page usable: the list
 * falls back to Galway-wide, sorted by pay.
 */

const RADII = [2, 5, 10, 25] as const;
const CATEGORY_CHIPS = SKILL_GROUPS.map((g) => ({ id: g.id, label: g.label }));
const POLL_MS = 20_000;

type WhenFilter = 'any' | 'now' | 'today';

const Find: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sessionOk, setSessionOk] = useState<boolean | null>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locState, setLocState] = useState<'idle' | 'asking' | 'ok' | 'denied'>('idle');
  const [q, setQ] = useState('');
  const [when, setWhen] = useState<WhenFilter>('any');
  const [category, setCategory] = useState<string | null>(null);
  const [minEuro, setMinEuro] = useState(0);
  const [radius, setRadius] = useState<number>(5);
  const [orders, setOrders] = useState<OpenOrder[] | null>(null);
  const [eligible, setEligible] = useState<boolean>(true);
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => { setMode('helper'); }, []);

  // Session gate: /student-account mints one after the phone code.
  useEffect(() => {
    void hasSupabaseSession().then((ok) => {
      setSessionOk(ok);
      if (!ok) navigate('/student-account?next=/find', { replace: true });
    });
  }, [navigate]);

  const askLocation = useCallback(async () => {
    setLocState('asking');
    try {
      const p = await getCurrentPosition({ enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 });
      setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
      setLocState('ok');
    } catch {
      setLocState('denied');
    }
  }, []);

  // Ask once on first open — with the reason card above already visible.
  useEffect(() => { if (sessionOk) void askLocation(); }, [sessionOk, askLocation]);

  const load = useCallback(async (quiet = false) => {
    if (!sessionOk) return;
    if (!quiet) setLoading(true);
    try {
      const r = await findOpenOrders({
        ...(pos ? { lat: pos.lat, lng: pos.lng } : {}),
        radius_km: pos ? radius : 50,
        ...(q.trim() ? { q: q.trim() } : {}),
        ...(category ? { category } : {}),
        ...(minEuro > 0 ? { min_cents: minEuro * 100 } : {}),
        when,
      });
      setOrders(r.orders);
      setEligible(r.eligible);
      setReason(r.reason ?? null);
    } catch (e) {
      if (!quiet) toast({ title: "Couldn't load orders", description: e instanceof Error ? e.message : 'Try again in a moment', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [sessionOk, pos, radius, q, category, minEuro, when, toast]);

  // Refetch on filter change (search debounced) + a gentle poll while visible.
  useEffect(() => {
    const t = window.setTimeout(() => void load(), q ? 250 : 0);
    return () => window.clearTimeout(t);
  }, [load, q]);
  useEffect(() => {
    let id: number | null = null;
    const start = () => { if (id === null) id = window.setInterval(() => void load(true), POLL_MS); };
    const stop = () => { if (id !== null) { window.clearInterval(id); id = null; } };
    const onVis = () => (document.visibilityState === 'visible' ? start() : stop());
    onVis();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

  const pick = (id: string) => {
    setActiveId(id);
    cardRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const claim = async (o: OpenOrder) => {
    if (claiming) return;
    haptic(12);
    setClaiming(o.id);
    try {
      const r = await claimOrder(o.id, pos);
      if (r.status === 'claimed' || r.status === 'mine') {
        haptic(20);
        navigate(`/student-job/${o.id}?claimed=1`);
        return;
      }
      if (r.status === 'not_eligible') {
        toast({ title: 'Verify your ID first', description: 'A free 2-minute check unlocks claiming.' });
        navigate('/verify-helper');
        return;
      }
      toast({ title: r.status === 'taken' ? 'Someone got there first' : 'That order is gone', description: 'Here are the others near you.' });
      setOrders((prev) => (prev ?? []).filter((x) => x.id !== o.id));
    } catch (e) {
      toast({ title: "Couldn't claim", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setClaiming(null);
    }
  };

  const visible = orders ?? [];
  const nextRadius = useMemo(() => RADII.find((r) => r > radius) ?? null, [radius]);

  if (sessionOk === null) return <div className="min-h-[100dvh] bg-cream" />;

  return (
    <div className="min-h-[100dvh] bg-cream pb-24">
      <SEOHead title="Find jobs near you — VANO" description="Open orders near you. Claim one and go." url="https://vanojobs.com/find" noindex />

      {/* Sticky search + filters */}
      <div className="sticky top-0 z-30 bg-cream/95 backdrop-blur-xl border-b border-border/50 px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-3">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-2.5">
            <h1 className="display-lg text-[26px] text-foreground">Find jobs</h1>
            {locState === 'ok' && pos && (
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-sage-dark"><Navigation className="w-3.5 h-3.5" /> Near you</span>
            )}
          </div>
          <label className="relative block">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" aria-hidden="true" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="cleaning tonight, dog walk Salthill…"
              aria-label="Search open orders"
              className="w-full h-12 rounded-full bg-white border border-border pl-10 pr-4 text-base text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <div className="mt-2.5 flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-0.5">
            {(['any', 'now', 'today'] as WhenFilter[]).map((w) => (
              <Chip key={w} active={when === w} onClick={() => { haptic(6); setWhen(w); }}>{w === 'any' ? 'Any time' : w === 'now' ? 'Now' : 'Today'}</Chip>
            ))}
            <span className="w-px bg-border/70 my-1 flex-shrink-0" aria-hidden="true" />
            {CATEGORY_CHIPS.map((c) => (
              <Chip key={c.id} active={category === c.id} onClick={() => { haptic(6); setCategory(category === c.id ? null : c.id); }}>{c.label}</Chip>
            ))}
            <span className="w-px bg-border/70 my-1 flex-shrink-0" aria-hidden="true" />
            <Chip active={minEuro > 0} onClick={() => { haptic(6); setMinEuro(minEuro >= 60 ? 0 : minEuro + 20); }}>{minEuro > 0 ? `€${minEuro}+` : 'Any pay'}</Chip>
            {pos && (
              <Chip active={false} onClick={() => { haptic(6); setRadius(RADII[(RADII.indexOf(radius as typeof RADII[number]) + 1) % RADII.length]); }}>{radius} km</Chip>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-lg mx-auto">
        {/* Location reason / fallback */}
        {locState !== 'ok' && (
          <div className="mx-4 mt-3 rounded-2xl border border-black/5 bg-white p-4 surface-float">
            <p className="text-sm font-semibold text-foreground flex items-center gap-2"><MapPin className="w-4 h-4 text-sage" aria-hidden="true" /> Jobs near you</p>
            <p className="mt-1 text-[13px] text-muted-foreground leading-relaxed">
              {locState === 'denied'
                ? "Location is off, so this is everything open in Galway, best-paid first. Turn it on in Settings to sort by distance."
                : 'Your location is used only while this screen is open, to show the closest orders first. Never in the background.'}
            </p>
            {locState !== 'asking' && locState !== 'denied' && (
              <button type="button" onClick={() => void askLocation()} className="mt-3 inline-flex h-10 items-center gap-2 rounded-full bg-sage px-4 text-sm font-semibold text-white active:scale-[0.98]">
                <Navigation className="w-4 h-4" /> Use my location
              </button>
            )}
          </div>
        )}

        {/* Eligibility */}
        {!eligible && reason && (
          <div className="mx-4 mt-3 rounded-2xl border border-gold/50 bg-amber-50/70 p-4">
            <p className="text-sm font-semibold text-foreground flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-gold" aria-hidden="true" /> {reason === 'not_verified' ? 'Verify your ID to claim' : reason === 'not_approved' ? 'Your account is being reviewed' : 'Sign in as a helper to claim'}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">You can see what's open. {reason === 'not_verified' ? 'A free 2-minute ID check unlocks the claim button.' : ''}</p>
            {reason === 'not_verified' && (
              <button type="button" onClick={() => navigate('/verify-helper')} className="mt-3 h-10 rounded-full bg-sage px-4 text-sm font-semibold text-white active:scale-[0.98]">Verify now</button>
            )}
          </div>
        )}

        {/* Map */}
        <div className="mt-3 mx-4 overflow-hidden rounded-2xl border border-black/5 bg-white surface-float">
          <Suspense fallback={<div className="shimmer h-[240px] bg-secondary" />}>
            <OrderMap orders={visible} me={pos} activeId={activeId} onPick={pick} height={240} />
          </Suspense>
        </div>

        {/* List */}
        <section className="px-4 mt-4" aria-live="polite">
          <p className="eyebrow mb-3">{loading && orders === null ? 'Looking…' : `${visible.length} open ${visible.length === 1 ? 'order' : 'orders'}${pos ? ` within ${radius} km` : ' in Galway'}`}</p>
          {orders === null ? (
            <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="shimmer h-[128px] rounded-2xl bg-white border border-black/5" />)}</div>
          ) : visible.length === 0 ? (
            <div className="rounded-2xl border border-black/5 bg-white p-6 text-center surface-float">
              <p className="text-base font-semibold text-foreground">No orders {pos ? `in ${radius} km` : 'right now'}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{q ? 'Try fewer words, or ' : ''}new jobs land here the moment they're posted.</p>
              {pos && nextRadius && (
                <button type="button" onClick={() => { haptic(8); setRadius(nextRadius); }} className="mt-4 h-11 rounded-full bg-sage px-5 text-sm font-semibold text-white active:scale-[0.98]">Expand to {nextRadius} km</button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {visible.map((o, i) => (
                <motion.div
                  key={o.id}
                  ref={(el) => { cardRefs.current[o.id] = el; }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 6) * 0.04, duration: 0.3 }}
                  className={cn('rounded-2xl border bg-white p-4 surface-float transition-colors', o.id === activeId ? 'border-sage/60' : 'border-black/5')}
                  onClick={() => setActiveId(o.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold text-foreground leading-snug">{o.label}</p>
                      <p className="mt-0.5 text-[13px] text-muted-foreground">
                        {o.when_label} · {o.area}{formatKm(o.distance_km) ? ` · ${formatKm(o.distance_km)}` : ''}{o.size_label ? ` · ${o.size_label}` : ''}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xl font-extrabold text-foreground tabular-nums">{formatEuro(o.earn_cents)}</p>
                      <p className="text-[11px] font-semibold text-sage-dark">You keep 100%</p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                    {o.customer_rep?.stars ? <span className="inline-flex items-center gap-1"><Star className="w-3 h-3 fill-gold text-gold" aria-hidden="true" /> {o.customer_rep.stars.toFixed(1)}{o.customer_rep.paid_jobs ? ` · ${o.customer_rep.paid_jobs} paid` : ''}</span> : null}
                    {o.customer_rep?.unpaid_reports ? <span className="text-destructive font-semibold">⚠ {o.customer_rep.unpaid_reports} unpaid report{o.customer_rep.unpaid_reports > 1 ? 's' : ''}</span> : null}
                    {o.kit_required.length > 0 && <span className="inline-flex items-center gap-1"><Wrench className="w-3 h-3" aria-hidden="true" /> Bring {o.kit_required.join(', ').replace(/-/g, ' ')}</span>}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); void claim(o); }}
                    disabled={!eligible || claiming !== null}
                    className="mt-3 h-12 w-full rounded-full bg-sage text-[15px] font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 transition-[transform,opacity]"
                  >
                    {claiming === o.id ? <><Loader2 className="w-4 h-4 animate-spin" /> Claiming…</> : eligible ? 'Claim this job' : 'Verify to claim'}
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

const Chip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      'h-9 flex-shrink-0 rounded-full px-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors duration-150 active:scale-[0.97]',
      active ? 'bg-foreground text-white' : 'bg-white border border-border text-foreground/70',
    )}
  >
    {children}
  </button>
);

export default Find;
