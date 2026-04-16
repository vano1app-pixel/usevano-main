import React, { useEffect, useState } from 'react';
import { StudentCard } from './StudentCard';
import { supabase } from '@/integrations/supabase/client';
import { COMMUNITY_CATEGORIES, type CommunityCategoryId } from '@/lib/communityCategories';

/**
 * Thin wrapper that turns the wizard's live form state into a synthetic
 * StudentProfile object and renders the real StudentCard with
 * `demoExample={true}` so clicks and hire modals are disabled.
 *
 * Owns a single fetch of the user's `profiles` row (display_name, avatar_url)
 * on mount — those two fields aren't collected by the wizard, they come from
 * the existing profile set up at sign-up or in /profile. Cached in local
 * state; never re-fetched during the wizard session.
 *
 * Every other prop is a live wizard value passed through, so the card
 * updates keystroke-by-keystroke without any special plumbing.
 */
interface StudentCardPreviewProps {
  userId: string;
  category: CommunityCategoryId | null;
  bannerUrl?: string;
  title?: string;
  description?: string;
  skills?: string[];
  serviceArea?: string;
  university?: string;
  /** Hourly rate as a free-form string — parsed defensively. */
  hourlyRate?: string;
  rateMin?: string;
  rateMax?: string;
  tiktokUrl?: string;
  instagramUrl?: string;
  linkedinUrl?: string;
  websiteUrl?: string;
  /** If true, renders at a compact width suited to the mobile pull-down. */
  compact?: boolean;
}

function toNumberOrZero(s: string | undefined): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function toNumberOrNull(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export const StudentCardPreview: React.FC<StudentCardPreviewProps> = ({
  userId,
  category,
  bannerUrl,
  title,
  description,
  skills,
  serviceArea,
  university,
  hourlyRate,
  rateMin,
  rateMax,
  tiktokUrl,
  instagramUrl,
  linkedinUrl,
  websiteUrl,
  compact,
}) => {
  const [displayName, setDisplayName] = useState<string>('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled) return;
      setDisplayName((data?.display_name as string | null) ?? '');
      setAvatarUrl((data?.avatar_url as string | null) ?? '');
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Build the synthetic profile object. Empty/missing fields are filled with
  // soft placeholders so the card never collapses mid-edit. The card itself
  // already handles `bio` wrapping, skill overflow, and missing rates.
  const synthetic = {
    id: userId,
    user_id: userId,
    bio: (description && description.trim()) || (title && title.trim()) || 'Your pitch will appear here as you type.',
    skills: skills && skills.length > 0 ? skills : [],
    hourly_rate: toNumberOrZero(hourlyRate),
    is_available: true,
    avatar_url: avatarUrl,
    banner_url: bannerUrl || null,
    service_area: serviceArea || null,
    typical_budget_min: toNumberOrNull(rateMin),
    typical_budget_max: toNumberOrNull(rateMax),
    university: university || null,
    student_verified: false,
    tiktok_url: tiktokUrl || null,
    instagram_url: instagramUrl || null,
    linkedin_url: linkedinUrl || null,
    website_url: websiteUrl || null,
  };

  const categoryLabel = category ? COMMUNITY_CATEGORIES[category].label : undefined;

  return (
    <div className={compact ? 'max-w-[16rem]' : undefined}>
      <StudentCard
        student={synthetic}
        displayName={displayName || 'Your name'}
        demoExample
        category={categoryLabel}
        profileAvatarUrl={avatarUrl || null}
      />
    </div>
  );
};
