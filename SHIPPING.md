# Getting VANO onto the App Store & Google Play — beginner guide

No Mac required. Take it one step at a time. You can't break the website doing
any of this — the app is a separate thing.

## The big picture (read this once)

Your app is built and ready. To go live you do this, roughly in order:

1. **Sign up for the two developer accounts** (Apple + Google). Apple's approval
   can take a day or two, so start it now.
2. **Make one Supabase setting change** so login works in the app (5 minutes).
3. **Give the app its icon** (you provide one 1024×1024 picture).
4. **Ship Android first** — easiest, no Mac, $25. Great confidence builder.
5. **Ship iPhone** — needs a "cloud Mac" (Codemagic). We've set that up.

You're doing **both** stores — Android is just the easier one to start with.

| | Android (Google Play) | iPhone (App Store) |
|---|---|---|
| Cost | $25 once | $99 / year |
| Need a Mac? | No | No (Codemagic builds it in the cloud) |
| Review wait | a few hours – 2 days | 1 – 3 days |

---

## Step 1 — Create the accounts (do this first; approval takes time)

- **Google Play Console**: https://play.google.com/console/signup ($25 once)
- **Apple Developer**: https://developer.apple.com/programs/ ($99/year)

Use a business-ish email you control. Apple may ask to verify your identity.

## Step 2 — The one Supabase setting (5 min) — REQUIRED or login breaks

1. Open your project at https://supabase.com → **Authentication** → **URL
   Configuration** → **Redirect URLs**.
2. Click **Add URL**, paste exactly:

   ```
   com.vanojobs.app://auth-callback
   ```

3. Save. (Leave the existing `https://vanojobs.com` one there too.)

That's the address the app uses to bring users back after Google / email login.

## Step 3 — The app icon

The stores need a square **1024×1024 PNG** of your logo (no transparency, no
rounded corners — the stores round it for you).

- Put your 1024×1024 file at `assets/icon.png` (replace the placeholder there).
- On your computer run:

  ```bash
  npm install
  npm i -D @capacitor/assets
  npx @capacitor/assets generate --iconBackgroundColor '#1a2340' --splashBackgroundColor '#1a2340'
  npx cap sync
  ```

That stamps the icon into both apps. (Don't have a 1024 logo? Send it to me and
I'll tell you exactly what to do.)

---

## Step 4 — Ship ANDROID (the easy win) 🤖

Easiest path uses **Android Studio** (free, runs on your Windows/Mac/Linux PC):

1. Install Android Studio: https://developer.android.com/studio
2. In a terminal in this project: `npm run build && npx cap open android`
   (this opens the app in Android Studio).
3. In Android Studio: **Build → Generate Signed App Bundle / APK → Android App
   Bundle**. It walks you through **creating a keystore** (your app's signing
   key — save the file and passwords somewhere safe forever; you'll reuse them).
4. It produces an `.aab` file. 
5. In **Play Console**: **Create app** → fill the listing (name, description,
   screenshots, privacy policy URL → you have `vanojobs.com/privacy`) → complete
   the **Data safety** form → upload the `.aab` → roll out to **Internal testing**
   first (instant, just you), then **Production**.

That's Android done. 🎉 (Prefer hands-off? `codemagic.yaml` has an Android
workflow too — but Android Studio is the simplest first time.)

---

## Step 5 — Ship iPHONE with Codemagic (the cloud Mac) 🍎

You don't own a Mac, so Codemagic builds the iPhone app for you in the cloud.

**A. One-time setup in the Codemagic website**

1. Sign up at https://codemagic.io with your GitHub account (free tier is plenty).
2. **Add application** → pick this repo (`usevano-main`). It'll detect
   `codemagic.yaml` automatically.
3. **Teams → Integrations → App Store Connect** → connect it. You'll create an
   **API key** in Apple's App Store Connect (Users and Access → Integrations) and
   paste the key id / issuer id / .p8 file into Codemagic. Name the key exactly
   **`VANO App Store Connect`** (the config refers to it by that name).
4. **Environment variables** → create a group named **`vano_env`** with two
   variables (get the values from Supabase → Project Settings → API):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
5. In **App Store Connect** (https://appstoreconnect.apple.com), create the app
   record: **My Apps → +** → bundle id `com.vanojobs.app`, name "VANO".

**B. Build it**

1. In Codemagic press **Start new build** → choose **VANO — iPhone**.
2. It builds, signs, and uploads to **TestFlight** (Apple's testing area).
3. Install **TestFlight** on your iPhone, sign in with your Apple ID, and you can
   open VANO on your own phone — test login + booking here first.
4. When happy: in **App Store Connect**, fill the listing (screenshots, privacy,
   description) and **Submit for Review**.

> First Codemagic build wobble? The build log tells you what's missing (usually a
> signing setting). Codemagic's onboarding wizard walks you through signing too.

---

## After you submit

- **Android**: usually live within hours (sometimes up to ~2 days).
- **iPhone**: Apple reviews in ~1–3 days; they email you if they need changes.
- **Updates later**: change code → bump the version → rebuild the same way.

## When you're stuck

Tell me which step + what you see on screen and I'll walk you through it. The
deeper technical reference is in `CAPACITOR.md`, but you shouldn't need it.
