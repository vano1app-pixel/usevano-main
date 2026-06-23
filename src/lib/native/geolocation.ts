import { isNativeApp } from '@/lib/platform';

/**
 * Geolocation that works on the web AND inside the native app.
 *
 * `navigator.geolocation` does not work in the iOS WKWebView, so on native we
 * bridge to `@capacitor/geolocation` (dynamically imported, so it never ships in
 * the web bundle). On the web the behaviour is exactly as before.
 *
 * Positions are normalised to a small shape compatible with both the browser
 * `GeolocationPosition` and the plugin's `Position`. Errors expose a `.code`
 * (1 = permission denied) so call sites can use `isPermissionDenied()`.
 */

export interface GeoPosition {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: number | null;
    altitudeAccuracy: number | null;
    heading: number | null;
    speed: number | null;
  };
  timestamp: number;
}

export interface GeoOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

export interface GeoError {
  code: number;
  message: string;
}

export type WatchId = string | number;

/** Matches the web GeolocationPositionError.PERMISSION_DENIED code. */
export const GEO_PERMISSION_DENIED = 1;

export function isPermissionDenied(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: number }).code === GEO_PERMISSION_DENIED;
}

/** Both the browser and plugin coord objects are structurally compatible with this. */
interface RawCoords {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
}

function normalize(coords: RawCoords, timestamp: number): GeoPosition {
  return {
    coords: {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
      altitude: coords.altitude ?? null,
      altitudeAccuracy: coords.altitudeAccuracy ?? null,
      heading: coords.heading ?? null,
      speed: coords.speed ?? null,
    },
    timestamp,
  };
}

/** Ask for native location permission if not already granted. Returns true if usable. */
async function ensureNativePermission(): Promise<boolean> {
  const { Geolocation } = await import('@capacitor/geolocation');
  let status = await Geolocation.checkPermissions();
  if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
    status = await Geolocation.requestPermissions({ permissions: ['location'] });
  }
  return status.location === 'granted' || status.coarseLocation === 'granted';
}

export async function getCurrentPosition(options?: GeoOptions): Promise<GeoPosition> {
  if (isNativeApp()) {
    if (!(await ensureNativePermission())) {
      throw { code: GEO_PERMISSION_DENIED, message: 'Location permission denied' } as GeoError;
    }
    const { Geolocation } = await import('@capacitor/geolocation');
    const p = await Geolocation.getCurrentPosition({
      enableHighAccuracy: options?.enableHighAccuracy ?? false,
      timeout: options?.timeout ?? 10000,
      maximumAge: options?.maximumAge ?? 0,
    });
    return normalize(p.coords, p.timestamp);
  }

  // Web — unchanged.
  return new Promise<GeoPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(normalize(p.coords, p.timestamp)),
      (e) => reject(e),
      options,
    );
  });
}

/**
 * Start watching position. Returns the watch id, or null if it could not start
 * (e.g. permission denied — `onError` is called in that case). Pass the id to
 * `clearWatch()`.
 */
export async function watchPosition(
  onPosition: (pos: GeoPosition) => void,
  onError: (err: GeoError) => void,
  options?: GeoOptions,
): Promise<WatchId | null> {
  if (isNativeApp()) {
    if (!(await ensureNativePermission())) {
      onError({ code: GEO_PERMISSION_DENIED, message: 'Location permission denied' });
      return null;
    }
    const { Geolocation } = await import('@capacitor/geolocation');
    return Geolocation.watchPosition(
      {
        enableHighAccuracy: options?.enableHighAccuracy ?? true,
        timeout: options?.timeout,
        maximumAge: options?.maximumAge,
      },
      (p, err) => {
        if (err) {
          onError({ code: (err as { code?: number }).code ?? 2, message: (err as Error).message ?? 'Location error' });
        } else if (p) {
          onPosition(normalize(p.coords, p.timestamp));
        }
      },
    );
  }

  // Web — unchanged.
  return navigator.geolocation.watchPosition(
    (p) => onPosition(normalize(p.coords, p.timestamp)),
    (e) => onError({ code: e.code, message: e.message }),
    options,
  );
}

export async function clearWatch(id: WatchId): Promise<void> {
  if (isNativeApp()) {
    const { Geolocation } = await import('@capacitor/geolocation');
    await Geolocation.clearWatch({ id: String(id) });
    return;
  }
  navigator.geolocation.clearWatch(id as number);
}
