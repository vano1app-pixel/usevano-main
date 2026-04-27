import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';

// Fee + amount bounds for Vano Pay. Authoritative copy lives on the
// server (supabase/functions/_shared/vanoPayConfig.ts); the frontend
// fetches it so the modal preview stays in sync without redeploys
// when the fee changes. Defaults below mirror the server as of the
// last deploy and act as a safety net if the endpoint is unreachable.
//
// Fee model: SPLIT 4% / 4% on the agreed price (the figure the
// freelancer quoted in chat). Hirer is charged agreed + 4%; freelancer
// receives agreed − 4%; Vano keeps 8% total.

export interface VanoPayConfig {
  hirerFeeBps: number;
  freelancerFeeBps: number;
  // Sum of the two split bps — useful for headline copy ("Vano takes
  // 8% of the agreed price"). Equals hirer + freelancer.
  totalFeeBpsOfAgreed: number;
  minCents: number;
  maxCents: number;
  currency: string;
}

export const VANO_PAY_CONFIG_FALLBACK: VanoPayConfig = {
  hirerFeeBps: 400,
  freelancerFeeBps: 400,
  totalFeeBpsOfAgreed: 800,
  minCents: 100,
  maxCents: 500000,
  currency: 'eur',
};

async function fetchVanoPayConfig(): Promise<VanoPayConfig> {
  const { data, error } = await supabase.functions.invoke('get-vano-pay-config', {
    body: {},
  });
  if (error) throw error;
  const parsed = data as Partial<VanoPayConfig> & { feeBps?: number } | null;
  // Tolerate a stale server that only knows about feeBps — treat it
  // as "all on one side" for the purposes of preview math (hirer-side
  // gross-up). New deploys serve hirerFeeBps + freelancerFeeBps so
  // this branch is just a safety net during the rollout.
  const hirerFeeBps = typeof parsed?.hirerFeeBps === 'number'
    ? parsed.hirerFeeBps
    : typeof parsed?.feeBps === 'number'
      ? parsed.feeBps
      : VANO_PAY_CONFIG_FALLBACK.hirerFeeBps;
  const freelancerFeeBps = typeof parsed?.freelancerFeeBps === 'number'
    ? parsed.freelancerFeeBps
    : VANO_PAY_CONFIG_FALLBACK.freelancerFeeBps;
  const totalFeeBpsOfAgreed = typeof parsed?.totalFeeBpsOfAgreed === 'number'
    ? parsed.totalFeeBpsOfAgreed
    : hirerFeeBps + freelancerFeeBps;
  return {
    hirerFeeBps,
    freelancerFeeBps,
    totalFeeBpsOfAgreed,
    minCents: typeof parsed?.minCents === 'number' ? parsed.minCents : VANO_PAY_CONFIG_FALLBACK.minCents,
    maxCents: typeof parsed?.maxCents === 'number' ? parsed.maxCents : VANO_PAY_CONFIG_FALLBACK.maxCents,
    currency: typeof parsed?.currency === 'string' ? parsed.currency : VANO_PAY_CONFIG_FALLBACK.currency,
  };
}

export function useVanoPayConfig(): VanoPayConfig {
  const query = useQuery<VanoPayConfig>({
    queryKey: ['vano-pay-config'],
    queryFn: fetchVanoPayConfig,
    // 1 hour fresh + 1 day cached — fee changes are rare and a stale
    // preview never corrupts the charge (server is authoritative).
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });
  return query.data ?? VANO_PAY_CONFIG_FALLBACK;
}

// Pure math helper — keep in lockstep with computeVanoPaySplit in
// supabase/functions/_shared/vanoPayConfig.ts. The server is
// authoritative; this just lets the modal render an accurate preview
// before the request fires. A regression here surfaces in the
// vanoPayMath test (src/lib/__tests__/vanoPayMath.test.ts).
export function computeVanoPaySplit(
  agreedCents: number,
  config: Pick<VanoPayConfig, 'hirerFeeBps' | 'freelancerFeeBps'>,
): {
  agreedCents: number;
  hirerFeeCents: number;
  freelancerFeeCents: number;
  amountCents: number;
  feeCents: number;
  freelancerCents: number;
} {
  const hirerFeeCents = agreedCents > 0
    ? Math.max(1, Math.round((agreedCents * config.hirerFeeBps) / 10000))
    : 0;
  const freelancerFeeCents = agreedCents > 0
    ? Math.max(1, Math.round((agreedCents * config.freelancerFeeBps) / 10000))
    : 0;
  const amountCents = agreedCents + hirerFeeCents;
  const feeCents = hirerFeeCents + freelancerFeeCents;
  const freelancerCents = agreedCents - freelancerFeeCents;
  return {
    agreedCents,
    hirerFeeCents,
    freelancerFeeCents,
    amountCents,
    feeCents,
    freelancerCents,
  };
}
