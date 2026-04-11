import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
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
        /* Plus Jakarta Sans — close to typical social / carousel branding; swap if you export an exact font from IG */
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
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
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        "zoom-in": {
          "0%": {
            transform: "scale(1.05)"
          },
          "100%": {
            transform: "scale(1)"
          }
        },
        "fade-zoom-in": {
          "0%": {
            opacity: "0",
            transform: "scale(1.1)"
          },
          "100%": {
            opacity: "1",
            transform: "scale(1)"
          }
        },
        "fade-in": {
          "0%": {
            opacity: "0",
            transform: "translateY(10px)"
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0)"
          }
        },
        "slide-in-right": {
          "0%": {
            transform: "translateX(100%)"
          },
          "100%": {
            transform: "translateX(0)"
          }
        },
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
        "shimmer": {
          "0%": { backgroundPosition: "-200% center" },
          "100%": { backgroundPosition: "200% center" },
        },
        "slide-up-fade": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.92)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(1)", opacity: "0.6" },
          "100%": { transform: "scale(2.5)", opacity: "0" },
        },
        "walk-left": {
          "0%, 100%": { transform: "rotate(-15deg)" },
          "50%": { transform: "rotate(15deg)" },
        },
        "walk-right": {
          "0%, 100%": { transform: "rotate(15deg)" },
          "50%": { transform: "rotate(-15deg)" },
        },
        "arm-swing-left": {
          "0%, 100%": { transform: "rotate(20deg)" },
          "50%": { transform: "rotate(-20deg)" },
        },
        "arm-swing-right": {
          "0%, 100%": { transform: "rotate(-20deg)" },
          "50%": { transform: "rotate(20deg)" },
        },
        "wave": {
          "0%, 100%": { transform: "rotate(-10deg)" },
          "25%": { transform: "rotate(-40deg)" },
          "75%": { transform: "rotate(-5deg)" },
        },
        "celebrate-left": {
          "0%, 100%": { transform: "rotate(-60deg)" },
          "50%": { transform: "rotate(-80deg)" },
        },
        "celebrate-right": {
          "0%, 100%": { transform: "rotate(60deg)" },
          "50%": { transform: "rotate(80deg)" },
        },
        "jump": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "head-bob": {
          "0%, 100%": { transform: "translateY(0) rotate(0deg)" },
          "50%": { transform: "translateY(-3px) rotate(3deg)" },
        },
        "head-tilt": {
          "0%, 100%": { transform: "rotate(0deg)" },
          "50%": { transform: "rotate(8deg)" },
        },
        "think": {
          "0%, 100%": { transform: "rotate(0deg) translateY(0)" },
          "50%": { transform: "rotate(-15deg) translateY(-8px)" },
        },
        "build": {
          "0%, 100%": { transform: "rotate(0deg)" },
          "30%": { transform: "rotate(-30deg)" },
          "60%": { transform: "rotate(5deg)" },
        },
        "sparkle": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.3", transform: "scale(0.6)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-zoom-in": "fade-zoom-in 1s ease-out",
        "fade-in": "fade-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "slide-in-right": "slide-in-right 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "scroll-left": "scroll-left 40s linear infinite",
        "scroll-left-fast": "scroll-left 110s linear infinite",
        "shimmer": "shimmer 4s ease-in-out infinite",
        "shimmer-slow": "shimmer 8s ease-in-out infinite",
        "slide-up-fade": "slide-up-fade 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "scale-in": "scale-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "pulse-ring": "pulse-ring 2s cubic-bezier(0, 0, 0.2, 1) infinite",
        "float": "float 6s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
