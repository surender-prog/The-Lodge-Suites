# The Lodge Suites — Mobile App (Capacitor)

The web app is wrapped with **Capacitor** so the *same codebase* ships as native
**iOS + Android** apps. The web build is unchanged — Capacitor only activates
inside the native shell (`IS_NATIVE` in `src/lib/supabase.js`).

- **App ID:** `com.thelodgesuites.app`  ·  **Name:** The Lodge Suites
  *(the App ID is permanent once submitted to a store — change it in
  `capacitor.config.json` before the first `cap add` if you want a different one)*
- **Web dir:** `dist` (Vite build output)

The native `ios/` and `android/` folders are **not generated yet** — they must
be created on a machine with the native toolchains (below). Everything else
(config, plugins, session storage, npm scripts) is already in place.

---

## Prerequisites
| Platform | Needs |
|---|---|
| **iOS** | macOS + **Xcode**, and **CocoaPods** (`sudo gem install cocoapods` or `brew install cocoapods`) |
| **Android** | **Android Studio** + JDK 17 (Android SDK already present on this machine) |

## 1. Generate the native projects (one time)
```bash
npm run build           # produce dist/
npx cap add ios         # creates ios/   (needs Xcode + CocoaPods)
npx cap add android     # creates android/
```
Commit the generated `ios/` and `android/` folders (Capacitor convention — they
hold native config + signing).

## 2. Build & run
```bash
npm run cap:android     # build web → sync → open Android Studio → Run ▶
npm run cap:ios         # build web → sync → open Xcode → Run ▶
```
After any web change, re-run `npm run cap:sync` (or the per-platform script) to
copy the fresh `dist/` into the native shells.

---

## Auth on native — what already works vs. what's next
- ✅ **Email OTP + email/password login work as-is.** They're plain network
  calls (no browser redirect), so the member OTP flow and corporate/agent
  password flow run unchanged inside the app once `VITE_REAL_GUEST_AUTH=true`.
- ✅ **Durable session.** The Supabase session persists via
  `@capacitor/preferences` on device (not the WebView's evictable localStorage),
  so users stay signed in across cold starts.
- ⬜ **Google / Apple sign-in** (later): needs deep-link handling —
  `@capacitor/app`'s `appUrlOpen` → `supabase.auth.exchangeCodeForSession`, plus
  a custom URL scheme / Universal Link added to the Supabase redirect allow-list.
  **Apple Sign In is mandatory on iOS if Google is offered** (App Store 4.8).
- ⬜ **Biometric unlock** (later): gate the stored refresh token behind Face ID /
  fingerprint with a passcode fallback.
- ⬜ **Secure-storage hardening** (recommended before launch): `@capacitor/preferences`
  is durable but uses UserDefaults / SharedPreferences, **not** the Keychain /
  Keystore. Swap `nativeSessionStorage()` in `src/lib/supabase.js` for a Keychain
  plugin (e.g. `@aparajita/capacitor-secure-storage`) for production.

## Polish plugins to add when ready (optional)
```bash
npm i @capacitor/splash-screen @capacitor/status-bar @capacitor/keyboard
```

---

## Store submission
| Store | Account | Cost | Flow |
|---|---|---|---|
| **Apple App Store** | Apple Developer Program | **$99 / year** | Archive in Xcode → TestFlight → submit |
| **Google Play** | Play Console | **$25 once** | Generate signed AAB in Android Studio → internal testing → submit |

⏰ **Start these in parallel — they have lead times:** the Apple Developer
enrollment can take days, and (for phone OTP) a GCC **+973 SMS sender-ID** can
take weeks.

## Pre-submission gate
Do **not** ship the app to the stores until the web auth is fully live:
1. Apply migration **024** (scoped RLS) + flip `VITE_REAL_GUEST_AUTH=true`.
2. Verify member / corporate / agent login + data scoping in the app.
Wrapping the app while auth is still flag-off would ship a shell that can't log
anyone in.
