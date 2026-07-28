import React, { useEffect, useRef, useState, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, LocateFixed, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { getCurrentPosition, isPermissionDenied } from '@/lib/native/geolocation';

// Leaflet is heavy — keep it OUT of the eager homepage bundle. The draggable
// map only mounts once an address is confirmed, so lazy-load it then.
const AddressMap = React.lazy(() => import('./AddressMap'));

// Shared address picker — Nominatim autocomplete (Ireland only, handles
// eircodes) + "use my current location" via browser geolocation with
// reverse geocoding. Used by the booking wizard ConfirmStep and the
// homepage quick-book sheet.

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    house_number?: string;
    road?: string;
    suburb?: string;
    village?: string;
    town?: string;
    city?: string;
    county?: string;
    postcode?: string;
  };
}

function formatNominatimAddress(r: NominatimResult): string {
  const a = r.address ?? {};
  const street = a.house_number && a.road
    ? `${a.house_number} ${a.road}`
    : a.road ?? '';
  const locality = a.suburb ?? a.village ?? a.town ?? a.city ?? '';
  const county = a.county ?? '';
  const parts = [street, locality, county].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : r.display_name;
}

// Reverse geocode a point → formatted address + raw parts. Shared by "use my
// location" and the draggable map pin. Throws on failure so callers can toast.
async function reverseGeocode(lat: number, lng: number): Promise<{ formatted: string; address?: NominatimResult['address'] }> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
    { headers: { 'Accept-Language': 'en' } },
  );
  const result: NominatimResult = await res.json();
  if (!res.ok || (!result?.display_name && !result?.address)) {
    throw new Error('reverse geocode failed');
  }
  return { formatted: formatNominatimAddress(result), address: result.address };
}

export interface AddressPickerProps {
  value: string;
  coords: { lat: number; lng: number } | null;
  error: boolean;
  onAddress: (
    address: string,
    lat: number,
    lng: number,
    /** Geocoder locality parts (suburb/town/city/county) — lets callers
     *  auto-derive the booking area instead of asking the customer. */
    locality?: NominatimResult['address'],
  ) => void;
  onBlur: () => void;
  /** Shown in the empty input. */
  placeholder?: string;
  /** Hide the OSM map preview (e.g. in tight bottom sheets). */
  showMapPreview?: boolean;
  /**
   * Called on every keystroke with the raw text. Lets callers accept a
   * manually typed address/Eircode even when no suggestion is selected.
   */
  onTextChange?: (text: string) => void;
}

