import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface Channel { configured: boolean; live: boolean | null; note: string | null }
interface Health {
  ok: boolean;
  checkedAt: string;
  channels: Record<string, Channel>;
  supply: { approvedAvailable: number; approvedNoPhone: number; approvedNoUserId: number };
  pipeline: {
    openUnassigned: number;
    acceptedUnpaid: number;
    lastDispatch: { ref: string; category: string | null; city: string | null; workers: number } | null;
  };
}

const CHANNEL_LABELS: Record<string, string> = {
  ownerWhatsApp:  'Owner WhatsApp (your alerts)',
  workerWhatsApp: 'Worker WhatsApp',
  workerSms:      'Worker SMS',
  email:          'Email (Resend)',
  push:           'Web push',
  payments:       'Payments (Stripe)',
  adminEmail:     'Admin email address',
};

const CHANNEL_ORDER = ['ownerWhatsApp', 'workerWhatsApp', 'workerSms', 'email', 'push', 'payments', 'adminEmail'];

function StatusDot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  if (ok) return <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />;
  if (warn) return <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />;
  return <XCircle size={16} className="text-red-500 flex-shrink-0" />;
}

export default function SystemHealthPanel() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('admin-health');
      if (error) throw error;
      setHealth(data as Health);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load health');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  if (loading && !health) {
    return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }
  if (error) {
    return (
      <div className="bg-card border border-border rounded-2xl p-5 text-sm">
        <p className="text-red-500 font-medium mb-2">Couldn't load system health</p>
        <p className="text-muted-foreground mb-3">{error}</p>
        <button onClick={() => void load()} className="text-xs text-primary flex items-center gap-1"><RefreshCw size={13} /> Try again</button>
      </div>
    );
  }
  if (!health) return null;

  const s = health.supply;
  const p = health.pipeline;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Checked {new Date(health.checkedAt).toLocaleTimeString()}</p>
        <button onClick={() => void load()} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <RefreshCw size={12} className={cn(loading && 'animate-spin')} /> Refresh
        </button>
      </div>

      {/* Channels */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <p className="font-semibold text-foreground text-sm mb-3">Notification channels</p>
        <div className="space-y-2.5">
          {CHANNEL_ORDER.filter((k) => health.channels[k]).map((key) => {
            const c = health.channels[key];
            // Green = configured (and live where we can check); amber = configured
            // but the live credential check failed; red = not configured.
            const liveBad = c.configured && c.live === false;
            return (
              <div key={key} className="flex items-start gap-2.5 text-sm">
                <StatusDot ok={c.configured && c.live !== false} warn={liveBad} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground">{CHANNEL_LABELS[key] ?? key}</span>
                    <span className={cn(
                      'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                      c.configured && c.live !== false ? 'bg-emerald-50 text-emerald-700'
                        : liveBad ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600',
                    )}>
                      {!c.configured ? 'Not set' : c.live === false ? 'Credentials failing' : c.live === true ? 'Live ✓' : 'Configured'}
                    </span>
                  </div>
                  {c.note && <p className="text-xs text-muted-foreground mt-0.5">{c.note}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Supply reach */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <p className="font-semibold text-foreground text-sm mb-3">Worker reach</p>
        <div className="space-y-2.5 text-sm">
          <div className="flex items-center gap-2.5">
            <StatusDot ok={s.approvedAvailable > 0} />
            <span className="text-foreground">{s.approvedAvailable} approved & available worker{s.approvedAvailable === 1 ? '' : 's'}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <StatusDot ok={s.approvedNoPhone === 0} warn={s.approvedNoPhone > 0} />
            <span className="text-foreground">
              {s.approvedNoPhone} with no phone <span className="text-muted-foreground">— can't get WhatsApp/SMS</span>
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <StatusDot ok={s.approvedNoUserId === 0} warn={s.approvedNoUserId > 0} />
            <span className="text-foreground">
              {s.approvedNoUserId} with no account <span className="text-muted-foreground">— no push until first one-tap</span>
            </span>
          </div>
        </div>
      </div>

      {/* Live pipeline */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <p className="font-semibold text-foreground text-sm mb-3">Right now</p>
        <div className="space-y-2.5 text-sm">
          <div className="flex items-center gap-2.5">
            <StatusDot ok={p.openUnassigned === 0} warn={p.openUnassigned > 0} />
            <span className="text-foreground">{p.openUnassigned} open job{p.openUnassigned === 1 ? '' : 's'} waiting for a worker</span>
          </div>
          <div className="flex items-center gap-2.5">
            <StatusDot ok={p.acceptedUnpaid === 0} warn={p.acceptedUnpaid > 0} />
            <span className="text-foreground">{p.acceptedUnpaid} accepted but unpaid</span>
          </div>
          {p.lastDispatch && (
            <div className="flex items-center gap-2.5">
              <StatusDot ok={p.lastDispatch.workers > 0} warn={p.lastDispatch.workers === 0} />
              <span className="text-foreground">
                Last job ({p.lastDispatch.ref}) reached <strong>{p.lastDispatch.workers}</strong> worker{p.lastDispatch.workers === 1 ? '' : 's'}
                {p.lastDispatch.city ? <span className="text-muted-foreground"> · {p.lastDispatch.city}</span> : null}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
