-- Allow a workspace owner to remove the optional shared workspace lock.
-- Account authentication and active workspace membership remain required.
create or replace function public.remove_workspace_lock(
  target_workspace uuid,
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
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_workspace_owner(target_workspace) then
    raise exception 'not_workspace_owner';
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

  delete from public.workspace_lock_credentials where workspace_id = target_workspace;
  delete from public.workspace_lock_modes where workspace_id = target_workspace;
  delete from public.workspace_lock_attempts where workspace_id = target_workspace;

  return jsonb_build_object(
    'configured', false,
    'lock_type', 'password',
    'updated_at', null
  );
end;
$function$;

revoke all on function public.remove_workspace_lock(uuid, text) from public, anon;
grant execute on function public.remove_workspace_lock(uuid, text) to authenticated;
