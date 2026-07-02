import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, ShieldCheck, CreditCard, CheckCircle2, Loader2, ArrowRight, Lock, MessageCircle, Phone } from 'lucide-react';
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
type PayState = 'idle' | 'confirming' | 'paying' | 'paid';

const inputClass =
  'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-[border-color,box-shadow] duration-150';

/**
 * Post-application verification — the three gates that get a helper live:
 *   1. confirm their college email (OTP)
 *   2. verify ID (Stripe Identity, document + selfie)
 *   3. pay the €2 sign-up fee
 * Passing all three auto-approves them (DB trigger). This is what makes the
 * homepage's "ID-verified" promise real.
 */
const VerifyHelper: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const helperId = params.get('id') || (typeof localStorage !== 'undefined' ? localStorage.getItem('vano_helper_id') : null);
  const name = params.get('name') || (typeof localStorage !== 'undefined' ? localStorage.getItem('vano_helper_name') : null);
  const returnedFromIdCheck = params.get('id_check') === 'done';
  const paymentSession = params.get('sp'); // Stripe Checkout session id on return

  const [email, setEmail] = useState(
    (typeof localStorage !== 'undefined' ? localStorage.getItem('vano_student_email') : '') || '',
  );
  const [code, setCode] = useState('');
  const [emailState, setEmailState] = useState<EmailState>('idle');
  const [emailError, setEmailError] = useState<string | null>(null);

  const [idState, setIdState] = useState<IdState>(returnedFromIdCheck ? 'submitted' : 'idle');
  const [idError, setIdError] = useState<string | null>(null);

  const [payState, setPayState] = useState<PayState>(paymentSession ? 'confirming' : 'idle');
  const [payError, setPayError] = useState<string | null>(null);

  // Reflect any progress already on file (revisiting / returning from Stripe).
  useEffect(() => {
    if (!helperId) return;
    let cancelled = false;
    (async () => {
      const { data } = await hdb
        .from('household_helpers')
        .select('student_email_verified, id_verified, identity_status, signup_paid')
        .eq('id', helperId)
        .maybeSingle();
      if (cancelled || !data) return;
      if (data.student_email_verified) setEmailState('verified');
      if (data.id_verified) setIdState('verified');
      else if (data.identity_status === 'processing' || data.identity_status === 'requires_input') {
        setIdState((s) => (s === 'verified' ? s : 'submitted'));
      }
      if (data.signup_paid) setPayState('paid');
    })();
    return () => { cancelled = true; };
  }, [helperId]);

  // Confirm the €2 payment when Stripe returns with a session id.
  useEffect(() => {
    if (!helperId || !paymentSession) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.functions.invoke('confirm-signup-payment', { body: { helper_id: helperId, session_id: paymentSession } });
      if (cancelled) return;
      setPayState((data as { paid?: boolean } | null)?.paid ? 'paid' : 'idle');
    })();
    return () => { cancelled = true; };
  }, [helperId, paymentSession]);

  const sendCode = useCallback(async () => {
    if (!helperId) return;
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) { setEmailError('Enter your college email.'); return; }
    setEmailState('sending'); setEmailError(null);
    const { data, error } = await supabase.functions.invoke('send-student-email-otp', { body: { helper_id: helperId, email: clean } });
    if (error || (data as { error?: string } | null)?.error) {
      setEmailError((data as { error?: string } | null)?.error || 'Could not send a code. Try again.');
      setEmailState('idle');
      return;
    }
    haptic(8);
    setEmailState('sent');
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
  }, [helperId, code]);

  const startIdCheck = useCallback(async () => {
    if (!helperId) return;
    setIdState('starting'); setIdError(null);
    const { data, error } = await supabase.functions.invoke('create-identity-verification', { body: { helper_id: helperId } });
    if ((data as { already_verified?: boolean } | null)?.already_verified) { setIdState('verified'); return; }
    const url = (data as { url?: string } | null)?.url;
    if (error || !url) {
      setIdError((data as { error?: string } | null)?.error || 'Could not start the ID check. Try again.');
      setIdState('idle');
      return;
    }
    window.location.href = url;
  }, [helperId]);

  const startPayment = useCallback(async () => {
    if (!helperId) return;
    setPayState('paying'); setPayError(null);
    const { data, error } = await supabase.functions.invoke('create-signup-payment', { body: { helper_id: helperId } });
    if ((data as { already_paid?: boolean } | null)?.already_paid) { setPayState('paid'); return; }
    const url = (data as { url?: string } | null)?.url;
    if (error || !url) {
      setPayError((data as { error?: string } | null)?.error || 'Could not open checkout. Try again.');
      setPayState('idle');
      return;
    }
    window.location.href = url;
  }, [helperId]);

  // All three done → celebrate once.
  const allDone = emailState === 'verified' && idState === 'verified' && payState === 'paid';
  const celebrated = useRef(false);
  useEffect(() => {
    if (allDone && !celebrated.current) { celebrated.current = true; haptic(20); celebrateBooking(); }
  }, [allDone]);

  return (
    <>
      <SEOHead title="Verify your helper account — VANO" description="Confirm your student email, verify your ID and pay the €2 fee to start picking up jobs." noindex />
      <HouseholdNav />

      <main className="pt-28 pb-20 px-4">
        <div className="max-w-md mx-auto">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
            <div className="flex items-center gap-2 text-sage mb-3">
              <Lock className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-widest">Secure verification</span>
            </div>
            <h1 className="display-lg text-foreground mb-2">
              {name ? `Nearly there, ${name.split(' ')[0]}` : 'Nearly there'}
            </h1>
            <p className="text-muted-foreground leading-relaxed mb-8">
              Three quick steps get you live. They're why customers feel safe letting a helper into their home — and they only ever see verified helpers.
            </p>
          </motion.div>

          {!helperId ? (
            <div className="rounded-2xl border border-border/60 bg-secondary/30 p-6 text-center">
              <p className="text-sm text-foreground font-semibold mb-1">We couldn't find your application</p>
              <p className="text-sm text-muted-foreground mb-4">Apply first, then come back to verify.</p>
              <a href="/join" className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold">Apply to join <ArrowRight className="w-4 h-4" /></a>
            </div>
          ) : (
            <div className="space-y-4">
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
                    {emailError && <p className="text-xs text-destructive">{emailError}</p>}
                    {emailState === 'idle' || emailState === 'sending' ? (
                      <Button onClick={() => void sendCode()} disabled={emailState === 'sending'} className="w-full rounded-full font-semibold gap-2">
                        {emailState === 'sending' ? <><Loader2 className="w-4 h-4 animate-spin" />Sending…</> : 'Send me a code'}
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button onClick={() => void verifyCode()} disabled={emailState === 'verifying' || code.length !== 6} className="flex-1 rounded-full font-semibold gap-2">
                          {emailState === 'verifying' ? <><Loader2 className="w-4 h-4 animate-spin" />Checking…</> : 'Verify'}
                        </Button>
                        <button onClick={() => void sendCode()} className="text-xs text-muted-foreground underline underline-offset-2 px-2">Resend</button>
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
                    <p className="text-sm text-muted-foreground leading-relaxed">A 2-minute photo of your ID plus a quick selfie, secured by Stripe. We never see your documents.</p>
                    {idError && <p className="text-xs text-destructive">{idError}</p>}
                    <Button onClick={() => void startIdCheck()} disabled={idState === 'starting'} className="w-full rounded-full font-semibold gap-2">
                      {idState === 'starting' ? <><Loader2 className="w-4 h-4 animate-spin" />Opening…</> : <>Start ID check <ArrowRight className="w-4 h-4" /></>}
                    </Button>
                  </div>
                )}
              </VerifyCard>

              {/* Step 3 — €2 fee */}
              <VerifyCard icon={<CreditCard className="w-5 h-5" />} step="3" title="Pay your €2 sign-up fee" done={payState === 'paid'}>
                {payState === 'paid' ? (
                  <p className="text-sm text-muted-foreground">Paid — thank you. 💚</p>
                ) : payState === 'confirming' ? (
                  <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Confirming your payment…</p>
                ) : (
                  <div className="space-y-2.5">
                    <p className="text-sm text-muted-foreground leading-relaxed">A one-off €2 keeps VANO genuine — it's how we know everyone here actually wants to help. Card, Apple Pay or Google Pay.</p>
                    {payError && <p className="text-xs text-destructive">{payError}</p>}
                    <Button onClick={() => void startPayment()} disabled={payState === 'paying'} className="w-full rounded-full font-semibold gap-2">
                      {payState === 'paying' ? <><Loader2 className="w-4 h-4 animate-spin" />Opening…</> : 'Pay €2 to join'}
                    </Button>
                  </div>
                )}
              </VerifyCard>

              {allDone && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-sage-light border border-sage/30 p-5 text-center">
                  <CheckCircle2 className="w-9 h-9 text-sage mx-auto mb-1.5" />
                  <p className="text-base font-bold text-foreground">You're verified and in 🎉</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">Jobs near you will start coming through. Set yourself Available to get them first.</p>
                  <a href="/student-dashboard" className="inline-flex items-center gap-1.5 rounded-full bg-sage text-white px-6 py-2.5 text-sm font-semibold">Go to my dashboard <ArrowRight className="w-4 h-4" /></a>
                </motion.div>
              )}

              {/* Payout nudge */}
              {!allDone && (
                <div className="rounded-2xl border border-sage/30 bg-sage-light p-4">
                  <p className="text-sm font-semibold text-foreground mb-1">Set up payouts</p>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                    Add your bank or Revolut (any IBAN) to get paid automatically after each job. You can do this anytime — earnings are held safely until you do.
                  </p>
                  <a href="/student-dashboard?tab=earnings" className="inline-flex h-10 items-center justify-center rounded-full bg-sage text-white text-xs font-semibold px-5">Set up payouts</a>
                </div>
              )}

              {/* Need a hand? — straight to a person */}
              <div className="rounded-2xl border border-border/60 bg-background p-4">
                <p className="text-sm font-semibold text-foreground mb-0.5">Stuck on anything?</p>
                <p className="text-xs text-muted-foreground mb-3">We're real people in Galway — text or call and we'll sort it.</p>
                <div className="flex items-center gap-2">
                  <a
                    href={`${teamWhatsAppHref}?text=${encodeURIComponent(`Hi VANO, I'm signing up as a helper${name ? ` (${name})` : ''} and need a hand with verification.`)}`}
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
