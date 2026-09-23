# Setup

## Requirements

- Node.js 22 or compatible LTS
- pnpm 10
- A Supabase project on the Free plan
- A private repository checkout

## Environment

```bash
cp .env.example .env.local
```

Fill in:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Only the publishable key belongs in the browser. Never put the database password, JWT secret, `service_role`, or `sb_secret_` key in `.env.local` committed to Git.

## Database

Open **Supabase Dashboard → SQL Editor**, paste the contents of [`supabase/migrations/001_initial_schema.sql`](../supabase/migrations/001_initial_schema.sql), and run it once. The migration is designed to be rerunnable for functions, policies, indexes, and the enum guard.

## Owner

1. Open the app and choose **حساب جديد**.
2. Register with the Owner email and a strong password.
3. If email confirmation is enabled, confirm the email first.
4. Create the workspace.
5. Copy the Workspace ID from the sidebar.

## Member

1. Open the app on the partner device.
2. Create a separate Auth account.
3. Paste the Workspace ID.
4. Choose **انضم لمساحة موجودة**.

Do not share one email/password between the two people. The audit log needs separate identities.

## Local checks

```bash
pnpm check
pnpm build
```

## Troubleshooting

- **Workspace not found:** verify the full Workspace ID and ensure the SQL migration ran.
- **Workspace full:** the simplified beta permits only Owner + one Member.
- **Email not arriving:** check Supabase Auth email settings; the built-in sender has rate limits.
- **RLS error:** verify that the current user has an active row in `workspace_members`; never bypass RLS with a secret key in the browser.
