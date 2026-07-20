-- Cron shared secret — fixes the hourly 401 on nudge-helper-onboarding.
-- ---------------------------------------------------------------------------
-- The function's spend gate demands `Authorization: Bearer <service key>`,
-- but the scheduled job was created with the PUBLIC ANON key (verified live
-- 2026-07-20), so every hourly run 401'd and stalled helpers were never
-- chased to finish their ID check.
--
-- Fix without embedding the service key anywhere: a random secret lives in
-- the vault; pg_cron resolves it AT RUN TIME into an X-Vano-Cron header, and
-- the function validates it through check_cron_key() — a definer RPC whose
-- EXECUTE is stripped from anon/authenticated, so holders of the public keys
-- still can't fire the spend endpoint. The service-key path stays for manual
-- invocations.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'vano_cron_secret') then
    perform vault.create_secret(
      encode(gen_random_bytes(24), 'hex'),
      'vano_cron_secret',
      'Shared secret pg_cron presents (X-Vano-Cron) to spend-gated edge functions'
    );
  end if;
end $$;

create or replace function public.check_cron_key(candidate text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'vano_cron_secret' and decrypted_secret = candidate
  );
$$;

revoke all on function public.check_cron_key(text) from public;
revoke all on function public.check_cron_key(text) from anon;
revoke all on function public.check_cron_key(text) from authenticated;
grant execute on function public.check_cron_key(text) to service_role;

-- Reschedule the job by name (same cadence) with the runtime-resolved header.
select cron.schedule(
  'nudge-helper-onboarding',
  '30 * * * *',
  $cmd$ SELECT net.http_post(
    url := 'https://puomfwjtpvqedwxjxogh.supabase.co/functions/v1/nudge-helper-onboarding',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Vano-Cron', (select decrypted_secret from vault.decrypted_secrets where name = 'vano_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  ); $cmd$
);
