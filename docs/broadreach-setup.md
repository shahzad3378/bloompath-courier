# FastDrop BroadReach booking

Open **Courier Partner API → Open BroadReach booking**.

Configure these server-only Vercel environment variables for the `bloompath-courier` project. Select Production; add Preview only when the test deployment should access the account. Never prefix these names with `NEXT_PUBLIC_`.

| Variable | Value |
|---|---|
| `BROADREACH_ORGANIZATION_ID` | `edb6f2a6-1e35-45b6-a60c-35b8ca4aa01e` (FastDrop) |
| `BROADREACH_ACCOUNT` | `1384` (confirmed FastDrop account code) |
| `BROADREACH_USERNAME` | BroadReach Shipping API Basic Auth username |
| `BROADREACH_PASSWORD` | BroadReach Shipping API Basic Auth password |
| `BROADREACH_LIVE_ENABLED` | `false` until the real test is verified |

Use the Shipping API credentials, not a `brda_` agent-access token. The API endpoint is `POST https://shipping-api.brdrch.com/api/v1`, with Basic Auth, JSON and `X-Requested-With: XMLHttpRequest`.

Apply the `broadreach_awb_booking` migration before deploying. Existing Supabase server and service-role configuration is also required. Redeploy after changing environment variables.

## Acceptance test

BroadReach confirmed production labels are required to exercise void/cancel workflows. This connector does not yet implement void/cancel; arrange cancellation directly with BroadReach before creating paid verification labels. Live booking remains gated by `BROADREACH_LIVE_ENABLED` and the charge confirmation.

1. Sign in as FastDrop super admin, operations admin or dispatcher.
2. Choose an eligible single-parcel shipment with complete sender/recipient country, state/province and postal codes, positive kg weight, and no assigned driver or existing partner link. COD collection is not configured and nonzero COD bookings are rejected.
3. Enter its FastDrop AWB, actual item values and their currency. Supply US cross-border SKU, origin and 10-digit HS code. Optional dimensions use cm.
4. Keep **Test label** selected and generate. Download and inspect the PDF/PNG/ZPL. Confirm the correct service (`ca_rateshop` or `us_rateshop`) and account in BroadReach. Confirm the test has not changed custody or added a 3PL partner link.
5. Verify both destination services with the account. Test booking support and account/service entitlement cannot be established without actual account credentials.
6. Enable `BROADREACH_LIVE_ENABLED=true` and redeploy only after test verification. Live booking requires an explicit shipping-charge checkbox. Download labels through the authenticated internal route; seller/customer AWBs remain unchanged.
7. When the live parcel is physically at warehouse, use the existing 3PL handover with BroadReach. It reuses the pre-booked partner link and then updates custody.

## Bulk labels

1. Upload shipments through the existing universal bulk upload first to obtain FastDrop AWBs.
2. On BroadReach booking, use **Bulk BroadReach labels → Download CSV template**. Keep the headers: `awb,currency,description,qty,value,sku,origin,hscode,length,width,height`.
3. Enter one content item per row. Multiple items for one parcel repeat its AWB with matching currency and dimensions; they produce one label. Different physical parcels need different FastDrop AWBs. Maximum 100 parcels / 1,000 item rows / 2 MB. CSV and XLSX (Bulk Upload sheet or first sheet) are supported. HS codes must be text to retain leading zeros.
4. Canada domestic parcels may leave SKU/origin/HS code blank. USA cross-border parcels require those fields, including a 10-digit HS code. Shipment addresses, weight and references are read from the saved shipment.
5. **Validate and preview** checks the file and tenant shipments without requesting labels. Invalid parcels remain visible and are excluded from booking.
6. Choose test or activated live mode. Live requires the per-label shipping-charge confirmation. The batch first requests rates for a waiting parcel; rejected credentials leave all waiting parcels unbooked.
7. Generate the valid parcels. Each uses the existing protected booking/reservation/finalization action sequentially. **Stop after current parcel** finishes the in-flight request before stopping. A carrier failure or interrupted request halts the batch; there is no automatic retry. Continue sends only waiting parcels. Keep the page open while processing.
8. Download the result CSV and individual labels, or a ZIP of saved labels and report (maximum 50 MB). ZIP uses the same authenticated label route. Saved labels remain in Recent carrier bookings after refresh; upload/validation results are transient, so export before leaving. Reuploading an already booked AWB in the same mode reuses its saved label, while unconfirmed reservations remain blocked.

## Duplicate and recovery behavior

Use **Check API connection** with an existing Canada/USA FastDrop AWB to request rates without creating a label or changing booking records. Item fields are not required for this check. It validates API access, account and route coverage, but does not prove label generation or release an earlier unconfirmed booking. Errors show fixed diagnostic categories and HTTP status; arbitrary provider messages and credentials are never logged. New booking failures save the safe diagnostic in `response_metadata`.

Reservation is atomic per tenant, shipment and test/live mode. A second click cannot send another carrier request. No automatic booking retry is used because the provider docs do not promise an idempotency key.

BroadReach requires `reference` values to be unique within 180 days. Preserve the original FastDrop AWB; do not reuse it for another carrier booking. `reference` and optional `reference2` are validated at 35 characters maximum without truncation. Multi-piece creation is unsupported: book each separately represented physical parcel with its own unique reference and label cost.

After a timeout, non-success response, invalid label or process interruption, the pending/needs-review row blocks repeat requests. Search BroadReach by the original FastDrop AWB (`reference`) and reconcile the partner booking first. Only a trusted administrator may repair the reservation after confirming whether an AWB exists; do not delete it blindly.

If label storage succeeded but partner linking failed, submitting the same mode again retries local linking and does not call BroadReach again. Test/live reservations are separate and labels can be downloaded repeatedly.

This change implements booking, label storage/download and local handover compatibility. Tracking webhooks and carrier void/cancel are separate work. Archiving or cancelling a local shipment does not void a BroadReach shipment; reconcile it directly in BroadReach before doing so.

Run focused verification with `node --test tests/broadreach.test.cjs`, `npm run typecheck` (after `npx next typegen`), and `npm run build`.
