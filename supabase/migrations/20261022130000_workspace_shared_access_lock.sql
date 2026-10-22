-- Workspace-wide access lock shared by every active member.
-- Mode is visible to members; credential hashes and rate-limit state remain private.

create table if not exists public.workspace_lock_modes (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  lock_type text not null check (lock_type in ('password', 'pin', 'pattern')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_lock_credentials (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  credential_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_lock_attempts (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table public.workspace_lock_modes enable row level security;
alter table public.workspace_lock_credentials enable row level security;
alter table public.workspace_lock_attempts enable row level security;

drop policy if exists workspace_lock_modes_member_select on public.workspace_lock_modes;
create policy workspace_lock_modes_member_select
  on public.workspace_lock_modes for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_lock_credentials_no_direct_access on public.workspace_lock_credentials;
create policy workspace_lock_credentials_no_direct_access
  on public.workspace_lock_credentials for all
  using (false) with check (false);

drop policy if exists workspace_lock_attempts_no_direct_access on public.workspace_lock_attempts;
create policy workspace_lock_attempts_no_direct_access
  on public.workspace_lock_attempts for all
  using (false) with check (false);

revoke all on table public.workspace_lock_modes from public, anon, authenticated;
grant select on table public.workspace_lock_modes to authenticated;
revoke all on table public.workspace_lock_credentials from public, anon, authenticated;
revoke all on table public.workspace_lock_attempts from public, anon, authenticated;

create or replace function public.get_workspace_lock_config(target_workspace uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  result public.workspace_lock_modes%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_workspace_member(target_workspace) then
    raise exception 'workspace_access_denied';
  end if;

  select * into result
  from public.workspace_lock_modes
  where workspace_id = target_workspace;

  if not found then
    return jsonb_build_object(
      'configured', false,
      'lock_type', 'password',
      'updated_at', null
    );
  end if;

  return jsonb_build_object(
    'configured', true,
    'lock_type', result.lock_type,
    'updated_at', result.updated_at
  );
end;
$function$;

create or replace function public.verify_workspace_lock(
  target_workspace uuid,
  provided_credential text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  stored_hash text;
  attempts public.workspace_lock_attempts%rowtype;
  next_attempt integer;
  cooldown_until timestamptz;
  remaining_seconds integer;
  matched boolean := false;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_workspace_member(target_workspace) then
    raise exception 'workspace_access_denied';
  end if;
  if provided_credential is null or length(provided_credential) > 128 then
    return jsonb_build_object('ok', false, 'locked', false, 'retry_after_seconds', 0);
  end if;

  -- Serialize attempts per user/workspace so parallel calls cannot bypass throttling.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || target_workspace::text, 0));

  select credential_hash into stored_hash
  from public.workspace_lock_credentials
  where workspace_id = target_workspace;

  if stored_hash is null then
    return jsonb_build_object('ok', false, 'configured', false, 'locked', false, 'retry_after_seconds', 0);
  end if;

  insert into public.workspace_lock_attempts (workspace_id, user_id)
  values (target_workspace, auth.uid())
  on conflict (workspace_id, user_id) do nothing;

  select * into attempts
  from public.workspace_lock_attempts
  where workspace_id = target_workspace and user_id = auth.uid()
  for update;

  if attempts.locked_until is not null and attempts.locked_until > now() then
    remaining_seconds := greatest(1, ceil(extract(epoch from (attempts.locked_until - now())))::integer);
    return jsonb_build_object('ok', false, 'locked', true, 'retry_after_seconds', remaining_seconds);
  end if;

  if attempts.window_started_at < now() - interval '5 minutes' then
    attempts.window_started_at := now();
    attempts.attempt_count := 0;
    attempts.locked_until := null;
  end if;

  matched := stored_hash = extensions.crypt(
    encode(extensions.digest(provided_credential, 'sha256'), 'hex'),
    stored_hash
  );

  if matched then
    delete from public.workspace_lock_attempts
    where workspace_id = target_workspace and user_id = auth.uid();
    return jsonb_build_object('ok', true, 'locked', false, 'retry_after_seconds', 0);
  end if;

  next_attempt := attempts.attempt_count + 1;
  cooldown_until := case when next_attempt >= 5 then now() + interval '60 seconds' else null end;

  update public.workspace_lock_attempts
     set window_started_at = attempts.window_started_at,
         attempt_count = next_attempt,
         locked_until = cooldown_until,
         updated_at = now()
   where workspace_id = target_workspace and user_id = auth.uid();

  remaining_seconds := case when cooldown_until is null then 0 else 60 end;
  return jsonb_build_object(
    'ok', false,
    'locked', cooldown_until is not null,
    'retry_after_seconds', remaining_seconds
  );
end;
$function$;

create or replace function public.set_workspace_lock(
  target_workspace uuid,
  new_lock_type text,
  new_credential text,
  current_credential text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  existing_hash text;
  credential_preimage text;
  nodes text[];
  distinct_nodes integer;
  lock_updated_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_workspace_owner(target_workspace) then
    raise exception 'not_workspace_owner';
  end if;
  if new_lock_type not in ('password', 'pin', 'pattern') then
    raise exception 'invalid_workspace_lock_type';
  end if;
  if new_credential is null or length(new_credential) < 4 or length(new_credential) > 128 then
    raise exception 'invalid_workspace_lock_credential';
  end if;

  if new_lock_type = 'pin' and new_credential !~ '^[0-9]{4}$' then
    raise exception 'workspace_pin_must_be_4_digits';
  end if;

  if new_lock_type = 'pattern' then
    if new_credential !~ '^([0-8]-){3,8}[0-8]$' then
      raise exception 'invalid_workspace_pattern';
    end if;
    nodes := regexp_split_to_array(new_credential, '-');
    select count(distinct value)::integer into distinct_nodes from unnest(nodes) as node(value);
    if distinct_nodes <> cardinality(nodes) then
      raise exception 'workspace_pattern_points_must_be_unique';
    end if;
  end if;

  select credential_hash into existing_hash
  from public.workspace_lock_credentials
  where workspace_id = target_workspace
  for update;

  if found then
    if current_credential is null or length(current_credential) > 128 then
      raise exception 'current_workspace_lock_required';
    end if;
    credential_preimage := encode(extensions.digest(current_credential, 'sha256'), 'hex');
    if existing_hash <> extensions.crypt(credential_preimage, existing_hash) then
      raise exception 'current_workspace_lock_invalid';
    end if;
  end if;

  credential_preimage := encode(extensions.digest(new_credential, 'sha256'), 'hex');
  insert into public.workspace_lock_credentials (workspace_id, credential_hash, updated_at)
  values (target_workspace, extensions.crypt(credential_preimage, extensions.gen_salt('bf', 12)), now())
  on conflict (workspace_id) do update
    set credential_hash = excluded.credential_hash, updated_at = now();

  insert into public.workspace_lock_modes (workspace_id, lock_type, updated_by, updated_at)
  values (target_workspace, new_lock_type, auth.uid(), now())
  on conflict (workspace_id) do update
    set lock_type = excluded.lock_type, updated_by = excluded.updated_by, updated_at = now()
  returning updated_at into lock_updated_at;

  delete from public.workspace_lock_attempts where workspace_id = target_workspace;

  return jsonb_build_object(
    'configured', true,
    'lock_type', new_lock_type,
    'updated_at', lock_updated_at
  );
end;
$function$;

revoke all on function public.get_workspace_lock_config(uuid) from public, anon;
revoke all on function public.verify_workspace_lock(uuid, text) from public, anon;
revoke all on function public.set_workspace_lock(uuid, text, text, text) from public, anon;
grant execute on function public.get_workspace_lock_config(uuid) to authenticated;
grant execute on function public.verify_workspace_lock(uuid, text) to authenticated;
grant execute on function public.set_workspace_lock(uuid, text, text, text) to authenticated;

do $publication$
begin
  begin
    alter publication supabase_realtime add table public.workspace_lock_modes;
  exception when duplicate_object then null;
  end;
end;
$publication$;
