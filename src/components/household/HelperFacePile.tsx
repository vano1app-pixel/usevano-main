import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Social proof under the hero search bar: a face-pile of REAL approved helpers
 * (same source as the "Meet the helpers" cards — approved, homepage-visible,
 * has a photo) with their first names + a live count.
 *
 * Honesty rule: renders NOTHING until there are real approved helpers with
 * photos — never a fake or placeholder face. The "+N" rounds DOWN to the
 * nearest ten so it can only ever understate how many helpers there are.
 */

interface Face { id: string; name: string; photo_url: string }

const firstName = (n: string) => (n || '').trim().split(/\s+/)[0] || '';
const roundedPlus = (n: number) => (n >= 10 ? `${Math.floor(n / 10) * 10}+` : `${n}`);

const base = () =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase as any)
    .from('household_helpers')
    .select('id, name, photo_url', { count: 'exact' })
    .eq('status', 'approved')
    .eq('show_on_homepage', true)
    .not('photo_url', 'is', null)
    .neq('photo_url', '');

export const HelperFacePile: React.FC = () => {
  const [faces, setFaces] = useState<Face[]>([]);
  const [total, setTotal] = useState(0);
  // Only claim "ID-verified" when the shown helpers actually are. Prefer
  // id_verified helpers; if none are verified yet, still show real approved
  // helpers but drop the verification claim (honesty — never call an unverified
  // helper "ID-verified"). Auto-upgrades once real verifications land.
  const [verified, setVerified] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const v = await base().eq('id_verified', true).limit(6);
      if (cancelled) return;
      if (v.data && v.data.length > 0) {
        setFaces(v.data); setTotal(v.count ?? v.data.length); setVerified(true); setLoaded(true);
        return;
      }
      const a = await base().limit(6);
      if (cancelled) return;
      if (a.data && a.data.length > 0) { setFaces(a.data); setTotal(a.count ?? a.data.length); }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!loaded || faces.length === 0) return null;

  const shown = faces.slice(0, 4);
  const names = faces.map(f => firstName(f.name)).filter(Boolean);
  const noun = verified ? 'ID-verified students' : 'local students in Galway';
  // Never overstate: the "& N" tail only appears when there genuinely are
  // more helpers than the two we name.
  const label =
    total <= 1
      ? `${names[0] ?? 'A student'} — ${verified ? 'ID-verified & ready to help' : 'ready to help in Galway'}`
      : names.length >= 2
        ? (total <= 2
            ? `${names[0]} & ${names[1]} — ${noun}`
            : `${names[0]}, ${names[1]} & ${roundedPlus(total - 2)} ${noun}`)
        : `${roundedPlus(total)} ${noun}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.34, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="mt-3 sm:mt-5 flex justify-center"
    >
      <a href="#helpers" className="group inline-flex items-center gap-3" aria-label="Meet the student helpers">
        <div className="flex -space-x-2.5">
          {shown.map(f => (
            <img
              key={f.id}
              src={f.photo_url}
              alt=""
              loading="lazy"
              className="w-8 h-8 rounded-full object-cover object-[center_20%] ring-2 ring-cream bg-secondary transition-transform duration-200 group-hover:-translate-y-0.5"
            />
          ))}
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs sm:text-[13px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">
          {/* Shield only when the claim is actually "ID-verified" — a MapPin
              otherwise, so the icon never implies verification we don't have. */}
          {verified
            ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" aria-hidden="true" />
            : <MapPin className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" aria-hidden="true" />}
          {label}
        </span>
      </a>
    </motion.div>
  );
};
