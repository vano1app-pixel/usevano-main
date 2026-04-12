-- Schedule the expire-hire-requests cleanup to run every minute.
--
-- This uses pg_cron + pg_net (both available on Supabase Pro and above).
-- If either extension is not enabled for this project, the migration is a no-op
-- and expiry can still run via an external cron hitting the edge function, or
-- via the Postgres function `expire_stale_hire_requests()` defined earlier.
--
-- To swap from the edge function to the pure-SQL path, replace the pg_net.http_post
-- call with `perform public.expire_stale_hire_requests();`

do $$
declare
  has_pg_cron boolean;
  has_pg_net boolean;
  project_url text;
  service_key text;
begin
  select exists(select 1 from pg_extension where extname = 'pg_cron') into has_pg_cron;
  select exists(select 1 from pg_extension where extname = 'pg_net') into has_pg_net;

  if not has_pg_cron then
    raise notice 'pg_cron extension not enabled — skipping hire request expiry schedule.';
    return;
  end if;

  -- If pg_net + vault are available, prefer invoking the edge function so
  -- requester notifications also fire. Otherwise fall back to the SQL helper.
  begin
    select decrypted_secret into project_url from vault.decrypted_secrets where name = 'supabase_url' limit 1;
    select decrypted_secret into service_key from vault.decrypted_secrets where name = 'supabase_service_role_key' limit 1;
  exception when others then
    project_url := null;
    service_key := null;
  end;

  if has_pg_net and project_url is not null and service_key is not null then
    perform cron.schedule(
      'expire-hire-requests-every-minute',
      '* * * * *',
      format($c$
        select net.http_post(
          url := %L,
          headers := jsonb_build_object('Authorization', %L, 'Content-Type', 'application/json'),
          body := '{}'::jsonb
        );
      $c$, project_url || '/functions/v1/expire-hire-requests', 'Bearer ' || service_key)
    );
  else
    -- Pure-SQL fallback: marks rows expired but does NOT insert requester notifications.
    -- Good enough to keep the table clean; upgrade to the pg_net path once vault secrets are set.
    perform cron.schedule(
      'expire-hire-requests-every-minute',
      '* * * * *',
      $c$ select public.expire_stale_hire_requests(); $c$
    );
  end if;
end $$;
