# VANO iOS — ship checklist (build 1.0 (1))

Tick top to bottom. Nothing here uploads or submits on its own; the last two lines
need the owner's words **667** (merge/deploy) and **submit vano** (upload + submit).

## A. Code (done by Claude on branch `claude/ios-orders`)
- [ ] `store/ios-review-audit.md` — Phase 0 audit + decisions A–D
- [ ] Order loop live: waitlist off, fee hold at post, Find + claim, arrived/start/done, cancel rule
- [ ] Native shell clean: no SEO/blog/social surfaces, no "soon", no admin route, no €2 badge checkout, no mic
- [ ] Stripe hand-off on native opens in-app browser and returns
- [ ] Demo: `_shared/reviewDemo.ts` two phones, `supabase/seed/review-demo.sql`, all crons skip demo rows
- [ ] Privacy page + Info.plist strings match the code
- [ ] `npm run typecheck` · `npm test` · `npm run lint` · `npm run build` all green
- [ ] Simulator run: Post → Find → Claim → Job screen → Done, screenshots in `store/screens/`
- [ ] `store/review-notes.md` + `store/demo-accounts.md` written
- [ ] PR opened, Vercel preview clicked through

## B. Supabase (owner, dashboard) — BEFORE the reviewer opens the app
- [ ] SQL editor: run `supabase/migrations/20260906100000_orders_loop.sql` (by hand, per CLAUDE.md)
- [ ] SQL editor: run `supabase/seed/review-demo.sql` (re-runnable; refreshes the open order)
- [ ] Auth → URL Configuration → Redirect URLs: add `com.vanojobs.app://auth-callback`
- [ ] Edge Functions → Secrets: `REVIEW_DEMO=true`
- [ ] (Optional, only to turn the hold OFF) `VANO_AUTH_AT_BOOKING=0` — the hold is now the default

## C. Merge + deploy (needs **667**)
- [ ] Merge the PR → vanojobs.com + every edge function deploy from main
- [ ] Load https://vanojobs.com, post a real test job to your own number, cancel it (hold released)

## D. Binary (this Mac, Xcode 26.6)
```bash
cd ~/dev/usevano-main
npm run native:sync          # vite build + prerender + cap sync → ios/App/App/public
grep -c 'viewport-fit=cover' ios/App/App/public/index.html   # must print 1
npm run native:ios           # opens ios/App/App.xcworkspace in Xcode
```
In Xcode:
- [ ] App target → Signing & Capabilities → tick *Automatically manage signing* → pick your Team (needs the Apple Developer Program, $99/yr)
- [ ] General → Version `1.0`, Build `1` (bump Build on every upload)
- [ ] Destination: *Any iOS Device (arm64)*
- [ ] Product → Archive → Organizer → *Distribute App* → App Store Connect → Upload
- [ ] Export compliance is pre-answered (`ITSAppUsesNonExemptEncryption = false`)

Or from the terminal once the Team is set (replace TEAMID):
```bash
xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/VANO.xcarchive archive \
  DEVELOPMENT_TEAM=TEAMID
xcodebuild -exportArchive -archivePath build/VANO.xcarchive -exportPath build/export \
  -exportOptionsPlist store/ExportOptions.plist     # method: app-store-connect
```

## E. App Store Connect (owner) — needs **submit vano** before the final button
- [ ] My Apps → + → New App: iOS, name **VANO**, primary language **English (UK)**, bundle id `com.vanojobs.app`, SKU `vano-ios`
- [ ] App Information: category Lifestyle / Productivity, Privacy Policy URL
- [ ] Version 1.0: paste `store/listing.md` (name, subtitle, keywords, promo, description, what's new, support URL)
- [ ] Screenshots: 6.9" set from `store/screens/` (5 frames listed in `store/listing.md`)
- [ ] App Privacy: answers from `docs/APP-STORE-PRIVACY-LABELS.md` (Tracking: No)
- [ ] Age rating: 4+
- [ ] App Review Information: sign-in required YES → user `0890000000`, password `000000`; Notes = `store/review-notes.md`; contact phone + email
- [ ] TestFlight: install on your iPhone, run the tap-by-tap in `store/review-notes.md` yourself first
- [ ] Add for Review → Submit  ← only after **submit vano**

## F. After approval
- [ ] Supabase secret `REVIEW_DEMO` → `false` (or delete)
- [ ] Leave the demo rows (invisible to the public) or delete them per `supabase/seed/README.md`
