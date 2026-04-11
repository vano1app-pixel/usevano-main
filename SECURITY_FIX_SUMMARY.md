# VANO Security Fix Summary

**Date:** 2026-04-11 (updated with v2 fixes)

---

## V2 Fixes (remaining risks resolved)

### Admin page — server-side role check (was C1/C2)
- **Admin.tsx** — replaced `isAdminOwnerEmail()` hardcoded email check with `supabase.rpc('has_role')` database call. Admin access now verified server-side via `user_roles` table, not client-side email list.

### 5 AI Edge Functions — auth validation added (was critical)
- **ai-profile-coach** — added Bearer token + `getUser()` validation
- **ai-cover-letter** — added Bearer token + `getUser()` validation
- **ai-pricing-advisor** — added Bearer token + `getUser()` validation
- **ai-job-description** — added Bearer token + `getUser()` validation
- **ai-review-summary** — added Bearer token + `getUser()` validation
- Unauthenticated callers now get 401 before any AI credits are consumed.

### RLS migration — community posts + hire requests (was high)
- **New migration: `20260411120000_security_hardening_v2.sql`**
  - Community posts INSERT now forces `moderation_status = 'pending'` — users can't self-approve
  - Hire requests get admin SELECT/UPDATE/DELETE policies
  - Notifications UPDATE policy tightened

---

## What was fixed

### File upload hardening (H1, H2)
- **AvatarUpload.tsx** — added MIME type whitelist (JPEG, PNG, WebP, GIF)
- **PortfolioManager.tsx** — added MIME type whitelist + replaced `Math.random()` with `crypto.randomUUID()` + sanitized file extensions
- **ReviewForm.tsx** — added MIME type whitelist + replaced `Math.random()` with `crypto.randomUUID()` + sanitized extensions
- **Messages.tsx** — added MIME type whitelist + size limit (5MB) + replaced `Math.random()` with `crypto.randomUUID()` + sanitized extensions
- **Profile.tsx** (banner upload) — added MIME type whitelist + size limit (5MB) + sanitized extensions
- **ListOnCommunityWizard.tsx** — replaced `Math.random()` with `crypto.randomUUID()` + sanitized extensions
- **New file: `src/lib/uploadValidation.ts`** — shared validation helpers for future use

### Security headers (H3)
- **vercel.json** — added production security headers:
  - `X-Content-Type-Options: nosniff` (prevents MIME sniffing)
  - `X-Frame-Options: DENY` (prevents clickjacking)
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: geolocation=(), microphone=(), camera=(self)`

### Service worker open redirect fix (M2)
- **sw.ts** — notification click URL now validated to start with `/` before navigating. External URLs fall back to `/`.

### Tabnabbing fix (L2)
- **ListOnCommunityWizard.tsx** — changed `<Link target="_blank">` to `<a target="_blank" rel="noopener noreferrer">` for Terms and Privacy links.

---

## What remains risky (manual action required)

### Admin email exposure (C1) — MANUAL REVIEW
The admin email list in `src/lib/adminOwner.ts` is baked into the client bundle. However, the actual admin operations are protected by Supabase RLS (`has_role()` check). This is a PII leak, not an access control bypass. To fully fix:
- The `user_roles` table and `has_role()` function already exist in the database
- Consider removing the client-side email list and querying `user_roles` via Supabase RLS instead
- Or keep it as a UI-only gate (current state) since RLS enforces the real boundary

### Admin page password (C2) — MANUAL REVIEW
`VITE_ADMIN_PAGE_PASSWORD` in client bundle is plaintext. Since RLS protects actual operations, this is a UI gate only. Consider removing it if not needed.

### CORS on Edge Functions (M1) — MANUAL ACTION
All Supabase Edge Functions use `Access-Control-Allow-Origin: *`. For production, restrict to:
```typescript
'Access-Control-Allow-Origin': 'https://vanojobs.com'
```
This needs to be done in each function file under `supabase/functions/`.

### Vite dev server binding (M3) — OPTIONAL
`vite.config.ts` binds to `0.0.0.0:8080` (accessible on network). Change `host` to `"127.0.0.1"` for local-only dev. Low priority — only affects development.

### Database RLS improvements — MANUAL ACTION
From the database audit, these migrations should be created:
1. **Community posts moderation bypass** — add `AND moderation_status = 'pending'` to INSERT policy
2. **Hire requests** — add UPDATE/SELECT policies for admins
3. **Profiles SELECT** — currently `USING (true)` allows anyone to read all profiles. Consider restricting to authenticated users if sensitive fields are stored

### AI Profile Coach auth (M, edge function) — MANUAL ACTION
`supabase/functions/ai-profile-coach/index.ts` doesn't validate the Authorization header. Add auth check before processing.

---

## Env vars needed
No new environment variables required. Existing setup is correct.

## DB migrations needed
See "Database RLS improvements" above. These are recommended hardening, not breaking issues — RLS on core tables (profiles, student_profiles, messages, jobs, applications) is already solid.

## Routes/components hardened
- All file upload components (6 files)
- Service worker notification handler
- Vercel deployment headers
- ListOnCommunityWizard external links

## Areas unable to fully verify
- **Supabase storage bucket configuration** — bucket-level settings (public/private, size limits) are managed in the Supabase dashboard, not in code. Verify these match expectations.
- **Edge Function CORS** — requires per-function updates in the `supabase/functions/` directory, which would need redeployment via `supabase functions deploy`.
- **Rate limiting** — Supabase handles auth rate limiting. Application-level rate limiting on Edge Functions would require additional infrastructure (Deno KV or similar).
