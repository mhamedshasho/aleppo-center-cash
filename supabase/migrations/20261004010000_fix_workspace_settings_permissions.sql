-- Fix permissions required by workspace_settings RLS policies.
grant execute on function public.is_workspace_member(uuid) to authenticated;
alter function public.workspace_settings_touch() set search_path = public;
