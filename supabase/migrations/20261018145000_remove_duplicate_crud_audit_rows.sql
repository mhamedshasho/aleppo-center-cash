-- Remove legacy client-written audit entries that duplicate the database
-- trigger entry for the same account/payment create, update, or delete.
-- Keep the trigger-generated row because it contains the canonical entity data.

with parsed as materialized (
  select
    id,
    workspace_id,
    user_id,
    action,
    entity,
    entity_id,
    created_at,
    summary::jsonb as detail
  from public.audit_log
  where entity in ('account', 'payment')
    and action in ('create', 'update', 'delete')
),
legacy_rows as (
  select
    id,
    workspace_id,
    user_id,
    action,
    entity,
    entity_id,
    created_at,
    detail,
    detail ->> 'name' as target_name
  from parsed
  where (detail - 'name') = '{}'::jsonb
    and jsonb_typeof(detail -> 'name') = 'string'
),
trigger_rows as (
  select
    id,
    workspace_id,
    user_id,
    action,
    entity,
    entity_id,
    created_at,
    case
      when action = 'update' then coalesce(detail -> 'after' ->> 'name', detail ->> 'name')
      else detail ->> 'name'
    end as target_name
  from parsed
  where not (
    (detail - 'name') = '{}'::jsonb
    and jsonb_typeof(detail -> 'name') = 'string'
  )
),
candidate_pairs as (
  select
    legacy.id as legacy_id,
    trigger_row.id as trigger_id,
    abs(extract(epoch from (trigger_row.created_at - legacy.created_at))) as seconds_apart
  from legacy_rows legacy
  join trigger_rows trigger_row
    on trigger_row.workspace_id = legacy.workspace_id
   and trigger_row.user_id = legacy.user_id
   and trigger_row.action = legacy.action
   and trigger_row.entity = legacy.entity
   and trigger_row.target_name = legacy.target_name
   and abs(extract(epoch from (trigger_row.created_at - legacy.created_at))) <= 60
   and (
     legacy.entity_id is null
     or trigger_row.entity_id is null
     or legacy.entity_id = trigger_row.entity_id
   )
),
ranked_pairs as (
  select
    legacy_id,
    trigger_id,
    seconds_apart,
    row_number() over (partition by legacy_id order by seconds_apart, trigger_id) as legacy_rank,
    row_number() over (partition by trigger_id order by seconds_apart, legacy_id) as trigger_rank
  from candidate_pairs
),
duplicate_legacy_rows as (
  select distinct legacy_id
  from ranked_pairs
  where legacy_rank = 1
    and trigger_rank = 1
    and seconds_apart <= 60
)
delete from public.audit_log audit
using duplicate_legacy_rows duplicate
where audit.id = duplicate.legacy_id;
