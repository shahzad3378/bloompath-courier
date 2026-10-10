<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

The environment runs two apps. `bloompath-courier` is the operations portal at `http://127.0.0.1:3000`. `bloompth` is the public storefront at `http://127.0.0.1:3001`. Startup launches both with `npm run dev`.

Local Supabase uses the CLI native runtime, so Docker is not required. Startup copies this repo's migrations to `~/.bloompath/courier-supabase` and, if it is missing, inserts `drop policy if exists "authorized users can update shipments"` into `20260813203109_consolidate_shipment_update_policy.sql` before applying them. A fresh database otherwise fails because that migration recreates a policy the previous migration already created. It then writes gitignored `.env.local` files for both apps from `supabase stack status`.

Local sign-in details are created on boot and stored in `~/.bloompath/local-admin.env`. Google Maps, BroadReach, and GTA AirSkip keys are optional. They are not required to sign in or book a domestic shipment.

`bloompth` does not include a SQL schema. Product and settings queries against this local database come back empty, and the marketing pages still render.

`npm run lint` in this repo currently reports existing project errors. `npm run typecheck` needs the Next.js route types created by `npm run dev` or `npm run build`, because `next-env.d.ts` is gitignored. `npm run build` is the production check for both apps.
