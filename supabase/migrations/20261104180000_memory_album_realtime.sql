do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'date_memories') then
      alter publication supabase_realtime add table public.date_memories;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'date_memory_contributions') then
      alter publication supabase_realtime add table public.date_memory_contributions;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'memory_photos') then
      alter publication supabase_realtime add table public.memory_photos;
    end if;
  end if;
end;
$$;
