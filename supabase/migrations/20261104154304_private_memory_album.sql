create unique index date_memories_one_per_session
  on public.date_memories(session_id) where session_id is not null;

alter table public.date_memories
  add column updated_at timestamptz not null default now();

alter table public.memory_photos
  add constraint memory_photos_phase4_mime_check
    check (mime_type in ('image/jpeg','image/png','image/webp')) not valid,
  add constraint memory_photos_phase4_size_check
    check (byte_size between 1 and 3145728) not valid;

alter table public.private_notes
  add column session_id uuid,
  add constraint private_notes_session_couple_fk
    foreign key (couple_id, session_id) references public.date_sessions(couple_id, id) on delete set null (session_id);

create table public.date_memory_contributions (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.date_memories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text check (title is null or char_length(title) between 1 and 120),
  description text check (description is null or char_length(description) <= 2000),
  favorite_part text check (favorite_part is null or char_length(favorite_part) <= 1000),
  song text check (song is null or char_length(song) <= 500),
  is_shared_note_copy boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint date_memory_contribution_has_content check (
    nullif(btrim(coalesce(title,'')), '') is not null
    or nullif(btrim(coalesce(description,'')), '') is not null
    or nullif(btrim(coalesce(favorite_part,'')), '') is not null
    or nullif(btrim(coalesce(song,'')), '') is not null
  )
);

create index date_memory_contributions_memory_created_idx
  on public.date_memory_contributions(memory_id, created_at desc);
create index memory_photos_memory_created_idx
  on public.memory_photos(memory_id, created_at desc);
create index private_notes_couple_session_idx
  on public.private_notes(couple_id, session_id) where session_id is not null;

create or replace function public.touch_memory_contribution_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger date_memory_contributions_touch_updated_at
before update on public.date_memory_contributions
for each row execute function public.touch_memory_contribution_updated_at();

alter table public.date_memory_contributions enable row level security;

create policy date_memory_contributions_read_members on public.date_memory_contributions
  for select to authenticated using (
    exists (
      select 1 from public.date_memories m
      where m.id = memory_id and public.is_couple_member(m.couple_id)
    )
  );
create policy date_memory_contributions_insert_owner on public.date_memory_contributions
  for insert to authenticated with check (
    user_id = (select auth.uid()) and not is_shared_note_copy and exists (
      select 1 from public.date_memories m
      where m.id = memory_id and public.is_couple_member(m.couple_id)
    )
  );
create policy date_memory_contributions_update_owner on public.date_memory_contributions
  for update to authenticated using (
    user_id = (select auth.uid()) and exists (
      select 1 from public.date_memories m
      where m.id = memory_id and public.is_couple_member(m.couple_id)
    )
  ) with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.date_memories m
      where m.id = memory_id and public.is_couple_member(m.couple_id)
    )
  );
create policy date_memory_contributions_delete_owner on public.date_memory_contributions
  for delete to authenticated using (
    user_id = (select auth.uid()) and exists (
      select 1 from public.date_memories m
      where m.id = memory_id and public.is_couple_member(m.couple_id)
    )
  );

