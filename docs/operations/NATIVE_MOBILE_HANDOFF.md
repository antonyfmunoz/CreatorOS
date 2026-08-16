# CreativesOS native mobile handoff

## Implemented without external accounts

- Capacitor 8 projects for Android and iOS using the stable
  `net.creativesos.app` application identifier.
- The production web application is the shared UI/runtime and is synchronized
  from `dist/public`.
- HTTPS and `creativesos://` deep-link intake rejects foreign origins before
  routing.
- Resume and network recovery wake the existing authenticated, user-scoped
  post/message/media outbox.
- Notification permission is requested only from an explicit Settings action.
- Device registrations are authenticated, rate-limited, owner-scoped and
  revocable. Provider tokens are indexed with a domain-separated keyed HMAC,
  AES-256-GCM encrypted at rest and excluded from every response. Encryption-key
  rotation therefore requires a coordinated device re-registration window.
- The background runner stores only a timestamp and connectivity status. It is
  not a persistent capture daemon and never receives cookies, tokens, private
  media or outbox payloads.

## Repeatable local checks

```powershell
npm run check
npx vitest run tests/native-mobile.test.ts
npm run build
npx cap sync
npm run verify:mobile
```

Android compilation additionally requires JDK 21, the Android SDK 36 toolchain
and acceptance of Google's SDK license. iOS compilation requires macOS and a
current Xcode installation.

## External and user-controlled completion gates

1. Accept the Android SDK license, install platform/build tools 36, compile and
   run the debug build on representative Android devices.
2. Supply a Firebase project and `google-services.json`; prove token rotation,
   delivery, action routing, opt-out and deletion on Android.
3. Open the iOS project on macOS, select the Apple Developer team, enable Push
   Notifications, Background Processing and Associated Domains, then compile.
4. Supply APNs credentials through the selected push adapter and prove the same
   lifecycle on iPhone/iPad.
5. Publish platform association files only after Android signing certificate
   fingerprints and the Apple Team ID are known, then enable Android
   `autoVerify` and iOS Associated Domains. Custom-scheme links use the bounded
   `creativesos://app/...` contract independently in development.
6. Run foreground/background/terminated notification tests, offline media
   recovery, low-power/thermal/network-transition tests and sustained field
   capture on the supported device matrix.
7. Complete privacy disclosures, store listings, screenshots, review metadata,
   signing custody and irreversible app-store submissions.

Sustained background camera/microphone capture is intentionally not claimed by
the generic background runner. It requires a reviewed native capture service,
platform-policy approval and physical-device evidence.
