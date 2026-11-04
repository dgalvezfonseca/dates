create or replace function public.register_memory_photo(
  p_memory_id uuid, p_object_path text, p_mime_type text, p_byte_size integer
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_couple uuid;
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
  perform 1 from public.date_memories where id = p_memory_id for update;
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
