# Driver UX contract

Visual decisions: DESIGN.md. Business and authorization sources: README.md and src/courier.ts (loadDriverProfile, loadAssignedStops, saveDeliveryResult); backend authorization remains authoritative.

## Canonical UI Map
| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Form | Native TextInput and shared ActionButton in src/ui.tsx | Existing login/stop validation | Sign in, AWB entry, result | Typecheck, lint, Android export |
| Toast | Shared Banner in src/ui.tsx | Driver context notice/errors | Error, success | Static review and browser preview |
| CRUD | src/courier.ts and DriverProvider | Existing role/assignment gates | Read pending stops, save result | Source preservation; device acceptance required |
| Scrollbar | Platform ScrollView/FlatList | Native React Native behavior | Route list, detail form | Phone-width preview |

## Navigation and states
Home and Routes use one assigned-stop list implementation. Home greets the driver; Routes emphasizes the route workspace. Search is local, has Clear, and keeps route sequence. No-results offers a correction; unassigned routes explain dispatch handover. Refresh retains existing assignments on network errors with explicit retry. Profile shows the authenticated identity and actual assignment counts. Bottom navigation is shared, with textual labels and accessibility states.

## Delivery flow
Scan opens only a pending assigned stop. Detail offers customer call/map, tenant-aware collection amount, delivery result, required reason for undelivered, required JPG proof photo up to 5MB and optional notes. Save disables duplicate submission; only confirmed server success clears the pending stop and returns Home with a notice. Existing driver and organization access gates remain unchanged. No carrier identity is introduced into driver or customer tracking by this UI.

## Authentication and recovery
Passwords are masked initially with Show/Hide. Invalid or unavailable login preserves email and explains retry. Unauthorized driver accounts use the established access-error view. Sign out ends the current session. No credentials are put into URLs or logs.

## Platform and acceptance
English interface with international names/addresses. Native keyboard/scroll/accessibility semantics; touch controls at least 44px. Network is required: no optimistic saved status or offline queue. Physical Android acceptance must cover barcode camera, proof camera, permissions denied, authenticated routes and actual delivery save; web export cannot prove device permissions.
