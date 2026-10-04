-- Shared workspace settings for theme and invoice branding.
create table if not exists public.workspace_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  theme text not null default 'light' check (theme in ('light','dark','gold','red','yellow-black')),
  invoice_logo_data text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create or replace function public.workspace_settings_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists workspace_settings_touch on public.workspace_settings;
create trigger workspace_settings_touch
before update on public.workspace_settings
for each row execute function public.workspace_settings_touch();

alter table public.workspace_settings enable row level security;

drop policy if exists workspace_settings_member_select on public.workspace_settings;
create policy workspace_settings_member_select on public.workspace_settings
for select using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_settings_member_insert on public.workspace_settings;
create policy workspace_settings_member_insert on public.workspace_settings
for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists workspace_settings_member_update on public.workspace_settings;
create policy workspace_settings_member_update on public.workspace_settings
for update using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

do $$
begin
  begin
    alter publication supabase_realtime add table public.workspace_settings;
  exception when duplicate_object then null;
  end;
end $$;
