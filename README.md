# Aleppo Center Cash

**Arabic RTL cloud accounting for a small shop — built around accounts, payments, audit history, and reliable recovery.**

Aleppo Center Cash is a focused accounting workspace for recording what is **owed to a customer (له)** and what a **customer owes the shop (عليه)**, with separate SYP and USD balances.

Production: **https://aleppo-center-cash.vercel.app/**

## What it does

- Arabic RTL accounting workflow
- Customer accounts with phone/owner information
- Payments classified as **له / عليه**
- Separate **SYP / USD** accounting
- Dashboard with account and balance summaries
- Account-level transaction history
- Search and account navigation
- Audit/activity history for important changes
- Supabase Auth and PostgreSQL as the cloud source of truth
- Row Level Security and workspace membership
- Realtime synchronization
- Automatic cloud restoration snapshots
- Encrypted portable JSON restoration files using AES-GCM
- PDF and PNG account reports
- Responsive desktop and mobile UI
- Vercel production deployment

## Product model

The accounting meaning is intentionally explicit:

| Entry | Meaning |
|---|---|
| **له** | The shop owes the customer |
| **عليه** | The customer owes the shop |

Balances are calculated independently for each currency. SYP and USD are never silently mixed.

## Architecture

```text
Browser
  │
  ├── React 19 + TypeScript + Vite
  ├── Arabic RTL UI
  └── Supabase client
          │
          ├── Auth / JWT
          ├── PostgreSQL
          ├── Row Level Security
          ├── Realtime
          └── Edge Functions
                  │
                  └── Private restoration storage
```

PostgreSQL is authoritative while connected. The application does not treat browser storage as the accounting database.

### Backup layers

1. **Cloud restoration snapshot** — maintained in private Supabase Storage.
2. **Portable restoration file** — exported as an AES-GCM encrypted JSON file.
3. **Off-site backup** — Dropbox integration is planned as an additional encrypted copy; it is not represented as active until its server-side credentials are configured.

The restoration file never contains a login password or Supabase secret.

## Technology

- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- shadcn/ui / Radix UI primitives
- Supabase Auth
- PostgreSQL + RLS
- Supabase Realtime
- Supabase Edge Functions
- Vercel
- jsPDF
- html2canvas
- Lucide React
- pnpm

## Repository layout

```text
client/                 React application
client/src/lib/         Supabase, sync, validation, backup helpers
client/src/pages/       Dashboard, accounts, activity views
supabase/migrations/    Database migrations
supabase/functions/     Server-side Edge Functions
docs/                   Architecture and deployment documentation
.github/                CI and repository automation
```

## Local development

Requirements:

- Node.js
- pnpm 10.x
- A Supabase project

```bash
pnpm install
cp .env.example .env.local
pnpm check
pnpm build
pnpm dev
```

Configure:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

Never commit:

- `.env.local`
- database passwords
- `service_role` keys
- `sb_secret_` keys
- access tokens
- production accounting exports

## Database

Migrations live in `supabase/migrations/`.

Apply migrations through the Supabase workflow used by the project. Do not manually delete production tables to resolve application problems.

Important domain tables include:

- `workspaces`
- `workspace_members`
- `profiles`
- `accounts`
- `payments`
- `audit_log`

## Security model

This project is **not end-to-end encrypted**.

The security boundary is:

- browser receives only the Supabase publishable key
- database access is protected by RLS
- authenticated workspace membership is required
- sensitive server operations run through Edge Functions
- restoration files can be encrypted locally with AES-GCM
- production security headers are configured at Vercel

Do not describe the hosted application as zero-knowledge or E2EE.

## Quality checks

Run before shipping:

```bash
pnpm check
pnpm build
```

The repository also includes GitHub Actions for repeatable type-check and build validation.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Setup](docs/SETUP.md)
- [Deployment](docs/DEPLOY.md)
- [Multi-user architecture](docs/multi-user-simplified-architecture.md)

## Project status

This is an actively developed production application. The repository is the source for the deployed application; production accounting data is stored outside GitHub.

## License

MIT
