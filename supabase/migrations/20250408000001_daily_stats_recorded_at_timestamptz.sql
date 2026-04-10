-- Hourly snapshots: recorded_at is a UTC-aligned timestamptz (app truncates to hour on upsert).
do $$
begin
  if exists (
    select 1
    from information_schema.columns c
    where
      c.table_schema = 'public'
      and c.table_name = 'daily_stats'
      and c.column_name = 'recorded_at'
      and c.data_type = 'date'
  ) then
    alter table public.daily_stats alter column recorded_at drop default;

    alter table public.daily_stats
      alter column recorded_at type timestamptz using ((recorded_at::text || 'T00:00:00Z')::timestamptz);

    alter table public.daily_stats
      alter column recorded_at
      set default to_timestamp(3600 * floor(extract(epoch from now()) / 3600));
  end if;
end$$;
