# BloomPath Courier UX Contract

## Scope

This contract records observable workflow behavior for the authenticated courier product. Business lifecycle rules remain implemented and authorized by the server/database domain model.

## Canonical owners

| Capability | Canonical owner | Required behavior |
|---|---|---|
| Authentication and role gates | `requireProfile` and server-side organization filters | Every operational query is tenant-scoped and role-authorized. |
| Shipment custody | Shipment status plus warehouse receive scan | “In warehouse” means physical custody, not every shipment in the system. |
| Dispatch route | `dispatch_runs` and `dispatch_run_items.stop_sequence` | A route shows assigned AWBs, mapped stops, unmapped stops, driver, and progress separately. |
| Route visualization | Shared dispatcher route-map component | Client-only map loading, numbered stops, text sequence, and Google Maps driving links. |
| Route optimization overview | `/dispatch/route-optimization` plus shared map loader | Show unassigned warehouse pool, active routes, missing-coordinate count, and latest active-driver GPS without mixing scopes. |
| Draft route selection | Draft route manager | Checkboxes select only the draft routes shown, report exact selected route/shipment counts, and use an app-owned confirmation for cancellation. |
| Route cancellation | Server-authorized dispatch transition | Only draft routes may be cancelled; route records/items remain for audit while warehouse-ready AWBs return to route planning. With-driver and completed routes stay locked. |
| Operational feedback | Inline page banners and stable loading panels | Success, partial success, and recovery guidance remain visible in text. |
| Currency | Organization base currency with shipment override | No screen hardcodes AED for a non-AED tenant. |
| Tenant user roles | `/users` and SaaS-only `/saas/users` | Tenant Super Admins can create staff and edit staff details, but cannot assign or change roles. Only a platform admin can change roles; every company keeps at least one active Super Admin. |

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Table Selection | Shared `SelectableTable` | UX contract | Checkbox or native Selection dropdown; visible candidates only; changing partner remounts selection | Scoped markup audit and live selection check |
| Form | Shared `bp-input`/buttons with server domain validation | DESIGN.md and authorized shipment/booking actions | Single booking / bulk file preview | Scoped ESLint, typecheck, parser and action tests |
| Select/Listbox | Native select in operational booking forms | DESIGN.md; platform popup geometry is accepted | Single booking / batch mode | Semantic labels, disabled states and typecheck |
| Scrollbar | `src/app/globals.css` | DESIGN.md runtime mapping | Results table owns horizontal overflow | Responsive source review and static audit |
| Toast | Inline operational feedback/live regions | UX contract operational feedback | Field error / batch status | Live-region markup and action failure tests |
| CRUD | Role/tenant-authorized server actions and existing database reservation RPCs | Authentication and shipment custody model | Booking / reusing saved labels | Tenant/action tests and reservation verification |

## Workflow ledger

### Shipment browsing

- `/shipments` starts with 50 rows and lets staff select 50, 100, 200, or 500 rows per page. Previous/Next controls state the visible range and result total.
- Shipment rows use the document's vertical scroll so the full selected page can be reached by scrolling down; the table owns horizontal overflow only.
- Search, status, shipper, driver, and date filters keep the existing tenant scoping and filter results before table display.
- Shippers can export all active shipments matching the current search and filters as an Excel workbook. The export remains tenant- and shipper-scoped, mirrors the bulk-upload fields (including international-only fields), adds AWB first and customer-safe status last, and excludes driver details and BloomPath branding. It does not depend on table selection or the current visible page.
- `/shipments/customs-clearance` provides a Canada Customs tab for Canada-bound international shipments. A Dubai-date range filters the same rows used by both downloads. CSV and Excel preserve the attached 34-column manifest order in uppercase; generated AWBs populate consignment, barcode and internal account number, and customer references and uploaded details populate the corresponding fields. Empty/NA address2 values remain blank. International upload supports consignee email, Incoterm, item quantity/value and country of origin; item quantity defaults to one per AWB and missing Canada item value defaults to CAD 1 per parcel kg, including during export of legacy shipments. Other unavailable legacy/custom fields remain blank. Exports are tenant- and shipper-scoped.

### BloomPath FastDrop report

- Reports navigation includes `/reports/bloompath-fastdrop` for internal roles. A Dubai-date range filters shipment booking dates and matches each customer's reference number and FastDrop AWB to its linked 3PL AWB.
- The report reads the tenant-scoped shipment row and its `third_party_shipment_links` record. Missing customer references or partner AWBs remain blank. The table is paginated; CSV and Excel downloads include all matching rows for the selected date range and only the three requested columns.

