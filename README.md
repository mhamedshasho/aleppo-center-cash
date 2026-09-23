# Aleppo Center Cash

Aleppo Center Cash is a privacy-first Arabic RTL cash-accounting workspace for one shop. The current beta supports two people: an **Owner** and one **Member** sharing the same workspace.

## Product scope

The app provides account and payment records, SYP and USD validation, local exports, audit-friendly changes, and a Supabase-backed authentication and workspace onboarding path. It is intentionally simple: one workspace, two roles, no E2EE, no recovery-key system, and no multi-team administration.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS 4 and shadcn/ui primitives
- Wouter routing
- Supabase Auth, PostgreSQL, Row Level Security, and Realtime
- IndexedDB local-first persistence and backup helpers
- jsPDF/html2canvas for local exports
- PWA manifest and service worker

## Local development

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. Never add `.env.local`, a database password, a `service_role` key, or an `sb_secret_` key to Git.

## Supabase setup

Run [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql) in the Supabase SQL Editor. It creates the simplified two-user workspace schema, RLS policies, version checks, the Owner bootstrap RPC, and the Member join RPC.

After signing up, the Owner creates the workspace. The Member signs up separately and joins using the Workspace ID shown in the app. Each person must use an individual email/password account; do not share one login.

## Validation

```bash
pnpm check
pnpm build
```

## Security boundary

This beta uses TLS, Supabase storage encryption, Auth, RLS, and least-privilege application roles. It is **not end-to-end encrypted**: the hosted backend can read records under its administrative authority. Do not describe this version as E2EE or zero-knowledge.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Setup](docs/SETUP.md)
- [Deployment](docs/DEPLOY.md)
- [Simplified multi-user decision](docs/multi-user-simplified-architecture.md)

## License and data

The repository is private. Production data must not be committed. Use the Supabase project and local backup workflow described in the setup documentation.
