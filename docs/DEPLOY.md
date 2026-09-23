# Deploy

## Build

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm build
```

The build creates the Vite client and the production server bundle. The environment must provide `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` at build time.

## Hosting

The current Manus WebDev project remains the canonical preview. For another static host, configure the build command and output according to that provider's React/Vite integration. Add the two Vite variables as public build-time configuration. Do not add a database password or Supabase secret key to hosting environment variables exposed to the client.

## Supabase production checklist

- Confirm the project region and Free-tier limits.
- Keep Dashboard access restricted to trusted technical custodians.
- Confirm email/password Auth and email confirmation policy.
- Run the migration and test Owner/Member RLS with two separate accounts.
- Verify Realtime events for accounts and payments.
- Export and test restoration of critical data before relying on the system operationally.
- Review storage, bandwidth, database size, and project activity periodically.

## Release checklist

- `pnpm check` passes.
- `pnpm build` passes.
- `git grep` finds no secret keys, database passwords, or `.env.local`.
- Owner and Member can sign in separately.
- A non-member cannot read the workspace through RLS.
- A stale payment update is surfaced as a conflict.
- The app's Arabic RTL shell is readable on mobile.
- The deployed version still states that it is not E2EE.

## Rollback

Use the private Git history for source rollback. For database changes, add a new migration or a reviewed rollback migration; do not edit production tables manually without recording the change. Keep exports outside Git and protect them separately.
