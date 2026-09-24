-- Aleppo Center Cash: RLS performance/security hardening
-- Applied to production on 2026-09-24.

create schema if not exists private;

create or replace function private.is_workspace_member(target_workspace uuid)
returns boolean language sql stable security definer set search_path = public
as $fn$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace
      and wm.user_id = auth.uid()
      and wm.active = true
  );
$fn$;

create or replace function private.is_workspace_owner(target_workspace uuid)
returns boolean language sql stable security definer set search_path = public
as $fn$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace
      and wm.user_id = auth.uid()
      and wm.active = true
      and wm.role = 'owner'
  );
$fn$;

revoke all on function private.is_workspace_member(uuid) from public;
revoke all on function private.is_workspace_owner(uuid) from public;
grant execute on function private.is_workspace_member(uuid) to public;
grant execute on function private.is_workspace_owner(uuid) to public;

drop policy if exists accounts_member_insert on public.accounts;
create policy accounts_member_insert on public.accounts for insert
with check ((select private.is_workspace_member(workspace_id)) and created_by=(select auth.uid()));
drop policy if exists accounts_member_select on public.accounts;
create policy accounts_member_select on public.accounts for select using ((select private.is_workspace_member(workspace_id)));
drop policy if exists accounts_member_update on public.accounts;
create policy accounts_member_update on public.accounts for update using ((select private.is_workspace_member(workspace_id))) with check ((select private.is_workspace_member(workspace_id)));
drop policy if exists accounts_owner_delete on public.accounts;
create policy accounts_owner_delete on public.accounts for delete using ((select private.is_workspace_owner(workspace_id)));

drop policy if exists audit_member_insert on public.audit_log;
create policy audit_member_insert on public.audit_log for insert with check ((select private.is_workspace_member(workspace_id)) and user_id=(select auth.uid()));
drop policy if exists audit_member_select on public.audit_log;
create policy audit_member_select on public.audit_log for select using ((select private.is_workspace_member(workspace_id)));

drop policy if exists payments_member_insert on public.payments;
create policy payments_member_insert on public.payments for insert with check ((select private.is_workspace_member(workspace_id)) and created_by=(select auth.uid()));
drop policy if exists payments_member_select on public.payments;
create policy payments_member_select on public.payments for select using ((select private.is_workspace_member(workspace_id)));
drop policy if exists payments_member_update on public.payments;
create policy payments_member_update on public.payments for update using ((select private.is_workspace_member(workspace_id))) with check ((select private.is_workspace_member(workspace_id)));
drop policy if exists payments_owner_delete on public.payments;
create policy payments_owner_delete on public.payments for delete using ((select private.is_workspace_owner(workspace_id)));

drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles for select using (user_id=(select auth.uid()));
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

drop policy if exists sync_member_insert on public.sync_events;
create policy sync_member_insert on public.sync_events for insert with check ((select private.is_workspace_member(workspace_id)));
drop policy if exists sync_member_select on public.sync_events;
create policy sync_member_select on public.sync_events for select using ((select private.is_workspace_member(workspace_id)));

drop policy if exists membership_owner_manage on public.workspace_members;
create policy membership_owner_manage on public.workspace_members for all using ((select private.is_workspace_owner(workspace_id))) with check ((select private.is_workspace_owner(workspace_id)));
drop policy if exists membership_self_or_owner_select on public.workspace_members;
create policy membership_self_or_owner_select on public.workspace_members for select using (user_id=(select auth.uid()) or (select private.is_workspace_owner(workspace_id)));

drop policy if exists workspace_member_select on public.workspaces;
create policy workspace_member_select on public.workspaces for select using ((select private.is_workspace_member(id)));
drop policy if exists workspace_owner_update on public.workspaces;
create policy workspace_owner_update on public.workspaces for update using ((select private.is_workspace_owner(id))) with check ((select private.is_workspace_owner(id)));

revoke all on function public.is_workspace_member(uuid) from public, anon, authenticated;
revoke all on function public.is_workspace_owner(uuid) from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path=pg_catalog
as $fn$ begin new.updated_at=now(); return new; end; $fn$;

create or replace function public.bump_version()
returns trigger language plpgsql set search_path=pg_catalog
as $fn$ begin if tg_op='UPDATE' then new.version=old.version+1; end if; return new; end; $fn$;

create index if not exists accounts_created_by_idx on public.accounts(created_by);
create index if not exists audit_log_user_idx on public.audit_log(user_id);
create index if not exists payments_created_by_idx on public.payments(created_by);
create index if not exists payments_workspace_idx on public.payments(workspace_id,updated_at desc);

revoke all on function public.create_workspace(text,text) from public, anon;
grant execute on function public.create_workspace(text,text) to authenticated;
revoke all on function public.join_workspace(uuid) from public, anon;
grant execute on function public.join_workspace(uuid) to authenticated;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
