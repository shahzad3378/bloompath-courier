# Driver operations 1.2.0 verification

- Native TypeScript/Expo ESLint and Android Hermes export pass. This verifies compilation, not a signed APK or physical camera behavior.
- Route tests cover invalid coordinates, nearest-stop order, immutable dispatch order, antimeridian distance, address URL encoding and map injection escaping.
- Hosted rollback-only SQL fixtures passed: assigned pickup reads, all-scan gate, duplicate scan idempotency, driver pickup, warehouse authority boundary, mixed pay commission, self-credit/rate-change denial and cross-driver support/bank/document/earnings privacy. No test salaries, financial entries or shipments persist.
- Main web TypeScript and production build pass for admin pay terms, finance ledger recording, pickup assignment and dispatch support pages.
- Authenticated custody RPCs intentionally use security-definer execution with explicit active-driver/organization/assignment validation. Anonymous execution is revoked. Supabase advisors still report their inherent security-definer surface alongside older unrelated warnings.
- Existing repository icon assets are preserved on GitHub. Temporary local placeholder icons were used only for export resolution and are not committed.
- No EAS authenticated session is available in this workspace; a new APK must be built using the user's Expo account.

## Required physical Android acceptance

Verify 1.2.0 sign-in; pickup assignment/scan/complete/hub handover; delivery scan and mandatory photo/failure reason; map missing-coordinate and navigation states; cash/earnings/history pagination; private JPG documents; masked bank editing; issue creation and dispatch reply; denied permissions and retry/network failures. Runtime screenshots of the native app are not available here. OTP/signature capture, offline queues, push/realtime replies and automatic salary accrual are not implemented.