### Dispatch and warehouse scan modes

- `/dispatch` has an explicit Auto routing / Dispatch scan selector. Auto routing shows the existing warehouse route planner; Dispatch scan asks for an active driver, creates a draft route, and opens its AWB scanner.
- `/warehouse` has one scan selector for Inbound warehouse scan, Driver return scan, Manual customer status update, and Scan & print package label. Each option opens its authorized workflow.
- Scan & print is part of Warehouse because staff label physical packages before dispatch. A warehouse-authorized USB/Bluetooth scanner types an AWB into the focused field; the read-only lookup is organization-scoped and excludes archived shipments. A match opens the shared 4×6 `AwbPrintSheet` directly in a new print window and starts the browser print dialog without an on-page label preview. Multi-piece shipments print package 1 on scan; choosing another piece opens that piece's print dialog. The label caps contents at eight words and reserves its bottom row for the destination and QR code. Lookup errors keep the station available and do not change shipment custody or tracking.
- A driver return is only received after a physical warehouse scan; manual customer tracking updates do not change shipment custody.
### Warehouse custody

- Shipment starts as Booked and is not counted as physically in warehouse.
- `/warehouse` exposes Warehouse receive scan separately from Driver return scan. Authorized warehouse roles can receive a booked, unassigned new parcel directly; pickup-manifest parcels reuse the existing manifest receipt action and database guards. Duplicate scans and changed/ineligible custody are rejected. The scanner resets and refocuses after successful receipt.\n- Warehouse receive scan moves an eligible shipment to At Warehouse.
- Header count shows exact physical-custody scope.
- A separate system summary shows total shipments and other major statuses.

### Dispatch mapping and handover

1. Dispatcher creates or opens a route.
2. Route AWBs are ordered provisionally by zone/postal grouping.
3. “Map & optimize stops” geocodes missing coordinates, writes valid coordinates, and updates stop sequence.
4. The result reports mapped and unmapped counts; partial mapping is a warning, not a false success.
5. Handover repeats the same safe mapping step, then changes eligible AWBs to Out for Delivery.
6. Dispatcher can review the numbered route overview and open address segments in Google Maps.
7. Missing coordinates never become the placeholder point (0,0).
8. The route-optimization view displays dispatch-ready unassigned AWBs, route-assigned AWBs, active drivers, and missing coordinates as separate counts.
9. Automatic planning remains a deliberate dispatcher action and creates draft routes; it does not bypass warehouse custody or handover.
10. A dispatcher may remove a single AWB from a draft route or bulk-cancel selected draft routes.
11. Cancelling preserves the route and item history, records actor and timestamp, and releases its warehouse-ready AWBs back to the optimization pool.
12. With-driver and completed routes cannot be cancelled through the draft cancellation workflow.

## Loading, empty, and recovery states

- Map loading reserves the final map height.
- A route with zero mapped stops shows assigned-stop count and a recovery action.
- A partially mapped route shows both mapped and awaiting-coordinate counts.
- External Google Maps links open in a new tab and retain the in-app route state.

## Accessibility and responsive behavior

- Actions use semantic buttons and links with visible focus.
- Dangerous bulk actions name the selected scope and consequence in an app-owned modal; initial focus lands on “Keep routes,” Escape closes, and focus returns to the trigger.
- Route markers are backed by a text sequence list.
- Color never carries the only status meaning.
- Desktop route map and sequence collapse into a vertical layout on narrow screens.


## BroadReach carrier booking

