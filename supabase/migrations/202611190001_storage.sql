-- Run once in Supabase SQL Editor. Safe to run again; no existing rows are deleted.
begin;

create table if not exists public.sm_records (
  kind text not null check (kind in ('product','design','revision','asset','audit','session','event','quota')),
  shop text not null check (length(shop) between 1 and 255),
  id text not null check (length(id) between 1 and 255),
  version bigint not null default 1 check (version > 0),
  data jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (kind,shop,id)
);
create index if not exists sm_records_shop_kind_created on public.sm_records(shop,kind,created_at desc);
alter table public.sm_records enable row level security;
revoke all on public.sm_records from public,anon,authenticated;
grant select,insert,update,delete on public.sm_records to service_role;

-- One RPC = one transaction. Version checks protect snapshots, reviews and payments.
-- The exception block rolls back ALL writes, including an event claim, on conflict.
create or replace function public.sm_commit(p_changes jsonb, p_event jsonb default null)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  item jsonb; actual_version bigint; affected integer;
begin
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) > 2000 then
    raise exception 'Invalid change list' using errcode='22023';
  end if;
  if p_event is not null then
    insert into public.sm_records(kind,shop,id,data)
    values ('event',p_event->>'shop',p_event->>'id','{}'::jsonb)
    on conflict do nothing;
    get diagnostics affected = row_count;
    if affected=0 then return 'duplicate'; end if;
  end if;

  for item in select value from jsonb_array_elements(p_changes)
    order by value->>'kind',value->>'shop',value->>'id'
  loop
    if item->>'operation' not in ('set','delete','check') then
      raise exception 'Invalid operation' using errcode='22023';
    end if;
    actual_version := null;
    select version into actual_version from public.sm_records
      where kind=item->>'kind' and shop=item->>'shop' and id=item->>'id' for update;
    if actual_version is distinct from (item->>'expectedVersion')::bigint then
      raise exception 'Concurrent change' using errcode='40001';
    end if;
    if item->>'kind'='revision' and actual_version is not null and item->>'operation'<>'check' then
      raise exception 'Revisions are immutable' using errcode='22023';
    end if;
  end loop;

  for item in select value from jsonb_array_elements(p_changes) loop
    if item->>'operation'='delete' then
      delete from public.sm_records where kind=item->>'kind' and shop=item->>'shop' and id=item->>'id';
    elsif item->>'operation'='set' then
      if item->>'expectedVersion' is null then
        insert into public.sm_records(kind,shop,id,data)
        values(item->>'kind',item->>'shop',item->>'id',item->'data');
      else
        update public.sm_records set data=item->'data',version=version+1
        where kind=item->>'kind' and shop=item->>'shop' and id=item->>'id';
      end if;
    end if;
  end loop;
  return 'committed';
exception when serialization_failure or unique_violation or deadlock_detected then
  return 'conflict';
end;
$$;
revoke all on function public.sm_commit(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sm_commit(jsonb,jsonb) to service_role;

-- Private bucket. Browser clients have no storage policies; only the server key
-- can access files. The app checks shop/customer authorization before returning them.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('souvenir-assets','souvenir-assets',false,16000000,array['image/png'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

commit;
