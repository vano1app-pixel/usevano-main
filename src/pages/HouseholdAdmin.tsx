import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Loader2, RefreshCw, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const ADMIN_EMAIL = 'vano1app@gmail.com';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface Booking {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  category: string | null;
  city: string | null;
  scheduled_date: string | null;
  status: string;
  price_estimate_cents: number | null;
  created_at: string;
  student_id: string | null;
}

interface Helper {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  categories: string[] | null;
  photo_url: string | null;
  status: string;
  average_rating: number | null;
  rating_count: number;
  user_id: string | null;
  created_at: string;
}

interface Payout {
  id: string;
  booking_id: string;
  student_id: string;
  amount_cents: number;
  status: string;
  created_at: string;
  helper_name?: string | null;
  category?: string;
  city?: string;
}

const CAT_LABELS: Record<string, string> = {
  shopping: 'Shopping', 'dog-walk': 'Dog Walk', garden: 'Garden',
  moving: 'Moving', cleaning: 'Cleaning', tutoring: 'Tutoring', other: 'Other',
};

const STATUS_COLOURS: Record<string, string> = {
  awaiting_payment: 'bg-yellow-100 text-yellow-800',
  pending:          'bg-blue-100 text-blue-800',
  accepted:         'bg-green-100 text-green-800',
  on_way:           'bg-sky-100 text-sky-800',
  arrived:          'bg-sky-100 text-sky-800',
  in_progress:      'bg-amber-100 text-amber-800',
  completed:        'bg-gray-100 text-gray-600',
  cancelled:        'bg-red-100 text-red-700',
  approved:         'bg-green-100 text-green-800',
  pending_review:   'bg-yellow-100 text-yellow-800',
  rejected:         'bg-red-100 text-red-700',
};

const CANCELLABLE = ['pending', 'accepted', 'on_way', 'arrived', 'in_progress'];

