// One-shot: create the €1 Vano AI Find Payment Link on Stripe.
//
// Run once. Outputs the https://buy.stripe.com/... URL to paste into
// VITE_STRIPE_AI_FIND_PAYMENT_LINK (Vercel + .env.local).
//
// Usage (bash):
//   STRIPE_SECRET_KEY=sk_live_... SITE_URL=https://vanojobs.com \
//     node scripts/create-ai-find-payment-link.mjs
//
// Usage (PowerShell):
//   $env:STRIPE_SECRET_KEY="sk_live_..."; $env:SITE_URL="https://vanojobs.com"
//   node scripts/create-ai-find-payment-link.mjs
//
// Why a script and not the Stripe Dashboard? Same end state, but this
// (a) is reproducible — commit the output and any teammate can rebuild
// it in 30 seconds, (b) doesn't need Dashboard access, (c) sets the
// success URL correctly on the first try instead of a 3-click form.
//
// Safe to re-run — it'll create a new Payment Link each time (Stripe
// doesn't dedupe by name). The old one still works if you accidentally
// already pasted it somewhere, so there's no cleanup urgency. If you
// want to clean up: Stripe Dashboard → Payment Links → archive old.

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SITE_URL = (process.env.SITE_URL || 'https://vanojobs.com').replace(/\/+$/, '');
const RETURN_URL = `${SITE_URL}/ai-find-return?session_id={CHECKOUT_SESSION_ID}`;

if (!STRIPE_SECRET_KEY) {
  console.error('ERROR: STRIPE_SECRET_KEY is required.');
  console.error('  Get it from Stripe Dashboard → Developers → API keys → Secret key');
  console.error('  Or copy from Supabase → Edge Functions → Secrets → STRIPE_SECRET_KEY');
  process.exit(1);
}

// Mode sanity-check. sk_test_ creates a Payment Link in test mode,
// sk_live_ in live mode. You almost always want live for a deployed
// site. We log so a wrong key doesn't silently end up in prod.
const mode = STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'LIVE'
           : STRIPE_SECRET_KEY.startsWith('sk_test_') ? 'TEST'
           : 'UNKNOWN';
console.log(`Creating Payment Link in ${mode} mode…`);

function formEncode(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

async function stripe(path, body) {
  const resp = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formEncode(body),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Stripe ${path} ${resp.status}: ${text}`);
  }
  return JSON.parse(text);
}

try {
  // 1. Product
  const product = await stripe('products', {
    name: 'Vano AI Find',
    description: 'AI-matched freelancer for your brief. Refunded if no match.',
  });
  console.log(`  product: ${product.id}`);

  // 2. Price — €1.00 one-time
  const price = await stripe('prices', {
    product: product.id,
    currency: 'eur',
    unit_amount: '100',
  });
  console.log(`  price:   ${price.id}`);

  // 3. Payment Link
  //    - line_items: one of the price above
  //    - after_completion: redirect to our return handler with the
  //      session id so /ai-find-return can fall back to session-based
  //      lookup when localStorage is unavailable (Safari private mode)
  const link = await stripe('payment_links', {
    'line_items[0][price]': price.id,
    'line_items[0][quantity]': '1',
    'after_completion[type]': 'redirect',
    'after_completion[redirect][url]': RETURN_URL,
  });

  console.log('\n✅ Created Payment Link');
  console.log(`   URL: ${link.url}`);
  console.log('\nNext:');
  console.log(`  1. Paste this URL into Vercel → VITE_STRIPE_AI_FIND_PAYMENT_LINK`);
  console.log(`     (Production + Preview + Development)`);
  console.log(`  2. Also add to .env.local so dev matches prod.`);
  console.log(`  3. Redeploy.`);
} catch (err) {
  console.error('\n❌ Failed:', err.message);
  process.exit(1);
}
