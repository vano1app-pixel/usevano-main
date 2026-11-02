import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Before/after job photos — upload endpoint for the helper's job screen.
//
// The helper snaps a "before" photo at arrival and an "after" photo when they
// mark the job finished (StudentJobDetail). Photos are the evidence layer for
// Vano Cover damage claims + report-a-problem disputes, and the customer's
// tracking page renders the pair as a shareable before/after card.
//
// Auth (verify_jwt=false like every function — enforced here): the caller's
// JWT must resolve to the booking's assigned helper (student_id), same model
// as household-arrival. Writes go to the public-read `job-photos` bucket via
// the service role (no client upload policy exists on purpose) and the URL is
// stamped onto the booking row (arrival_photo_url / finish_photo_url).
//
// Fail-soft by design on the client: a photo that won't upload must never
// block the job flow — this endpoint just returns an error and the app moves on.
//
// kind='customer' (2026-09-06): the BUYER's optional photo of the job, attached
// right after posting. No JWT (customers are anonymous) — the booking UUID is
// the capability, same trust model as complete-household-job. It can only
// write customer_photo_url, never the helper's arrival/finish shots.

const FALLBACK_ORIGINS = ['https://vanojobs.com', 'https://www.vanojobs.com', 'http://localhost:5173', 'http://localhost:4173'];
const NATIVE_APP_ORIGINS = ['capacitor://localhost', 'https://localhost', 'ionic://localhost'];
const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type';

function matchOrigin(req: Request): string | null {
  const origin = req.headers.get('Origin');
  if (!origin) return null;
  const n = origin.replace(/\/$/, '');
  const list = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  const allowed = [...(list.length ? list : FALLBACK_ORIGINS), ...NATIVE_APP_ORIGINS];
  if (allowed.includes(n)) return n;
  try { if (new URL(n).hostname.endsWith('-vano1app-pixels-projects.vercel.app')) return n; } catch { /* not a URL */ }
  return null;
}
function buildCorsHeaders(req: Request) {
  return { 'Access-Control-Allow-Origin': matchOrigin(req) ?? 'null', 'Access-Control-Allow-Headers': ALLOWED_HEADERS, 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
}
function isOriginAllowed(req: Request) { return !req.headers.get('Origin') || matchOrigin(req) !== null; }

const MAX_BYTES = 8 * 1024 * 1024; // matches the bucket's file_size_limit
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const json = (status: number, payload: Record<string, unknown>) =>
    new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  const bad = (status: number, error: string) => json(status, { error });

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return bad(405, 'Method not allowed');
  if (!isOriginAllowed(req)) return bad(403, 'Forbidden origin');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const form = await req.formData().catch(() => null);
    if (!form) return bad(400, 'Expected multipart/form-data');
    const bookingId = String(form.get('booking_id') ?? '').trim();
    const kindRaw = String(form.get('kind') ?? '').trim();
    const photo = form.get('photo');
    if (!bookingId) return bad(400, 'booking_id required');
    if (kindRaw !== 'arrival' && kindRaw !== 'finish' && kindRaw !== 'customer') return bad(400, "kind must be 'arrival', 'finish' or 'customer'");
    const kind = kindRaw as 'arrival' | 'finish' | 'customer';

    // Helper kinds need the assigned helper's session; the customer kind is
    // gated on the booking id below (anonymous customers have no session).
    let user: { id: string } | null = null;
    if (kind !== 'customer') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) return bad(401, 'Unauthorized');
      const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user: u }, error: userErr } = await authClient.auth.getUser();
      if (userErr || !u) return bad(401, 'Unauthorized');
      user = u;
    }
    if (!(photo instanceof File) || photo.size === 0) return bad(400, 'photo file required');
    if (photo.size > MAX_BYTES) return bad(413, 'Photo too large (max 8 MB)');
    const contentType = photo.type || 'image/jpeg';
    if (!ALLOWED_TYPES.includes(contentType)) return bad(415, 'Photo must be JPEG, PNG or WebP');

    const supabase = createClient(supabaseUrl, serviceKey);

    // Only the ASSIGNED helper may attach photos, and only while the job is
    // actually theirs to document (accepted through completed — photos can
    // arrive slightly late, e.g. the finish shot after the customer confirms).
    const { data: booking } = await supabase
      .from('household_bookings')
      .select('id, status, student_id')
      .eq('id', bookingId)
      .maybeSingle() as { data: { id: string; status: string; student_id: string | null } | null };
    if (!booking) return bad(404, 'Booking not found');
    if (kind === 'customer') {
      // One photo, attached while the order is live. UUID = capability.
      if (['cancelled', 'completed'].includes(booking.status)) return bad(409, 'Booking is not open');
    } else {
      if (!booking.student_id || booking.student_id !== user!.id) return bad(403, 'Not your job');
      if (['pending', 'cancelled'].includes(booking.status)) return bad(409, 'Booking is not active');
    }

    // Fixed path per booking+kind — a retake overwrites, no orphan files.
    const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    const path = `${bookingId}/${kind}.${ext}`;
    const bytes = new Uint8Array(await photo.arrayBuffer());
    const { error: uploadErr } = await supabase.storage
      .from('job-photos')
      .upload(path, bytes, { contentType, upsert: true });
    if (uploadErr) {
      console.error('[job-photo] upload failed', uploadErr);
      return bad(500, 'Upload failed — try again');
    }

    const { data: pub } = supabase.storage.from('job-photos').getPublicUrl(path);
    // Cache-bust retakes: same path means the old URL may be CDN/browser-cached.
    const url = `${pub.publicUrl}?v=${Date.now()}`;

    const column = kind === 'arrival' ? 'arrival_photo_url' : kind === 'finish' ? 'finish_photo_url' : 'customer_photo_url';
    const { error: updateErr } = await supabase
      .from('household_bookings')
      .update({ [column]: url })
      .eq('id', bookingId);
    if (updateErr) {
      console.error('[job-photo] stamp failed', updateErr);
      return bad(500, 'Could not save the photo — try again');
    }

    console.log(`[job-photo] ${kind} photo saved for booking ${bookingId}`);
    return json(200, { url });
  } catch (err) {
    console.error('[job-photo] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
