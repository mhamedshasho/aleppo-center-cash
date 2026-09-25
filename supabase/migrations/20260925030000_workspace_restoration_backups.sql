create extension if not exists pgcrypto with schema extensions;

create table if not exists public.workspace_restore_secrets (workspace_id uuid primary key, password_hash text not null, updated_at timestamptz not null default now());
revoke all on table public.workspace_restore_secrets from public;

create or replace function public.set_workspace_restore_password(target_workspace uuid, new_password text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
begin
  if length(coalesce(new_password, '')) < 8 then raise exception 'restore_password_too_short'; end if;
  if auth.uid() is not null and not exists (select 1 from public.workspace_members where workspace_id = target_workspace and user_id = auth.uid() and active = true) then raise exception 'not_workspace_member'; end if;
  insert into public.workspace_restore_secrets(workspace_id, password_hash, updated_at) values (target_workspace, extensions.crypt(new_password, extensions.gen_salt('bf')), now())
  on conflict (workspace_id) do update set password_hash = excluded.password_hash, updated_at = now();
  return true;
end; $$;
revoke all on function public.set_workspace_restore_password(uuid, text) from public;
grant execute on function public.set_workspace_restore_password(uuid, text) to service_role;

create or replace function public.verify_workspace_restore_password(target_workspace uuid, candidate_password text)
returns boolean language sql security definer set search_path = public, extensions as $$
select exists (select 1 from public.workspace_restore_secrets s where s.workspace_id = target_workspace and s.password_hash = extensions.crypt(candidate_password, s.password_hash));
$$;
revoke all on function public.verify_workspace_restore_password(uuid, text) from public;
grant execute on function public.verify_workspace_restore_password(uuid, text) to service_role;

create or replace function public.restore_workspace_snapshot(target_workspace uuid, snapshot jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare workspace_row jsonb := snapshot->'workspace'; profile_row jsonb; member_row jsonb; account_row jsonb; payment_row jsonb; audit_row jsonb;
begin
  if workspace_row is null then raise exception 'invalid_backup'; end if;
  insert into public.workspaces(id, name, timezone, created_at, slug) values (target_workspace, coalesce(workspace_row->>'name','Aleppo Center Cash'), coalesce(workspace_row->>'timezone','Asia/Damascus'), coalesce((workspace_row->>'created_at')::timestamptz,now()), nullif(workspace_row->>'slug','')) on conflict (id) do update set name=excluded.name, timezone=excluded.timezone, slug=excluded.slug;
  delete from public.audit_log where workspace_id=target_workspace;
  delete from public.payments where workspace_id=target_workspace;
  delete from public.accounts where workspace_id=target_workspace;
  for profile_row in select value from jsonb_array_elements(coalesce(snapshot->'profiles','[]'::jsonb)) loop
    if exists (select 1 from auth.users where id=(profile_row->>'user_id')::uuid) then
      insert into public.profiles(user_id,display_name,created_at,updated_at) values ((profile_row->>'user_id')::uuid,coalesce(profile_row->>'display_name',''),coalesce((profile_row->>'created_at')::timestamptz,now()),coalesce((profile_row->>'updated_at')::timestamptz,now())) on conflict (user_id) do update set display_name=excluded.display_name,updated_at=excluded.updated_at;
    end if;
  end loop;
  for member_row in select value from jsonb_array_elements(coalesce(snapshot->'members','[]'::jsonb)) loop
    if exists (select 1 from auth.users where id=(member_row->>'user_id')::uuid) then
      insert into public.workspace_members(workspace_id,user_id,role,active,joined_at,removed_at) values (target_workspace,(member_row->>'user_id')::uuid,case when member_row->>'role'='owner' then 'owner'::public.workspace_role else 'member'::public.workspace_role end,coalesce((member_row->>'active')::boolean,true),coalesce((member_row->>'joined_at')::timestamptz,now()),case when member_row->>'removed_at' is null then null else (member_row->>'removed_at')::timestamptz end) on conflict (workspace_id,user_id) do update set role=excluded.role,active=excluded.active,joined_at=excluded.joined_at,removed_at=excluded.removed_at;
    end if;
  end loop;
  for account_row in select value from jsonb_array_elements(coalesce(snapshot->'accounts','[]'::jsonb)) loop
    if exists (select 1 from auth.users where id=(account_row->>'created_by')::uuid) then
      insert into public.accounts(id,workspace_id,name,owner_name,accent,version,is_archived,created_by,created_at,updated_at) values ((account_row->>'id')::uuid,target_workspace,account_row->>'name',coalesce(account_row->>'owner_name',''),coalesce(account_row->>'accent','mint'),coalesce((account_row->>'version')::bigint,1),coalesce((account_row->>'is_archived')::boolean,false),(account_row->>'created_by')::uuid,coalesce((account_row->>'created_at')::timestamptz,now()),coalesce((account_row->>'updated_at')::timestamptz,now()));
    end if;
  end loop;
  for payment_row in select value from jsonb_array_elements(coalesce(snapshot->'payments','[]'::jsonb)) loop
    if exists (select 1 from auth.users where id=(payment_row->>'created_by')::uuid) and exists (select 1 from public.accounts where id=(payment_row->>'account_id')::uuid and workspace_id=target_workspace) then
      insert into public.payments(id,workspace_id,account_id,name,amount_minor,currency,payment_type,occurred_on,version,created_by,created_at,updated_at) values ((payment_row->>'id')::uuid,target_workspace,(payment_row->>'account_id')::uuid,payment_row->>'name',(payment_row->>'amount_minor')::bigint,payment_row->>'currency',payment_row->>'payment_type',(payment_row->>'occurred_on')::date,coalesce((payment_row->>'version')::bigint,1),(payment_row->>'created_by')::uuid,coalesce((payment_row->>'created_at')::timestamptz,now()),coalesce((payment_row->>'updated_at')::timestamptz,now()));
    end if;
  end loop;
  for audit_row in select value from jsonb_array_elements(coalesce(snapshot->'audit_log','[]'::jsonb)) loop
    if exists (select 1 from auth.users where id=(audit_row->>'user_id')::uuid) then
      insert into public.audit_log(workspace_id,user_id,action,entity,entity_id,summary,created_at,actor_email) values (target_workspace,(audit_row->>'user_id')::uuid,audit_row->>'action',audit_row->>'entity',audit_row->>'entity_id',coalesce(audit_row->>'summary',''),coalesce((audit_row->>'created_at')::timestamptz,now()),audit_row->>'actor_email');
    end if;
  end loop;
  return true;
end; $$;
revoke all on function public.restore_workspace_snapshot(uuid,jsonb) from public;
grant execute on function public.restore_workspace_snapshot(uuid,jsonb) to service_role;

insert into storage.buckets(id,name,public) values ('workspace-restorations','workspace-restorations',false) on conflict (id) do update set public=false;
