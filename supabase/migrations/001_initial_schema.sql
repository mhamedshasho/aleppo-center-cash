-- Aleppo Center Cash: simplified two-user shared workspace
-- Run once in Supabase Dashboard -> SQL Editor.
-- This script does not contain or require the database password.

create extension if not exists pgcrypto;

do $$
begin
  create type public.workspace_role as enum ('owner', 'member');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  timezone text not null default 'Asia/Damascus',
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null,
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (workspace_id, user_id)
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  owner_name text not null default '',
  accent text not null default 'mint',
  version bigint not null default 1 check (version > 0),
  is_archived boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency in ('SYP', 'USD')),
  payment_type text not null check (payment_type in ('credit', 'debit')),
  occurred_on date not null,
  version bigint not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  action text not null check (action in ('create', 'update', 'delete', 'import', 'export', 'login', 'sync', 'conflict')),
  entity text not null check (entity in ('workspace', 'account', 'payment', 'member', 'backup', 'session')),
  entity_id text,
  summary text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.sync_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity text not null,
  entity_id uuid not null,
  action text not null,
  version bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists workspace_members_user_idx on public.workspace_members (user_id, active);
create index if not exists accounts_workspace_idx on public.accounts (workspace_id, updated_at desc);
create index if not exists payments_account_idx on public.payments (account_id, occurred_on desc);
create index if not exists audit_workspace_idx on public.audit_log (workspace_id, created_at desc);
create index if not exists sync_workspace_idx on public.sync_events (workspace_id, id desc);

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace
      and wm.user_id = auth.uid()
      and wm.active = true
  );
$$;

create or replace function public.is_workspace_owner(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace
      and wm.user_id = auth.uid()
      and wm.active = true
      and wm.role = 'owner'
  );
$$;

