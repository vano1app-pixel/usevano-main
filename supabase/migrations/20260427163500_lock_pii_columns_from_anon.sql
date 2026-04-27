-- Block anonymous (anon) SELECT on PII columns of profiles + student_profiles.
--
-- The bug we're fixing: Postgres RLS is row-level only. The existing
-- "Anyone can view approved student profiles" policy
-- (20260402130000_public_student_profiles.sql) and the broader
-- "Profiles are viewable by everyone USING (true)" policy
-- (20251029164531_…) correctly limit which rows the anon role can
-- read — but they can't restrict which columns. Result: any anon
-- caller could harvest every approved freelancer's phone, payment
-- details, institutional email, Stripe Connect id, and student number
-- with one PostgREST query.
--
-- Reproducer (before this migration, from any browser tab on any
-- domain — no auth required):
--   await fetch('https://<project>.supabase.co/rest/v1/student_profiles' +
--     '?community_board_status=eq.approved&select=phone',
--     { headers: { apikey: '<publishable_key>' } });
--   // → array of { phone } for every approved freelancer
--
-- Fix: column-level REVOKE on the anon role. Postgres composes column
-- and table grants — the row-level policy still decides which rows
-- the role can see, but a SELECT that includes a revoked column will
-- now fail with permission_denied for the anon role. The authenticated
-- role retains access via the existing table-level grant; service_role
-- continues to bypass RLS for edge functions.
--
-- Frontend coordination: the only anon-context reader of these columns
-- was src/pages/AiFindReturn.tsx's signed-out "Path 3" public-match
-- fallback (it pulled phone via supabase.from('student_profiles')
-- .select('phone, ...')). That call is updated in the same commit to
-- drop phone from the SELECT — the existing "no phone — connect via
-- WhatsApp" fallback UI already handles the null-phone case.
--
-- Follow-up (out of scope here): the authenticated role can still
-- enumerate every approved freelancer's phone via the same row-level
-- policy. The proper fix is a SECURITY DEFINER RPC that returns phone
-- only when the caller has (a) a paid AI Find row referencing this
-- freelancer, (b) an active conversation with them, (c) ownership,
-- or (d) admin role.

-- ── student_profiles columns ────────────────────────────────────────
-- phone           — direct contact, primary leak
-- payment_details — bank / PayPal / Revolut details (added 20260308110644)
-- verified_email  — institutional email used for student verification
-- student_number  — institutional ID used for verification
-- stripe_account_id — Stripe Connect Express account id; combined with
--                     other harvested signals, useful for targeted
--                     social-engineering of freelancers
REVOKE SELECT (phone)             ON public.student_profiles FROM anon;
REVOKE SELECT (payment_details)   ON public.student_profiles FROM anon;
REVOKE SELECT (verified_email)    ON public.student_profiles FROM anon;
REVOKE SELECT (student_number)    ON public.student_profiles FROM anon;
REVOKE SELECT (stripe_account_id) ON public.student_profiles FROM anon;

-- ── profiles columns ────────────────────────────────────────────────
-- phone         — business phone (added 20260416140000)
-- student_email — verified institutional email (added 20260329180000)
REVOKE SELECT (phone)         ON public.profiles FROM anon;
REVOKE SELECT (student_email) ON public.profiles FROM anon;
