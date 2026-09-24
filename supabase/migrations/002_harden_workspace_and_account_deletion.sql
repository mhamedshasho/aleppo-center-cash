-- Aleppo Center Cash: hardening for an already-initialized Supabase project.
-- Run this migration in Supabase SQL Editor after 001_initial_schema.sql.
-- It is safe to run more than once.

create or replace function public.create_workspace(workspace_name text, display_name text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $create_workspace$
declare
  new_workspace_id uuid;
  existing_workspace_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  -- Serialize workspace creation per authenticated user so two tabs cannot
  -- both observe "no workspace" and create duplicates.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));

  if char_length(trim(workspace_name)) not between 1 and 120 then
    raise exception 'invalid_workspace_name';
  end if;

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
$create_workspace$;

revoke all on function public.create_workspace(text, text) from public;
grant execute on function public.create_workspace(text, text) to authenticated;

create or replace function public.join_workspace(target_workspace uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $join_workspace$
declare
  workspace_name text;
  member_count integer;
  existing_workspace_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));

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

  select w.name
    into workspace_name
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

  return jsonb_build_object(
    'id', target_workspace,
    'name', workspace_name,
    'role', 'member'
  );
end;
$join_workspace$;

revoke all on function public.join_workspace(uuid) from public;
grant execute on function public.join_workspace(uuid) to authenticated;

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

  -- Workspace ownership is deleted first; FK cascades remove accounts,
  -- payments, members, audit rows, and sync rows belonging to those spaces.
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