create or replace function public.create_workspace(workspace_name text, display_name text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_workspace_id uuid;
  existing_workspace_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if char_length(trim(workspace_name)) not between 1 and 120 then
    raise exception 'invalid_workspace_name';
  end if;

  -- A user may own/use only one active workspace. This check lives in the
  -- database function so two browser tabs cannot create duplicates by racing.
  select wm.workspace_id
    into existing_workspace_id
    from public.workspace_members wm
   where wm.user_id = auth.uid()
     and wm.active = true
   order by wm.joined_at asc
   limit 1;

  if existing_workspace_id is not null then
    return existing_workspace_id;
  end if;

  insert into public.workspaces (name)
    values (trim(workspace_name))
    returning id into new_workspace_id;

  insert into public.profiles (user_id, display_name)
    values (auth.uid(), trim(display_name))
    on conflict (user_id) do update set display_name = excluded.display_name;

  insert into public.workspace_members (workspace_id, user_id, role)
    values (new_workspace_id, auth.uid(), 'owner');

  return new_workspace_id;
end;
$$;

revoke all on function public.create_workspace(text, text) from public;
grant execute on function public.create_workspace(text, text) to authenticated;

create or replace function public.join_workspace(target_workspace uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace_name text;
  member_count integer;
  existing_workspace_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select wm.workspace_id
    into existing_workspace_id
    from public.workspace_members wm
   where wm.user_id = auth.uid()
     and wm.active = true
   order by wm.joined_at asc
   limit 1;

  if existing_workspace_id is not null and existing_workspace_id <> target_workspace then
    raise exception 'already_has_workspace';
  end if;

  select w.name into workspace_name
    from public.workspaces w
   where w.id = target_workspace;

  if workspace_name is null then
    raise exception 'workspace_not_found';
  end if;

  select count(*)::integer
    into member_count
    from public.workspace_members
   where workspace_id = target_workspace
     and active = true;

  if member_count >= 2 and existing_workspace_id is null then
    raise exception 'workspace_full';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
    values (target_workspace, auth.uid(), 'member')
    on conflict (workspace_id, user_id) do update
      set active = true, removed_at = null;

  return jsonb_build_object('id', target_workspace, 'name', workspace_name, 'role', 'member');
end;
$$;

revoke all on function public.join_workspace(uuid) from public;
grant execute on function public.join_workspace(uuid) to authenticated;

-- Permanently delete the currently authenticated user and everything they own.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $delete_account$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  delete from public.workspaces w
  where exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = w.id
      and wm.user_id = current_user_id
      and wm.role = 'owner'
      and wm.active = true
  );

  delete from public.workspace_members
  where user_id = current_user_id;

  delete from public.profiles
  where user_id = current_user_id;

  delete from auth.users
  where id = current_user_id;
end;
$delete_account$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;


create or replace function public.delete_workspace_payment(target_workspace uuid, target_payment uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $
declare
  deleted boolean := false;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_workspace_owner(target_workspace) then
    raise exception 'not_workspace_owner';
  end if;
  delete from public.payments
   where id = target_payment
     and workspace_id = target_workspace;
  deleted := found;
  return deleted;
end;
$;

revoke all on function public.delete_workspace_payment(uuid, uuid) from public;
grant execute on function public.delete_workspace_payment(uuid, uuid) to authenticated;

create or replace function public.delete_workspace_account(target_workspace uuid, target_account uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $
declare
  deleted boolean := false;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_workspace_owner(target_workspace) then
    raise exception 'not_workspace_owner';
  end if;
  delete from public.accounts
   where id = target_account
     and workspace_id = target_workspace;
  deleted := found;
  return deleted;
end;
$;

revoke all on function public.delete_workspace_account(uuid, uuid) from public;
grant execute on function public.delete_workspace_account(uuid, uuid) to authenticated;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists accounts_touch_updated_at on public.accounts;
create trigger accounts_touch_updated_at before update on public.accounts for each row execute function public.touch_updated_at();
drop trigger if exists payments_touch_updated_at on public.payments;
create trigger payments_touch_updated_at before update on public.payments for each row execute function public.touch_updated_at();

create or replace function public.bump_version()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    new.version = old.version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists accounts_bump_version on public.accounts;
create trigger accounts_bump_version before update on public.accounts for each row execute function public.bump_version();
drop trigger if exists payments_bump_version on public.payments;
create trigger payments_bump_version before update on public.payments for each row execute function public.bump_version();

alter table public.workspaces enable row level security;
alter table public.profiles enable row level security;
alter table public.workspace_members enable row level security;
alter table public.accounts enable row level security;
alter table public.payments enable row level security;
alter table public.audit_log enable row level security;
alter table public.sync_events enable row level security;

drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles for select using (user_id = auth.uid());
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists workspace_member_select on public.workspaces;
create policy workspace_member_select on public.workspaces for select using (public.is_workspace_member(id));
drop policy if exists workspace_owner_update on public.workspaces;
create policy workspace_owner_update on public.workspaces for update using (public.is_workspace_owner(id)) with check (public.is_workspace_owner(id));

drop policy if exists membership_self_or_owner_select on public.workspace_members;
create policy membership_self_or_owner_select on public.workspace_members for select using (user_id = auth.uid() or public.is_workspace_owner(workspace_id));
drop policy if exists membership_owner_manage on public.workspace_members;
create policy membership_owner_manage on public.workspace_members for all using (public.is_workspace_owner(workspace_id)) with check (public.is_workspace_owner(workspace_id));

drop policy if exists accounts_member_select on public.accounts;
create policy accounts_member_select on public.accounts for select using (public.is_workspace_member(workspace_id));
drop policy if exists accounts_member_insert on public.accounts;
create policy accounts_member_insert on public.accounts for insert with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());
drop policy if exists accounts_member_update on public.accounts;
create policy accounts_member_update on public.accounts for update using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
drop policy if exists accounts_owner_delete on public.accounts;
create policy accounts_owner_delete on public.accounts for delete using (public.is_workspace_owner(workspace_id));

drop policy if exists payments_member_select on public.payments;
create policy payments_member_select on public.payments for select using (public.is_workspace_member(workspace_id));
drop policy if exists payments_member_insert on public.payments;
create policy payments_member_insert on public.payments for insert with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());
drop policy if exists payments_member_update on public.payments;
create policy payments_member_update on public.payments for update using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
drop policy if exists payments_owner_delete on public.payments;
create policy payments_owner_delete on public.payments for delete using (public.is_workspace_owner(workspace_id));

drop policy if exists audit_member_select on public.audit_log;
create policy audit_member_select on public.audit_log for select using (public.is_workspace_member(workspace_id));
drop policy if exists audit_member_insert on public.audit_log;
create policy audit_member_insert on public.audit_log for insert with check (public.is_workspace_member(workspace_id) and user_id = auth.uid());

drop policy if exists sync_member_select on public.sync_events;
create policy sync_member_select on public.sync_events for select using (public.is_workspace_member(workspace_id));
drop policy if exists sync_member_insert on public.sync_events;
create policy sync_member_insert on public.sync_events for insert with check (public.is_workspace_member(workspace_id));

-- Add only safe, lightweight tables to Realtime. The client fetches full rows through RLS.
do $$
begin
  begin
    alter publication supabase_realtime add table public.accounts;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.payments;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.sync_events;
  exception when duplicate_object then null;
  end;
end $$;
