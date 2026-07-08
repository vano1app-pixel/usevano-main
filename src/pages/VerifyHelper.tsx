import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, ShieldCheck, CheckCircle2, Loader2, ArrowRight, Lock, MessageCircle, Phone, BadgeCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { HouseholdNav } from '@/components/household/HouseholdNav';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/integrations/supabase/client';
import { haptic } from '@/lib/haptics';
import { celebrateBooking } from '@/lib/celebrate';
import { teamWhatsAppHref, teamTelHref } from '@/lib/contact';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hdb = supabase as any;

type EmailState = 'idle' | 'sending' | 'sent' | 'verifying' | 'verified';
type IdState = 'idle' | 'starting' | 'submitted' | 'verified';
type PlanState = 'idle' | 'confirming' | 'paying' | 'active';

const inputClass =
  'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-[border-color,box-shadow] duration-150';

// ── Stage-progress cache ─────────────────────────────────────────────────────
// The DB columns are the source of truth for the three stages, but the
// restore read happens async (a beat of "nothing done" flash) and can fail on
// a network blip — which looks to the helper like their progress was lost.
// Cache completed stages per helper so a returning helper's ticks render
// instantly. UPGRADE-ONLY: the cache can mark a stage done, never undo one.
interface VerifyProgress { email?: boolean; id_check?: boolean; plan?: boolean }
const progressKey = (id: string) => `vano_verify_progress_${id}`;
function readProgress(id: string | null): VerifyProgress {
  if (!id) return {};
  try { return (JSON.parse(localStorage.getItem(progressKey(id)) ?? '{}') as VerifyProgress) ?? {}; } catch { return {}; }
}
function saveProgress(id: string | null, patch: VerifyProgress) {
  if (!id) return;
  try { localStorage.setItem(progressKey(id), JSON.stringify({ ...readProgress(id), ...patch })); } catch { /* best effort */ }
}