- `/courier-integrations/broadreach` uses the shared `bp-panel`, `bp-input`, and button primitives; native selects and React `useActionState` follow existing form ownership.
- Internal booking is role-authorized and scoped to the configured FastDrop tenant. Credentials never enter browser props, logs, or database rows.
- Canada uses `ca_rateshop`; USA uses `us_rateshop`. Existing tenant AWBs remain the customer-facing identifiers.
- Default is a test label. Live booking requires activation and an explicit shipping-charge checkbox.
- Connection checking submits rates only using the saved AWB addresses and weight, skips item-field validation, and leaves booking reservations unchanged. Safe categorized failures appear inline without provider text or credentials.
- One shipment represents one parcel. Item values, currency, optional dimensions and customs data are validated server-side.
- Provider references retain their full values and reject lengths over 35 characters before booking.
- Atomic per-shipment/per-mode reservation prevents concurrent double booking. Timeout, ambiguous error or process interruption stays blocked for manual carrier reconciliation.
- Generated labels are retained internally and can be downloaded after authorization. Local linking can be retried without another carrier request.
- Generating an AWB does not mark shipment handover or change physical custody. Warehouse handover reuses the pre-booked partner link.
- Bulk booking owns a transient, non-shareable file preview rather than URL state. The existing file-reader, shipment mapper, booking action and authenticated download route remain canonical; the new `BroadReachBulkBooking` component owns per-parcel progress and `processBroadReachBatch` owns sequential execution.
- Bulk preview accepts CSV/XLSX (2 MB, 100 parcels, 1,000 item rows), reports invalid rows in text and sends no carrier booking. Additional content rows group by AWB with consistent currency/dimensions. Unknown tenant AWBs cannot be booked.
- Starting a batch checks rates before reservation, keeps invalid parcels excluded and repeats authorization for each parcel. Live charges require activation and explicit confirmation. Batch mode locks after the first parcel is processed.
- Stop finishes the current request. Carrier uncertainty or interrupted transport stops subsequent parcels; continue sends only waiting rows and never auto-retries an attempted row. Leaving/unmounting stops subsequent dispatch. Results/labels are downloadable and saved bookings survive reload; the preview/report should be exported before navigation.
- Shared green form/table/button tokens and native platform-owned selects match single booking. Inline live regions announce validation, counts and stop outcomes; the results table scrolls within its panel on narrow screens. Bulk forms own validation with `noValidate` and focus file errors. See `docs/broadreach-setup.md` for provider limits, billing and recovery sources.


## GTA AirSkip booking (2026-10-03)
- Entry: Courier Partner API → GTA AirSkip; internal administrators/dispatchers only, scoped to configured organization.
- Shared BP panels, inputs and buttons; responsive two/three-column forms, visible labels, server-owned validation with announced errors, pending controls disabled.
- Configured API environment owns QA/live mode; required induction confirmation, terminal/package type and dimensions, optional service. No fake default terminal.
- Domestic CA items may be empty; cross-border/USPS requires customs items. Add/remove item controls retain remaining rows.
- Rate check is read-only, explicit account-currency copy; paid booking has charge confirmation and live-enable gate. QA preserves partner/custody.
- Recent booking rows expose protected labels, pending review and tenant-bound tracking. No webhook/public tracking claim.
- Verification: TypeScript/build, carrier schema/transport tests and migration inspection. Browser runtime unavailable; authenticated visual acceptance remains pending.

### GTA account/API connection check
- Internal tenant/role-authorized read-only tracking request with a fresh synthetic exact filter; no booking reservation, addresses or account-wide shipment listing.
- Independent connection panel uses canonical BP controls, pending disable and announced inline results. Successful credentials do not imply shipping route coverage or booking acceptance.

GTA single and bulk forms display the complete read-only sender terminal list `ONDM,MISS2,MISSF,BRA`; server validation normalizes legacy individual selections to this same list. Both forms separately display the FastDrop sender address used on the carrier label and the physical GTA drop-off location, including Cargo 2, Entrance 6. Drop-off guidance does not populate carrier sender fields.

## GTA booking recovery

The existing carrier booking form uses configured FastDrop sender by default when available, with explicit sender and live-charge confirmations. Original shipment sender details remain unchanged. A failed create remains reserved; recovery verifies the carrier tracking/reference before fetching an existing label and never sends another creation request. Recent bookings offer PDF reprint and stored-label downloads. Tracking callbacks are untrusted hints; only provider API verification populates the internal cached tracking view, and the manual tracking check is retained as fallback.

## Carrier desk and GTA batch booking

The courier integrations hub and legacy carrier routes share `CarrierWorkspace`: a native partner Select, URL-addressable Single shipment / Bulk upload / Bookings & labels navigation, and retained mounted panels. Switching partners with edited form or preview state uses an app-owned native dialog; active requests disable partner and tab changes. Configuration badges mean settings exist, not that the carrier accepted credentials.

GTA bulk imports existing tenant-scoped FastDrop AWBs, using saved weights and addresses plus server-configured FastDrop sender. New shipment address imports remain at `/shipments/import`. CSV/XLSX files are capped at 2 MB, 100 parcels and 1,000 item rows. Domestic CA parcels need no customs fields; cross-border parcels require validated customs items. Repeated AWBs group only customs items with identical dimensions. Preview performs no carrier call or booking reservation.

