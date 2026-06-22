import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, ShieldCheck, CheckCircle2, Loader2, ArrowRight, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { HouseholdNav } from '@/components/household/HouseholdNav';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/integrations/supabase/client';
import { haptic } from '@/lib/haptics';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hdb = supabase as any;

type EmailState = 'idle' | 'sending' | 'sent' | 'verifying' | 'verified';
type IdState = 'idle' | 'starting' | 'submitted' | 'verified';

const inputClass =
  'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-[border-color,box-shadow] duration-150';

/**
 * Post-application verification: confirm the student's college email (OTP) and
 * run a Stripe Identity ID + selfie check. This is what makes the homepage's
 * "ID-checked & vetted" promise real. Reachable straight after applying (id in
 * the URL / localStorage) and re-openable later.
 */
const VerifyHelper: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const helperId = params.get('id') || (typeof localStorage !== 'undefined' ? localStorage.getItem('vano_helper_id') : null);
  const name = params.get('name') || (typeof localStorage !== 'undefined' ? localStorage.getItem('vano_helper_name') : null);
  const returnedFromIdCheck = params.get('id_check') === 'done';
  const paid = params.get('paid') === '1';

  const [email, setEmail] = useState(
    (typeof localStorage !== 'undefined' ? localStorage.getItem('vano_student_email') : '') || '',
  );
  const [code, setCode] = useState('');
  const [emailState, setEmailState] = useState<EmailState>('idle');
  const [emailError, setEmailError] = useState<string | null>(null);

  const [idState, setIdState] = useState<IdState>(returnedFromIdCheck ? 'submitted' : 'idle');
  const [idError, setIdError] = useState<string | null>(null);

  // Reflect any verification already on file (e.g. revisiting the page).
  useEffect(() => {
    if (!helperId) return;
    let cancelled = false;
    (async () => {
      const { data } = await hdb
        .from('household_helpers')
        .select('student_email_verified, id_verified, identity_status')
        .eq('id', helperId)
        .maybeSingle();
      if (cancelled || !data) return;
      if (data.student_email_verified) setEmailState('verified');
      if (data.id_verified) setIdState('verified');
      else if (data.identity_status === 'processing' || data.identity_status === 'requires_input') {
        setIdState((s) => (s === 'verified' ? s : 'submitted'));
      }
    })();
    return () => { cancelled = true; };
  }, [helperId]);

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
    const url = (data as { url?: string } | null)?.url;
    if (error || !url) {
      setIdError((data as { error?: string } | null)?.error || 'Could not start the ID check. Try again.');
      setIdState('idle');
      return;
    }
    window.location.href = url;
  }, [helperId]);

  const bothDone = emailState === 'verified' && idState === 'verified';

  return (
    <>
      <SEOHead title="Verify your helper account — VANO" description="Confirm your student email and verify your ID to start picking up jobs." noindex />
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
            <p className="text-muted-foreground leading-relaxed mb-4">
              Two quick checks keep VANO trusted — they're why customers feel safe letting a helper into their home. Customers only ever see verified helpers.
            </p>
            {paid && (
              <div className="mb-8 inline-flex items-center gap-1.5 rounded-full bg-sage/10 border border-sage/25 px-3 py-1.5 text-xs font-semibold text-sage-dark">
                <CheckCircle2 className="w-3.5 h-3.5" /> €2 sign-up fee paid
              </div>
            )}
            {!paid && <div className="mb-8" />}
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
              <VerifyCard
                icon={<Mail className="w-5 h-5" />}
                step="1"
                title="Confirm your student email"
                done={emailState === 'verified'}
              >
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
              <VerifyCard
                icon={<ShieldCheck className="w-5 h-5" />}
                step="2"
                title="Verify your ID"
                done={idState === 'verified'}
              >
                {idState === 'verified' ? (
                  <p className="text-sm text-muted-foreground">Your ID is verified. You're good to go. ✅</p>
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

              {/* Payout nudge + onward */}
              <div className="rounded-2xl border border-sage/30 bg-sage-light p-4">
                <p className="text-sm font-semibold text-foreground mb-1">Set up payouts</p>
                <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                  Add your bank or Revolut (any IBAN) to get paid automatically after each job. You can do this anytime — earnings are held safely until you do.
                </p>
                <div className="flex items-center gap-2">
                  <a href="/student-dashboard?tab=earnings" className="flex-1 h-10 rounded-full bg-sage text-white text-xs font-semibold flex items-center justify-center">Set up payouts</a>
                  <a href="/student-dashboard" className="flex-1 h-10 rounded-full bg-secondary text-foreground text-xs font-semibold flex items-center justify-center">Go to dashboard</a>
                </div>
              </div>

              {bothDone && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-sage-light border border-sage/30 p-4 text-center">
                  <CheckCircle2 className="w-8 h-8 text-sage mx-auto mb-1.5" />
                  <p className="text-sm font-semibold text-foreground">You're fully verified 🎉</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Jobs near you will start coming through.</p>
                </motion.div>
              )}

              <p className="text-center text-xs text-muted-foreground pt-1">
                Questions? WhatsApp us at{' '}
                <a href="https://wa.me/353899817111" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">+353 89 981 7111</a>
              </p>
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
