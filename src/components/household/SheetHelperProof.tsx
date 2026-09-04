import React, { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { boundedPhotoUrl } from '@/lib/boundedPhoto';

/**
 * Reassurance inside the booking sheet: a few REAL approved, ID-verified
 * helper faces + the 4-digit-code-at-the-door promise, right by the money line.
 *
 * Honesty rules (same as HelperFacePile — never invent a student):
 *  - Renders NOTHING until there are real approved helpers with photos.
 *  - Only says "ID-verified" when the shown faces actually are id_verified;
 *    otherwise it shows real faces and drops the claim.
 *  - It does NOT claim per-job matching — dispatch decides who actually gets
 *    the job. This is "students like these", stated honestly.
 */

interface Face { id: string; name: string; photo_url: string }
const firstName = (n: string) => (n || '').trim().split(/\s+/)[0] || '';

const base = () =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase as any)
    .from('household_helpers')
    .select('id, name, photo_url')
    .eq('status', 'approved')
    .eq('show_on_homepage', true)
    .not('photo_url', 'is', null)
    .neq('photo_url', '');

export const SheetHelperProof: React.FC = () => {
  const [faces, setFaces] = useState<Face[]>([]);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const bound = (rows: Face[]) =>
      Promise.all(rows.map(async f => ({
        ...f,
        photo_url: (await boundedPhotoUrl(f.photo_url, 128)) ?? f.photo_url,
      })));
    (async () => {
      // Prefer ID-verified faces; fall back to approved (drop the claim).
      const v = await base().eq('id_verified', true).limit(3);
      if (cancelled) return;
      if (v.data && v.data.length > 0) {
        const safe = await bound(v.data as Face[]);
        if (!cancelled) { setFaces(safe); setVerified(true); }
        return;
      }
      const a = await base().limit(3);
      if (cancelled) return;
      if (a.data && a.data.length > 0) {
        const safe = await bound(a.data as Face[]);
        if (!cancelled) setFaces(safe);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (faces.length === 0) return null; // honesty: no real faces → show nothing

  const names = faces.map(f => firstName(f.name)).filter(Boolean);
  const nameLine =
    names.length >= 2 ? `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}` : names[0];

  return (
    <div className="rounded-2xl border border-border bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex -space-x-2 flex-shrink-0">
          {faces.map(f => (
            <img
              key={f.id}
              src={f.photo_url}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-8 w-8 rounded-full border-2 border-white object-cover object-[center_20%]"
            />
          ))}
        </div>
        <p className="text-[13px] leading-snug text-foreground/80">
          <span className="font-semibold text-foreground">{nameLine}</span>
          {verified ? ' and other ID-verified students' : ' and other students'} could take this.
        </p>
      </div>
      <p className="mt-2.5 flex items-center gap-1.5 text-[12.5px] font-medium text-sage-dark">
        <KeyRound className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        They’ll show you a 4-digit code at your door before they start.
      </p>
    </div>
  );
};
