-- Bug fixes for direct hire flow (post-deployment audit):
--   1. Notify the business (requester) when their direct hire request is accepted/declined.
--      Before this, the freelancer saw a toast and a conversation opened for them,
--      but the requester heard nothing — breaking the feedback loop.
--   2. Prevent freelancers from accepting/declining a request whose expires_at has
--      already passed. Previously the RLS update policy only checked status='pending',
--      so stale requests could be resurrected hours/days later.

-- ========================================================================
-- FIX 2: Tighten the update RLS policy to honour expires_at
-- ========================================================================
drop policy if exists "Targeted freelancer can respond to direct hire requests"
  on public.hire_requests;

create policy "Targeted freelancer can respond to direct hire requests"
  on public.hire_requests for update
  using (
    kind = 'direct'
    and auth.uid() = target_freelancer_id
    and status = 'pending'
    and (expires_at is null or expires_at > now())
  )
  with check (
    kind = 'direct'
    and auth.uid() = target_freelancer_id
    and status in ('accepted','declined')
  );

-- ========================================================================
-- FIX 1: Trigger that inserts a notification for the requester whenever a
--        pending direct hire request transitions to accepted or declined.
-- ========================================================================
create or replace function public.notify_requester_on_hire_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  freelancer_name text;
  status_title text;
  status_message text;
begin
  -- Only fire for direct hire requests that just transitioned out of pending
  if new.kind <> 'direct' then return new; end if;
  if old.status = new.status then return new; end if;
  if old.status <> 'pending' then return new; end if;
  if new.status not in ('accepted','declined') then return new; end if;

  -- Look up the freelancer's display name for a friendly notification
  select coalesce(display_name, 'The freelancer')
    into freelancer_name
  from public.profiles
  where user_id = new.target_freelancer_id
  limit 1;

  if new.status = 'accepted' then
    status_title := '🎉 ' || freelancer_name || ' accepted your hire!';
    status_message := 'Open your messages to lock in the details.';
  else
    status_title := freelancer_name || ' declined your hire request';
    status_message := 'No worries — browse other freelancers who are available now.';
  end if;

  insert into public.notifications (user_id, title, message, read)
  values (new.requester_id, status_title, status_message, false);

  return new;
end $$;

drop trigger if exists hire_requests_notify_response on public.hire_requests;
create trigger hire_requests_notify_response
  after update on public.hire_requests
  for each row
  execute function public.notify_requester_on_hire_response();
