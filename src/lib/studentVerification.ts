import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { isStrictInstitutionVerificationEmail } from '@/lib/studentEmailValidator';

/**
 * If the user signed in with Google using an institutional email already, mark student as verified without OTP.
 */
export async function ensureAutoStudentVerificationFromEmail(session: Session): Promise<boolean> {
  const email = session.user.email;
  if (!email || !isStrictInstitutionVerificationEmail(email)) return false;

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (profile?.user_type !== 'student') return false;

  const { data: sp } = await supabase
    .from('student_profiles')
    .select('student_verified')
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (sp?.student_verified) return false;

  await supabase.from('student_profiles').upsert(
    {
      user_id: session.user.id,
      student_verified: true,
      verified_email: email,
    },
    { onConflict: 'user_id' },
  );
  await supabase.from('profiles').update({ student_email: email }).eq('user_id', session.user.id);
  return true;
}

export async function isFreelancerStudentVerified(userId: string): Promise<boolean> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('user_id', userId)
    .maybeSingle();
  if (profile?.user_type !== 'student') return true;

  const { data: sp } = await supabase
    .from('student_profiles')
    .select('student_verified')
    .eq('user_id', userId)
    .maybeSingle();
  return !!sp?.student_verified;
}
