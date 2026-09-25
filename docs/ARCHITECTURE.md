# Architecture

## Product boundary

Aleppo Center Cash is a cloud accounting workspace for a small shop. Its core workflow is:

1. Sign in.
2. Enter the shared workspace.
3. Create customer accounts.
4. Record **له / عليه** movements.
5. Review balances independently in SYP and USD.
6. Inspect the activity history.
7. Export reports or create a restoration backup.

The browser is a user interface and synchronization client. PostgreSQL is the accounting source of truth while connected.

## Runtime

```text
React + TypeScript
       │
       ├── Supabase Auth
       ├── PostgreSQL + RLS
       ├── Realtime
       └── Edge Functions
              │
              └── private restoration storage
```

The application currently disables stale service workers and browser caches rather than presenting an offline accounting mode. Accounting writes require an active internet connection.

## Workspace permissions

Active workspace members receive the application's normal workspace permissions. The project does not use a separate owner-only UI restriction for ordinary accounting operations.

Each person uses an individual authentication account.

## Data model

Core tables:

- `workspaces`
- `profiles`
- `workspace_members`
- `accounts`
- `payments`
- `audit_log`

Every accounting record is associated with a workspace. Money is represented with an explicit currency: `SYP` or `USD`.

Payment semantics:

- `credit` = **له**
- `debit` = **عليه**

The UI calculates balance as debit minus credit, preserving the distinction between the two directions.

## Synchronization

Supabase is authoritative.

The client:

- reads canonical cloud data
- writes through the synchronization layer
- subscribes to Realtime changes
- recovers from transient sync failures
- periodically retries the cloud backup

A failed backup must not be reported as a failed accounting write.

## Audit

Important account and payment changes are represented in `audit_log`. The activity view exposes recent changes and actor information.

Restoration is a controlled backend operation and does not expose the service-role key to the browser.

## Backup

### Cloud snapshot

The Edge Function creates a complete workspace snapshot containing the workspace, active members, relevant profiles, accounts, payments, and audit records. The latest snapshot replaces the previous workspace snapshot.

### Portable restoration file

The browser requests a server snapshot, encrypts it with:

- AES-GCM
- PBKDF2-SHA-256
- 250,000 iterations
- random salt
- random IV

The resulting JSON envelope is portable and does not contain Supabase credentials or the user's login password.

### Dropbox

Dropbox is an off-site backup target, not the primary database. The application must not put a Dropbox access token in client-side code. Dropbox credentials belong in server-side secrets.

## Security boundary

This system is not E2EE. Supabase administrators and authorized backend operations can access hosted records.

The intended model is secure authenticated cloud storage plus encrypted portable recovery files, not zero-knowledge accounting.

## Deployment

Vercel builds the application from the GitHub repository. Supabase hosts the database and Edge Functions.

Every production change should pass:

```bash
pnpm check
pnpm build
```