export const AddressPicker: React.FC<AddressPickerProps> = ({
  value, coords, error, onAddress, onBlur,
  placeholder = 'Type your address…',
  showMapPreview = true,
  onTextChange,
}) => {
  const { toast } = useToast();
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [locating, setLocating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [open, setOpen] = useState(false);
  // Set when "Change" is tapped on the confirmed row, so the input can grab
  // focus the moment it re-renders.
  const [editRequested, setEditRequested] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value changes (e.g. cleared form)
  useEffect(() => { setQuery(value); }, [value]);

  // A geocoded address (GPS or picked suggestion) collapses the two controls
  // into one confirmed row — the section gets SMALLER once it's done, which
  // reads as progress. Manually typed text (no coords) keeps the input.
  const confirmed = !!coords && query.trim().length > 0;

  useEffect(() => {
    if (!confirmed && editRequested) {
      inputRef.current?.focus();
      setEditRequested(false);
    }
  }, [confirmed, editRequested]);

  // Autocomplete — debounced, Ireland only
  useEffect(() => {
    if (query.length < 3) { setSuggestions([]); setOpen(false); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=ie&limit=5&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } },
        );
        // Nominatim under rate-limit/error returns a JSON object (or HTML),
        // not an array — guard before setState or the .map render crashes.
        const results: unknown = res.ok ? await res.json().catch(() => []) : [];
        const list = Array.isArray(results) ? (results as NominatimResult[]) : [];
        setSuggestions(list);
        setOpen(list.length > 0);
      } catch { /* network error — ignore */ }
      finally { setSearching(false); }
    }, 380);
    return () => clearTimeout(timer);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // The pin was dragged/tapped to a new point — snap the address text to it.
  // If the reverse geocode fails we still keep the new coords (a helper can be
  // sent to a lat/lng), just leaving the last address text in place.
  async function pinMoved(lat: number, lng: number) {
    setPinBusy(true);
    try {
      const { formatted, address } = await reverseGeocode(lat, lng);
      setQuery(formatted);
      onAddress(formatted, lat, lng, address);
    } catch {
      onAddress(query, lat, lng);
    } finally {
      setPinBusy(false);
    }
  }

  function selectSuggestion(s: NominatimResult) {
    const formatted = formatNominatimAddress(s);
    setQuery(formatted);
    setSuggestions([]);
    setOpen(false);
    onAddress(formatted, parseFloat(s.lat), parseFloat(s.lon), s.address);
  }

  async function locateMe() {
    setLocating(true);
    try {
      // Native app uses @capacitor/geolocation; web uses the browser API.
      const pos = await getCurrentPosition({ timeout: 10000, enableHighAccuracy: true });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      // Reverse geocode can come back as {error: "Unable to geocode"} — that
      // throws inside reverseGeocode → the catch's "type your address" toast,
      // instead of confirming an address of "undefined".
      const { formatted, address } = await reverseGeocode(lat, lng);
      setQuery(formatted);
      setSuggestions([]);
      setOpen(false);
      onAddress(formatted, lat, lng, address);
    } catch (err) {
      const isDenied = isPermissionDenied(err);
      toast({
        title: isDenied ? 'Location access denied' : 'Could not get your location',
        description: isDenied ? 'Allow location access in your settings.' : 'Type your address instead.',
        variant: 'destructive',
      });
    } finally {
      setLocating(false);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      {confirmed ? (
        /* Locked-in address — Uber's "pin dropped" moment. One compact row
           instead of button + input: the field visibly completes. */
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
          className="flex items-center gap-2.5 rounded-xl border border-sage/40 bg-sage-light px-3.5 py-3"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sage/15 flex-shrink-0" aria-hidden="true">
            <MapPin size={14} className="text-sage-dark" />
          </span>
          <span className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">{query}</span>
          <button
            type="button"
            onClick={() => { setEditRequested(true); onTextChange?.(query); }}
            className="text-[11px] font-semibold text-sage-dark flex-shrink-0 px-3 py-3 -mx-3 -my-3 rounded-lg transition-[color,transform] duration-150 hover:text-sage active:scale-95"
          >
            Change
          </button>
        </motion.div>
      ) : (
        /* Eases back in when "Change" re-opens the controls — the confirmed
           row swapping to a taller block shouldn't snap. */
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Use my location — the one-tap fast path, styled as such: solid,
              full-weight, with press feedback. Typing is the fallback below. */}
          <button
            type="button"
            onClick={() => void locateMe()}
            disabled={locating}
            className={cn(
              'w-full flex items-center gap-2.5 rounded-xl border border-primary/25',
              'bg-primary/[0.08] px-3.5 py-3 text-sm text-primary font-semibold mb-2',
              'hover:bg-primary/[0.12] active:scale-[0.98]',
              'transition-[background-color,transform] duration-150 disabled:opacity-60',
            )}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/[0.12] flex-shrink-0" aria-hidden="true">
              {locating
                ? <Loader2 size={14} className="animate-spin" />
                : <LocateFixed size={14} />
              }
            </span>
            {locating ? 'Getting your location…' : 'Use my current location'}
          </button>

          {/* Text input */}
          <div className="relative">
            <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); onTextChange?.(e.target.value); }}
              onBlur={onBlur}
              onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
              placeholder={placeholder}
              className={cn(
                // text-base on phones: 14px inputs make iOS Safari zoom the
                // whole sheet on focus (the class beats the 16px base rule).
                'w-full rounded-xl border bg-background pl-8 pr-10 py-2.5 text-base sm:text-sm',
                'placeholder:text-muted-foreground/50',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                'transition-[border-color,box-shadow] duration-150',
                error ? 'border-destructive' : 'border-border',
              )}
            />
            {searching && (
              <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
            )}
          </div>
        </motion.div>
      )}

      {/* Suggestions dropdown */}
      <AnimatePresence>
        {!confirmed && open && suggestions.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
            className="absolute z-50 left-0 right-0 mt-1 bg-background border border-border rounded-xl shadow-lg overflow-hidden"
          >
            {suggestions.map((s) => (
              <li key={s.place_id}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary active:bg-secondary transition-colors duration-100 flex items-start gap-2"
                >
                  <MapPin size={13} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                  <span className="leading-snug">{formatNominatimAddress(s)}</span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      {/* Draggable map once an address is confirmed — the Deliveroo "is the
          pin on your door?" moment. Drag the pin (or tap the map) to correct
          it; the address text snaps to wherever it lands. */}
      <AnimatePresence>
        {showMapPreview && coords && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="mt-2 overflow-hidden"
          >
            <div className="rounded-xl overflow-hidden border border-border/50 relative">
              <Suspense fallback={<div className="shimmer h-[190px] w-full bg-secondary" aria-hidden="true" />}>
                <AddressMap lat={coords.lat} lng={coords.lng} onMove={pinMoved} />
              </Suspense>
              {pinBusy && (
                <span className="absolute top-2 right-2 z-[400] inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-medium text-foreground shadow-sm">
                  <Loader2 size={12} className="animate-spin" /> Updating…
                </span>
              )}
            </div>
            <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <MapPin size={13} className="flex-shrink-0 text-sage-dark" />
              Drag the pin to your exact door if it's not quite right.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
