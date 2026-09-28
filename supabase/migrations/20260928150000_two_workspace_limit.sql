create or replace function public.create_workspace(workspace_name text, display_name text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  new_workspace_id uuid;
  active_workspace_count integer;
  base_slug text;
  candidate_slug text;
  suffix integer := 1;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));

  if char_length(trim(workspace_name)) not between 1 and 120 then
    raise exception 'invalid_workspace_name';
  end if;

  select count(*)::integer
    into active_workspace_count
    from public.workspace_members
   where user_id = auth.uid()
     and active = true;

  if active_workspace_count >= 2 then
    raise exception 'workspace_limit_reached';
  end if;

  base_slug := trim(both '-' from regexp_replace(upper(trim(workspace_name)), '[^A-Z0-9]+', '-', 'g'));
  if base_slug = '' then
    base_slug := 'WORKSPACE';
  end if;

  candidate_slug := base_slug;
  while exists (select 1 from public.workspaces where slug = candidate_slug) loop
    suffix := suffix + 1;
    candidate_slug := base_slug || '-' || suffix::text;
  end loop;

  insert into public.workspaces (name, slug)
    values (trim(workspace_name), candidate_slug)
    returning id into new_workspace_id;

  insert into public.profiles (user_id, display_name)
    values (auth.uid(), trim(display_name))
    on conflict (user_id) do update set display_name = excluded.display_name;

  insert into public.workspace_members (workspace_id, user_id, role)
    values (new_workspace_id, auth.uid(), 'owner');

  return new_workspace_id;
end;
$function$;

create or replace function public.join_workspace(target_workspace uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  workspace_name text;
  member_count integer;
  active_workspace_count integer;
  already_member boolean;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select exists (
    select 1
      from public.workspace_members
     where workspace_id = target_workspace
       and user_id = auth.uid()
       and active = true
  ) into already_member;

  if already_member then
    select w.name into workspace_name
      from public.workspaces w
     where w.id = target_workspace;

    if workspace_name is null then
      raise exception 'workspace_not_found';
    end if;

    return jsonb_build_object('id', target_workspace, 'name', workspace_name, 'role', 'member');
  end if;

  select count(*)::integer
    into active_workspace_count
    from public.workspace_members
   where user_id = auth.uid()
     and active = true;

  if active_workspace_count >= 2 then
    raise exception 'workspace_limit_reached';
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

  if member_count >= 2 then
    raise exception 'workspace_full';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
    values (target_workspace, auth.uid(), 'member')
    on conflict (workspace_id, user_id) do update
      set active = true, removed_at = null;

  return jsonb_build_object('id', target_workspace, 'name', workspace_name, 'role', 'member');
end;
$function$;

revoke all on function public.create_workspace(text, text) from public;
grant execute on function public.create_workspace(text, text) to authenticated;
revoke all on function public.join_workspace(uuid) from public;
grant execute on function public.join_workspace(uuid) to authenticated;
