import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Check, CircleAlert, Plus, TrendingUp, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { logSupabaseError } from '@/lib/supabaseError';
import { format, parseISO } from 'date-fns';

interface ReferralRow {
  id: string;
  sales_user_id: string;
  business_user_id: string;
  deal_value_eur: number;
  commission_eur: number;
  note: string | null;
  verified_by_business: boolean;
  disputed: boolean;
  created_at: string;
}

interface ProfileLite {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface SalesReferralsPanelProps {
  /**
   * 'business' — a hiring business viewing referrals submitted against them.
   * 'sales'    — a sales rep viewing / adding their own referrals.
   */
  mode: 'business' | 'sales';
  /** Current logged-in user's id. */
  currentUserId: string;
}

/**
 * Shared panel that renders either:
 * - (business) a per-rep breakdown of clients brought to them with verify/dispute controls, or
 * - (sales)    the rep's own ledger with an "Add client deal" form.
 */
export const SalesReferralsPanel: React.FC<SalesReferralsPanelProps> = ({ mode, currentUserId }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<ReferralRow[]>([]);
  const [counterparties, setCounterparties] = useState<Map<string, ProfileLite>>(new Map());
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newBusinessId, setNewBusinessId] = useState('');
  const [newDealValue, setNewDealValue] = useState('');
  const [newCommission, setNewCommission] = useState('');
  const [newNote, setNewNote] = useState('');
  // Businesses the sales rep has already been hired by (used as picker options).
  const [hiredBy, setHiredBy] = useState<ProfileLite[]>([]);

  const selfField = mode === 'business' ? 'business_user_id' : 'sales_user_id';
  const otherField = mode === 'business' ? 'sales_user_id' : 'business_user_id';

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('sales_client_referrals')
      .select('*')
      .eq(selfField, currentUserId)
      .order('created_at', { ascending: false });

    if (error) {
      logSupabaseError('SalesReferralsPanel: load', error);
      setLoading(false);
      return;
    }

    const list = (data ?? []) as ReferralRow[];
    setRows(list);