// Mid-OTP state: once a code is texted/emailed, a reload used to bounce the
// card back to "Send me a code" even though the server-side code (10-min TTL,
// one live code) was still perfectly valid. Persist the sent-state so the
// code input survives a reload; expires with the code itself.
const OTP_STATE_KEY = 'vano_verify_otp_state';
const OTP_TTL_MS = 10 * 60 * 1000;
interface OtpState { channel: 'email' | 'sms'; email: string; sentAt: number }
function readOtpState(): OtpState | null {
  try {
    const raw = localStorage.getItem(OTP_STATE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as OtpState;
    if (!s || typeof s.sentAt !== 'number' || Date.now() - s.sentAt > OTP_TTL_MS) return null;
    return s;
  } catch { return null; }
}
function saveOtpState(s: OtpState) {
  try { localStorage.setItem(OTP_STATE_KEY, JSON.stringify(s)); } catch { /* best effort */ }
}
function clearOtpState() {
  try { localStorage.removeItem(OTP_STATE_KEY); } catch { /* best effort */ }
}

/**
 * Post-application page — free-to-join:
 * signing up already put the helper LIVE (status approved). This page earns
 * the ✓ Verified blue tick:
 *   1. confirm their college email  ┐ free checks
 *   2. verify ID (Stripe Identity)  ┘
 *   3. €2/month plan (only offered once 1+2 pass) → vano_verified flips on
 * Verified helpers are offered jobs first, so the tick is the carrot.
 */
const VerifyHelper: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const helperId = params.get('id') || (typeof localStorage !== 'undefined' ? localStorage.getItem('vano_helper_id') : null);
  const name = params.get('name') || (typeof localStorage !== 'undefined' ? localStorage.getItem('vano_helper_name') : null);
  const returnedFromIdCheck = params.get('id_check') === 'done';
  const planSession = params.get('vp');   // Stripe Checkout session id — €2/month plan return
  const legacySession = params.get('sp'); // legacy one-off €2 return (old links still resolve)

  // Instant restore: cached completed stages (upgrade-only mirror of the DB
  // flags) + a still-live OTP send, so a reload or return visit picks up
  // exactly where the helper left off instead of resetting every card.
  const [cachedProgress] = useState<VerifyProgress>(() => readProgress(helperId));
  const [restoredOtp] = useState<OtpState | null>(() => (cachedProgress.email ? null : readOtpState()));

  // Landing with ?id= (from join, a dashboard nudge, or a Stripe return)
  // makes this browser remember the account, so later param-less visits work.
  useEffect(() => {
    try {
      if (helperId) localStorage.setItem('vano_helper_id', helperId);
      if (name) localStorage.setItem('vano_helper_name', name);
    } catch { /* best effort */ }
  }, [helperId, name]);

  const [email, setEmail] = useState(
    restoredOtp?.email
    || (typeof localStorage !== 'undefined' ? localStorage.getItem('vano_student_email') : '')
    || '',
  );
  const [code, setCode] = useState('');
  const [emailState, setEmailState] = useState<EmailState>(
    cachedProgress.email ? 'verified' : restoredOtp ? 'sent' : 'idle',
  );
  const [emailError, setEmailError] = useState<string | null>(null);
  // Which channel the live code was sent by, so Resend re-uses it and the
  // helper text matches ('sms' also covers WhatsApp).
  const [otpChannel, setOtpChannel] = useState<'email' | 'sms'>(restoredOtp?.channel ?? 'email');

  const [idState, setIdState] = useState<IdState>(
    cachedProgress.id_check ? 'verified' : returnedFromIdCheck ? 'submitted' : 'idle',
  );
  const [idError, setIdError] = useState<string | null>(null);

  const [planState, setPlanState] = useState<PlanState>(
    planSession ? 'confirming' : cachedProgress.plan ? 'active' : 'idle',
  );
  const [planError, setPlanError] = useState<string | null>(null);

  // Free-to-join: applications are approved on arrival, so this is true for
  // everyone landing here from /join. Read from the DB rather than assumed,
  // so an admin-suspended helper doesn't see a false "you're live".
  const [isLive, setIsLive] = useState(false);

  // Reflect any progress already on file (revisiting / returning from Stripe).
  useEffect(() => {
    if (!helperId) return;
    let cancelled = false;
    (async () => {
      const { data } = await hdb
        .from('household_helpers')
        .select('status, student_email_verified, id_verified, identity_status, verified_plan_active')
        .eq('id', helperId)
        .maybeSingle();
      if (cancelled || !data) return;
      if (data.status === 'approved') setIsLive(true);
      if (data.student_email_verified) { setEmailState('verified'); saveProgress(helperId, { email: true }); clearOtpState(); }
      if (data.id_verified) { setIdState('verified'); saveProgress(helperId, { id_check: true }); }
      else if (data.identity_status === 'processing' || data.identity_status === 'requires_input') {
        setIdState((s) => (s === 'verified' ? s : 'submitted'));
      }
      if (data.verified_plan_active) { setPlanState('active'); saveProgress(helperId, { plan: true }); }
    })();
    return () => { cancelled = true; };
  }, [helperId]);

  // Confirm the €2/month plan when Stripe returns with a session id.
  useEffect(() => {
    if (!helperId || !planSession) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.functions.invoke('confirm-verified-plan', { body: { helper_id: helperId, session_id: planSession } });
      if (cancelled) return;
      const active = Boolean((data as { active?: boolean } | null)?.active);
      setPlanState(active ? 'active' : 'idle');
      if (active) saveProgress(helperId, { plan: true });
    })();
    return () => { cancelled = true; };
  }, [helperId, planSession]);

  // Legacy: a helper returning from an old one-off €2 checkout link. Record it
  // (it grandfathers their plan server-side history) but the page no longer
  // gates anything on it.
  useEffect(() => {
    if (!helperId || !legacySession) return;
    void supabase.functions.invoke('confirm-signup-payment', { body: { helper_id: helperId, session_id: legacySession } });
  }, [helperId, legacySession]);

  const sendCode = useCallback(async () => {
    if (!helperId) return;
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) { setEmailError('Enter your college email.'); return; }
    setEmailState('sending'); setEmailError(null); setOtpChannel('email');
    const { data, error } = await supabase.functions.invoke('send-student-email-otp', { body: { helper_id: helperId, email: clean } });
    if (error || (data as { error?: string } | null)?.error) {
      setEmailError((data as { error?: string } | null)?.error || 'Could not send a code. Try again.');
      setEmailState('idle');
      return;
    }
    haptic(8);
    setEmailState('sent');
    saveOtpState({ channel: 'email', email: clean, sentAt: Date.now() });
    try { localStorage.setItem('vano_student_email', clean); } catch { /* best effort */ }
  }, [helperId, email]);

  // Reliable alternative: text the code to the phone on the application
  // (SMS preferred, WhatsApp fallback). No email needed. Same code + verify.
  const sendSmsCode = useCallback(async () => {
    if (!helperId) return;
    setEmailState('sending'); setEmailError(null); setOtpChannel('sms');
    const { data, error } = await supabase.functions.invoke('send-student-sms-otp', { body: { helper_id: helperId } });
    if (error || (data as { error?: string } | null)?.error) {
      setEmailError((data as { error?: string } | null)?.error || 'Could not text a code. Try email instead.');
      setEmailState('idle');
      return;
    }
    haptic(8);
    setEmailState('sent');
    saveOtpState({ channel: 'sms', email: email.trim().toLowerCase(), sentAt: Date.now() });
  }, [helperId, email]);

  const verifyCode = useCallback(async () => {
    if (!helperId || code.trim().length !== 6) { setEmailError('Enter the 6-digit code.'); return; }
    setEmailState('verifying'); setEmailError(null);
    const { data, error } = await supabase.functions.invoke('verify-student-email-otp', { body: { helper_id: helperId, code: code.trim() } });
    if (error || !(data as { verified?: boolean } | null)?.verified) {
      setEmailError((data as { error?: string } | null)?.error || 'That code is incorrect.');
      setEmailState('sent');
      return;
    }
    haptic(16);
    setEmailState('verified');
    saveProgress(helperId, { email: true });
    clearOtpState();
  }, [helperId, code]);

  const startIdCheck = useCallback(async () => {
    if (!helperId) return;
    setIdState('starting'); setIdError(null);
    const { data, error } = await supabase.functions.invoke('create-identity-verification', { body: { helper_id: helperId } });
    if ((data as { already_verified?: boolean } | null)?.already_verified) { setIdState('verified'); saveProgress(helperId, { id_check: true }); return; }
    const url = (data as { url?: string } | null)?.url;
    if (error || !url) {
      setIdError((data as { error?: string } | null)?.error || 'Could not start the ID check. Try again.');
      setIdState('idle');
      return;
    }
    window.location.href = url;
  }, [helperId]);

  const startPlan = useCallback(async () => {
    if (!helperId) return;
    setPlanState('paying'); setPlanError(null);
    const { data, error } = await supabase.functions.invoke('create-verified-plan', { body: { helper_id: helperId } });
    if ((data as { already_active?: boolean } | null)?.already_active) { setPlanState('active'); saveProgress(helperId, { plan: true }); return; }
    const url = (data as { url?: string } | null)?.url;
    if (error || !url) {
      setPlanError((data as { error?: string } | null)?.error || 'Could not open checkout. Try again.');
      setPlanState('idle');
      return;
    }
    window.location.href = url;
  }, [helperId]);

  const checksDone = emailState === 'verified' && idState === 'verified';
  const hasTick = checksDone && planState === 'active';
  const celebrated = useRef(false);
  useEffect(() => {
    if (hasTick && !celebrated.current) { celebrated.current = true; haptic(20); celebrateBooking(); }
  }, [hasTick]);

  // Auto-verify the moment the 6th digit lands (guarded so a failed code
  // isn't retried in a loop — the code must change to auto-try again).
  const lastAutoTried = useRef('');
  useEffect(() => {
    if (emailState === 'sent' && code.length === 6 && lastAutoTried.current !== code) {
      lastAutoTried.current = code;
      void verifyCode();
    }
  }, [code, emailState, verifyCode]);

  // While Stripe is confirming the ID, poll the webhook-independent backstop
  // (check-identity-status asks Stripe's API directly), so the ✓ lands even if
  // the identity webhook isn't configured in the Stripe dashboard. Polls ~2
  // minutes; the outcome is also recorded server-side so leaving is safe.
  useEffect(() => {
    if (idState !== 'submitted' || !helperId) return;
    let cancelled = false;
    let timer: number | undefined;
    let tries = 0;
    const tick = async () => {
      tries += 1;
      const { data } = await supabase.functions.invoke('check-identity-status', { body: { helper_id: helperId } });
      if (cancelled) return;
      const st = data as { verified?: boolean; status?: string } | null;
      if (st?.verified) { haptic(16); setIdState('verified'); saveProgress(helperId, { id_check: true }); return; }
      if (st?.status === 'requires_input') {
        setIdError('Stripe needs another look — a photo may have been blurry. Tap below to re-do it (takes 2 minutes).');
        setIdState('idle');
        return;
      }
      if (tries < 30) timer = window.setTimeout(tick, 4000);
    };
    timer = window.setTimeout(tick, 2000);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [idState, helperId]);

  return (
    <>
      <SEOHead title="Get VANO Verified — earn your blue tick" description="You're live on VANO the moment you join. Confirm your student email and ID, then €2/month keeps the ✓ Verified tick on your name." noindex />
      <HouseholdNav />

      <main className="pt-28 pb-20 px-4">
        <div className="max-w-md mx-auto">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
            <div className="flex items-center gap-2 text-sage mb-3">
              <Lock className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-widest">Secure verification</span>
            </div>
            <h1 className="display-lg text-foreground mb-2">
              {name ? `You're in, ${name.split(' ')[0]} 🎉` : "You're in 🎉"}
            </h1>
            <p className="text-muted-foreground leading-relaxed mb-8">
              You're live on VANO — jobs near you can already reach you. Now earn the{' '}
              <span className="font-semibold text-foreground inline-flex items-center gap-1">
                <BadgeCheck className="w-4 h-4 fill-sky-500 text-white inline" aria-hidden="true" />
                Verified blue tick
              </span>{' '}
              — customers look for it, and verified helpers are <span className="font-semibold text-foreground">offered jobs first</span>.
              Two free checks, then €2/month keeps the tick on your name. Cancel anytime.
            </p>
          </motion.div>

          {!helperId ? (
            <div className="rounded-2xl border border-border/60 bg-secondary/30 p-6 text-center">
              <p className="text-sm text-foreground font-semibold mb-1">We couldn't find your account</p>
              <p className="text-sm text-muted-foreground mb-4">Join first, then come back to get verified.</p>
              <a href="/join" className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold">Join as a helper <ArrowRight className="w-4 h-4" /></a>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Live banner — free-to-join means they're already in. */}
              {isLive && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-sage-light border border-sage/30 p-5 text-center">
                  <CheckCircle2 className="w-9 h-9 text-sage mx-auto mb-1.5" />
                  <p className="text-base font-bold text-foreground">{hasTick ? "You're live and Verified ✓ 🎉" : "You're live on VANO"}</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">
                    {hasTick
                      ? 'The blue tick is on your name. Set yourself Available and jobs near you reach you first.'
                      : 'Jobs can now come through. Finish the steps below to earn your ✓ Verified tick — verified helpers are offered jobs first.'}
                  </p>
                  <a href="/student-dashboard" className="inline-flex items-center gap-1.5 rounded-full bg-sage text-white px-6 py-2.5 text-sm font-semibold">Go to my dashboard <ArrowRight className="w-4 h-4" /></a>
                </motion.div>
              )}

              {/* The three steps that earn the tick */}
              <div className="flex items-center gap-2 pt-2" aria-hidden="true">
                <span className="h-px flex-1 bg-border" />
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Earn your ✓ Verified tick</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              {/* Step 1 — student email */}
              <VerifyCard icon={<Mail className="w-5 h-5" />} step="1" title="Confirm your student email" done={emailState === 'verified'}>
                {emailState === 'verified' ? (
                  <p className="text-sm text-muted-foreground">Verified — you're confirmed as a student. 🎓</p>
                ) : (
                  <div className="space-y-2.5">
                    <input
                      type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@universityofgalway.ie" inputMode="email" autoCapitalize="off" autoCorrect="off"
                      disabled={emailState === 'sent' || emailState === 'verifying'}
                      className={cn(inputClass, (emailState === 'sent' || emailState === 'verifying') && 'opacity-60')}
                    />
                    {(emailState === 'sent' || emailState === 'verifying') && (
                      <input
                        type="text" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="6-digit code" inputMode="numeric" autoComplete="one-time-code"
                        className={cn(inputClass, 'tracking-[0.4em] text-center font-semibold')}
                      />
                    )}
                    {(emailState === 'sent' || emailState === 'verifying') && !emailError && (
                      <p className="text-xs text-muted-foreground leading-snug">
                        {otpChannel === 'sms' ? (
                          <>We texted your code (check WhatsApp too). Didn't get it? Tap Resend or use email above.</>
                        ) : (
                          <>Code sent to <span className="font-medium text-foreground">{email.trim()}</span>. It can take a minute — <span className="font-medium text-foreground">check your Spam / Promotions folder</span> too. Still nothing? Tap Resend, text it instead, or{' '}
                          <a
                            href={`${teamWhatsAppHref}?text=${encodeURIComponent(`Hi VANO, my student email code isn't arriving (${email.trim()}) — can you verify me?`)}`}
                            target="_blank" rel="noopener noreferrer"
                            className="font-medium text-primary underline underline-offset-2"
                          >WhatsApp us</a>.</>
                        )}
                      </p>
                    )}
                    {emailError && <p className="text-xs text-destructive">{emailError}</p>}
                    {emailState === 'idle' || emailState === 'sending' ? (
                      <div className="space-y-2">
                        <Button onClick={() => void sendCode()} disabled={emailState === 'sending'} className="w-full rounded-full font-semibold gap-2">
                          {emailState === 'sending' && otpChannel === 'email' ? <><Loader2 className="w-4 h-4 animate-spin" />Sending…</> : 'Send me a code'}
                        </Button>
                        <button
                          type="button"
                          onClick={() => void sendSmsCode()}
                          disabled={emailState === 'sending'}
                          className="w-full text-sm font-medium text-primary flex items-center justify-center gap-1.5 py-1.5 disabled:opacity-50"
                        >
                          {emailState === 'sending' && otpChannel === 'sms'
                            ? <><Loader2 className="w-4 h-4 animate-spin" />Texting…</>
                            : <>📱 Prefer a text? Send the code by SMS</>}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button onClick={() => void verifyCode()} disabled={emailState === 'verifying' || code.length !== 6} className="flex-1 rounded-full font-semibold gap-2">
                          {emailState === 'verifying' ? <><Loader2 className="w-4 h-4 animate-spin" />Checking…</> : 'Verify'}
                        </Button>
                        <button onClick={() => void (otpChannel === 'sms' ? sendSmsCode() : sendCode())} className="text-xs text-muted-foreground underline underline-offset-2 px-2">Resend</button>
                      </div>
                    )}
                  </div>
                )}
              </VerifyCard>

              {/* Step 2 — ID check */}
              <VerifyCard icon={<ShieldCheck className="w-5 h-5" />} step="2" title="Verify your ID" done={idState === 'verified'}>
                {idState === 'verified' ? (
                  <p className="text-sm text-muted-foreground">Your ID is verified. ✅</p>
                ) : idState === 'submitted' ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Thanks — we're confirming your ID (usually instant). You can close this; we'll text you when you're cleared.</p>
                    <button onClick={() => void startIdCheck()} className="text-xs text-sage font-semibold underline underline-offset-2">Re-do the ID check</button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <p className="text-sm text-muted-foreground leading-relaxed">A 2-minute photo of your ID plus a quick selfie, secured by Stripe. Free — we never see your documents.</p>
                    {idError && <p className="text-xs text-destructive">{idError}</p>}
                    <Button onClick={() => void startIdCheck()} disabled={idState === 'starting'} className="w-full rounded-full font-semibold gap-2">
                      {idState === 'starting' ? <><Loader2 className="w-4 h-4 animate-spin" />Opening…</> : <>Start ID check <ArrowRight className="w-4 h-4" /></>}
                    </Button>
                  </div>
                )}
              </VerifyCard>

              {/* Step 3 — the €2/month plan that switches the tick on. Only
                  unlockable once both free checks pass, so nobody ever pays
                  for a tick that can't render. */}
              <VerifyCard icon={<BadgeCheck className="w-5 h-5" />} step="3" title="Turn on your blue tick — €2/month" done={planState === 'active'}>
                {planState === 'active' ? (
                  <p className="text-sm text-muted-foreground">
                    {checksDone
                      ? 'Your ✓ Verified tick is live. 💙 Manage or cancel anytime from your account page.'
                      : 'Plan active — your tick appears the moment the two checks above pass.'}
                  </p>
                ) : planState === 'confirming' ? (
                  <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Confirming your plan…</p>
                ) : (
                  <div className="space-y-2.5">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      The blue tick shows on your name everywhere customers see you — and verified helpers are offered jobs first.
                      €2/month, cancel anytime. Card, Apple Pay or Google Pay.
                    </p>
                    {!checksDone && (
                      <p className="text-xs font-medium text-foreground/60 flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                        Unlocks once steps 1 and 2 are done
                      </p>
                    )}
                    {planError && <p className="text-xs text-destructive">{planError}</p>}
                    <Button onClick={() => void startPlan()} disabled={planState === 'paying' || !checksDone} className="w-full rounded-full font-semibold gap-2">
                      {planState === 'paying' ? <><Loader2 className="w-4 h-4 animate-spin" />Opening…</> : <>Activate my tick — €2/month <BadgeCheck className="w-4 h-4" /></>}
                    </Button>
                  </div>
                )}
              </VerifyCard>

              {/* Payout nudge — phone-gated friendly (the account page hosts
                  payout setup now, no sign-in needed). */}
              {!hasTick && (
                <div className="rounded-2xl border border-sage/30 bg-sage-light p-4">
                  <p className="text-sm font-semibold text-foreground mb-1">Set up payouts</p>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                    Add your bank or Revolut (any IBAN) to get paid automatically after each job. You can do this anytime — earnings are held safely until you do.
                  </p>
                  <a href="/student-account" className="inline-flex h-10 items-center justify-center rounded-full bg-sage text-white text-xs font-semibold px-5">Set up payouts</a>
                </div>
              )}

              {/* Need a hand? — straight to a person */}
              <div className="rounded-2xl border border-border/60 bg-background p-4">
                <p className="text-sm font-semibold text-foreground mb-0.5">Stuck on anything?</p>
                <p className="text-xs text-muted-foreground mb-3">We're real people in Galway — text or call and we'll sort it.</p>
                <div className="flex items-center gap-2">
                  <a
                    href={`${teamWhatsAppHref}?text=${encodeURIComponent(`Hi VANO, I'm a helper${name ? ` (${name})` : ''} and need a hand with verification.`)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex-1 h-10 rounded-full border border-[#25D366]/40 text-[#25D366] text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-[#25D366]/8 transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" /> WhatsApp us
                  </a>
                  <a
                    href={teamTelHref}
                    className="flex-1 h-10 rounded-full border border-border text-foreground text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-secondary transition-colors"
                  >
                    <Phone className="w-4 h-4" /> Call us
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
};

const VerifyCard: React.FC<{ icon: React.ReactNode; step: string; title: string; done: boolean; children: React.ReactNode }> = ({ icon, step, title, done, children }) => (
  <div className={cn('rounded-2xl border p-5 transition-colors duration-200', done ? 'border-sage/40 bg-sage-light' : 'border-border/60 bg-background')}>
    <div className="flex items-center gap-3 mb-3">
      <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0', done ? 'bg-sage text-white' : 'bg-sage/12 text-sage')}>
        {done ? <CheckCircle2 className="w-5 h-5" /> : icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Step {step}</p>
        <h2 className="text-base font-bold text-foreground leading-tight">{title}</h2>
      </div>
    </div>
    {children}
  </div>
);

export default VerifyHelper;
