# BloomPath Courier

Multi-tenant courier operations platform covering secure role-based access, shipper booking, AWB printing, warehouse scans, dispatch, driver delivery, NDR/reattempts, returns, COD and shipment-level invoicing.

## Phase 1

- Next.js App Router portal foundation
- Supabase SSR authentication
- Verified JWT claims in the Next.js proxy
- Database-backed roles and account status
- Organization-scoped RLS policies
- Internal, shipper and driver portal shells

## Local setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Set the courier project's URL and **publishable** key in `.env.local`. Never expose or prefix a Supabase secret key with `NEXT_PUBLIC_`.

Apply `supabase/migrations/202608130001_phase_1_identity_and_access.sql` to a new courier Supabase project, create the first Auth user, then follow the two bootstrap statements at the bottom of the migration.

## Verification

```bash
npm run lint
npm run typecheck
npm run build
```
