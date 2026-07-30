#!/usr/bin/env python3
"""
Regenerate public/og.png — the 1200×630 OpenGraph / Twitter Card image every
scraper uses for the link preview of vanojobs.com (LinkedIn, WhatsApp,
Facebook, iMessage, Slack…).

    pip3 install Pillow
    python3 scripts/generate-og-image.py

Commit the resulting public/og.png.

── 2026-07-30 rewrite ────────────────────────────────────────────────────
This script had been left behind twice over. It still generated the DELETED
freelancer marketplace's card — blue #2563eb, "Any brief. Any budget.",
"Hand-picked freelancers in 60 seconds" — while the committed PNG was a
near-black navy gradient nobody could regenerate from here. Neither looked
like the site, which is warm cream with navy display headings.

So a link to vanojobs.com previewed as a dark, generic, slightly stale
product. That is the first impression on every share, and it was the only
place on the internet still showing the old brand.

Now it matches the real design language (see CLAUDE.md "Design language"):
cream page, navy display headings in Bricolage Grotesque, sage as the one
accent, gold used sparingly, tick-eyebrow above the wordmark.

RE-RUN THIS when the headline, the live category tiles or the entry price
change — the card is the one brand surface with no runtime, so it goes stale
silently. The category list and price below are mirrors, not sources: the
truth lives in CategoryGrid's CATEGORIES and src/lib/householdPricing.ts.
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

W, H = 1200, 630

# ── Brand palette ─────────────────────────────────────────────────────────
# Straight conversions of the HSL custom properties in src/index.css, so the
# card can never drift from the site's own tokens.
#   --cream 40 30% 97%      --navy 222 30% 12%
#   --sage  119 23% 45%     --sage-dark 119 23% 37%     --gold 43 90% 60%
CREAM     = (250, 248, 245)
NAVY      = (21, 27, 40)
SAGE      = (89, 141, 88)
SAGE_DARK = (73, 116, 73)
GOLD      = (245, 193, 61)
MUTED     = (110, 116, 128)

# ── Copy ──────────────────────────────────────────────────────────────────
# The live quick-book tiles, in grid order. Moving / Business / Tutoring are
# PARKED (see CLAUDE.md) — the old card still advertised Moving, Groceries and
# Tutoring, none of which a customer can book.
CATEGORIES = 'Cleaning · Pets · Garden · Laundry'
# The site-wide anchor: a 30-minute dog walk is €15 (householdPricing.ts).
FROM_PRICE = 'from €15'
HEADLINE_1 = 'Same-day help,'
HEADLINE_2 = 'booked in seconds.'
EYEBROW    = 'SAME-DAY HOME HELP · GALWAY'
TRUST      = 'ID-verified students · You only pay when one accepts'


def font(paths, size):
    """First font that actually exists, else Pillow's default so the script
    never dies on a box without the brand faces installed."""
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default(size)


# Bricolage Grotesque is the site's display face and ships in the repo's
# design-references bundle (SIL OFL). DejaVu is the fallback on a bare box.
BRICOLAGE_BOLD = [
    'design-references/ui-ux-pro-max/.claude/skills/ui-styling/canvas-fonts/BricolageGrotesque-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
]
SANS_BOLD = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']
SANS      = ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']

display   = font(BRICOLAGE_BOLD, 88)
wordmark  = font(BRICOLAGE_BOLD, 44)
eyebrow_f = font(SANS_BOLD, 20)
body      = font(SANS, 30)
small     = font(SANS, 24)
pill_f    = font(SANS_BOLD, 30)

img = Image.new('RGB', (W, H), CREAM)
draw = ImageDraw.Draw(img, 'RGBA')

# Ambient washes — the site's cream is never flat. Painted on their OWN layer
# and heavily blurred before compositing: stacking translucent ellipses
# straight onto the canvas leaves visible concentric banding, which is exactly
# the tell that makes a card look generated rather than designed.
glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
gdraw = ImageDraw.Draw(glow)
# Sage, bottom-left — the tint the floating cards sit on.
for radius, alpha in [(420, 14), (300, 18), (200, 22)]:
    gdraw.ellipse((-radius + 120, H - radius + 60, radius + 120, H + radius + 60),
                  fill=(*SAGE, alpha))
# Gold, top-right — the single accent, used sparingly.
for radius, alpha in [(300, 18), (210, 24), (140, 30)]:
    gdraw.ellipse((W - radius - 90, -radius + 60, W - 90 + radius, radius + 60),
                  fill=(*GOLD, alpha))
glow = glow.filter(ImageFilter.GaussianBlur(90))
img = Image.alpha_composite(img.convert('RGBA'), glow).convert('RGB')
draw = ImageDraw.Draw(img, 'RGBA')

# ── Wordmark + tick eyebrow (the .eyebrow signature: tick, tracked caps) ──
draw.text((80, 62), 'VANO', fill=NAVY, font=wordmark)
tick_x, tick_y = 80, 128
draw.line([(tick_x, tick_y + 8), (tick_x + 6, tick_y + 14), (tick_x + 17, tick_y)],
          fill=SAGE, width=4, joint='curve')
draw.text((tick_x + 28, tick_y - 3), ' '.join(EYEBROW), fill=SAGE_DARK, font=eyebrow_f)

# ── "from €15" pill, top-right — gold border, cream fill, navy text ───────
pill_w, pill_h = 196, 62
pill_x, pill_y = W - 80 - pill_w, 62
draw.rounded_rectangle((pill_x, pill_y, pill_x + pill_w, pill_y + pill_h),
                       radius=pill_h // 2, fill=(255, 255, 255), outline=GOLD, width=3)
pw = draw.textlength(FROM_PRICE, font=pill_f)
draw.text((pill_x + (pill_w - pw) / 2, pill_y + 14), FROM_PRICE, fill=NAVY, font=pill_f)

# ── Headline — navy, then sage for the payoff line ───────────────────────
draw.text((80, 250), HEADLINE_1, fill=NAVY, font=display)
draw.text((80, 348), HEADLINE_2, fill=SAGE_DARK, font=display)

# ── Live categories ──────────────────────────────────────────────────────
draw.text((80, 470), CATEGORIES, fill=MUTED, font=body)

# ── Footer: sage dot + domain, trust line right-aligned ──────────────────
draw.ellipse((80, 552, 94, 566), fill=SAGE)
draw.text((106, 545), 'vanojobs.com', fill=NAVY, font=body)
tw = draw.textlength(TRUST, font=small)
draw.text((W - 80 - tw, 551), TRUST, fill=MUTED, font=small)

out_path = 'public/og.png'
img.save(out_path, 'PNG', optimize=True)
print(f'Wrote {out_path}: {img.size}')
