#!/usr/bin/env python3
"""
Regenerate public/og.png — the 1200×630 OpenGraph / Twitter Card
image every scraper uses for a social-share preview of the site.

Run on any box with Pillow installed:

    pip3 install Pillow
    python3 scripts/generate-og-image.py

Re-run whenever the headline copy or brand colours shift so the
preview card stays in sync. Commit the resulting public/og.png.

Why a script, not a runtime/edge function:
- We only have one OG image right now (one hero promise, one brand).
  A dynamic per-page OG route would be overkill and needs a Vercel
  edge function. Regenerate on demand, commit the PNG.
- A hand-designed PNG exported from Figma would look nicer but
  introduces a manual re-export step whenever copy changes. This
  gets us reproducibility; swap in a Figma-sourced PNG any time.
"""

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630

# Brand colours — tailwind.config.ts --primary is hsl(221 83% 53%)
# which matches #2563eb. Darker variant for the bottom-of-card
# gradient, amber accent for the italic line + ambient blob.
PRIMARY = (37, 99, 235)
PRIMARY_DARK = (29, 78, 216)
AMBER = (252, 211, 77)
WHITE = (255, 255, 255)
WHITE_MUTED = (255, 255, 255, 200)

img = Image.new('RGB', (W, H), PRIMARY)
draw = ImageDraw.Draw(img, 'RGBA')

# Vertical linear gradient — subtle but breaks the flatness.
for i in range(H):
    ratio = i / H
    r = int(PRIMARY[0] * (1 - ratio) + PRIMARY_DARK[0] * ratio)
    g = int(PRIMARY[1] * (1 - ratio) + PRIMARY_DARK[1] * ratio)
    b = int(PRIMARY[2] * (1 - ratio) + PRIMARY_DARK[2] * ratio)
    draw.line([(0, i), (W, i)], fill=(r, g, b))

# Soft amber blob top-right — mirrors the site's primary-card glow.
for radius, alpha in [(260, 24), (210, 40), (160, 64)]:
    bbox = (W - radius - 120, -radius + 80, W - 120 + radius, radius + 80)
    draw.ellipse(bbox, fill=(*AMBER, alpha))

# Fonts — DejaVu Sans is the most commonly-available Linux font and
# reads cleanly at these sizes. Swap for Plus Jakarta Sans (the
# site's display face) if running this locally with it installed.
try:
    bold = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 72)
    bold_small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 28)
    regular = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 32)
    wordmark = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 40)
except Exception:
    bold = ImageFont.load_default()
    bold_small = ImageFont.load_default()
    regular = ImageFont.load_default()
    wordmark = ImageFont.load_default()

# VANO wordmark (top-left) + eyebrow
draw.text((80, 60), 'VANO', fill=WHITE, font=wordmark)
draw.text((80, 115), 'HIRE · BE HIRED · PAY SAFELY', fill=(255, 255, 255, 200), font=bold_small)

# Headline — echoes the Landing hero. The italic-primary-gradient
# second line on the site becomes a solid amber line here because
# italic renders poorly at card sizes and amber is unambiguous.
draw.text((80, 250), 'Any brief. Any budget.', fill=WHITE, font=bold)
draw.text((80, 335), 'Your perfect match.', fill=AMBER, font=bold)

# Sub-copy
draw.text((80, 440), 'Hand-picked freelancers in 60 seconds.', fill=WHITE_MUTED[:3], font=regular)
draw.text((80, 480), 'Paid safely through Vano.', fill=WHITE_MUTED[:3], font=regular)

# URL footer
draw.text((80, 545), 'vanojobs.com', fill=(255, 255, 255, 170), font=regular)

out_path = 'public/og.png'
img.save(out_path, 'PNG', optimize=True)
print(f'Wrote {out_path}: {img.size}')
