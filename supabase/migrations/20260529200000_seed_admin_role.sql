-- Seed the admin role for the VANO owner account.
-- Uses ON CONFLICT DO NOTHING so re-running is safe.
-- If the account doesn't exist yet in auth.users the INSERT is a no-op;
-- run this migration again after the account is created and it will work.

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'
FROM auth.users
WHERE email = 'vano1app@gmail.com'
ON CONFLICT DO NOTHING;
