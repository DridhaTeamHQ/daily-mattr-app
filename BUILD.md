# Building the Daily Mattr APK

One-time setup (needs a free Expo account — create at expo.dev):

```bash
npm i -g eas-cli
eas login
eas init            # links the project, writes the projectId into app.json
```

Build an installable APK (cloud build, ~10–20 min):

```bash
eas build --profile preview --platform android
```

When it finishes, EAS prints a download link — install that APK on any Android
phone. This is a real dev-client build, so **remote push notifications work**
(unlike Expo Go): tokens register automatically on first launch, and the
Supabase cron (`app_breaking_push`, every 10 min) delivers breaking-news pushes
via Expo's push service.

Notes
- `eas init` inserts `extra.eas.projectId` into app.json — commit that change.
- The app icon/splash still use placeholder art. Replace
  `assets/images/icon.png`, `android-icon-*.png`, and `splash-icon.png` with
  branded versions before any public share.
- Day-to-day development stays on `npx expo start` + Expo Go (local
  notifications only there).
