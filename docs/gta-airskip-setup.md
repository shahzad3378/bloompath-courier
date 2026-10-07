# GTA AirSkip connector

Source: https://tms-api-qa.gtagsm.com/developer/docs/index.html?url=/developer/docs/swagger.json (OpenAPI 1.0, reviewed 2026-10-03).

Operations: POST /shipment/rate; POST /shipment?pngLabel=true; POST /trackings/get. Both x-account-key and x-api-key are sent server-side. No portal password is used.

Configure in Vercel project Settings → Environment Variables (Production, then redeploy):
- GTA_AIRSKIP_ORGANIZATION_ID: FastDrop organization UUID edb6f2a6-1e35-45b6-a60c-35b8ca4aa01e.
- GTA_AIRSKIP_ACCOUNT_KEY and GTA_AIRSKIP_API_KEY: issued by GTA. Never put secrets in NEXT_PUBLIC variables or chat.
- GTA_AIRSKIP_BASE_URL: QA default https://tms-api-qa.gtagsm.com. Production is https://tms-api.gtagsm.com (confirmed by GTA 2026-10-06). Only these exact QA/production origins are accepted; paths and redirects are rejected. Use the matching account key/API key for each host.
- GTA_AIRSKIP_LIVE_ENABLED: false until production acceptance; true enables live bookings with a per-booking charge confirmation.

Ask GTA to confirm account-enabled service names, induction address/terminal, package type values, middle-mile destination terminal, account billing/insurance currency, item weight/value interpretation for quantities, and production URL. No terminal or service name is guessed. The current connector requires a terminal because the Shipment schema lists it as required, although its field description calls it optional for Ground rates.

Open Courier Partner API → GTA AirSkip. Use an existing one-piece FastDrop AWB with complete sender/consignee addresses, positive kg weight, and cm dimensions. Use the configured FastDrop sender address for the carrier leg; operator confirmation is required for rates and labels. Original shipment sender details remain unchanged. Blank service lets GTA select an appropriate service. Enter a destination terminal for middle-mile services.

Canada domestic: customs items/HS codes can be omitted. Cross-border and explicit USPS service: add actual customs items, weight in kg, 4–10 digit HS code, declared value, currency and quantity. Do not assume whether provider weight/value is per unit or total for quantity >1; confirm with GTA. Insured shipments need an actual insurance declared value. COD collection and multiple physical parcels under a single FastDrop shipment are blocked in this first connector, even though GTA's API supports package arrays.

Rate checks create no AWB. QA uses the QA hostname and creates no live partner link or custody change. Production labels create/reuse GTA AirSkip's partner link, without physical handover or shipment-status changes. Dispatch handover stays a separate operation.

Booking UUID is the provider JSON body field IdempotencyKey and reference1 is the FastDrop AWB. No custom trackingNumbers are sent (provider approval required). Service-only reservation and shipment locks prevent duplicate concurrent bookings across GTA/BroadReach in production. One booking per shipment per QA/live mode. No automatic carrier booking retries. Timeout, rejection or invalid labels retain a pending/needs_review reservation; reconcile with GTA before any manual recovery. A saved generated label can retry local finalization without another carrier request. PNG/ZPL bytes and loadNumber are retained internally; authenticated tenant-scoped downloads do not use public URLs.

Tracking checks use only saved partner AWBs and matching API environment. They display provider status/code and recent events internally. No automatic public tracking/status synchronization yet. GTA registers webhooks after receiving the endpoint URL; see the confirmed callback contract below. Void is POST /shipment/{loadNumber}/void; cancellation UI is not yet implemented. Customs clearance APIs and manifest/report downloading are outside this connector's current scope. This UI is single-parcel booking; existing BroadReach bulk booking remains separate.

Acceptance after keys arrive: QA domestic rate → label → protected download → tracking; cross-border customs rate/label; concurrent booking rejection; production rate with provider-approved details; authorized production label and partner-link verification. No actual carrier requests are made without configured account keys.

Implementation verification: 32 BroadReach/GTA tests passed; TypeScript, scoped ESLint and production Next build passed. Live database rollback test passed for tenant boundaries, QA custody, duplicate reservation, both cross-carrier directions and idempotent live linking. RLS and client-role privilege checks passed. New UI scoped strict audit passed; full legacy repository audit timed out after 12 seconds. Authenticated browser and actual provider calls remain pending keys. Request schema fixture is copied from the provider Swagger above (2026-10-03).

API connection verification: the tenant-authorized Verify API keys button calls POST /trackings/get with a fresh synthetic exact tracking filter, pageSize=1 and includeHistory=false. A successful list response proves acceptance by the tracking endpoint, without querying account-wide records or creating a shipment. Rates, route coverage and booking permission still need actual parcel acceptance.

