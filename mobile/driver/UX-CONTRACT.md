# Driver UX contract — 1.2.0

Visual owner: DESIGN.md → src/theme.ts → src/ui.tsx. Data and authorization: src/courier.ts, src/driver-features.ts, DriverProvider, private database helpers and RLS.

## Canonical UI Map

| Capability | Owner | Source of truth | Variants | Verification |
|---|---|---|---|---|
| Form | Native TextInput, ActionButton, Banner | Typed API + server validation | Auth, scan, proof, bank, support | Typecheck, lint, Android export |
| Feedback | Shared Banner + server-confirmed state | Query/provider state | Busy, empty, error/retry, success | Source review; device acceptance |
| CRUD | driver-features/courier modules | RLS and tenant/assignment guards | Own driver reads and permitted writes | Rollback SQL permission tests |
| Navigation | Shared BottomNav + native detail stack | Expo routes | Tasks, Route, Scan, Cash, Profile; History/Support shortcuts | Android export |
| Scrollbar | Native ScrollView/FlatList | Platform | Lists, detail forms, conversation | Device acceptance |

## Tasks and custody

Pickup and delivery sections use real assignments. Unassigned/empty states explain dispatch assignment. Delivery scan opens only an assigned pending stop. Pickup and hub scans use authenticated idempotent RPCs; completion requires all pickup scans. Warehouse receipt remains a warehouse action. No customer/carrier identity is added to public tracking.

## Money

Admin owns pay terms. Currency-grouped all-time summaries are distinct from paginated records. COD deposits belong to the company cash ledger; personal salary/commission belongs to the earnings ledger. Finance confirmation is required for manual entries in the admin UI. No invented rate, automatic fixed accrual or funds transfer is presented. New delivery commission is prospective and duplicate-safe.

## Map, history and support

Only saved valid coordinates become map markers. Straight-line nearest-stop suggestions are advisory; dispatch order is preserved. Google Maps opens directions externally. History and money lists page records. Support has stored issue threads and manual refresh; latest 200 messages are shown. Reattempt is a request, not an approved schedule. Driver documents are private JPG uploads and bank numbers start masked.

## Authentication, recovery and boundaries

Shared query/provider sequence guards discard stale identity/assignment responses. Unauthorized driver profiles use access-error handling. Passwords start masked. Failed writes retain input and enable retry; busy controls prevent duplicate submissions. No offline/optimistic saved result is claimed. Photo POD is required; OTP and signatures are pending. Native platform owns keyboard, select semantics and scrolling. Physical Android acceptance is required for camera permissions, scans, proof/document uploads, WebView map and authenticated end-to-end saves.
