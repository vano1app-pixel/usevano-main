import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

/**
 * Weather-aware garden prompt. Checks the next three days for Galway via
 * Open-Meteo (free, no API key) and — only when a genuinely dry day is
 * coming — nudges the visitor to book garden work while the weather holds.
 * Renders nothing while loading, on error, or when it's all rain: the nudge
 * must never lie about the forecast.
 */

interface DryDay {
  label: string; // "today" | "tomorrow" | weekday name
  tempC: number;
}

const CACHE_KEY = 'vano_weather_nudge_v1';
const CACHE_TTL_MS = 60 * 60 * 1000; // forecasts don't move fast — 1 hour
const DRY_THRESHOLD = 35; // max precipitation probability (%) to call it "dry"

// Galway HQ — same anchor as the geo meta tags
const FORECAST_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=53.27&longitude=-9.05' +
  '&daily=precipitation_probability_max,temperature_2m_max' +
  '&timezone=Europe%2FDublin&forecast_days=3';

function dayLabel(isoDate: string, index: number): string {
  if (index === 0) return 'today';
  if (index === 1) return 'tomorrow';
  const d = new Date(`${isoDate}T12:00:00`);
  return d.toLocaleDateString('en-IE', { weekday: 'long' });
}

async function findDryDay(): Promise<DryDay | null> {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      const { at, day } = JSON.parse(cached) as { at: number; day: DryDay | null };
      if (Date.now() - at < CACHE_TTL_MS) return day;
    }
  } catch { /* fall through to fetch */ }

  try {
    const res = await fetch(FORECAST_URL);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      daily?: {
        time?: string[];
        precipitation_probability_max?: (number | null)[];
        temperature_2m_max?: (number | null)[];
      };
    };
    const { time, precipitation_probability_max: rain, temperature_2m_max: temp } = json.daily ?? {};
    if (!time || !rain || !temp) return null;

    let day: DryDay | null = null;
    for (let i = 0; i < time.length; i++) {
      const p = rain[i];
      const t = temp[i];
      if (p != null && t != null && p <= DRY_THRESHOLD) {
        day = { label: dayLabel(time[i], i), tempC: Math.round(t) };
        break;
      }
    }
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), day }));
    } catch { /* private mode — nudge still works this visit */ }
    return day;
  } catch {
    return null;
  }
}

export const WeatherNudge: React.FC = () => {
  const [dry, setDry] = useState<DryDay | null>(null);

  useEffect(() => {
    let cancelled = false;
    findDryDay().then((d) => { if (!cancelled) setDry(d); });
    return () => { cancelled = true; };
  }, []);

  if (!dry) return null;

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      onClick={() => window.dispatchEvent(new CustomEvent('vano:select-category', { detail: { slug: 'garden' } }))}
      className="mt-3.5 w-full rounded-2xl bg-amber-50 border border-amber-200/80 px-4 py-3 flex items-center gap-3 text-left hover:bg-amber-100/70 active:scale-[0.98] transition-[background-color,transform] duration-150"
      aria-label={`Dry weather ${dry.label} — book garden help`}
    >
      <span className="text-xl leading-none flex-shrink-0" aria-hidden="true">☀️</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-semibold text-amber-900 leading-snug">
          {dry.tempC}° and dry {dry.label} in Galway
        </span>
        <span className="block text-xs text-amber-800/70 mt-0.5">
          Perfect for garden work — book before the slots go
        </span>
      </span>
      <span className="text-amber-700 text-lg font-bold leading-none flex-shrink-0" aria-hidden="true">→</span>
    </motion.button>
  );
};
