# Aleppo Center Cash — Cloud and DeepSeek Handoff

**Status:** Beta foundation complete; Supabase Auth and two-user workspace onboarding are live. The repository is private and is the source of truth for continuation.

**Repository:** [mhamedshasho/aleppo-center-cash](https://github.com/mhamedshasho/aleppo-center-cash)

**Live application:** `https://aleppocash-l3cn7pdx.manus.space/`

**Current release checkpoint:** `c7b4242c` — Supabase build-time configuration, Auth endpoint test, and live Signup/Login gate.

## 1. Mission for the next agent

Cloud and DeepSeek should continue the project from GitHub without rebuilding the architecture. The immediate goal is to complete the real two-device Owner/Member test, then harden cloud synchronization and release operations. The product is intentionally limited to one shop, one Workspace, and two users: one `owner` and one `member`.

The system is **not E2EE**. It uses TLS, Supabase Auth, PostgreSQL Row Level Security, and Supabase-managed storage protections. Do not describe this release as end-to-end encrypted, zero-knowledge, or recovery-key based.

## 2. What is complete

The frontend is a React 19 and TypeScript application with Arabic RTL presentation. It contains the dashboard, accounts, payments, local validation, local backup/export, PDF and PNG export, PWA assets, and a local IndexedDB fallback.

Supabase Auth is configured for email and password. `CloudAuthGate` renders Login and Signup. After authentication, the user either creates a Workspace as Owner or joins a Workspace as Member using the Workspace ID. The Owner can copy the Workspace ID from the dashboard sidebar.

The Supabase schema contains `workspaces`, `profiles`, `workspace_members`, `accounts`, `payments`, `audit_log`, and `sync_events`. RLS policies restrict rows by active Workspace membership. The SQL also contains `create_workspace` and `join_workspace` RPC functions, version bump triggers, indexes, and Realtime publication entries.

The client contains a first Sync layer in `client/src/lib/supabaseSync.ts`. It performs an initial pull, pushes local account and payment changes, subscribes to Realtime changes, queues failed writes in IndexedDB, retries queued snapshots when the browser returns online, and detects stale version updates as conflicts. This layer has passed TypeScript and production-build checks, but the two-device authenticated test is still required.

The repository also contains a Supabase Auth endpoint Vitest test at `client/src/lib/supabase-config.test.ts`. It verifies the configured public key against `/auth/v1/settings` without exposing the key in test output.

## 3. Important files

| Area | Location | Purpose |
|---|---|---|
| App routing | `client/src/App.tsx` | Routes `/` through `CloudAuthGate`. |
| Auth UI | `client/src/components/CloudAuthGate.tsx` | Login, Signup, Owner Workspace creation, Member join. |
| Dashboard | `client/src/pages/Home.tsx` | Existing dashboard plus cloud session and sync integration. |
| Supabase client | `client/src/lib/supabase.ts` | Browser client, Auth session helpers, sign-in, sign-up, and sign-out. |
| Sync | `client/src/lib/supabaseSync.ts` | Pull, push, Realtime subscription, versions, and conflict error. |
| Local storage | `client/src/lib/localStore.ts` | IndexedDB accounts, snapshots, audit entries, and offline queue. |
| Validation | `client/src/lib/validation.ts` | Account and payment validation. |
| Database migration | `supabase/migrations/001_initial_schema.sql` | Rerunnable schema, RPCs, RLS, indexes, and Realtime setup. |
| Schema copy | `supabase/schema.sql` | Human-readable SQL handoff copy. |
| Setup | `docs/SETUP.md` | Local setup and Owner/Member onboarding. |
| Architecture | `docs/ARCHITECTURE.md` | Runtime and security boundaries. |
| Deployment | `docs/DEPLOY.md` | Build and deployment checklist. |

## 4. Required secure environment variables

The cloud environment must provide these names through its secure environment-variable manager or GitHub Actions secrets:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

The values are intentionally not stored in GitHub files or Git history. The Supabase URL and publishable key are browser configuration, but keeping them in the environment makes rotation and cloud builds clearer. Never add `Database password`, `JWT secret`, `service_role`, `sb_secret_`, or SMTP credentials to the browser build.

## 5. Reproduce the project

Clone the private repository, install dependencies, run the checks, and start the development server:

```bash
git clone https://github.com/mhamedshasho/aleppo-center-cash.git
cd aleppo-center-cash
pnpm install --frozen-lockfile
pnpm check
pnpm vitest run client/src/lib/supabase-config.test.ts
pnpm build
pnpm dev
```

The Supabase migration must already exist in the target project. If a fresh project is used, run `supabase/migrations/001_initial_schema.sql` from the Supabase SQL Editor before creating the first Workspace.

## 6. Required device test

The Owner should register with a real email and password, confirm the email if Supabase requires confirmation, and create the Workspace. The Owner must copy the Workspace ID from the sidebar.

The Member should use a different email and password on another browser or device. The Member should register, paste the Workspace ID, and join. The test must verify that the Member sees the same account rows and that the Workspace refuses a third active member.

Then create, edit, and delete a payment from each device. Confirm that the other device receives the Realtime change. Disconnect one device, create a valid local payment, reconnect it, and verify the offline queue retries. Finally, change the same record from both devices and confirm that a stale version produces the Arabic conflict state instead of silently overwriting the newer update.

Do not use real financial records during the first test. Use synthetic account names and small test amounts.

## 7. Known limitations and risks

The current sync implementation maps the existing numeric local UI IDs to generated UUIDs on first cloud push. It preserves the local UI model while using UUIDs in PostgreSQL. A later refactor may make UUIDs first-class in the UI, but that is not required for the two-user beta.

The simplified schema allows only two active Workspace members. The Member can update rows according to RLS, while destructive deletes are Owner-controlled in the current policy. If product behavior should allow Member deletion, review the RLS policy and audit implications before changing it.

Conflict detection exists, but the current user experience surfaces the conflict state and requires a refresh or later resolution flow. A future improvement should present the server version and local version side by side and let the user choose a safe merge.

The production JavaScript bundle has a size warning above 500KB. This is not a correctness blocker. Code splitting for PDF/export features is a good Round 5 task.

The current system does not create a GitHub Actions deployment workflow. GitHub is the source backup and version-control location. Any future workflow must read the two Vite variables from GitHub Actions secrets and must never print them.

## 8. Next work order

First, run the authenticated two-device Owner/Member test described above. Record the result and any RLS or Realtime errors. Second, fix only confirmed failures, keeping changes in small commits. Third, add automated tests for payment validation, account import rollback, UUID mapping, offline queue retry, and stale-version conflict handling. Fourth, add a reviewed GitHub Actions workflow for check, test, build, and optional deployment. Fifth, improve conflict UI and code-split the PDF/export bundle.

## 9. Acceptance criteria

The next release is ready for beta only when a separate Owner and Member can authenticate, share exactly one Workspace, read the same data, create and edit valid payments, receive Realtime updates, survive a temporary offline period through the IndexedDB queue, and receive a visible conflict state for stale writes. The release must pass `pnpm check`, the Supabase Auth Vitest test, `pnpm build`, and a secret scan that finds no credential values in tracked files.

## References

[1]: https://github.com/mhamedshasho/aleppo-center-cash "Aleppo Center Cash private repository"
[2]: https://supabase.com/docs/guides/auth "Supabase Auth documentation"
[3]: https://supabase.com/docs/guides/database/postgres/row-level-security "Supabase Row Level Security documentation"
[4]: https://supabase.com/docs/guides/realtime "Supabase Realtime documentation"
