# CreativesOS v209 — Stitch profile, settings and qualification release

## Outcome

Release v209 promotes the latest provider-independent CreativesOS work. The
Stitch screenshots under `attached_assets/stitch_creatoros/stitch_creatoros`
are the only visual reference set used for this release.

## Product changes

- Added the Stitch-aligned General Settings screen with durable push
  notification and high-contrast dark-palette preferences.
- Added validated, durable public profile links and removed the obsolete
  visible `Public` profile tab. The profile rail contains exactly Posts,
  Reposts, Likes, Tagged, Offers and Playlists.
- Preserved clickable profile tabs while retaining hidden-scrollbar horizontal
  navigation.
- Added community recent-message search, selected-result jump behavior and
  message context actions.
- Corrected focused search chrome, route-selected navigation, accessible names,
  keyboard focus and primary dark-theme contrast.
- Kept demo identity and privacy behavior isolated from production and expanded
  migration qualification for the new user preference columns.

## Release evidence

- Unit/integration: 55 files, 184 tests passed.
- TypeScript, production build and bundle budgets passed.
- Browser: 26/26 Pixel 7 and desktop Chromium executions passed.
- Empty database: 61 migrations and all required tables/columns passed.
- Relationship release: tenant operations, automation kernel, native
  comment-to-DM, opt-out, receipts, audit, privacy export/deletion passed.
- Backup/hash/restore, source secret scan and production dependency audit passed.
- Local capacity: 200 requests at concurrency 20, zero failures, p95 168.2 ms.
- Production capacity: 200 requests at concurrency 20, zero failures, p95
  310.4 ms.
- Production security: anonymous privacy access 401, hostile-origin mutation
  403, HSTS/frame/content-type/origin headers present.
- Signed-in v209 browser proof covered Relationship Hub, Settings persistence,
  six-tab Profile behavior, Marketplace filtering/stable product identity and
  the owned community workspace.

## Explicit external gates

UMH installation pairing; Meta, X and future approved messaging providers;
model-backed relationship suggestions; cloned voice; realtime transcription
and AI workers; counsel-approved binding legal documents; and provider-owned
payment/reversal paths are not represented as completed by this release.
