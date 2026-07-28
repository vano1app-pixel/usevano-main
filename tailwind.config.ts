import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";
import typography from "@tailwindcss/typography";

/**
 * VANO color-role codex
 * ─────────────────────
 * Every new UI component should pick colors based on what the color MEANS,
 * not what looks nice in isolation. Users subconsciously learn these roles
 * within 1–2 sessions and move faster because of them.
 *
 *   primary (sage)   → THE action + trust colour. Book / Continue / Save,
 *                      verification badges, safety items. Exactly ONE primary
 *                      button per card / form.
 *   navy             → Hero + footer bands, display headings, high-contrast
 *                      anchors, tinted backdrops/shadows.
 *   gold             → The single accent: star ratings, "most booked" crown,
 *                      focus halos, the booking-lookup button. Sparingly.
 *   cream            → The page. Warm base everywhere (never pure white pages).
 *   express-orange   → Express / urgent tier only.
 *   emerald          → Success + live signals: online dots, "booking received",
 *                      success toasts.
 *   amber            → Warnings-to-act and honest heads-ups (skip-verify card,
 *                      photo-quality notes).
 *   destructive/rose → Destructive actions ONLY (cancel booking, delete
 *                      account, unpaid strikes). Never for prompts or nudges.
 *   muted / secondary → Supporting UI: Back, Cancel, borders, body copy.
 */
export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  // Mobile Safari is the primary real-world device: without this, every
  // `hover:` style fires as a STICKY hover on tap (lifted cards + shadows
  // that stay stuck after the finger leaves). This compiles all hover:
  // variants inside @media (hover:hover) — same pattern index.css already
  // hand-writes for .tile-float.
  future: { hoverOnlyWhenSupported: true },
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        /* Bricolage Grotesque — warm, slightly irregular grotesque. Used for hero/display headings only. */
        display: ['"Bricolage Grotesque"', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        sage: {
          DEFAULT: "hsl(var(--sage))",
          light: "hsl(var(--sage-light))",
          dark: "hsl(var(--sage-dark))",
        },
        navy:            "hsl(var(--navy))",
        gold:            "hsl(var(--gold))",
        cream:           "hsl(var(--cream))",
        "express-orange": "hsl(var(--express-orange))",
        whatsapp:        "hsl(var(--whatsapp))",
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-quint': 'cubic-bezier(0.23, 1, 0.32, 1)',
        'in-out-smooth': 'cubic-bezier(0.77, 0, 0.175, 1)',
        'drawer': 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      // Only the keyframes with live call sites. The old mascot family
      // (walk/wave/celebrate/…) and the marketplace-era entrances were dead
      // config that misled new work; framer-motion or index.css own the rest.
      // NOTE: the `shimmer` keyframes live in index.css (a translateX sweep) —
      // the config used to define a colliding backgroundPosition version,
      // which fought the .shimmer skeleton + the "most booked" badge sweep.
      keyframes: {
        "scroll-left": {
          "0%": {
            transform: "translate3d(0, 0, 0)"
          },
          "100%": {
            transform: "translate3d(-50%, 0, 0)"
          }
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px)" },
        },
      },
      animation: {
        "scroll-left": "scroll-left 40s linear infinite",
        "float": "float 6s ease-in-out infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate, typography],
} satisfies Config;
