import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, type Variants } from 'framer-motion';
import { Star, MapPin, ShieldCheck, ArrowLeft, BadgeCheck } from 'lucide-react';
import { format } from 'date-fns';
import { HouseholdNav } from '@/components/household/HouseholdNav';
import { HouseholdFooter } from '@/components/household/HouseholdFooter';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/integrations/supabase/client';
import { HELPER_CATEGORY_LABELS, AVAILABILITY_SLOTS } from '@/lib/helperCategories';
import { skillLabel } from '@/lib/helperSkills';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hdb = supabase as any;

// Cards cascade in as the profile lands, instead of one flat fade
const cardStagger: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const cardItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show:   { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 440, damping: 32 } },
};

// Count a whole number up from 0 once `run` flips true (e.g. data loaded).
function useCountUp(target: number, run: boolean, duration = 700): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) { setN(0); return; }
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setN(target); return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - start) / duration, 1);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, duration]);
  return n;
}

interface HelperRow {
  id:             string;
  name:           string;
  photo_url:      string | null;
  city:           string;
  age:            number | null;
  bio:            string | null;
  categories:     string[] | null;
  availability:   string[] | null;
  is_available:   boolean;
  accepted_count: number;
  average_rating: number | null;
  rating_avg:     number | null;
  rating_count:   number;
  created_at:     string;
  id_verified:    boolean | null;
  /** email + ID + active plan — the blue tick (DB generated column). */
  vano_verified:  boolean | null;
}

interface ReviewRow {
  rating:     number;
  comment:    string | null;
  created_at: string;
}

