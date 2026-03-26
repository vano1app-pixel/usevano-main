/** Survives refresh so the OTP step isn’t lost mid–sign-up */
export const OTP_STORAGE = {
  email: 'vano_auth_otp_email',
  flow: 'vano_auth_otp_flow',
  userType: 'vano_auth_otp_user_type',
  displayName: 'vano_auth_otp_display_name',
} as const;

export function persistOtpContext(args: {
  email: string;
  flow: 'login' | 'signup';
  userType?: 'student' | 'business';
  displayName?: string;
}) {
  try {
    sessionStorage.setItem(OTP_STORAGE.email, args.email);
    sessionStorage.setItem(OTP_STORAGE.flow, args.flow);
    if (args.userType) sessionStorage.setItem(OTP_STORAGE.userType, args.userType);
    if (args.displayName != null) sessionStorage.setItem(OTP_STORAGE.displayName, args.displayName);
  } catch {
    /* private mode / quota */
  }
}

export function clearOtpContext() {
  try {
    sessionStorage.removeItem(OTP_STORAGE.email);
    sessionStorage.removeItem(OTP_STORAGE.flow);
    sessionStorage.removeItem(OTP_STORAGE.userType);
    sessionStorage.removeItem(OTP_STORAGE.displayName);
  } catch {
    /* ignore */
  }
}
