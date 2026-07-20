import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

// Admin ledger for partner commissions (the 3% recruit-a-student program).
//
// Partner payouts are MANUAL by design — the owner sends the money (Revolut /
// bank) and then records it here; there is no automated transfer. This
// endpoint gives the admin dashboard the two halves of that loop:
//   { action: 'list' }                          → per-partner owed/paid summary
//   { action: 'mark_paid', code_id, expected_cents? } → flip that partner's
//     pending commission rows to paid (paid_at stamped)
//
// mark_paid snapshots the pending rows FIRST and only updates those ids, so a
// commission accruing mid-click stays pending instead of being silently marked
// paid without money moving. Passing expected_cents (the total the admin saw)
// adds a stale-screen guard: if the live pending total differs, nothing is
// updated and a 409 returns the fresh number.
//
// Auth mirrors admin-complete-household-job: caller JWT → getClaims →
// user_roles must contain role='admin'. verify_jwt is pinned false in
// config.toml like the rest of the fleet — this in-function gate is the auth.

interface CommissionRow {
  id: string;
  code_id: string;
  amount_cents: number | null;
  status: string;
  created_at: string | null;
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const bad = (status: number, error: string, extra?: Record<string, unknown>): Response =>
    new Response(JSON.stringify({ error, ...extra }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!isOriginAllowed(req)) return bad(403, 'Forbidden origin');
  if (req.method !== 'POST') return bad(405, 'Method not allowed');

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return bad(401, 'Unauthorized');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify the JWT and resolve the caller.
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return bad(401, 'Unauthorized');
    // The anon key is itself a valid JWT with no sub — reject anything that
    // isn't a real signed-in user before touching user_roles.
    const callerId = typeof claimsData.claims.sub === 'string' ? claimsData.claims.sub : null;
    if (!callerId) return bad(401, 'Unauthorized');

    // Admin role check (service-role client bypasses RLS on user_roles).
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', callerId)
      .eq('role', 'admin')
      .maybeSingle();
    if (!roleRow) return bad(403, 'Admin access required');

    const body = await req.json().catch(() => ({}));
    const action = body?.action === 'mark_paid' ? 'mark_paid' : 'list';

    if (action === 'list') {
      // Every commission row, newest first. 2000 covers years at current
      // volume; if it ever truncates, the oldest (long-settled) rows drop.
      const { data: commissions, error: commErr } = await supabase
        .from('referral_commissions')
        .select('id, code_id, amount_cents, status, created_at')
        .order('created_at', { ascending: false })
        .limit(2000);
      if (commErr) {
        console.error('[admin-partner-payouts] list query failed', commErr);
        return bad(500, 'Could not load commissions');
      }

      const byCode = new Map<string, {
        pending_cents: number; pending_count: number;
        paid_cents: number; paid_count: number;
        last_earned_at: string | null;
      }>();
      for (const c of (commissions ?? []) as CommissionRow[]) {
        let agg = byCode.get(c.code_id);
        if (!agg) {
          // Rows arrive newest-first, so the first row seen is the latest.
          agg = { pending_cents: 0, pending_count: 0, paid_cents: 0, paid_count: 0, last_earned_at: c.created_at };
          byCode.set(c.code_id, agg);
        }
        const amt = c.amount_cents ?? 0;
        if (c.status === 'paid') { agg.paid_cents += amt; agg.paid_count++; }
        else { agg.pending_cents += amt; agg.pending_count++; }
      }

      if (byCode.size === 0) {
        return new Response(JSON.stringify({ partners: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: codes, error: codesErr } = await supabase
        .from('referral_codes')
        .select('id, code, owner_name, owner_email, owner_phone')
        .in('id', [...byCode.keys()]);
      if (codesErr) {
        console.error('[admin-partner-payouts] codes query failed', codesErr);
        return bad(500, 'Could not load partner codes');
      }

      const partners = (codes ?? [])
        .map((row) => ({
          code_id: row.id as string,
          code: row.code as string,
          owner_name: (row.owner_name as string | null) ?? null,
          owner_email: (row.owner_email as string | null) ?? null,
          owner_phone: (row.owner_phone as string | null) ?? null,
          ...byCode.get(row.id as string)!,
        }))
        // Money owed first (largest debt on top), settled partners after.
        .sort((a, b) => (b.pending_cents - a.pending_cents) || (b.paid_cents - a.paid_cents));

      return new Response(JSON.stringify({ partners }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── mark_paid ──
    const codeId = typeof body?.code_id === 'string' ? body.code_id.trim() : null;
    if (!codeId) return bad(400, 'code_id required');
    const expectedCents = typeof body?.expected_cents === 'number' && Number.isFinite(body.expected_cents)
      ? Math.round(body.expected_cents)
      : null;

    // Snapshot the pending rows, then update ONLY those ids — a commission
    // landing between snapshot and update stays pending.
    const { data: pendingRows, error: pendErr } = await supabase
      .from('referral_commissions')
      .select('id, amount_cents')
      .eq('code_id', codeId)
      .eq('status', 'pending');
    if (pendErr) {
      console.error('[admin-partner-payouts] pending query failed', pendErr);
      return bad(500, 'Could not load pending commissions');
    }

    const ids = (pendingRows ?? []).map((r) => r.id as string);
    const pendingCents = (pendingRows ?? []).reduce((s, r) => s + ((r.amount_cents as number) ?? 0), 0);
    if (ids.length === 0) {
      return new Response(JSON.stringify({ success: true, marked: 0, amount_cents: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (expectedCents !== null && expectedCents !== pendingCents) {
      return bad(409, 'The pending total changed since you loaded the page — check the fresh amount and try again.', {
        pending_cents: pendingCents,
      });
    }

    const { data: updated, error: updErr } = await supabase
      .from('referral_commissions')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .in('id', ids)
      .eq('status', 'pending')
      .select('id, amount_cents');
    if (updErr) {
      console.error('[admin-partner-payouts] mark_paid update failed', updErr);
      return bad(500, 'Could not mark commissions paid');
    }

    const marked = updated?.length ?? 0;
    const amountCents = (updated ?? []).reduce((s, r) => s + ((r.amount_cents as number) ?? 0), 0);
    console.log(`[admin-partner-payouts] admin ${callerId.slice(0, 8)} marked ${marked} commission rows (€${(amountCents / 100).toFixed(2)}) paid for code ${codeId}`);

    return new Response(JSON.stringify({ success: true, marked, amount_cents: amountCents }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[admin-partner-payouts] unhandled error', err);
    return bad(500, 'Unexpected error');
  }
});