function Stars({ value }: { value: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${i < value ? 'fill-gold text-gold' : 'fill-foreground/10 text-foreground/10'}`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="shimmer space-y-4" aria-label="Loading profile">
      <div className="bg-card rounded-3xl border border-border/40 p-6">
        <div className="flex items-center gap-4">
          <div className="w-24 h-24 rounded-2xl bg-secondary" />
          <div className="space-y-2 flex-1">
            <div className="h-5 w-36 bg-secondary rounded-full" />
            <div className="h-3.5 w-24 bg-secondary rounded-full" />
            <div className="h-3.5 w-28 bg-secondary rounded-full" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-6">
          {[0, 1, 2].map(i => <div key={i} className="h-14 bg-secondary rounded-xl" />)}
        </div>
      </div>
      <div className="bg-card rounded-3xl border border-border/40 p-6 h-32" />
    </div>
  );
}

export const HelperPublicProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [helper,   setHelper]   = useState<HelperRow | null>(null);
  const [reviews,  setReviews]  = useState<ReviewRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) { setNotFound(true); setLoading(false); return; }
    let cancelled = false;

    (async () => {
      const { data } = await hdb
        .from('household_helpers')
        .select('id, name, photo_url, city, age, bio, categories, availability, is_available, accepted_count, average_rating, rating_avg, rating_count, created_at, id_verified, vano_verified')
        .eq('id', id)
        .eq('status', 'approved')
        .maybeSingle();

      if (cancelled) return;
      if (!data) { setNotFound(true); setLoading(false); return; }
      setHelper(data as HelperRow);
      setLoading(false);

      const { data: ratings } = await hdb
        .from('household_ratings')
        .select('rating, comment, created_at')
        .eq('helper_id', id)
        .order('created_at', { ascending: false })
        .limit(12);
      if (!cancelled && ratings) setReviews(ratings as ReviewRow[]);
    })();

    return () => { cancelled = true; };
  }, [id]);

  const firstName  = helper?.name.split(' ')[0] ?? '';
  const rating     = helper ? (helper.average_rating ?? helper.rating_avg) : null;
  const cats       = helper?.categories ?? [];
  const slots      = AVAILABILITY_SLOTS.filter(s => helper?.availability?.includes(s.id));
  const written    = reviews.filter(r => r.comment && r.comment.trim().length > 0);
  // Tasks-done counts up once the profile loads
  const tasksDone  = useCountUp(helper?.accepted_count ?? 0, !!helper);

  return (
    <div className="bg-cream min-h-screen flex flex-col">
      <SEOHead
        title={helper ? `${firstName} — VANO helper in ${helper.city}` : 'VANO helper profile'}
        description={helper
          ? `Meet ${firstName}, ${helper.id_verified ? 'an ID-verified' : 'a'} student helper on VANO in ${helper.city}. ${helper.accepted_count} tasks completed. Book same-day home help in minutes.`
          : 'Meet a VANO student helper. Book same-day home help in minutes.'}
        url={`https://vanojobs.com/helpers/${id ?? ''}`}
        type="profile"
        // Deliberately unindexed: these are personal pages (a student's name +
        // photo), they're client-rendered only (crawlers without JS get an
        // empty shell) and they're absent from the sitemap. Customers reach
        // them from the accept email / helper cards, not from Google.
        noindex
      />
      <HouseholdNav />

      <main className="flex-1 pt-24 pb-20 px-4 max-w-xl mx-auto w-full">
        <Link
          to="/home"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-150 mb-5"
        >
          <ArrowLeft className="w-4 h-4" /> Back to VANO
        </Link>

        {loading && <ProfileSkeleton />}

        {!loading && notFound && (
          <div className="bg-card rounded-3xl border border-border/40 shadow-tinted p-10 text-center">
            <span className="text-4xl">🎓</span>
            <h1 className="text-xl font-semibold text-foreground mt-3 mb-1">Helper not found</h1>
            <p className="text-sm text-muted-foreground mb-6">
              This profile doesn't exist or isn't active any more.
            </p>
            <Link
              to="/home"
              className="inline-flex items-center rounded-full bg-primary text-primary-foreground px-6 py-2.5 text-sm font-semibold hover:-translate-y-px transition-transform duration-150"
            >
              Browse helpers →
            </Link>
          </div>
        )}

        {!loading && helper && (
          <motion.div
            variants={cardStagger}
            initial="hidden"
            animate="show"
            className="space-y-4"
          >
            {/* Identity card */}
            <motion.section variants={cardItem} className="bg-card rounded-3xl border border-border/40 shadow-tinted-lg p-6">
              <div className="flex items-center gap-4">
                <div className="w-24 h-24 rounded-2xl overflow-hidden bg-secondary flex-shrink-0">
                  {helper.photo_url ? (
                    <img src={helper.photo_url} alt={helper.name} decoding="async" className="w-full h-full object-cover object-[center_20%]" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-sage bg-sage-light">
                      {firstName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold text-foreground leading-tight flex items-center gap-1.5">
                    <span>
                      {firstName}
                      {helper.age ? <span className="font-normal text-muted-foreground"> · {helper.age}</span> : null}
                    </span>
                    {helper.vano_verified && (
                      <BadgeCheck className="w-6 h-6 fill-sky-500 text-white flex-shrink-0" aria-label="VANO Verified" />
                    )}
                  </h1>
                  <p className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" /> {helper.city}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {/* Only claim ID-verified when it's true — the badge is the
                        product; a false tick would poison every real one. (This
                        used to render unconditionally, doubling up for verified
                        helpers and overclaiming for unverified ones.) */}
                    {helper.id_verified ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sage-light text-sage-dark text-[11px] font-semibold px-2.5 py-1">
                        <ShieldCheck className="w-3 h-3" /> ID-verified by VANO
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-secondary text-foreground/70 text-[11px] font-semibold px-2.5 py-1">
                        🎓 Student helper
                      </span>
                    )}
                    {helper.is_available && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold px-2.5 py-1">
                        <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        </span>
                        Available now
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats — Uber-style trust strip */}
              <div className="grid grid-cols-3 divide-x divide-border/60 rounded-2xl bg-secondary/50 mt-6">
                <div className="py-3.5 text-center">
                  <p className="text-base font-bold text-foreground leading-tight">
                    {rating ? (
                      <span className="inline-flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 fill-gold text-gold" /> {Number(rating).toFixed(1)}
                      </span>
                    ) : 'New'}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                    {helper.rating_count > 0 ? `${helper.rating_count} rating${helper.rating_count === 1 ? '' : 's'}` : 'Rating'}
                  </p>
                </div>
                <div className="py-3.5 text-center flex flex-col items-center justify-center">
                  {helper.accepted_count > 0 ? (
                    <>
                      <p className="text-base font-bold text-foreground leading-tight tabular-nums">{tasksDone}</p>
                      <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                        Task{helper.accepted_count === 1 ? '' : 's'} done
                      </p>
                    </>
                  ) : helper.id_verified ? (
                    /* A brand-new helper has 0 jobs — show vetting credibility
                       instead of a hollow "0" that reads as an empty profile. */
                    <>
                      <ShieldCheck className="w-4 h-4 text-sage" aria-hidden="true" />
                      <p className="text-[11px] text-muted-foreground font-medium mt-1">ID-verified</p>
                    </>
                  ) : (
                    <>
                      <p className="text-base font-bold text-foreground leading-tight">New</p>
                      <p className="text-[11px] text-muted-foreground font-medium mt-0.5">Helper</p>
                    </>
                  )}
                </div>
                <div className="py-3.5 text-center">
                  <p className="text-base font-bold text-foreground leading-tight">
                    {format(new Date(helper.created_at), 'MMM yyyy')}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-medium mt-0.5">Joined</p>
                </div>
              </div>

              {helper.bio && (
                <p className="text-sm text-foreground/80 leading-relaxed mt-5">
                  "{helper.bio}"
                </p>
              )}
            </motion.section>

            {/* What they can help with */}
            {cats.length > 0 && (
              <motion.section variants={cardItem} className="bg-card rounded-3xl border border-border/40 shadow-tinted p-6">
                <p className="eyebrow mb-3">
                  {firstName} can help with
                </p>
                <div className="flex flex-wrap gap-2">
                  {cats.map(slug => (
                    <span key={slug} className="text-xs font-medium bg-secondary text-foreground/80 rounded-full px-3 py-1.5">
                      {HELPER_CATEGORY_LABELS[slug] ?? skillLabel(slug) ?? slug}
                    </span>
                  ))}
                </div>
              </motion.section>
            )}

            {/* Availability */}
            {slots.length > 0 && (
              <motion.section variants={cardItem} className="bg-card rounded-3xl border border-border/40 shadow-tinted p-6">
                <p className="eyebrow mb-3">
                  Usually available
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {slots.map(({ id: slotId, label }) => (
                    <span key={slotId} className="rounded-xl px-3 py-2 text-xs font-medium bg-sage-light text-sage-dark border border-sage/15">
                      {label}
                    </span>
                  ))}
                </div>
              </motion.section>
            )}

            {/* Reviews */}
            {written.length > 0 && (
              <motion.section variants={cardItem} className="bg-card rounded-3xl border border-border/40 shadow-tinted p-6">
                <p className="eyebrow mb-4">
                  What customers say
                </p>
                <ul className="space-y-5">
                  {written.map((r, i) => (
                    <li key={i} className={i > 0 ? 'pt-5 border-t border-border/50' : ''}>
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <Stars value={r.rating} />
                        <span className="text-[11px] text-muted-foreground">
                          {format(new Date(r.created_at), 'd MMM yyyy')}
                        </span>
                      </div>
                      <p className="text-sm text-foreground/80 leading-relaxed">"{r.comment}"</p>
                      <p className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium mt-1.5">
                        <ShieldCheck className="w-3 h-3 flex-shrink-0" /> Verified booking
                      </p>
                    </li>
                  ))}
                </ul>
              </motion.section>
            )}

            {/* Trust note + CTA */}
            <motion.section variants={cardItem} className="bg-sage-light rounded-3xl border border-sage/20 p-6 text-center">
              <ShieldCheck className="w-6 h-6 text-sage mx-auto mb-2" aria-hidden="true" />
              <p className="text-sm text-foreground/80 leading-relaxed max-w-sm mx-auto">
                {helper.id_verified
                  ? `${firstName} has passed photo-ID and selfie verification with Stripe.
                     Not happy with a task? You don't pay.`
                  : `Book through VANO and you're protected — track your helper live, and if
                     you're not happy with a task, you don't pay.`}
                {' '}Accidental damage is covered up to €250 by{' '}
                <Link to="/cover" className="font-semibold underline underline-offset-2 hover:text-foreground transition-colors">Vano Cover</Link>.
              </p>
              <Link
                to="/home#category-grid"
                className="mt-5 inline-flex items-center rounded-full bg-primary text-primary-foreground px-7 py-3 text-sm font-semibold hover:-translate-y-px hover:shadow-primary-glow transition-[transform,box-shadow] duration-150"
              >
                Book a task on VANO →
              </Link>
              <p className="text-[11px] text-muted-foreground mt-3">
                Available helpers near you — like {firstName} — get matched to your booking in minutes.
              </p>
            </motion.section>
          </motion.div>
        )}
      </main>

      <HouseholdFooter />
    </div>
  );
};

export default HelperPublicProfile;
