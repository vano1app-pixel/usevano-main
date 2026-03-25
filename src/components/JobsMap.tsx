import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useNavigate } from 'react-router-dom';
import { Flame } from 'lucide-react';

// Fix default marker icon issue with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const urgentIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface Job {
  id: string;
  title: string;
  location: string;
  hourly_rate: number;
  fixed_price?: number | null;
  payment_type?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  shift_date: string;
  shift_start: string | null;
  shift_end: string | null;
  is_urgent?: boolean;
}

interface JobsMapProps {
  jobs: Job[];
}

export const JobsMap: React.FC<JobsMapProps> = ({ jobs }) => {
  const navigate = useNavigate();

  const mappableJobs = jobs.filter((j) => j.latitude && j.longitude);

  // Default center: Galway, Ireland
  const center: [number, number] = mappableJobs.length > 0
    ? [mappableJobs[0].latitude!, mappableJobs[0].longitude!]
    : [53.2707, -9.0568];

  if (mappableJobs.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] rounded-xl border border-border bg-muted/30 text-muted-foreground text-sm">
        No jobs with location data to show on the map.
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border border-border h-[400px]">
      <MapContainer center={center} zoom={13} className="h-full w-full" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {mappableJobs.map((job) => (
          <Marker
            key={job.id}
            position={[job.latitude!, job.longitude!]}
            icon={job.is_urgent ? urgentIcon : new L.Icon.Default()}
          >
            <Popup>
              <div className="text-sm min-w-[160px]">
                {job.is_urgent && (
                  <span className="text-red-600 font-semibold text-xs flex items-center gap-1 mb-1">
                    <Flame size={12} /> Urgent
                  </span>
                )}
                <p className="font-semibold">{job.title}</p>
                <p className="text-muted-foreground text-xs">{job.location}</p>
                <p className="font-bold text-primary mt-1">
                  {job.payment_type === 'fixed' ? `€${job.fixed_price ?? 0} total` : `€${job.hourly_rate}/hr`}
                </p>
                <button
                  onClick={() => navigate(`/jobs/${job.id}`)}
                  className="mt-2 text-xs text-primary underline hover:no-underline"
                >
                  View Details →
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};
