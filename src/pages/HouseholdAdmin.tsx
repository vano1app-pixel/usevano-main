import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const ADMIN_EMAIL = 'vano1app@gmail.com';

interface Booking {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  category: string | null;
  city: string | null;
  scheduled_date: string | null;
  status: string;
  price_cents: number | null;
  created_at: string;
}

interface Helper {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  categories: string[] | null;
  tutor_subjects: string[] | null;
  tutor_levels: string[] | null;
  photo_url: string | null;
  status: string;
  created_at: string;
}

const CAT_LABELS: Record<string, string> = {
  shopping: 'Shopping', 'dog-walk': 'Dog Walk', garden: 'Garden',
  moving: 'Moving', cleaning: 'Cleaning', tutoring: 'Tutoring', other: 'Other',
};

const STATUS_COLOURS: Record<string, string> = {
  awaiting_payment: 'bg-yellow-100 text-yellow-800',
  pending: 'bg-blue-100 text-blue-800',
  accepted: 'bg-green-100 text-green-800',
  completed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-700',
  approved: 'bg-green-100 text-green-800',
  pending_review: 'bg-yellow-100 text-yellow-800',
  rejected: 'bg-red-100 text-red-700',
};

export default function HouseholdAdmin() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'bookings' | 'students'>('bookings');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [helpers, setHelpers] = useState<Helper[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || session.user.email !== ADMIN_EMAIL) {
        navigate('/', { replace: true });
        return;
      }

      const [{ data: b }, { data: h }] = await Promise.all([
        supabase
          .from('household_bookings')
          .select('id, customer_name, customer_phone, customer_email, category, city, scheduled_date, status, price_cents, created_at')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('household_helpers')
          .select('id, name, phone, email, city, categories, tutor_subjects, tutor_levels, photo_url, status, created_at')
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      setBookings((b as Booking[]) ?? []);
      setHelpers((h as Helper[]) ?? []);
      setLoading(false);
    })();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-foreground text-lg">VANO Admin</h1>
          <p className="text-xs text-muted-foreground">Household bookings &amp; students</p>
        </div>
        <button
          onClick={() => supabase.auth.signOut().then(() => navigate('/'))}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Sign out
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-card">
        {(['bookings', 'students'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 py-3 text-sm font-medium capitalize transition-colors',
              tab === t ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground',
            )}
          >
            {t === 'bookings' ? `Bookings (${bookings.length})` : `Students (${helpers.length})`}
          </button>
        ))}
      </div>

      <div className="p-4 max-w-3xl mx-auto space-y-3">
        {tab === 'bookings' && (
          bookings.length === 0
            ? <p className="text-center text-muted-foreground py-12 text-sm">No bookings yet</p>
            : bookings.map((b) => (
              <div key={b.id} className="bg-card border border-border rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-semibold text-foreground">{CAT_LABELS[b.category ?? ''] ?? b.category}</p>
                    <p className="text-xs text-muted-foreground">{b.city} · {b.scheduled_date ?? 'No date'}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full capitalize', STATUS_COLOURS[b.status] ?? 'bg-gray-100 text-gray-600')}>
                      {b.status.replace('_', ' ')}
                    </span>
                    {b.price_cents && (
                      <span className="text-sm font-bold text-green-600">€{(b.price_cents / 100).toFixed(2)}</span>
                    )}
                  </div>
                </div>
                <div className="space-y-1 text-sm">
                  <p><span className="text-muted-foreground">Name: </span>{b.customer_name ?? '—'}</p>
                  {b.customer_phone && (
                    <p>
                      <span className="text-muted-foreground">Phone: </span>
                      <a href={`https://wa.me/${b.customer_phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                        {b.customer_phone}
                      </a>
                    </p>
                  )}
                  {b.customer_email && <p><span className="text-muted-foreground">Email: </span>{b.customer_email}</p>}
                </div>
                <p className="text-xs text-muted-foreground mt-2">{format(new Date(b.created_at), 'dd MMM yyyy, HH:mm')} · #{b.id.slice(-8).toUpperCase()}</p>
              </div>
            ))
        )}

        {tab === 'students' && (
          helpers.length === 0
            ? <p className="text-center text-muted-foreground py-12 text-sm">No students yet</p>
            : helpers.map((h) => (
              <div key={h.id} className="bg-card border border-border rounded-2xl p-4 flex gap-3">
                {h.photo_url
                  ? <img src={h.photo_url} alt={h.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                  : <div className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0 text-xl font-bold text-muted-foreground">{h.name[0]}</div>
                }
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-foreground">{h.name}</p>
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full capitalize flex-shrink-0', STATUS_COLOURS[h.status] ?? 'bg-gray-100 text-gray-600')}>
                      {h.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{h.city}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{(h.categories ?? []).map(c => CAT_LABELS[c] ?? c).join(', ')}</p>
                  {h.tutor_subjects?.length ? (
                    <p className="text-xs text-muted-foreground">Subjects: {h.tutor_subjects.join(', ')}</p>
                  ) : null}
                  <div className="flex items-center gap-3 mt-2">
                    {h.phone && (
                      <a href={`https://wa.me/${h.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
                        WhatsApp
                      </a>
                    )}
                    {h.email && <p className="text-xs text-muted-foreground truncate">{h.email}</p>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{format(new Date(h.created_at), 'dd MMM yyyy')}</p>
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  );
}