export default function HouseholdAdmin() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'bookings' | 'students' | 'payouts'>('bookings');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [helpers, setHelpers] = useState<Helper[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [actioning, setActioning] = useState<string | null>(null);

  const loadAll = async () => {
    const [{ data: b }, { data: h }, { data: p }] = await Promise.all([
      db.from('household_bookings')
        .select('id, customer_name, customer_phone, customer_email, category, city, scheduled_date, status, price_estimate_cents, created_at, student_id')
        .order('created_at', { ascending: false })
        .limit(200),
      db.from('household_helpers')
        .select('id, name, phone, email, city, categories, photo_url, status, average_rating, rating_count, user_id, created_at')
        .order('created_at', { ascending: false })
        .limit(200),
      db.from('household_payouts')
        .select('id, booking_id, student_id, amount_cents, status, created_at')
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

    const bookingList = (b as Booking[]) ?? [];
    const helperList  = (h as Helper[]) ?? [];
    const rawPayouts  = (p as Payout[]) ?? [];

    // Enrich payouts with helper name + booking category/city
    const enriched = rawPayouts.map((pay) => {
      const booking = bookingList.find((bk) => bk.id === pay.booking_id);
      // student_id is the auth user id; match to helper via user_id
      const helper  = helperList.find((hh) => hh.user_id === pay.student_id);
      return {
        ...pay,
        helper_name: helper?.name ?? null,
        category:    booking?.category ?? '—',
        city:        booking?.city ?? '—',
      };
    });

    setBookings(bookingList);
    setHelpers(helperList);
    setPayouts(enriched);
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || session.user.email !== ADMIN_EMAIL) {
        navigate('/', { replace: true });
        return;
      }
      await loadAll();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const handleRefund = async (bookingId: string) => {
    if (!window.confirm('Cancel this booking and issue a Stripe refund?')) return;
    setActioning(bookingId);
    try {
      const { error } = await supabase.functions.invoke('cancel-household-booking', {
        body: { booking_id: bookingId, type: 'admin_cancel' },
      });
      if (error) throw error;
      toast({ title: 'Booking cancelled + refund issued' });
      setBookings((prev) => prev.map((bk) => bk.id === bookingId ? { ...bk, status: 'cancelled' } : bk));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: 'Failed', description: msg, variant: 'destructive' });
    } finally {
      setActioning(null);
    }
  };

  const handleApproveHelper = async (helperId: string) => {
    setActioning(helperId);
    try {
      const { error } = await db.from('household_helpers')
        .update({ status: 'approved', is_available: true })
        .eq('id', helperId);
      if (error) throw error;
      toast({ title: 'Helper approved' });
      setHelpers((prev) => prev.map((hh) => hh.id === helperId ? { ...hh, status: 'approved', is_available: true } : hh));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: 'Failed', description: msg, variant: 'destructive' });
    } finally {
      setActioning(null);
    }
  };

  const handleRejectHelper = async (helperId: string) => {
    if (!window.confirm('Reject this helper?')) return;
    setActioning(helperId);
    try {
      const { error } = await db.from('household_helpers').update({ status: 'rejected' }).eq('id', helperId);
      if (error) throw error;
      toast({ title: 'Helper rejected' });
      setHelpers((prev) => prev.map((hh) => hh.id === helperId ? { ...hh, status: 'rejected' } : hh));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: 'Failed', description: msg, variant: 'destructive' });
    } finally {
      setActioning(null);
    }
  };

  const handleMarkPaid = async (payoutId: string) => {
    setActioning(payoutId);
    try {
      const { error } = await db.from('household_payouts').update({ status: 'transferred' }).eq('id', payoutId);
      if (error) throw error;
      toast({ title: 'Marked as paid' });
      setPayouts((prev) => prev.map((p) => p.id === payoutId ? { ...p, status: 'transferred' } : p));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: 'Failed', description: msg, variant: 'destructive' });
    } finally {
      setActioning(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filteredBookings = statusFilter === 'all'
    ? bookings
    : bookings.filter((b) => b.status === statusFilter);

  const pendingPayouts   = payouts.filter((p) => p.status === 'pending');
  const pendingHelpers   = helpers.filter((h) => h.status === 'pending' || h.status === 'pending_review');
  const totalPendingCents = pendingPayouts.reduce((s, p) => s + p.amount_cents, 0);

  const TABS = [
    { id: 'bookings' as const, label: `Bookings (${bookings.length})` },
    { id: 'students' as const, label: `Students (${helpers.length})` },
    { id: 'payouts'  as const, label: `Payouts${pendingPayouts.length > 0 ? ` (${pendingPayouts.length})` : ''}` },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-foreground text-lg">VANO Admin</h1>
          <p className="text-xs text-muted-foreground">Household bookings, students &amp; payouts</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setLoading(true); void loadAll(); }}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <RefreshCw size={13} /> Refresh
          </button>
          <button
            onClick={() => supabase.auth.signOut().then(() => navigate('/'))}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Alerts */}
      {(pendingHelpers.length > 0 || pendingPayouts.length > 0) && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-2 text-xs text-amber-800">
          <AlertTriangle size={13} className="flex-shrink-0" />
          <span>
            {pendingHelpers.length > 0 && `${pendingHelpers.length} helper${pendingHelpers.length > 1 ? 's' : ''} awaiting approval`}
            {pendingHelpers.length > 0 && pendingPayouts.length > 0 && ' · '}
            {pendingPayouts.length > 0 && `€${(totalPendingCents / 100).toFixed(2)} in pending payouts`}
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border bg-card">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex-1 py-3 text-sm font-medium transition-colors',
              tab === t.id ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4 max-w-3xl mx-auto space-y-3">

        {/* ── Bookings tab ── */}
        {tab === 'bookings' && (
          <>
            {/* Status filter */}
            <div className="flex gap-2 flex-wrap">
              {['all', 'pending', 'accepted', 'in_progress', 'completed', 'cancelled'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    'text-xs px-3 py-1 rounded-full border font-medium transition-colors capitalize',
                    statusFilter === s
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'text-muted-foreground border-border hover:text-foreground',
                  )}
                >
                  {s === 'all' ? `All (${bookings.length})` : s.replace('_', ' ')}
                </button>
              ))}
            </div>

            {filteredBookings.length === 0 ? (
              <p className="text-center text-muted-foreground py-12 text-sm">No bookings</p>
            ) : (
              filteredBookings.map((b) => (
                <div key={b.id} className="bg-card border border-border rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-semibold text-foreground">{CAT_LABELS[b.category ?? ''] ?? b.category}</p>
                      <p className="text-xs text-muted-foreground">{b.city} · {b.scheduled_date ?? 'No date'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full capitalize', STATUS_COLOURS[b.status] ?? 'bg-gray-100 text-gray-600')}>
                        {b.status.replace(/_/g, ' ')}
                      </span>
                      {b.price_estimate_cents && (
                        <span className="text-sm font-bold text-green-600">€{(b.price_estimate_cents / 100).toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1 text-sm mb-3">
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
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{format(new Date(b.created_at), 'dd MMM yyyy, HH:mm')} · #{b.id.slice(-8).toUpperCase()}</p>
                    {CANCELLABLE.includes(b.status) && (
                      <button
                        onClick={() => void handleRefund(b.id)}
                        disabled={actioning === b.id}
                        className="text-xs text-destructive border border-destructive/30 px-3 py-1 rounded-full hover:bg-destructive/5 disabled:opacity-50 flex items-center gap-1 transition-colors"
                      >
                        {actioning === b.id ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}
                        Cancel + refund
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* ── Students tab ── */}
        {tab === 'students' && (
          helpers.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">No students yet</p>
          ) : (
            helpers.map((h) => (
              <div key={h.id} className="bg-card border border-border rounded-2xl p-4 flex gap-3">
                {h.photo_url
                  ? <img src={h.photo_url} alt={h.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                  : <div className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0 text-xl font-bold text-muted-foreground">{h.name[0]}</div>
                }
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-0.5">
                    <p className="font-semibold text-foreground">{h.name}</p>
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full capitalize flex-shrink-0', STATUS_COLOURS[h.status] ?? 'bg-gray-100 text-gray-600')}>
                      {h.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{h.city}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{(h.categories ?? []).map((c) => CAT_LABELS[c] ?? c).join(', ')}</p>
                  {h.average_rating && h.rating_count > 0 && (
                    <p className="text-xs text-amber-600 mt-0.5">★ {h.average_rating.toFixed(1)} ({h.rating_count} ratings)</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {h.phone && (
                      <a href={`https://wa.me/${h.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
                        WhatsApp
                      </a>
                    )}
                    {h.email && <p className="text-xs text-muted-foreground truncate">{h.email}</p>}
                  </div>
                  {(h.status === 'pending' || h.status === 'pending_review') && (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => void handleApproveHelper(h.id)}
                        disabled={actioning === h.id}
                        className="flex items-center gap-1 text-xs bg-sage/10 text-sage border border-sage/30 px-3 py-1.5 rounded-full font-semibold hover:bg-sage/20 disabled:opacity-50 transition-colors"
                      >
                        {actioning === h.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                        Approve
                      </button>
                      <button
                        onClick={() => void handleRejectHelper(h.id)}
                        disabled={actioning === h.id}
                        className="flex items-center gap-1 text-xs text-destructive border border-destructive/30 px-3 py-1.5 rounded-full font-semibold hover:bg-destructive/5 disabled:opacity-50 transition-colors"
                      >
                        <XCircle size={11} /> Reject
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">{format(new Date(h.created_at), 'dd MMM yyyy')}</p>
                </div>
              </div>
            ))
          )
        )}

        {/* ── Payouts tab ── */}
        {tab === 'payouts' && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
                <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide mb-1">Pending</p>
                <p className="text-2xl font-bold text-foreground">€{(totalPendingCents / 100).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{pendingPayouts.length} payout{pendingPayouts.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="rounded-2xl bg-sage-light border border-sage/20 p-4">
                <p className="text-[11px] font-semibold text-sage uppercase tracking-wide mb-1">Paid out</p>
                <p className="text-2xl font-bold text-foreground">
                  €{(payouts.filter((p) => p.status === 'transferred').reduce((s, p) => s + p.amount_cents, 0) / 100).toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{payouts.filter((p) => p.status === 'transferred').length} transfers</p>
              </div>
            </div>

            {payouts.length === 0 ? (
              <p className="text-center text-muted-foreground py-12 text-sm">No payouts yet</p>
            ) : (
              <div className="rounded-2xl border border-border overflow-hidden">
                {payouts.map((p, i) => (
                  <div
                    key={p.id}
                    className={cn('flex items-center justify-between px-4 py-3.5 gap-3', i !== payouts.length - 1 && 'border-b border-border/40')}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        €{(p.amount_cents / 100).toFixed(2)}
                        {p.helper_name && <span className="ml-1.5 text-xs font-medium text-foreground/70">{p.helper_name.split(' ')[0]}</span>}
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground capitalize">{CAT_LABELS[p.category ?? ''] ?? p.category}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{format(new Date(p.created_at), 'dd MMM, HH:mm')} · #{p.booking_id.slice(-6).toUpperCase()} · {p.city}</p>
                    </div>
                    {p.status === 'pending' ? (
                      <button
                        onClick={() => void handleMarkPaid(p.id)}
                        disabled={actioning === p.id}
                        className="flex-shrink-0 text-xs bg-sage/10 text-sage border border-sage/30 px-3 py-1.5 rounded-full font-semibold hover:bg-sage/20 disabled:opacity-50 flex items-center gap-1 transition-colors"
                      >
                        {actioning === p.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                        Mark paid
                      </button>
                    ) : (
                      <span className="flex-shrink-0 text-xs text-sage font-semibold flex items-center gap-1">
                        <CheckCircle2 size={12} /> Paid
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
