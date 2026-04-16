import React from 'react';
import { Star } from 'lucide-react';
import { TagBadge } from './TagBadge';
import { freelancerGradient, NOISE_BG_IMAGE } from '@/lib/categoryGradient';

/**
 * Square 1080×1080 share frame used by the "Share card" button on /profile.
 *
 * We intentionally build this as a self-contained render rather than reusing
 * the full `StudentCard` component: the card has hover states, click
 * handlers, optional admin controls, and hire modals — all pointless in a
 * static image export, and some (like hover state) would never fire during
 * the `html-to-image` capture anyway, but the DOM bloat slows the capture
 * and risks quirks. This component renders only the visible card surface
 * plus Vano branding.
 *
 * The node is rendered off-screen (position:fixed, left:-9999px) when the
 * share flow starts so `html-to-image` can read its dimensions. It's
 * unmounted as soon as the PNG is produced.
 */
export interface ShareCardFrameProps {
  displayName: string;
  bannerUrl?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  skills?: string[];
  categoryLabel?: string;
  /** One of the CommunityCategoryId values, used for the fallback banner gradient. */
  categoryId?: string | null;
  hourlyRate?: number | null;
  budgetLabel?: string | null;
  serviceArea?: string | null;
  avgRating?: string | null;
  reviewCount?: number;
  /** Already formatted for display (e.g. "vano.app/u/saoirse-doherty"). */
  profileUrl: string;
}

export const ShareCardFrame = React.forwardRef<HTMLDivElement, ShareCardFrameProps>(
  (
    {
      displayName,
      bannerUrl,
      avatarUrl,
      bio,
      skills,
      categoryLabel,
      categoryId,
      hourlyRate,
      budgetLabel,
      serviceArea,
      avgRating,
      reviewCount,
      profileUrl,
    },
    ref,
  ) => {
    const showRate = typeof hourlyRate === 'number' && hourlyRate > 0;
    const visibleSkills = (skills ?? []).slice(0, 5);
    const gradient = freelancerGradient(categoryId ?? undefined);

    return (
      <div
        ref={ref}
        // Inline sizing because html-to-image reads computed dimensions, and
        // Tailwind JIT wouldn't necessarily be guaranteed to purge-safe the
        // square aspect at 1080px. Plain styles are the least surprising.
        style={{
          width: 1080,
          height: 1080,
          backgroundImage:
            'radial-gradient(ellipse 70% 50% at 20% 15%, hsl(221 83% 53% / 0.16), transparent 60%), radial-gradient(ellipse 55% 45% at 85% 80%, hsl(142 76% 36% / 0.12), transparent 60%), linear-gradient(135deg, hsl(0 0% 100%) 0%, hsl(220 14% 96%) 100%)',
          fontFamily: '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif',
          color: '#111827',
        }}
        className="relative overflow-hidden"
      >
        {/* Subtle dot-pattern texture so the background feels designed, not
            generic. Very low opacity. */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: `radial-gradient(#111827 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }}
        />

        {/* Top: VANO wordmark + invitation copy */}
        <div style={{ paddingTop: 72, paddingLeft: 72, paddingRight: 72 }} className="relative">
          <p style={{ fontSize: 30, letterSpacing: '0.32em', fontWeight: 800 }}>VANO</p>
          <p style={{ fontSize: 40, fontWeight: 700, marginTop: 12, lineHeight: 1.15 }}>
            Find me on Vano.
          </p>
          <p style={{ fontSize: 22, color: '#4b5563', marginTop: 8 }}>
            The Galway talent board for freelancers.
          </p>
        </div>

        {/* Middle: the talent card itself, scaled up */}
        <div
          style={{
            position: 'absolute',
            top: 290,
            left: 80,
            right: 80,
            bottom: 200,
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 32,
              overflow: 'hidden',
              background: '#ffffff',
              border: '1px solid rgba(0,0,0,0.06)',
              boxShadow: '0 28px 60px -24px rgba(15,23,42,0.35), 0 8px 16px -8px rgba(15,23,42,0.18)',
            }}
          >
            {/* Banner */}
            <div
              style={{
                position: 'relative',
                height: 240,
                backgroundImage: bannerUrl
                  ? `url(${bannerUrl})`
                  : `${NOISE_BG_IMAGE}, ${gradient}`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              {categoryLabel && (
                <div
                  style={{
                    position: 'absolute',
                    left: 24,
                    bottom: 20,
                    color: '#ffffff',
                    fontSize: 18,
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                    textShadow: '0 2px 6px rgba(0,0,0,0.35)',
                  }}
                >
                  {categoryLabel}
                </div>
              )}
              {showRate && (
                <div
                  style={{
                    position: 'absolute',
                    right: 20,
                    top: 20,
                    background: 'rgba(255,255,255,0.95)',
                    borderRadius: 14,
                    padding: '10px 16px',
                    fontSize: 22,
                    fontWeight: 800,
                    color: '#047857',
                    boxShadow: '0 6px 12px -4px rgba(0,0,0,0.2)',
                  }}
                >
                  €{hourlyRate}/hr
                </div>
              )}
            </div>

            {/* Body */}
            <div style={{ padding: '28px 32px 32px', position: 'relative' }}>
              {/* Avatar overlapping banner */}
              <div
                style={{
                  position: 'absolute',
                  left: 32,
                  top: -44,
                  width: 88,
                  height: 88,
                  borderRadius: '50%',
                  border: '4px solid #ffffff',
                  boxShadow: '0 10px 20px -8px rgba(0,0,0,0.25)',
                  background: avatarUrl
                    ? `url(${avatarUrl}) center/cover`
                    : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  fontSize: 36,
                  fontWeight: 800,
                }}
              >
                {!avatarUrl && (displayName[0]?.toUpperCase() || 'V')}
              </div>

              <div style={{ paddingTop: 56 }}>
                <p style={{ fontSize: 30, fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>
                  {displayName || 'Your name'}
                </p>

                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', color: '#4b5563', fontSize: 18 }}>
                  {avgRating && typeof reviewCount === 'number' && reviewCount > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Star size={18} style={{ color: '#f59e0b', fill: '#f59e0b' }} strokeWidth={0} />
                      <span style={{ fontWeight: 700, color: '#111827' }}>{avgRating}</span>
                      <span>· {reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}</span>
                    </span>
                  )}
                  {serviceArea && (
                    <span>{serviceArea}</span>
                  )}
                  {!showRate && budgetLabel && (
                    <span style={{ color: '#047857', fontWeight: 700 }}>{budgetLabel}</span>
                  )}
                </div>

                {bio && (
                  <p
                    style={{
                      marginTop: 16,
                      fontSize: 20,
                      color: '#374151',
                      lineHeight: 1.45,
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {bio}
                  </p>
                )}

                {visibleSkills.length > 0 && (
                  <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {visibleSkills.map((s) => (
                      <div key={s} style={{ display: 'inline-flex' }}>
                        <TagBadge label={s} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: profile URL pill */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 64,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              background: '#111827',
              color: '#ffffff',
              borderRadius: 999,
              padding: '18px 36px',
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: '0.01em',
              boxShadow: '0 12px 30px -12px rgba(17,24,39,0.5)',
            }}
          >
            {profileUrl}
          </div>
        </div>
      </div>
    );
  },
);

ShareCardFrame.displayName = 'ShareCardFrame';
