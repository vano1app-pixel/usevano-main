import React, { useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Draggable address pin — the Deliveroo "is this the right spot?" moment.
 *
 * LAZY-LOADED ONLY (React.lazy in AddressPicker): pulls in Leaflet + tiles,
 * which must NEVER land in the eager homepage bundle. Renders a small map
 * centred on the geocoded address with a draggable pin; dragging OR tapping
 * the map bubbles the new lat/lng up so the caller can reverse-geocode and
 * correct the address text. Bounded height + a custom SVG divIcon (no
 * marker-image asset paths, which break under the bundler).
 */

const PIN = L.divIcon({
  className: '',
  html: `<svg width="36" height="46" viewBox="0 0 36 46" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 3px 5px rgba(0,0,0,.35))">
    <path d="M18 1C9.7 1 3 7.7 3 16c0 10.5 13.2 26.5 14 27.4a1.3 1.3 0 0 0 2 0C19.8 42.5 33 26.5 33 16 33 7.7 26.3 1 18 1Z" fill="#3f6146" stroke="#ffffff" stroke-width="2.5"/>
    <circle cx="18" cy="16" r="5.5" fill="#ffffff"/>
  </svg>`,
  iconSize: [36, 46],
  iconAnchor: [18, 44],
});

interface Props {
  lat: number;
  lng: number;
  /** Fired when the pin is dragged or the map is tapped to a new point. */
  onMove: (lat: number, lng: number) => void;
  height?: number;
}

// Keeps the view following external coord changes (e.g. a new address picked
// from the suggestions list while the map is already mounted).
const Recenter: React.FC<{ lat: number; lng: number }> = ({ lat, lng }) => {
  const map = useMap();
  const last = useRef(`${lat},${lng}`);
  const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  if (key !== last.current) {
    last.current = key;
    map.setView([lat, lng], map.getZoom(), { animate: true });
  }
  return null;
};

// Tap anywhere on the map to drop the pin there (Deliveroo pattern).
const TapToMove: React.FC<{ onMove: (lat: number, lng: number) => void }> = ({ onMove }) => {
  useMapEvents({ click: (e) => onMove(e.latlng.lat, e.latlng.lng) });
  return null;
};

const AddressMap: React.FC<Props> = ({ lat, lng, onMove, height = 190 }) => {
  const markerRef = useRef<L.Marker | null>(null);
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={16}
      scrollWheelZoom={false}
      style={{ height, width: '100%' }}
      // Touch-drag the map to pan; scroll-wheel off so the page still scrolls.
      className="z-0"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap'
      />
      <Marker
        position={[lat, lng]}
        icon={PIN}
        draggable
        ref={markerRef}
        eventHandlers={{
          dragend: () => {
            const m = markerRef.current;
            if (m) {
              const p = m.getLatLng();
              onMove(p.lat, p.lng);
            }
          },
        }}
      />
      <TapToMove onMove={onMove} />
      <Recenter lat={lat} lng={lng} />
    </MapContainer>
  );
};

export default AddressMap;