Booking requires sender confirmation and explicit production consent, verifies read-only account access, then invokes the existing authorized per-parcel reservation/idempotency action sequentially. It never retries an uncertain create. Unconfirmed outcomes, save/link failures and thrown requests halt the batch; continuing processes only untouched waiting parcels. Saved labels persist in booking storage. Local batch reports are transient and export as formula-safe CSV. ZIP downloads use protected stored labels with a 50 MB limit; individual PDF links use the authenticated reprint route.

## Shipper account workspace

`/shippers` owns the paginated shipper-only directory (25 rows), URL search/status/page filters and links to each account. Creation belongs exclusively to `/shippers/new`; profile, sign-in password, status and commercial rates belong to `/shippers/[id]`. Sidebar and native Shipper workspace Select use distinct list/create routes. Edited account forms guard workspace navigation with an app-owned native dialog and block navigation during requests.

Existing create-account authority (`shippers/actions.ts`) limits profile/email/password mutations to super_admin and operations_admin. Finance can maintain rates; customer_service has read-only account access. Every mutation independently verifies organization and shipper role. Profile editing checks saved update timestamps, synchronizes Supabase Auth email with the profile, and compensates business/Auth updates if subsequent persistence fails. No password is read, returned, logged, stored in page state or sent by email. Password reset requires matching 8–72 character entries plus explicit account confirmation; it does not claim session revocation. Closed-account reopening remains limited to super_admin. Existing historical rate rules and organization currency remain authoritative.


## Customer tracking privacy

Shipper shipment lists, detail timelines and exports use canonical customer statuses. 3PL handover/in_transit becomes In transit; out_for_delivery, delivered and every failed/return outcome become Out for delivery, Delivered and Undelivered respectively. Operational custody, attempt limits and return workflows retain their internal states. Customer history is read from `customer_tracking_events`, containing only status and timestamp; raw shipment audit notes and all carrier/partner tables remain inaccessible to shippers through RLS. Partner API metadata and labels remain internal. Booking a label alone does not mean physical handover. Existing shipment branding and FastDrop AWBs remain the customer identifiers. Tracking ingestion still requires verified operational updates; unauthenticated GTA webhook payloads cannot directly change delivery state.

### Driver mobile operations and admin pay terms

Admin configures per-driver per-delivery, fixed or mixed pay on `/users/[id]`, using native selects and existing BP form primitives. Rates/currency are explicit; no salary is preconfigured. Terms use a stale-update guard. Confirmed future deliveries create one commission; fixed pay/bonus/deduction/payout entries are explicitly confirmed, idempotent ledger records, not money transfers. COD deposits remain separate. Server authorization and tenant filters govern all writes.

Ready pickup manifests can be assigned to an active rider. After custody scans begin reassignment locks. The native app completes collection only after all parcel scans; hub handover does not replace warehouse receipt. `/driver-support` is restricted to authorized dispatch/support roles, lists 25 requests per page, and shows the latest 200 stored messages. Replies/status updates return inline success/error states; the rider manually refreshes replies. Reattempt requests use normal dispatch approval. No automatic rescheduling or push delivery is claimed.



### 3PL handover manifests

`/dispatch/3pl/manifests` owns draft creation and paginated history (25 per page). Native partner Select and shared SelectableTable select only shown warehouse candidates (latest 100); scanning/pasting accepts other AWBs up to 500. Draft selections are transient form state and reset when partner changes. Creation returns to the manifest detail; errors preserve input and receive focus. Detail confirms physical handover with receiver name and explicit acknowledgement, or cancels only a draft. Both operations are transactional and idempotent. The private authorized database writer locks eligible shipments, preserves existing partner bookings, prevents duplicate reservations and own-fleet conflicts, and reuses canonical custody/customer-status triggers. Draft creation never changes custody; confirmation projects In transit to customer-safe tracking. Cancellation releases reservations without altering shipment status. Partner identities and AWBs are internal-only through role/tenant RLS; print uses protected snapshot rows and a separate shell-free A4 route. Source: `supabase/migrations/20261007200735_three_pl_handover_manifests.sql` and existing customer tracking privacy migration.

### 3PL manifest exports

- Assigned 3PL shipments can be selected individually or through the shared native Selection dropdown (Select all visible / Clear selection).
- PDF and Excel downloads include the tenant AWB, partner AWB and saved partner load number; a single-load export uses that load number as its reference. Multiple loads remain separate row values.
- Saved handover manifests offer the same file formats. Export is read-only and never creates a booking or changes custody.
- Role and tenant checks protect every export. Missing or archived selected shipments fail the whole download. Export failures remain inline and allow retry.


