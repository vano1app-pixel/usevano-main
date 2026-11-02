import React, { useEffect } from 'react';
import { MapContainer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import VanoMapTiles from '@/components/household/VanoMapTiles';
import type { OpenOrder } from '@/lib/openOrders';
import { formatEuro } from '@/lib/openOrders';

/**
 * The Find screen's map (2026-09-06). LAZY-LOADED ONLY — Leaflet must never
 * land in the eager homepage bundle. Pins are the job's PAY, on a ~100 m grid
 * (approx_lat/lng from the server) so a helper sees the street corner, never
 * the house. Tap a pin → the list scrolls to that card.
 */

const pinIcon = (label: string, active: boolean) => L.divIcon({
  className: '',
  html: `<div style="transform:translate(-50%,-100%);display:inline-flex;align-items:center;gap:4px;padding:6px 10px;border-radius:999px;background:${active ? '#3f6146' : '#ffffff'};color:${active ? '#ffffff' : '#1a2340'};font:700 13px/1 -apple-system,system-ui,sans-serif;box-shadow:0 6px 16px -6px rgba(26,35,64,.45);border:1.5px solid ${active ? '#3f6146' : 'rgba(26,35,64,.12)'};white-space:nowrap">${label}</div>`,
  iconSize: [0, 0],
  iconAnchor: [0, 0],
});

const meIcon = L.divIcon({
  className: '',
  html: '<div style="transform:translate(-50%,-50%);width:16px;height:16px;border-radius:999px;background:#1a2340;border:3px solid #fff;box-shadow:0 0 0 6px rgba(26,35,64,.15)"></div>',
  iconSize: [0, 0],
  iconAnchor: [0, 0],
});

const GALWAY: [number, number] = [53.2724, -9.049];

function FitTo({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) { map.setView(GALWAY, 12); return; }
    if (points.length === 1) { map.setView(points[0], 14); return; }
    map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 15 });
  }, [map, points]);
  return null;
}

interface Props {
  orders: OpenOrder[];
  me: { lat: number; lng: number } | null;
  activeId: string | null;
  onPick: (id: string) => void;
  height?: number;
}

const OrderMap: React.FC<Props> = ({ orders, me, activeId, onPick, height = 260 }) => {
  const points: [number, number][] = [
    ...(me ? [[me.lat, me.lng] as [number, number]] : []),
    ...orders.filter((o) => o.approx_lat !== null && o.approx_lng !== null).map((o) => [o.approx_lat as number, o.approx_lng as number] as [number, number]),
  ];
  return (
    <MapContainer center={me ? [me.lat, me.lng] : GALWAY} zoom={13} scrollWheelZoom={false} style={{ height, width: '100%' }} className="z-0" attributionControl={false}>
      <VanoMapTiles />
      {me && <Marker position={[me.lat, me.lng]} icon={meIcon} interactive={false} />}
      {orders.map((o) => (o.approx_lat !== null && o.approx_lng !== null) && (
        <Marker
          key={o.id}
          position={[o.approx_lat, o.approx_lng]}
          icon={pinIcon(formatEuro(o.earn_cents), o.id === activeId)}
          eventHandlers={{ click: () => onPick(o.id) }}
          zIndexOffset={o.id === activeId ? 1000 : 0}
        />
      ))}
      <FitTo points={points} />
    </MapContainer>
  );
};

export default OrderMap;
