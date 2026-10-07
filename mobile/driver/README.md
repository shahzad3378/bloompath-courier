# BloomPath Courier Driver for Android — 1.2.0

Expo SDK 57 app connected to the existing Courier Supabase project. The web portal is the admin, warehouse and dispatcher workspace. Never use a service-role key in the app.

## Operational features

- Active driver login and tenant-scoped assignments. Tasks separates pickup manifests and handed-over delivery runs; dispatch assigns pickups from the manifest detail page.
- Pickup and hub-handover AWB scans record custody. Pickup completion requires every parcel scanned. Hub handover does not grant warehouse receiving authority.
- Route map displays saved delivery coordinates with OpenStreetMap attribution. A nearest-stop suggestion uses straight-line distance; it does not calculate road traffic or change dispatch order. Google Maps provides external navigation. Addresses without coordinates remain in Tasks.
- Assigned-only Code 39/128/QR and manual scanning. Delivered/undelivered outcomes, mandatory JPG proof photo (5 MB maximum), failure reasons and notes use the existing delivery-attempt workflow.
- Cash tab separates COD cash/deposit receipts and personal earnings. Admin selects per-delivery, fixed or mixed terms and currency in Users & Roles → driver edit. Future confirmed deliveries generate commission; fixed pay, bonuses, deductions and payouts require an authorized finance record. This records payouts and does not transfer funds.
- Paginated delivery/failed/return history. Profile shows recorded vehicle/licence information, actual delivery-attempt success rate, private identity/licence/vehicle JPG uploads and editable masked bank details.
- Support creates damage/dispute/address/reattempt issues and stored dispatch conversations. Dispatch replies in Rider Support. Refresh checks for replies; no push/realtime notification is claimed. The phone action uses the organization's configured contact number.

## Boundaries

Photo POD is supported; OTP verification and signature capture are not implemented. Reattempt requests require dispatch approval and the existing reattempt workflow. Delivery runs are assigned at handover, so accept/reject is not offered. Active return completion, offline queues, background GPS, ratings and automatic salary accrual are outside this release. Device testing is still required for camera, private uploads and native map interaction.

## Configure and build

1. Run from `mobile/driver`. Copy `.env.example` to `.env` for local development; preview/production profiles already contain the Courier public connection settings.
2. Run `npm ci`, then `node -p "require('./app.json').expo.version"` and verify **1.2.0**.
3. Use `npx expo start --android` for development or `npx eas-cli build --platform android --profile preview` for a new APK. EAS needs your Expo login. Production generates an AAB.
4. Install the new APK on an Android phone. An existing APK or a Vercel redeploy does not update native source.

Backend migrations: `driver_mobile_operations`, `driver_mobile_wallet_summary` and `driver_pickup_read_access`. Auth/assignment checks and RLS remain authoritative. The app shows a saved state only after server confirmation. No historical commissions are backfilled.

Design contracts: DESIGN.md and UX-CONTRACT.md. Verification evidence and outstanding device acceptance: UI-VERIFICATION.md.