Unsuccessful provider responses are mapped into fixed credential/account/access/no-match/contract categories; arbitrary provider text is never shown or logged. A no-match verification response is inconclusive and needs a real parcel rate check.

## Confirmed GTA contract and recovery (2026-10-06)

- Use exactly `IdempotencyKey` in the creation JSON body. There is no idempotency header; never generate a new key for an uncertain booking. FastDrop stores the booking UUID before the request and retains it on failure. It does not automatically retry POST /shipment.
- Send `ToAddress2` as an empty string when absent, never null. These two field spellings override the older Swagger fixture. Actual QA responses use PascalCase, including a single rate object; parsers accept documented camelCase and observed PascalCase but reject conflicting aliases.
- GTA can save a shipment before returning HTTP 500. A failure does not prove that no shipment exists. Reconcile with GTA using the FastDrop reference and stored booking UUID.
- GET /label/format?trackingNumber=...&format=PDF|PNG|ZPL reprints an existing label. Downloads are server-side, bounded, signature-checked and tenant/role protected. Default download is PDF reprint; Saved label downloads the stored PNG/ZPL without another carrier request. QA reprints remain available after production activation using GTA_AIRSKIP_QA_ACCOUNT_KEY and GTA_AIRSKIP_QA_API_KEY.
- Recover existing label accepts a GTA-confirmed tracking number for a pending/needs_review booking. It verifies the exact tracking record and reference1 against the original FastDrop AWB, recovers PNG, saves with a status compare-and-swap, then runs existing local finalization. It never calls shipment creation.
- GTA_AIRSKIP_PICKUP_ADDRESS is a server-only JSON object with name, phone, address, address2, city, state, postalCode and country. Operators can use this FastDrop sender address for the carrier leg while preserving the original shipper on the FastDrop shipment. No email is sent. Customs requirements are based on this selected induction country and destination country.
- GTA confirmed on 2026-10-07: send all sender terminals together as `fromTerminal: "ONDM,MISS2,MISSF,BRA"` for rate shopping. Single and bulk forms show the complete read-only list; legacy individual selections normalize to the complete list before rating or booking. Blank service allows provider selection. Production rating carriers enabled for account 0204: CP Expedited Parcel, INTELCOM2, FLEX, MIDLAND.

Confirmed parcel drop-off address (2026-10-07): GTA AIRSKIP LTD, 2710 Britannia Road East, Cargo 2, Entrance 6, Mississauga, ON, L4W 2P7, CA. This is physical handover guidance only and is never substituted as the label sender. `GTA_AIRSKIP_PICKUP_ADDRESS` retains its configuration key and stores the FastDrop sender: Fast Drop Worldwide Logistics Inc., 5004 Timberlea Rd, Unit 45, Mississauga, ON, L4W5C5, CA, +14383081520 (matching the user-supplied QA label). Existing carrier labels require provider correction; do not recreate shipments to change an address.

## Tracking callback

Give GTA the production URL `/api/webhooks/gta-airskip` to register for account 0204. GTA sends JSON once, without a body signature or API key, and does not retry. Registration remains an external GTA action.

The endpoint treats callbacks only as hints. TrackingNumber and LoadNumber must match an existing production booking in the configured tenant and exact host. Unknown references receive the same 202 acknowledgement. Callback events, POD, email and location are never trusted or persisted. A persistent compare-and-swap and 60-second cooldown bound repeated callbacks per booking; an authenticated exact tracking API pull supplies the cached status/events. Physical shipment custody is unchanged. Check tracking remains the manual API fallback if a callback is missed or the pull fails. No claim of automatic public tracking synchronization or scheduled polling is made.

Provider event codes: 0 Generic, 10 Created, 20 Ready for Shipment, 30 Shipped, 35 Out For Delivery, 40 Delivered, 50 Cancelled, 60 Delayed, 70 Customs cleared, 80 Returning to sender, 90 Returned To Sender, 100 POD, 110 Lost by carrier. These callback codes are not assumed to equal the tracking API standardStatus enum.

Live verification 2026-10-06: production ONDM rate returned Expedited Parcel cost 14.58 in account currency, without creating a shipment. QA reprint returned an authenticated PDF for the previously confirmed direct API test. The direct QA test is not a FastDrop booking record. The PDF template has overlapping service/terminal/reference text; provider label layout needs correction.

Missing Canadian province fields (2026-10-07): rate, label and bulk-preview mapping first uses the saved province, then resolves a missing province from a complete saved Canadian postal code using Canada Post's unambiguous first-character table. It does not rewrite the address or guess from a city name. X covers NT/NU and still needs a saved province; invalid/incomplete postal codes and missing US states remain blocked. Bulk files continue to use saved shipment addresses, not address columns.
