# GTA AirSkip connector

Source: https://tms-api-qa.gtagsm.com/developer/docs/index.html?url=/developer/docs/swagger.json (OpenAPI 1.0, reviewed 2026-10-03).

Operations: POST /shipment/rate; POST /shipment?pngLabel=true; POST /trackings/get. Both x-account-key and x-api-key are sent server-side. No portal password is used.

Configure in Vercel project Settings → Environment Variables (Production, then redeploy):
- GTA_AIRSKIP_ORGANIZATION_ID: FastDrop organization UUID edb6f2a6-1e35-45b6-a60c-35b8ca4aa01e.
- GTA_AIRSKIP_ACCOUNT_KEY and GTA_AIRSKIP_API_KEY: issued by GTA. Never put secrets in NEXT_PUBLIC variables or chat.
- GTA_AIRSKIP_BASE_URL: QA default https://tms-api-qa.gtagsm.com. Obtain the exact production hostname and matching keys from GTA; this connector accepts HTTPS subdomains of gtagsm.com, without paths or redirects. A different production domain needs an explicit code review.
- GTA_AIRSKIP_LIVE_ENABLED: false until production acceptance; true enables live bookings with a per-booking charge confirmation.

Ask GTA to confirm account-enabled service names, induction address/terminal, package type values, middle-mile destination terminal, account billing/insurance currency, item weight/value interpretation for quantities, and production URL. No terminal or service name is guessed. The current connector requires a terminal because the Shipment schema lists it as required, although its field description calls it optional for Ground rates.

Open Courier Partner API → GTA AirSkip. Use an existing one-piece FastDrop AWB with complete sender/consignee addresses, positive kg weight, and cm dimensions. The saved sender address must be the actual induction location; operator confirmation is required for rates and labels. Blank service lets GTA select an appropriate service. Enter a destination terminal for middle-mile services.

Canada domestic: customs items/HS codes can be omitted. Cross-border and explicit USPS service: add actual customs items, weight in kg, 4–10 digit HS code, declared value, currency and quantity. Do not assume whether provider weight/value is per unit or total for quantity >1; confirm with GTA. Insured shipments need an actual insurance declared value. COD collection and multiple physical parcels under a single FastDrop shipment are blocked in this first connector, even though GTA's API supports package arrays.

Rate checks create no AWB. QA uses the QA hostname and creates no live partner link or custody change. Production labels create/reuse GTA AirSkip's partner link, without physical handover or shipment-status changes. Dispatch handover stays a separate operation.

Booking UUID is the provider idempotencyKey and reference1 is the FastDrop AWB. No custom trackingNumbers are sent (provider approval required). Service-only reservation and shipment locks prevent duplicate concurrent bookings across GTA/BroadReach in production. One booking per shipment per QA/live mode. No automatic carrier booking retries. Timeout, rejection or invalid labels retain a pending/needs_review reservation; reconcile with GTA before any manual recovery. A saved generated label can retry local finalization without another carrier request. PNG/ZPL bytes and loadNumber are retained internally; authenticated tenant-scoped downloads do not use public URLs.

Tracking checks use only saved partner AWBs and matching API environment. They display provider status/code and recent events internally. No automatic public tracking/status synchronization yet. Documentation does not specify customer webhook registration/signing or cancellation endpoint; those remain pending GTA clarification. Customs clearance APIs and manifest/report downloading are outside this connector's current scope. This UI is single-parcel booking; existing BroadReach bulk booking remains separate.

Acceptance after keys arrive: QA domestic rate → label → protected download → tracking; cross-border customs rate/label; concurrent booking rejection; production rate with provider-approved details; authorized production label and partner-link verification. No actual carrier requests are made without configured account keys.

Implementation verification: 32 BroadReach/GTA tests passed; TypeScript, scoped ESLint and production Next build passed. Live database rollback test passed for tenant boundaries, QA custody, duplicate reservation, both cross-carrier directions and idempotent live linking. RLS and client-role privilege checks passed. New UI scoped strict audit passed; full legacy repository audit timed out after 12 seconds. Authenticated browser and actual provider calls remain pending keys. Request schema fixture is copied from the provider Swagger above (2026-10-03).

API connection verification: the tenant-authorized Verify API keys button calls POST /trackings/get with a fresh synthetic exact tracking filter, pageSize=1 and includeHistory=false. A successful list response proves acceptance by the tracking endpoint, without querying account-wide records or creating a shipment. Rates, route coverage and booking permission still need actual parcel acceptance.

Unsuccessful provider responses are mapped into fixed credential/account/access/no-match/contract categories; arbitrary provider text is never shown or logged. A no-match verification response is inconclusive and needs a real parcel rate check.
