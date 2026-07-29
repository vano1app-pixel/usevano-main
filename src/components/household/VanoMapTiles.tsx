import { TileLayer } from 'react-leaflet';

/**
 * The VANO basemap — ONE look for every map in the product (live tracking,
 * the helper job screen, the draggable address pin). Uber's calm-but-legible
 * style out of the same free CARTO CDN the app has always used, in two
 * layers: a Voyager base with NO labels, softened by a CSS filter, then
 * Voyager's labels-only tiles rendered crisp on top — streets stay readable
 * while the map recedes behind the navy route line and the pins.
 */

const TILE_BASE = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png';
const TILE_LABELS = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png';

// The soften filter sits on the base layer's container (Leaflet's `className`
// option) so the label tiles above it keep full contrast.
if (typeof document !== 'undefined' && !document.getElementById('vano-tiles-css')) {
  const s = document.createElement('style');
  s.id = 'vano-tiles-css';
  s.textContent = '.vano-tiles-base{filter:saturate(.55) contrast(.97) brightness(1.05)}';
  document.head.appendChild(s);
}

const VanoMapTiles = () => (
  <>
    <TileLayer
      url={TILE_BASE}
      subdomains="abcd"
      detectRetina
      className="vano-tiles-base"
      attribution='&copy; OpenStreetMap contributors &copy; CARTO'
    />
    <TileLayer url={TILE_LABELS} subdomains="abcd" detectRetina zIndex={2} />
  </>
);

export default VanoMapTiles;