### Local and international shipment booking

- `/shipments/new` provides Local shipment and International shipment navigation tabs. The international tab stays in the New Shipment workflow and supports one shipment per booking; International Bulk Upload remains a separate multi-row workflow.
- International single bookings require distinct enabled sender and destination countries, Air or Sea mode, positive per-piece dimensions, total actual weight, and a customs value. HS code is optional and validated when supplied. The server recalculates and stores CBM, volumetric and chargeable weight, and Sea W/M; browser-calculated figures are display-only.
- Single and bulk bookings use the database's existing unique AWB trigger. Single booking opens the shipment record after booking; bulk results show each generated AWB and link to its shipment. Booking does not hand over or alter shipment custody.
- The organization base currency is not displayed on the booking form. Shipment currency continues to resolve from the destination country and remains server-controlled.


### Shipment AWB labels

- `/print/shipments/[id]` and bulk printing use the shared `AwbPrintSheet` for 4×6 thermal and A4 output. Each physical piece gets its own label with the current piece index and total.
- The label prioritizes shipper/consignee addresses, service and COD/prepaid status, a centered full-width Code 39 AWB barcode, and a larger QR code for the same tenant AWB without a scan caption. It shows the customer reference, weight, piece count, available dimensions, delivery zone, parcel description, and delivery instructions.
- Destination uses postal code when available, then the saved consignee area, then country code. Missing parcel dimensions are labeled “Not recorded”; the label never invents a route/terminal code.
- Tenant logo/name and organization currency remain dynamic. Label printing is read-only and does not create a carrier booking, charge a customer, or change custody.
- The warehouse scan-to-print station opens one selected piece at a time in a new print window and invokes the browser print dialog automatically for the 4×6 label; the existing shipment detail and bulk print flows keep their current behavior.

### Company users and Super Admin ownership

- `/users` and `/users/[id]` are available to the company Super Admin and Operations Admin. Operations Admin can create and edit standard staff/driver accounts, and suspend or activate eligible staff; it cannot create another Operations Admin, manage peer Operations Admins, alter archive permissions, or edit a Super Admin.
- Super Admin role assignment is SaaS-only. Each organization has exactly one assigned Super Admin; a unique database index prevents duplicates, and the existing role guard protects the active owner.
- Team navigation links to `/users#add-user`, matching the user creation form. Server authorization is checked before profile queries and mutations.

### Public Fast Drop customer tracking

- `/tracking` is a public, no-login page for customer shipment lookups by AWB or exact customer reference number. It uses the deployed `fastdrop-public-tracking` Edge Function, which is scoped to Fast Drop's organization; lookup results therefore appear from the existing Fast Drop shipment records.
- `/api/public-tracking` proxies requests server-side with the app's publishable key. The service-role key remains inside the Edge Function; the page never queries shipment tables directly.
- Show the customer-safe current status, AWB, latest update time, and saved tracking events in newest-first order. Do not reveal 3PL names, provider payloads, internal notes, consignee contact details, or locations not present in the public tracking contract.
- Accept AWBs and customer reference numbers with the same validation as the Edge Function. Keep search input transient (not in the URL), provide loading, empty history, not-found, and retryable service-error states, and format event times in the visitor's local timezone.
- The public page uses BloomPath green branding, a selectable timezone, shipment summary, status-matched icons on the five-stage progress line and event history, and collapsible tracking history. Icons and status text both identify each milestone. Show the full customer-safe status text, AWB, last-update time, and timestamps; keep events newest-first with booking/earliest at the bottom. The page accepts AWB or exact customer reference lookups and queries Fast Drop only. Do not show 3PL/provider names, provider payloads, internal notes, delivery proof requiring a postal code, contact details, or locations not in the public tracking contract.
- Manual warehouse milestones store the selected wall-clock date/time using the detected Canadian scan location timezone when applicable; operators can choose a different scan timezone. Stored timestamps are UTC instants and public display uses the selected viewer timezone. Nonexistent local daylight-saving times are rejected.


### Warehouse scan-to-print log

- Choosing a warehouse workflow immediately submits the selector. In Scan & print, scanner input, paste + Enter, and the inline search button share one tenant-scoped lookup and automatic print flow; repeated shipment summary panels are omitted.
- Each label request sent to the browser print window is appended to a browser-local AWB report with piece number and Dubai timestamp. The report persists in that browser, exports as Excel-compatible CSV, and can be printed/saved as PDF. It records requests sent to the print dialog, not confirmation that paper physically printed.
