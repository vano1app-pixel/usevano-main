-- App Store review demo seed (2026-09-06). Idempotent — see README.md.
-- Fixed ids so re-runs update in place.
--   helper auth user  00000000-0000-4000-8000-00000000000a
--   helper row        00000000-0000-4000-8000-00000000000b
--   open order        00000000-0000-4000-8000-000000000001
--   completed order   00000000-0000-4000-8000-000000000002

begin;

-- 1. Auth user for the demo helper (email + phone confirmed, no password).
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'apple-review@vanojobs.com', null, now(),
  '353890000000', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"Apple Review","household_helper_id":"00000000-0000-4000-8000-00000000000b"}'::jsonb,
  now(), now(), '', '', '', ''
)
on conflict (id) do update set email = excluded.email, phone = excluded.phone, updated_at = now();

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
values (
  '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000a', 'apple-review@vanojobs.com', 'email',
  '{"sub":"00000000-0000-4000-8000-00000000000a","email":"apple-review@vanojobs.com","email_verified":true}'::jsonb,
  now(), now(), now()
)
on conflict (provider_id, provider) do nothing;

-- 2. The helper row. Approved + ID-verified so claiming works; is_available
--    false + show_on_homepage false keep it out of dispatch, the public count
--    and the "Meet the helpers" faces. Galway city-centre last position.
insert into household_helpers (
  id, name, phone, email, city, areas_served, status, is_available, show_on_homepage,
  id_verified, student_email_verified, categories, payment_handle, user_id,
  last_lat, last_lng, location_updated_at, average_rating, rating_count, accepted_count
) values (
  '00000000-0000-4000-8000-00000000000b', 'Apple Review', '+353890000000', 'apple-review@vanojobs.com', 'Galway', array['Salthill','City Centre'],
  'approved', false, false, true, true, array['cleaning','garden','dog-walk','other','shopping'], 'applereview',
  '00000000-0000-4000-8000-00000000000a', 53.2724, -9.0490, now(), 5.0, 1, 1
)
on conflict (id) do update set
  name = excluded.name, phone = excluded.phone, email = excluded.email, status = 'approved',
  is_available = false, show_on_homepage = false, id_verified = true, student_email_verified = true,
  categories = excluded.categories, payment_handle = excluded.payment_handle, user_id = excluded.user_id,
  last_lat = excluded.last_lat, last_lng = excluded.last_lng, location_updated_at = now(),
  average_rating = 5.0, rating_count = 1;

-- 3. The OPEN demo order — pending, unassigned, refreshed on every run.
insert into household_bookings (
  id, customer_id, category, scheduled_date, time_slot, is_express, price_estimate_cents, status,
  customer_name, customer_phone, customer_address, customer_lat, customer_lng, city,
  paid_at, area_label, search_tags, created_at, student_id, accepted_at, arrived_at, helper_finished_at, booking_data
) values (
  '00000000-0000-4000-8000-000000000001', null, 'cleaning', 'Today', null, false, 4400, 'pending',
  'Apple Reviewer', '+353890000001', '12 Seapoint Promenade, Salthill, Galway', 53.2607, -9.0800, 'Galway',
  now(), 'Salthill', array['cleaning','clean','kitchen','bathroom','tidy','house','salthill','galway','now','today','asap'],
  now(), null, null, null, null,
  jsonb_build_object(
    'demo', true, 'direct_pay', true, 'size_label', '2 hours', 'extra_label', 'Kitchen + bathroom',
    'job_price_cents', 4400, 'vano_fee_cents', 660, 'fee_due_cents', 660, 'when_label', 'Today',
    'note', 'Kitchen and bathroom please — the key is under the mat.',
    'customer_rep', jsonb_build_object('paid_jobs', 1, 'stars', 5)
  )
)
on conflict (id) do update set
  status = 'pending', student_id = null, accepted_at = null, arrived_at = null, helper_finished_at = null,
  worker_lat = null, worker_lng = null, arrival_verified_at = null, job_ends_at = null,
  paid_at = now(), created_at = now(), booking_data = excluded.booking_data, search_tags = excluded.search_tags;

-- Its arrival code (shown on the buyer's Orders screen; typed by the helper).
insert into household_booking_secrets (booking_id, arrival_code, updated_at)
values ('00000000-0000-4000-8000-000000000001', '1234', now())
on conflict (booking_id) do update set arrival_code = '1234', updated_at = now();

-- Timeline rows from any previous run of the open order go.
delete from household_job_updates where booking_id = '00000000-0000-4000-8000-000000000001';

-- 4. The COMPLETED demo order — three days ago, rated.
insert into household_bookings (
  id, customer_id, category, scheduled_date, time_slot, is_express, price_estimate_cents, status,
  customer_name, customer_phone, customer_address, customer_lat, customer_lng, city,
  paid_at, area_label, search_tags, created_at, student_id, accepted_at, arrived_at, arrival_verified_at, helper_finished_at, booking_data
) values (
  '00000000-0000-4000-8000-000000000002', null, 'dog-walk', 'Flexible', null, false, 2000, 'completed',
  'Apple Reviewer', '+353890000001', '12 Seapoint Promenade, Salthill, Galway', 53.2607, -9.0800, 'Galway',
  now() - interval '3 days', 'Salthill', array['dog','dog walk','walk','pet','salthill','galway'],
  now() - interval '3 days', '00000000-0000-4000-8000-00000000000a',
  now() - interval '3 days' + interval '20 minutes', now() - interval '3 days' + interval '55 minutes',
  now() - interval '3 days' + interval '56 minutes', now() - interval '3 days' + interval '2 hours',
  jsonb_build_object(
    'demo', true, 'direct_pay', true, 'size_label', '1 walk', 'extra_label', 'Bruno, 45 min',
    'job_price_cents', 2000, 'vano_fee_cents', 500, 'fee_due_cents', 500, 'when_label', 'Flexible',
    'helper_payment_handle', 'applereview'
  )
)
on conflict (id) do update set status = 'completed', student_id = excluded.student_id, booking_data = excluded.booking_data;

insert into household_booking_secrets (booking_id, rating_token, updated_at)
values ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000c2', now())
on conflict (booking_id) do update set rating_token = excluded.rating_token, updated_at = now();

delete from household_job_updates where booking_id = '00000000-0000-4000-8000-000000000002';
insert into household_job_updates (booking_id, status, note, created_at) values
  ('00000000-0000-4000-8000-000000000002', 'accepted',    'Helper claimed the job.', now() - interval '3 days' + interval '20 minutes'),
  ('00000000-0000-4000-8000-000000000002', 'on_way',      null,                     now() - interval '3 days' + interval '40 minutes'),
  ('00000000-0000-4000-8000-000000000002', 'arrived',     null,                     now() - interval '3 days' + interval '55 minutes'),
  ('00000000-0000-4000-8000-000000000002', 'in_progress', null,                     now() - interval '3 days' + interval '56 minutes'),
  ('00000000-0000-4000-8000-000000000002', 'completed',   'Job completed.',         now() - interval '3 days' + interval '2 hours');

insert into household_ratings (booking_id, helper_id, rating, comment, created_at)
values ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000000b', 5, 'Brilliant, on time and lovely with Bruno.', now() - interval '3 days' + interval '3 hours')
on conflict (booking_id) do update set rating = 5, comment = excluded.comment;

insert into household_customer_ratings (booking_id, helper_id, customer_phone, paid, rating, created_at)
values ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000000b', '+353890000001', true, 5, now() - interval '3 days' + interval '2 hours')
on conflict (booking_id) do update set paid = true, rating = 5;

commit;
