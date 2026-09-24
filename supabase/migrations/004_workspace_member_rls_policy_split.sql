-- Split the owner ALL policy so SELECT has a single permissive policy.
drop policy if exists membership_owner_manage on public.workspace_members;
drop policy if exists membership_owner_insert on public.workspace_members;
drop policy if exists membership_owner_update on public.workspace_members;
drop policy if exists membership_owner_delete on public.workspace_members;

create policy membership_owner_insert on public.workspace_members
for insert with check ((select private.is_workspace_owner(workspace_id)));

create policy membership_owner_update on public.workspace_members
for update
using ((select private.is_workspace_owner(workspace_id)))
with check ((select private.is_workspace_owner(workspace_id)));

create policy membership_owner_delete on public.workspace_members
for delete using ((select private.is_workspace_owner(workspace_id)));
