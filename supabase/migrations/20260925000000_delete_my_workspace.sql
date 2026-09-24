create or replace function public.delete_my_workspace(target_workspace uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace
      and user_id = current_user_id
      and role = 'owner'
      and active = true
  ) then
    raise exception 'not_workspace_owner';
  end if;

  delete from public.workspaces
  where id = target_workspace;
end;
$function$;

revoke all on function public.delete_my_workspace(uuid) from public;
grant execute on function public.delete_my_workspace(uuid) to authenticated;
