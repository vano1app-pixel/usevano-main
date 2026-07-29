-- Security hardening (2026-07-29) — close a self-referral hole in the PARTNER
-- commission program.
--
-- FINDING: resolve_referral_attribution() (migration 20260629010000) resolved a
-- typed referral code into an attribution using only "code exists + active + no
-- existing attribution". It NEVER checked that the code's owner is a different
-- person from the helper signing up under it. So someone intending to work as a
-- helper could mint their own partner code (get-referral-code / partner-program,
-- with a throwaway email/phone), enter it at /join, and then skim 3% of every
-- one of their own completed jobs out of VANO's fee margin for a year — the
-- exact abuse the CUSTOMER give-5-get-5 program already blocks at checkout
-- (create-household-payment-checkout: codeRow.phone !== normalizedPhone).
--
-- FIX: refuse to create the attribution when the code's owner_email or
-- owner_phone matches the helper's own email/phone. This is the single choke
-- point for BOTH attribution paths — the signup payload (referred_by_code in
-- create-helper-application) and the attach-referral-code backstop both land
-- here via the trg_resolve_referral_attribution trigger — so the accrual
-- triggers, which key off the attribution, can never pay a self-referral.
--
-- Only the function body changes; the trigger is untouched. Still fully
-- exception-safe: any error here can never block a signup.

create or replace function public.resolve_referral_attribution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code_id uuid;
  v_owner_email text;
  v_owner_phone text;
  v_helper_email text := lower(btrim(coalesce(NEW.email, '')));
  v_helper_phone_digits text := regexp_replace(coalesce(NEW.phone, ''), '\D', '', 'g');
  v_owner_phone_digits text;
begin
  begin
    if NEW.referred_by_code is null or btrim(NEW.referred_by_code) = '' then
      return NEW;
    end if;
    if exists (select 1 from referral_attributions where helper_id = NEW.id) then
      return NEW;
    end if;
    select id, owner_email, owner_phone
      into v_code_id, v_owner_email, v_owner_phone
      from referral_codes
      where upper(code) = upper(btrim(NEW.referred_by_code)) and active
      limit 1;
    if v_code_id is null then
      return NEW;
    end if;

    -- No self-referral: a helper must not earn partner commission on their own
    -- jobs by signing up under a code they own. Match on email (case-insensitive)
    -- OR phone (last 9 digits — Irish-mobile safe, tolerant of +353/0 forms).
    v_owner_phone_digits := regexp_replace(coalesce(v_owner_phone, ''), '\D', '', 'g');
    if (v_helper_email <> '' and lower(btrim(coalesce(v_owner_email, ''))) = v_helper_email)
       or (length(v_helper_phone_digits) >= 9 and length(v_owner_phone_digits) >= 9
           and right(v_owner_phone_digits, 9) = right(v_helper_phone_digits, 9)) then
      raise warning 'resolve_referral_attribution: self-referral blocked for helper %', NEW.id;
      return NEW;
    end if;

    insert into referral_attributions (code_id, helper_id)
      values (v_code_id, NEW.id)
      on conflict (helper_id) do nothing;
  exception when others then
    raise warning 'resolve_referral_attribution failed: %', sqlerrm;
  end;
  return NEW;
end;
$$;
