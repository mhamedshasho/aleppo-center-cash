alter table public.workspaces
  add column if not exists slug text;

update public.workspaces
set slug = trim(both '-' from regexp_replace(upper(regexp_replace(name, '[^A-Za-z0-9]+', '-', 'g')), '-+', '-', 'g'))
where slug is null
  and name <> 'Aleppo Center Cash';

update public.workspaces
set slug = 'MHAMED-WORKSPACE'
where slug is null
  and name = 'Aleppo Center Cash'
  and not exists (
    select 1 from public.workspaces other where other.slug = 'MHAMED-WORKSPACE'
  );

update public.workspaces
set slug = 'WORKSPACE-' || replace(id::text, '-', '')
where slug is null;

alter table public.workspaces
  alter column slug set not null;

create unique index if not exists workspaces_slug_uidx
  on public.workspaces (slug);

create or replace function public.create_workspace(workspace_name text, display_name text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  new_workspace_id uuid;
  existing_workspace_id uuid;
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

