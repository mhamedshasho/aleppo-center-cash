alter table public.audit_log
  add column if not exists actor_email text;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace uuid;
  target_id text;
  target_summary jsonb;
  actor_email_value text;
begin
  if tg_op = 'DELETE' then
    target_workspace := old.workspace_id;
    target_id := old.id::text;
  else
    target_workspace := new.workspace_id;
    target_id := new.id::text;
  end if;

  actor_email_value := coalesce(auth.jwt() ->> 'email', '');

  if tg_op = 'INSERT' then
    if tg_table_name = 'accounts' then
      target_summary := jsonb_build_object(
        'name', new.name,
        'owner', new.owner_name
      );
    elsif tg_table_name = 'payments' then
      target_summary := jsonb_build_object(
        'name', new.name,
        'amount', new.amount_minor,
        'currency', new.currency,
        'payment_type', new.payment_type,
        'occurred_on', new.occurred_on
      );
    end if;
  elsif tg_op = 'UPDATE' then
    target_summary := jsonb_build_object(
      'before', to_jsonb(old),
      'after', to_jsonb(new)
    );
  elsif tg_op = 'DELETE' then
    target_summary := to_jsonb(old);
  end if;

  insert into public.audit_log (
    workspace_id, user_id, actor_email, action, entity, entity_id, summary
  )
  values (
    target_workspace,
    auth.uid(),
    actor_email_value,
    lower(tg_op),
    case when tg_table_name = 'accounts' then 'account' else 'payment' end,
    target_id,
    coalesce(target_summary, '{}'::jsonb)::text
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists accounts_audit_log on public.accounts;
create trigger accounts_audit_log
after insert or update or delete on public.accounts
for each row execute function public.audit_row_change();

drop trigger if exists payments_audit_log on public.payments;
create trigger payments_audit_log
after insert or update or delete on public.payments
for each row execute function public.audit_row_change();

do $$
begin
  begin
    alter publication supabase_realtime add table public.audit_log;
  exception when duplicate_object then null;
  end;
end $$;

create index if not exists audit_workspace_created_idx
  on public.audit_log (workspace_id, created_at desc, id desc);