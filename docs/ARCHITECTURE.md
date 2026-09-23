# Architecture

## Scope

Aleppo Center Cash is a single-workspace application for one shop with two users: `owner` and `member`. The design deliberately excludes E2EE, recovery keys, device keys, multiple workspaces, and general team administration.

## Runtime flow

```text
React RTL client
  ├─ Supabase Auth / JWT
  ├─ PostgreSQL tables protected by RLS
  ├─ Realtime events for accounts, payments, and sync cursors
  └─ IndexedDB local persistence and offline retry queue
```

PostgreSQL is authoritative when connected. The client may render an optimistic local state, but it must reconcile with server versions after reconnect. Realtime is an invalidation/update channel, not the accounting source of truth.

## Roles

`owner` can manage the workspace, member, accounts, payments, exports, and audit visibility. `member` can read and update accounts and payments but cannot manage the workspace or other members. Both users have individual Auth accounts.

## Data model

The migration creates `workspaces`, `profiles`, `workspace_members`, `accounts`, `payments`, `audit_log`, and `sync_events`. Every domain row carries `workspace_id`. Money is validated as a positive integer amount with `SYP` or `USD`; payment type is `credit` or `debit`.

## RLS

Every exposed table has RLS enabled. Membership is checked by `is_workspace_member`; Owner-only operations use `is_workspace_owner`. The browser receives only the publishable key. Secret keys and database credentials remain server-side and outside the repository.

## Sync and conflicts

Accounts and payments have a monotonic `version`. An update should include the expected version; a stale update is treated as a conflict instead of silently overwriting the other user. Payments should be corrected or voided with an auditable action rather than changing financial meaning without history.

The client stores pending local changes and retries after reconnect. It should fetch canonical rows after a Realtime event. A missing, duplicated, or delayed Realtime message must not corrupt the ledger.

## Audit

Important writes, exports, imports, login/session events, sync failures, and conflicts are recorded in `audit_log`. Users cannot delete audit rows through normal RLS policies.

## Security boundary

The system uses TLS, Supabase Auth, RLS, session persistence, local validation, and restricted dashboard access. It does **not** use E2EE. Supabase administrators and permitted backend operations can read hosted records. This is an explicit product decision for the two-user simplified beta.
