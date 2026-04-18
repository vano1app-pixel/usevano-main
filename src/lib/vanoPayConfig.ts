import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';

// Fee + amount bounds for Vano Pay. Authoritative copy lives on the
// server (supabase/functions/_shared/vanoPayConfig.ts); the frontend
// fetches it so the modal preview stays in sync without redeploys
// when the fee changes. Defaults below mirror the server as of the
// last deploy and act as a safety net if the endpoint is unreachable.

export interface VanoPayConfig {
  feeBps: number;
  minCents: number;
  maxCents: number;
  currency: string;
}

export const VANO_PAY_CONFIG_FALLBACK: VanoPayConfig = {
  feeBps: 300,
  minCents: 100,
  maxCents: 500000,
  currency: 'eur',
};

async function fetchVanoPayConfig(): Promise<VanoPayConfig> {
  const { data, error } = await supabase.functions.invoke('get-vano-pay-config', {
    body: {},
  });
  if (error) throw error;
  const parsed = data as Partial<VanoPayConfig> | null;
  return {
    feeBps: typeof parsed?.feeBps === 'number' ? parsed.feeBps : VANO_PAY_CONFIG_FALLBACK.feeBps,
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
