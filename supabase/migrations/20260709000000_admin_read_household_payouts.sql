-- The /admin dashboard's Payouts tab reads household_payouts via the owner's
-- anon-key session, but the only policy on the table is "Students can read own
-- payouts" (auth.uid() = student_id). So the tab was permanently empty for the
-- admin: the pending-payouts total, the stuck-transfer alerts and the whole
-- money-oversight surface showed €0 while looking healthy.
--
-- Add an admin READ policy only. Deliberately NO admin UPDATE/INSERT policy:
-- the payout ledger's status is the record of real money movement and must be
-- flipped to 'transferred' exclusively by capture-household-payment /
-- release-household-payouts AFTER a successful Stripe transfer (with the
-- stripe_transfer_id + released_at). A client-side UPDATE would forge a
-- "paid" row with no money moved.
CREATE POLICY "Admins can read all household payouts"
  ON public.household_payouts FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
