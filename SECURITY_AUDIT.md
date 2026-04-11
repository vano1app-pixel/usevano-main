# VANO Security Audit

**Date:** 2026-04-11
**Scope:** Full codebase — frontend, Edge Functions, migrations, deployment config

---

## Critical

### C1. Admin emails hardcoded in client bundle
- **File:** `src/lib/adminOwner.ts:2`
- **Risk:** Admin email addresses (`vano1app@gmail.com`, `ayushpuri1239@gmail.com`) are baked into the browser-deliverable JS bundle. Anyone can extract them, enabling targeted phishing or account takeover attempts.
- **Exploit:** View page source or deobfuscate production bundle → extract admin emails.
- **Fix:** Move admin check to server-side `has_role()` via Supabase RLS. The DB trigger `auto_assign_admin()` already manages the `user_roles` table — use that. Keep the client-side list for UI gating only but make it non-functional for security.
- **Status:** The actual admin operations ARE protected by RLS `has_role()` checks, so this is primarily a PII leak, not an access control bypass. Severity lowered from "critical" to "high" because RLS enforces the real boundary.

### C2. Admin page password gate is client-side only
- **File:** `src/pages/Admin.tsx:91-99`
- **Risk:** `VITE_ADMIN_PAGE_PASSWORD` is baked into the client bundle (plaintext). The sessionStorage gate (`vano_admin_gate`) can be set via devtools.
- **Exploit:** Open devtools → `sessionStorage.setItem('vano_admin_gate', '1')` → access admin UI.
- **Mitigation:** Admin data operations are still protected by Supabase RLS. The password gate only hides the UI.
- **Fix:** Document that this is a UI-only gate. The real security is RLS. Remove plaintext password from env if not needed.

---

## High

### H1. File upload MIME type not validated
- **Files:** `AvatarUpload.tsx:28`, `PortfolioManager.tsx:38`, `ReviewForm.tsx:37`, `Messages.tsx:417`, `Profile.tsx:193`, `ListOnCommunityWizard.tsx:796`
- **Risk:** Only `file.name.split('.').pop()` is used for extension. No `file.type` (MIME) check. A user could upload `malware.exe.jpg` — the extension would be `jpg` but the content could be anything.
- **Exploit:** Upload executable content with image extension → if Supabase storage serves with guessed MIME type, could execute.
- **Fix:** Add MIME type whitelist validation before upload.

### H2. Math.random() for file paths
- **Files:** `ListOnCommunityWizard.tsx:797`, `ReviewForm.tsx:38`
- **Risk:** `Math.random()` is not cryptographically secure. Predictable file paths could allow enumeration or overwrite.
- **Fix:** Use `crypto.randomUUID()`.

### H3. Missing security headers in vercel.json
- **File:** `vercel.json`
- **Risk:** No X-Frame-Options, CSP, X-Content-Type-Options, Referrer-Policy. Site could be framed (clickjacking), content types could be sniffed.
- **Fix:** Add security headers.

---

## Medium

### M1. CORS `Access-Control-Allow-Origin: *` on all Edge Functions
- **Files:** All `supabase/functions/*/index.ts`
- **Risk:** Any origin can call Edge Functions. Mitigated by Bearer token auth on each function.
- **Fix:** Restrict to `https://vanojobs.com` in production. Note: this is a Supabase-side concern and would need to be done per-function or via Supabase config.
- **Manual action required:** Update CORS headers in each Edge Function when deploying to production.

### M2. Service worker notification click — no URL validation
- **File:** `src/sw.ts:63-77`
- **Risk:** `event.notification.data?.url` is used directly in `client.navigate(url)`. A malicious push notification could set an external URL.
- **Fix:** Validate URL starts with `/` before navigating.

### M3. Vite dev server binds to 0.0.0.0
- **File:** `vite.config.ts`
- **Risk:** Dev server accessible on local network. Other devices/users on the same network can access the dev server.
- **Fix:** Bind to `127.0.0.1` (localhost only).

---

## Low

### L1. Hardcoded team contact info in client bundle
- **File:** `src/lib/contact.ts:2-8`
- **Risk:** Phone number and email in client bundle. These are intentionally public contact info — low risk.
- **Fix:** None required — these are meant to be public.

### L2. Internal Link components with target="_blank" missing rel
- **File:** `src/components/ListOnCommunityWizard.tsx:1048,1059`
- **Risk:** React Router `<Link>` with `target="_blank"` — minor tabnabbing risk on internal routes.
- **Fix:** Use `<a>` tags with `rel="noopener noreferrer"` instead of `<Link>` for target="_blank".

---

## What's already secure (good practices found)

- **Supabase RLS** is well-implemented with `auth.uid()` checks on all user-facing tables
- **Storage policies** enforce user-id folder restrictions
- **OAuth flow** uses PKCE (secure)
- **Email verification** enforced on all protected routes
- **No `dangerouslySetInnerHTML`** found — XSS risk minimal
- **Open redirect prevention** — `safeReturnAfterAuth()` validates paths
- **Edge Functions** all validate Bearer tokens before processing
- **Service role key** never exposed to client — only used in Edge Functions
- **Error messages** sanitized — no stack traces or SQL errors exposed to users
- **Input validation** on forms (size limits, type checks)
