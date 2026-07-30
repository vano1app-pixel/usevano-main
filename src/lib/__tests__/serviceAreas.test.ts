import { describe, expect, it } from 'vitest';
import {
  SERVICE_AREAS,
  AREA_MATCH_KM,
  approxAreaLabel,
  areaFromCoords,
  areaFromAddressText,
} from '../serviceAreas';
// The REAL server module the edge functions run — same cross-check pattern as
// the pricing tables: the frontend mirror can never silently drift from it.
import {
  SERVICE_AREAS as SERVER_AREAS,
  AREA_MATCH_KM as SERVER_MATCH_KM,
  approxAreaLabel as serverApproxAreaLabel,
} from '../../../supabase/functions/_shared/serviceAreas';

const KNOWN = new Set(SERVICE_AREAS.map((a) => a.name));

describe('serviceAreas — rough area, never the exact house', () => {
  it('the frontend mirror and the server table are identical', () => {
    expect(SERVICE_AREAS).toEqual(SERVER_AREAS);
    expect(AREA_MATCH_KM).toBe(SERVER_MATCH_KM);
  });

  it('maps real Galway coordinates to the right neighbourhood', () => {
    expect(areaFromCoords(53.2607, -9.0800)).toBe('Salthill');
    expect(areaFromCoords(53.2812, -9.0272)).toBe('Mervue');
    expect(areaFromCoords(53.2742, -9.0132)).toBe('Renmore');
    expect(areaFromCoords(53.2680, -9.1080)).toBe('Knocknacarra');
    expect(areaFromCoords(53.2690, -8.9210)).toBe('Oranmore');
  });

  it('refuses to guess an area for a point far from every centroid', () => {
    expect(areaFromCoords(53.3498, -6.2603)).toBeNull(); // Dublin
    expect(areaFromCoords(51.8985, -8.4756)).toBeNull(); // Cork
    expect(areaFromCoords(null, null)).toBeNull();
    expect(areaFromCoords(NaN, 1)).toBeNull();
  });

  // THE SECURITY PROPERTY. Every path must return a value from the fixed
  // table, the city, or the generic — never a fragment of a typed address.
  it('NEVER leaks street-level detail from an address, whatever is typed', () => {
    const nasty = [
      '12 Oak Drive, Salthill, Galway, H91 X2Y3',
      'Apartment 4B, 77 Father Griffin Road, Galway',
      '  ',
      'H91 AB12',
      '<script>alert(1)</script> 9 Secret Lane',
      '3 Barnacle Road, Ballybane',
    ];
    for (const address of nasty) {
      const out = approxAreaLabel({ address, city: 'Galway' });
      const allowed = KNOWN.has(out) || out === 'Galway' || out === 'Galway area';
      expect(allowed, `"${address}" → "${out}"`).toBe(true);
      // No digits (house numbers / eircodes) and no comma (address shape).
      expect(/\d/.test(out), `digits leaked from "${address}"`).toBe(false);
      expect(out.includes(','), `comma leaked from "${address}"`).toBe(false);
    }
  });

  it('word-boundary matching: "Barnacle Road" is not Barna', () => {
    expect(areaFromAddressText('3 Barnacle Road, Ballybane')).toBe('Ballybane');
    expect(areaFromAddressText('Sea Road, Salthill')).toBe('Salthill');
    expect(areaFromAddressText('somewhere unlisted entirely')).toBeNull();
  });

  it('prefers coordinates, then the address allowlist, then the city', () => {
    // Coordinates win even when the text says something else.
    expect(approxAreaLabel({ lat: 53.2607, lng: -9.0800, address: 'Mervue', city: 'Galway' })).toBe('Salthill');
    // No coords → allowlist text.
    expect(approxAreaLabel({ address: '5 Somewhere, Mervue', city: 'Galway' })).toBe('Mervue');
    // Neither → the city.
    expect(approxAreaLabel({ address: 'unlisted place', city: 'Galway' })).toBe('Galway');
    // Nothing at all → the safe generic, never an empty string.
    expect(approxAreaLabel({})).toBe('Galway area');
  });

  it('the server produces the same label as the mirror for every case', () => {
    const cases = [
      { lat: 53.2607, lng: -9.0800, address: '12 Oak Drive', city: 'Galway' },
      { lat: null, lng: null, address: '5 Somewhere, Mervue', city: 'Galway' },
      { lat: null, lng: null, address: 'unlisted', city: 'Galway' },
      {},
    ];
    for (const c of cases) {
      expect(serverApproxAreaLabel(c)).toBe(approxAreaLabel(c));
    }
  });

  it('every table entry is a plausible, street-free name', () => {
    for (const a of SERVICE_AREAS) {
      expect(a.name.length).toBeGreaterThan(2);
      expect(/\d/.test(a.name), `${a.name} has digits`).toBe(false);
      expect(a.lat).toBeGreaterThan(52.5);
      expect(a.lat).toBeLessThan(54);
      expect(a.lng).toBeLessThan(-8);
      expect(a.lng).toBeGreaterThan(-10);
    }
    // No duplicate names — two entries with one name makes the label ambiguous.
    expect(new Set(SERVICE_AREAS.map((a) => a.name)).size).toBe(SERVICE_AREAS.length);
  });
});
