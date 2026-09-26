# BloomPath Courier Driver for Android

Expo SDK 57 app connected to the existing BloomPath Courier Supabase project.
The web portal remains the dispatcher and admin workspace.

## First release

- Existing driver email/password login; only an active `driver` profile can open the app.
- Handed-over routes and pending delivery stops, paged in route order.
- Code 39, Code 128 and QR scan, plus manual AWB entry. A scan only opens a stop already assigned to the signed-in driver.
- Customer call and Google Maps directions.
- Delivered or undelivered result, required reason for undelivered, required JPG proof photo (max 5 MB), optional notes.
- The same `delivery_attempts` insert and database trigger as the web portal update the shipment and dispatch run.

Returns, background GPS, push notifications and offline result queues are outside this first release. A result is only shown as saved after the server confirms it. Never use a Supabase secret/service-role key in this app.

## Configure and run

1. Copy `.env.example` to `.env` for local development. The preview and production build profiles already use the **Courier UAE** project URL and publishable key. Do not point the app at the separate BloomPath catalog database.
2. Run `npm ci` and `npx expo start --android`.
3. Sign in with an existing active driver account.
4. For an internal Android APK, run `npx eas-cli build --platform android --profile preview` after linking your Expo account. Production uses an AAB.

The app requires network access for sign-in, route loading, proof upload and result submission. If the database is paused, resume it before testing. Test camera scanning and photo upload on a physical Android device; simulator bundling cannot prove those paths.

The project root `DESIGN.md` and `UX-CONTRACT.md` remain the visual and workflow references. The mobile palette in `src/theme.ts` mirrors their green control-room identity.