    // Fetch counterparty profile info.
    const ids = [...new Set(list.map((r) => r[otherField as keyof ReferralRow] as string))];
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', ids);
      setCounterparties(new Map((profs ?? []).map((p) => [p.user_id, p])));
    } else {
      setCounterparties(new Map());
    }

    // For sales mode, pull the list of businesses who've hired this rep so the
    // "Add client deal" form offers a sensible dropdown. We look at accepted
    // job_applications → posted_by business.
    if (mode === 'sales') {
      const { data: apps } = await supabase
        .from('job_applications')
        .select('job_id, status')
        .eq('student_id', currentUserId)
        .eq('status', 'accepted');
      const jobIds = [...new Set((apps ?? []).map((a) => a.job_id))];
      if (jobIds.length > 0) {
        const { data: jobRows } = await supabase
          .from('jobs')
          .select('posted_by')
          .in('id', jobIds);
        const bizIds = [...new Set((jobRows ?? []).map((j) => j.posted_by))];
        if (bizIds.length > 0) {
          const { data: bizProfs } = await supabase
            .from('profiles')
            .select('user_id, display_name, avatar_url')
            .in('user_id', bizIds);
          setHiredBy(bizProfs ?? []);
        }
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    if (!currentUserId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, mode]);

  /* ── Sales: add / delete row ── */
  const handleAdd = async () => {
    if (mode !== 'sales') return;
    const businessId = newBusinessId.trim();
    if (!businessId) {
      toast({ title: 'Pick a business', description: 'Choose which business this client belongs to.', variant: 'destructive' });
      return;
    }
    const deal = parseFloat(newDealValue.replace(',', '.'));
    const commission = parseFloat(newCommission.replace(',', '.'));
    if (Number.isNaN(deal) || deal < 0) {
      toast({ title: 'Invalid deal value', description: 'Enter a positive number.', variant: 'destructive' });
      return;
    }
    if (Number.isNaN(commission) || commission < 0) {
      toast({ title: 'Invalid commission', description: 'Enter a positive number.', variant: 'destructive' });
      return;
    }
    setAdding(true);
    const { error } = await supabase.from('sales_client_referrals').insert({
      sales_user_id: currentUserId,
      business_user_id: businessId,
      deal_value_eur: deal,
      commission_eur: commission,
      note: newNote.trim() || null,
    });
    setAdding(false);
    if (error) {
      logSupabaseError('SalesReferralsPanel: insert', error);
      toast({ title: 'Could not log client', description: error.message, variant: 'destructive' });
      return;
    }
    setNewBusinessId('');
    setNewDealValue('');
    setNewCommission('');
    setNewNote('');
    toast({ title: 'Client logged', description: 'Awaiting verification from the business.' });
    load();
  };

  const handleDelete = async (id: string) => {
    if (mode !== 'sales') return;
    const { error } = await supabase.from('sales_client_referrals').delete().eq('id', id);
    if (error) {
      toast({ title: 'Could not delete', description: error.message, variant: 'destructive' });
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  /* ── Business: verify / dispute ── */
  const handleVerify = async (row: ReferralRow) => {
    if (mode !== 'business') return;
    const next = !row.verified_by_business;
    const { error } = await supabase
      .from('sales_client_referrals')
      .update({ verified_by_business: next, disputed: next ? false : row.disputed })
      .eq('id', row.id);
    if (error) {
      toast({ title: 'Could not update', description: error.message, variant: 'destructive' });
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, verified_by_business: next, disputed: next ? false : r.disputed } : r)));
  };

  const handleDispute = async (row: ReferralRow) => {
    if (mode !== 'business') return;
    const next = !row.disputed;
    const { error } = await supabase
      .from('sales_client_referrals')
      .update({ disputed: next, verified_by_business: next ? false : row.verified_by_business })
      .eq('id', row.id);
    if (error) {
      toast({ title: 'Could not update', description: error.message, variant: 'destructive' });
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, disputed: next, verified_by_business: next ? false : r.verified_by_business } : r)));
  };

  /* ── Aggregates ── */
  const totals = useMemo(() => {
    const verified = rows.filter((r) => r.verified_by_business);
    return {
      rowsCount: rows.length,
      verifiedCount: verified.length,
      dealSum: rows.reduce((s, r) => s + Number(r.deal_value_eur), 0),
      commissionSum: rows.reduce((s, r) => s + Number(r.commission_eur), 0),
      verifiedCommissionSum: verified.reduce((s, r) => s + Number(r.commission_eur), 0),
    };
  }, [rows]);

  /* ── Business view: group by sales rep ── */
  const businessGroups = useMemo(() => {
    if (mode !== 'business') return [];
    const map = new Map<string, ReferralRow[]>();
    for (const r of rows) {
      const arr = map.get(r.sales_user_id) ?? [];
      arr.push(r);
      map.set(r.sales_user_id, arr);
    }
    return Array.from(map.entries()).map(([salesId, group]) => ({
      salesId,
      profile: counterparties.get(salesId) ?? null,
      rows: group,
      dealSum: group.reduce((s, r) => s + Number(r.deal_value_eur), 0),
      commissionSum: group.reduce((s, r) => s + Number(r.commission_eur), 0),
      verifiedCount: group.filter((r) => r.verified_by_business).length,
    }));
  }, [mode, rows, counterparties]);

  if (loading) {
    return (
      <Card className="border-foreground/[0.06] shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" strokeWidth={1.8} />
            {mode === 'business' ? 'Sales referrals' : 'Clients I brought'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 animate-pulse rounded-lg bg-muted/40" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-foreground/[0.06] shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" strokeWidth={1.8} />
          {mode === 'business' ? 'Sales referrals' : 'Clients I brought'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Totals strip */}
        <div className="grid grid-cols-3 gap-3 rounded-xl border border-foreground/[0.04] bg-muted/30 p-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Clients</p>
            <p className="mt-1 text-lg font-bold tabular-nums">{totals.rowsCount}</p>
            <p className="text-[11px] text-muted-foreground">{totals.verifiedCount} verified</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Deal value</p>
            <p className="mt-1 text-lg font-bold tabular-nums">€{totals.dealSum.toFixed(0)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Commission</p>
            <p className="mt-1 text-lg font-bold tabular-nums">€{totals.commissionSum.toFixed(0)}</p>
            <p className="text-[11px] text-muted-foreground">€{totals.verifiedCommissionSum.toFixed(0)} verified</p>
          </div>
        </div>

        {/* Sales mode: add form */}
        {mode === 'sales' && (
          <div className="rounded-xl border border-dashed border-foreground/10 bg-background p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Log a client you brought in
            </p>
            <div className="mt-3 space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Business</Label>
                {hiredBy.length > 0 ? (
                  <select
                    value={newBusinessId}
                    onChange={(e) => setNewBusinessId(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Select a business…</option>
                    {hiredBy.map((b) => (
                      <option key={b.user_id} value={b.user_id}>
                        {b.display_name ?? b.user_id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    className="mt-1.5 h-10"
                    placeholder="Business user ID (once you've been hired, they appear here)"
                    value={newBusinessId}
                    onChange={(e) => setNewBusinessId(e.target.value)}
                  />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Deal value (€)</Label>
                  <Input
                    className="mt-1.5 h-10"
                    inputMode="decimal"
                    placeholder="e.g. 500"
                    value={newDealValue}
                    onChange={(e) => setNewDealValue(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Commission (€)</Label>
                  <Input
                    className="mt-1.5 h-10"
                    inputMode="decimal"
                    placeholder="e.g. 50"
                    value={newCommission}
                    onChange={(e) => setNewCommission(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Note (optional)</Label>
                <Input
                  className="mt-1.5 h-10"
                  placeholder="Short label so you both recognise the client"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  maxLength={120}
                />
              </div>
              <Button type="button" size="sm" onClick={handleAdd} disabled={adding} className="gap-1">
                <Plus className="h-4 w-4" /> Add client
              </Button>
            </div>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-foreground/10 px-6 py-10 text-center">
            <TrendingUp className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />
            <p className="text-sm font-medium text-muted-foreground">
              {mode === 'business'
                ? 'No sales referrals logged yet'
                : 'No clients logged yet — add your first one above'}
            </p>
          </div>
        ) : mode === 'business' ? (
          <div className="space-y-4">
            {businessGroups.map((grp) => (
              <div key={grp.salesId} className="rounded-xl border border-foreground/[0.06] bg-background">
                <div className="flex items-center gap-3 border-b border-foreground/[0.04] p-3">
                  <Avatar className="h-9 w-9 border border-border/60">
                    <AvatarImage src={grp.profile?.avatar_url ?? undefined} />
                    <AvatarFallback className="bg-primary/5 text-primary text-xs font-semibold">
                      {(grp.profile?.display_name ?? '?')[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {grp.profile?.display_name ?? 'Sales rep'}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {grp.rows.length} client{grp.rows.length !== 1 ? 's' : ''} · {grp.verifiedCount} verified
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Commission</p>
                    <p className="text-sm font-semibold tabular-nums">€{grp.commissionSum.toFixed(0)}</p>
                  </div>
                </div>
                <div className="divide-y divide-foreground/[0.04]">
                  {grp.rows.slice(0, 5).map((r) => (
                    <ReferralRowView
                      key={r.id}
                      row={r}
                      mode="business"
                      onVerify={() => handleVerify(r)}
                      onDispute={() => handleDispute(r)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-foreground/[0.04] rounded-xl border border-foreground/[0.06] bg-background">
            {rows.map((r) => (
              <ReferralRowView
                key={r.id}
                row={r}
                mode="sales"
                counterparty={counterparties.get(r.business_user_id) ?? null}
                onDelete={() => handleDelete(r.id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

interface ReferralRowViewProps {
  row: ReferralRow;
  mode: 'business' | 'sales';
  counterparty?: ProfileLite | null;
  onVerify?: () => void;
  onDispute?: () => void;
  onDelete?: () => void;
}

const ReferralRowView: React.FC<ReferralRowViewProps> = ({
  row,
  mode,
  counterparty,
  onVerify,
  onDispute,
  onDelete,
}) => {
  return (
    <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {mode === 'sales' && counterparty && (
            <span className="truncate text-sm font-medium">{counterparty.display_name ?? 'Business'}</span>
          )}
          {row.note && (
            <span className="truncate text-sm text-foreground/80">{mode === 'sales' ? '· ' : ''}{row.note}</span>
          )}
          {row.verified_by_business && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
              <Check className="h-3 w-3" strokeWidth={2.5} /> Verified
            </span>
          )}
          {row.disputed && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-400">
              <CircleAlert className="h-3 w-3" strokeWidth={2.5} /> Disputed
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          €{Number(row.deal_value_eur).toFixed(0)} deal · €{Number(row.commission_eur).toFixed(0)} commission · {format(parseISO(row.created_at), 'd MMM yyyy')}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {mode === 'business' && (
          <>
            <Button
              type="button"
              size="sm"
              variant={row.verified_by_business ? 'default' : 'outline'}
              className={cn('h-8 text-[12px]', row.verified_by_business && 'bg-emerald-600 hover:bg-emerald-700')}
              onClick={onVerify}
            >
              <Check className="mr-1 h-3.5 w-3.5" strokeWidth={2.5} />
              {row.verified_by_business ? 'Verified' : 'Verify'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={row.disputed ? 'destructive' : 'outline'}
              className="h-8 text-[12px]"
              onClick={onDispute}
            >
              {row.disputed ? 'Disputed' : 'Dispute'}
            </Button>
          </>
        )}
        {mode === 'sales' && !row.verified_by_business && (
          <Button type="button" size="sm" variant="ghost" className="h-8 text-muted-foreground" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
};
