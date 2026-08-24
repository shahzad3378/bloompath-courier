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
| Operational feedback | Inline page banners and stable loading panels | Success, partial success, and recovery guidance remain visible in text. |
| Currency | Organization base currency with shipment override | No screen hardcodes AED for a non-AED tenant. |

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

## Loading, empty, and recovery states

- Map loading reserves the final map height.
- A route with zero mapped stops shows assigned-stop count and a recovery action.
- A partially mapped route shows both mapped and awaiting-coordinate counts.
- External Google Maps links open in a new tab and retain the in-app route state.

## Accessibility and responsive behavior

- Actions use semantic buttons and links with visible focus.
- Route markers are backed by a text sequence list.
- Color never carries the only status meaning.
- Desktop route map and sequence collapse into a vertical layout on narrow screens.
