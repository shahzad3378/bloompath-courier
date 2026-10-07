# Driver operations 1.2.0

## Admin setup

1. Users & Roles → edit a driver → Rider payment model: per delivered parcel, fixed pay, or fixed pay + per delivery. Enter currency/rates/pay period and save. No rates are configured by this release.
2. Fixed pay, bonus, deduction and payout are recorded in the adjacent confirmed ledger form. A payout entry records an already-made payment; it does not send money. Fixed salary is not automatically accrued. Commission starts on future confirmed deliveries after terms are saved; old deliveries are not backfilled.
3. Ready pickup manifest → assign active rider. The driver scans pickup parcels and completes pickup. A hub-handover scan is custody evidence, while warehouse staff still records receipt.
4. Parcel Operations → Rider Support: review issue requests, reply and update status. The driver's app uses manual refresh for replies. Reattempt requests require the existing dispatch workflow.

## Implementation and verification

Migrations `driver_mobile_operations`, `driver_mobile_wallet_summary`, `driver_pickup_read_access` add RLS-protected pay terms/ledger, custody scans, support threads, private JPG documents/bank metadata, own-driver wallet summaries and narrow pickup parcel read access. Anonymous custody RPC execution is revoked. Driver writes cannot set their pay rates or credit their own earnings.

Rollback test `tests/driver-operations-rls.sql` checks all-scan completion, scan idempotency, warehouse boundary, prospective mixed commission, self-credit denial and cross-driver privacy. Test fixtures never persist. Web TypeScript/build and native TypeScript/lint/Android export pass; native physical-device acceptance is still required.

Native source stays on `codex/android-driver-app`, version 1.2.0, Android versionCode 3. Build a new APK with the user's authenticated EAS session. A Vercel redeploy cannot update an installed Android APK. Photo POD exists; OTP/signature capture, background GPS, offline queues and push/realtime replies are not included.