revoke insert, update, delete on public.date_memories from public, anon, authenticated;
grant select on public.date_memories to authenticated;
revoke all on public.memory_photos from public, anon, authenticated;
grant select on public.memory_photos to authenticated;
revoke all on public.date_memory_contributions from public, anon, authenticated;
grant select, insert, update, delete on public.date_memory_contributions to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'memory-album-private',
  'memory-album-private',
  false,
  3145728,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.create_date_memory(p_session_id uuid, p_title text, p_happened_on date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_couple uuid;
  v_status text;
  v_date_id text;
  v_memory uuid;
  v_confirmation_count integer;
begin
  if v_user is null or p_session_id is null or p_title is null
    or char_length(btrim(p_title)) not between 1 and 120 or p_happened_on is null then
    raise exception 'invalid memory details' using errcode = '22023';
  end if;
  select couple_id into v_couple from public.date_sessions where id = p_session_id;
  if v_couple is null or not public.is_couple_member(v_couple) then
    raise exception 'completed date is unavailable' using errcode = '42501';
  end if;
  select couple_id, status, selected_date_id into v_couple, v_status, v_date_id
  from public.date_sessions where id = p_session_id for update;
  if v_status <> 'completed' or v_date_id is null then
    raise exception 'completed date is unavailable' using errcode = '55000';
  end if;
  select count(*) into v_confirmation_count
  from public.date_experience_confirmations c
  join public.couple_members m on m.user_id = c.user_id and m.couple_id = v_couple
  where c.session_id = p_session_id;
  if v_confirmation_count <> 2 or (select count(*) from public.couple_members where couple_id = v_couple) <> 2 then
    raise exception 'both participants must confirm completion first' using errcode = '55000';
  end if;
  select id into v_memory from public.date_memories where session_id = p_session_id;
  if v_memory is not null then return v_memory; end if;
  insert into public.date_memories (couple_id, session_id, title, happened_on, created_by)
  values (v_couple, p_session_id, btrim(p_title), p_happened_on, v_user)
  returning id into v_memory;
  return v_memory;
end;
$$;

create or replace function public.update_date_memory_metadata(
  p_memory_id uuid, p_title text, p_happened_on date, p_expected_updated_at timestamptz
)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  v_couple uuid;
  v_current_updated_at timestamptz;
  v_updated timestamptz;
begin
  if auth.uid() is null or p_title is null or char_length(btrim(p_title)) not between 1 and 120 or p_happened_on is null then
    raise exception 'invalid memory details' using errcode = '22023';
  end if;
  select couple_id into v_couple from public.date_memories where id = p_memory_id;
  if v_couple is null or not public.is_couple_member(v_couple) then
    raise exception 'memory is unavailable' using errcode = '42501';
  end if;
  select updated_at into v_current_updated_at from public.date_memories where id = p_memory_id for update;
  if v_current_updated_at is distinct from p_expected_updated_at then
    raise exception 'memory changed; reload and retry' using errcode = '40001';
  end if;
  update public.date_memories set title = btrim(p_title), happened_on = p_happened_on, updated_at = now()
  where id = p_memory_id and updated_at = p_expected_updated_at
  returning updated_at into v_updated;
  if v_updated is null then raise exception 'memory changed; reload and retry' using errcode = '40001'; end if;
  return v_updated;
end;
$$;

create or replace function public.share_private_note_to_memory(p_note_id uuid, p_memory_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_note public.private_notes;
  v_memory_couple uuid;
  v_note_copy uuid;
begin
  if v_user is null then raise exception 'not authorized' using errcode = '42501'; end if;
  select * into v_note from public.private_notes where id = p_note_id and user_id = v_user;
  if not found then raise exception 'private note is unavailable' using errcode = '42501'; end if;
  select couple_id into v_memory_couple from public.date_memories where id = p_memory_id;
  if v_memory_couple is null or v_memory_couple <> v_note.couple_id or not public.is_couple_member(v_memory_couple) then
    raise exception 'memory is unavailable' using errcode = '42501';
  end if;
  insert into public.date_memory_contributions (memory_id, user_id, title, description, is_shared_note_copy)
  values (p_memory_id, v_user, v_note.title, v_note.body, true)
  returning id into v_note_copy;
  return v_note_copy;
end;
$$;

create or replace function public.register_memory_photo(
  p_memory_id uuid, p_object_path text, p_mime_type text, p_byte_size integer
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_couple uuid;
  v_locked_memory uuid;
  v_photo uuid;
  v_photo_count integer;
begin
  if v_user is null or p_memory_id is null or p_byte_size not between 1 and 3145728
    or p_mime_type not in ('image/jpeg','image/png','image/webp')
    or p_object_path !~ ('^' || p_memory_id::text || '/' || v_user::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')
    or (p_mime_type = 'image/jpeg' and p_object_path !~ '\.jpg$')
    or (p_mime_type = 'image/png' and p_object_path !~ '\.png$')
    or (p_mime_type = 'image/webp' and p_object_path !~ '\.webp$') then
    raise exception 'invalid photo metadata' using errcode = '22023';
  end if;
  select couple_id into v_couple from public.date_memories where id = p_memory_id;
  if v_couple is null or not public.is_couple_member(v_couple) then
    raise exception 'memory is unavailable' using errcode = '42501';
  end if;
  select id into v_locked_memory from public.date_memories where id = p_memory_id for update;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'memory-album-private' and o.name = p_object_path and o.owner = v_user
  ) then raise exception 'uploaded object is unavailable' using errcode = '42501'; end if;
  select count(*) into v_photo_count from public.memory_photos where memory_id = p_memory_id;
  if v_photo_count >= 6 then raise exception 'photo limit reached' using errcode = '54000'; end if;
  insert into public.memory_photos (memory_id, uploaded_by, object_path, mime_type, byte_size)
  values (p_memory_id, v_user, p_object_path, p_mime_type, p_byte_size)
  returning id into v_photo;
  return v_photo;
end;
$$;

create or replace function public.delete_memory_photo(p_photo_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_path text;
  v_couple uuid;
begin
  if v_user is null then raise exception 'not authorized' using errcode = '42501'; end if;
  select p.object_path, m.couple_id into v_path, v_couple
  from public.memory_photos p join public.date_memories m on m.id = p.memory_id
  where p.id = p_photo_id and p.uploaded_by = v_user for update of p, m;
  if v_path is null or not public.is_couple_member(v_couple) then
    raise exception 'photo is unavailable' using errcode = '42501';
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'memory-album-private' and name = v_path) then
    raise exception 'remove the private object before its metadata' using errcode = '55000';
  end if;
  delete from public.memory_photos where id = p_photo_id and uploaded_by = v_user;
  return v_path;
end;
$$;

create or replace function public.can_upload_memory_photo(p_memory_id uuid, p_object_name text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_couple uuid;
  v_existing integer;
begin
  if auth.uid() is null or p_object_name !~ ('^' || p_memory_id::text || '/' || auth.uid()::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then
    return false;
  end if;
  select couple_id into v_couple from public.date_memories where id = p_memory_id;
  if v_couple is null or not public.is_couple_member(v_couple) then return false; end if;
  perform 1 from public.date_memories where id = p_memory_id for update;
  select count(*) into v_existing from storage.objects o
  where o.bucket_id = 'memory-album-private' and o.name like p_memory_id::text || '/%' and o.name <> p_object_name;
  return v_existing < 6;
end;
$$;

revoke all on function public.create_date_memory(uuid,text,date),
  public.update_date_memory_metadata(uuid,text,date,timestamptz),
  public.share_private_note_to_memory(uuid,uuid),
  public.register_memory_photo(uuid,text,text,integer),
  public.delete_memory_photo(uuid),
  public.can_upload_memory_photo(uuid,text) from public, anon;
grant execute on function public.create_date_memory(uuid,text,date),
  public.update_date_memory_metadata(uuid,text,date,timestamptz),
  public.share_private_note_to_memory(uuid,uuid),
  public.register_memory_photo(uuid,text,text,integer),
  public.delete_memory_photo(uuid),
  public.can_upload_memory_photo(uuid,text) to authenticated;

create policy memory_album_select_member on storage.objects
  for select to authenticated using (
    bucket_id = 'memory-album-private' and exists (
      select 1 from public.date_memories m
      where m.id = (storage.foldername(name))[1]::uuid
        and public.is_couple_member(m.couple_id)
        and (
          exists (select 1 from public.memory_photos p where p.object_path = name)
          or (storage.foldername(name))[2] = (select auth.uid())::text
        )
    )
  );
create policy memory_album_insert_owner on storage.objects
  for insert to authenticated with check (
    bucket_id = 'memory-album-private'
    and public.can_upload_memory_photo((storage.foldername(name))[1]::uuid, name)
  );
create policy memory_album_delete_owner on storage.objects
  for delete to authenticated using (
    bucket_id = 'memory-album-private'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and exists (
      select 1 from public.date_memories m
      where m.id = (storage.foldername(name))[1]::uuid and public.is_couple_member(m.couple_id)
    )
  );
