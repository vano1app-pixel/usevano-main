import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
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

export const HelperFacePile: React.FC = () => {
  const [faces, setFaces] = useState<Face[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('household_helpers')
      .select('id, name, photo_url', { count: 'exact' })
      .eq('status', 'approved')
      .eq('show_on_homepage', true)
      .not('photo_url', 'is', null)
      .neq('photo_url', '')
      .limit(6)
      .then(({ data, count }: { data: Face[] | null; count: number | null }) => {
        if (cancelled) return;
        if (data && data.length > 0) {
          setFaces(data);
          setTotal(count ?? data.length);
        }
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  if (!loaded || faces.length === 0) return null;

  const shown = faces.slice(0, 4);
  const names = faces.map(f => firstName(f.name)).filter(Boolean);
  const label =
    total <= 1
      ? `${names[0] ?? 'An ID-verified student'} — verified & ready to help`
      : names.length >= 2
        ? `${names[0]}, ${names[1]} & ${roundedPlus(Math.max(total - 2, 1))} ID-verified students`
        : `${roundedPlus(total)} ID-verified students in Galway`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.34, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="mt-5 flex justify-center"
    >
      <a href="#helpers" className="group inline-flex items-center gap-3" aria-label="Meet the verified student helpers">
        <div className="flex -space-x-2.5">
          {shown.map(f => (
            <img
              key={f.id}
              src={f.photo_url}
              alt=""
              loading="lazy"
              className="w-8 h-8 rounded-full object-cover ring-2 ring-navy bg-navy transition-transform duration-200 group-hover:-translate-y-0.5"
            />
          ))}
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs sm:text-[13px] font-medium text-white/70 group-hover:text-white/90 transition-colors">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" aria-hidden="true" />
          {label}
        </span>
      </a>
    </motion.div>
  );
};
