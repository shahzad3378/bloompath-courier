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

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Form | Shared `bp-input`/buttons with server domain validation | DESIGN.md and authorized shipment/booking actions | Single booking / bulk file preview | Scoped ESLint, typecheck, parser and action tests |
| Select/Listbox | Native select in operational booking forms | DESIGN.md; platform popup geometry is accepted | Single booking / batch mode | Semantic labels, disabled states and typecheck |
| Scrollbar | `src/app/globals.css` | DESIGN.md runtime mapping | Results table owns horizontal overflow | Responsive source review and static audit |
| Toast | Inline operational feedback/live regions | UX contract operational feedback | Field error / batch status | Live-region markup and action failure tests |
| CRUD | Role/tenant-authorized server actions and existing database reservation RPCs | Authentication and shipment custody model | Booking / reusing saved labels | Tenant/action tests and reservation verification |

## Workflow ledger

### Warehouse custody

- Shipment starts as Booked and is not counted as physically in warehouse.
- Warehouse receive scan moves an eligible shipment to At Warehouse.
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
