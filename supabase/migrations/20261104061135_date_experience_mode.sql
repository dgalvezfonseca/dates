create table public.date_experience_progress (
  session_id uuid primary key references public.date_sessions(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  turn_user_id uuid not null references auth.users(id),
  question_level text not null default 'actividad' check (question_level in ('actividad','divertidas','gustos','suenos','romance','profundas')),
  question_index smallint not null default 0 check (question_index between 0 and 100),
  completed_steps smallint[] not null default '{}'::smallint[],
  skipped_steps smallint[] not null default '{}'::smallint[],
  updated_at timestamptz not null default now(),
  constraint date_experience_progress_couple_session_fk
    foreign key (couple_id, session_id) references public.date_sessions(couple_id, id) on delete cascade
);

create table public.date_experience_confirmations (
  session_id uuid not null references public.date_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table public.date_prompt_favorites (
  session_id uuid not null references public.date_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt_key text not null check (char_length(prompt_key) between 1 and 120),
  created_at timestamptz not null default now(),
  primary key (session_id, user_id, prompt_key)
);

create index date_experience_progress_couple on public.date_experience_progress(couple_id);
create index date_experience_confirmations_user on public.date_experience_confirmations(user_id);
create index date_prompt_favorites_user on public.date_prompt_favorites(user_id);

alter table public.date_experience_progress enable row level security;
alter table public.date_experience_confirmations enable row level security;
alter table public.date_prompt_favorites enable row level security;

create policy date_experience_progress_read_members on public.date_experience_progress
  for select to authenticated using (public.is_couple_member(couple_id));
create policy date_experience_confirmations_read_members on public.date_experience_confirmations
  for select to authenticated using (
    exists (select 1 from public.date_sessions s where s.id = session_id and public.is_couple_member(s.couple_id))
  );
create policy date_prompt_favorites_read_owner on public.date_prompt_favorites
  for select to authenticated using (
    user_id = (select auth.uid()) and exists (
      select 1 from public.date_sessions s where s.id = session_id and public.is_couple_member(s.couple_id)
    )
  );
create policy date_prompt_favorites_insert_owner on public.date_prompt_favorites
  for insert to authenticated with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.date_sessions s where s.id = session_id and public.is_couple_member(s.couple_id)
    )
  );
create policy date_prompt_favorites_delete_owner on public.date_prompt_favorites
  for delete to authenticated using (
    user_id = (select auth.uid()) and exists (
      select 1 from public.date_sessions s where s.id = session_id and public.is_couple_member(s.couple_id)
    )
  );

revoke all on public.date_experience_progress, public.date_experience_confirmations, public.date_prompt_favorites from public, anon, authenticated;
grant select on public.date_experience_progress, public.date_experience_confirmations to authenticated;
grant select, insert, delete on public.date_prompt_favorites to authenticated;

create or replace function public.start_date_experience(p_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_couple uuid;
  v_status text;
  v_date_id text;
  v_turn uuid;
begin
  if v_user is null then raise exception 'not authorized' using errcode = '42501'; end if;
  select couple_id, status, selected_date_id into v_couple, v_status, v_date_id
  from public.date_sessions where id = p_session_id for update;
  if v_couple is null or not public.is_couple_member(v_couple) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_status not in ('confirmed','in_progress') or v_date_id is null then
    raise exception 'experience is not confirmed' using errcode = '55000';
  end if;
  select user_id into v_turn from public.couple_members where couple_id = v_couple order by user_id limit 1;
  if (select count(*) from public.couple_members where couple_id = v_couple) <> 2 or v_turn is null then
    raise exception 'shared space must have two participants' using errcode = '55000';
  end if;
  if v_status = 'confirmed' and (
    select count(*) from public.date_confirmations c
    join public.date_recommendations r on r.id = c.recommendation_id and r.session_id = c.session_id
    where c.session_id = p_session_id and r.date_id = v_date_id
  ) <> 2 then
    raise exception 'bilateral confirmation required' using errcode = '55000';
  end if;
  update public.date_sessions set status = 'in_progress', updated_at = now()
  where id = p_session_id and status = 'confirmed';
  insert into public.date_experience_progress (session_id, couple_id, turn_user_id)
  values (p_session_id, v_couple, v_turn)
  on conflict (session_id) do nothing;
end;
$$;

create or replace function public.update_date_experience_step(p_session_id uuid, p_step smallint, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_couple uuid;
  v_date_id text;
  v_step_count integer;
  v_progress public.date_experience_progress;
  v_steps smallint[];
begin
  if auth.uid() is null or p_action is null or p_action not in ('complete','skip') or p_step is null then
    raise exception 'invalid request' using errcode = '22023';
  end if;
  select couple_id, selected_date_id into v_couple, v_date_id from public.date_sessions
  where id = p_session_id and status = 'in_progress' for update;
  if v_couple is null or not public.is_couple_member(v_couple) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select jsonb_array_length(steps) into v_step_count from public.date_catalog where id = v_date_id and active;
  if v_step_count is null or p_step < 0 or p_step > v_step_count then
    raise exception 'invalid activity step' using errcode = '22023';
  end if;
  select * into v_progress from public.date_experience_progress where session_id = p_session_id for update;
  if not found then raise exception 'experience has not started' using errcode = '55000'; end if;
  if p_action = 'complete' then
    select coalesce(array_agg(distinct n order by n), '{}'::smallint[]) into v_steps
    from unnest(v_progress.completed_steps || p_step) n;
    update public.date_experience_progress set completed_steps = v_steps,
      skipped_steps = array_remove(v_progress.skipped_steps, p_step), updated_at = now()
    where session_id = p_session_id;
  else
    select coalesce(array_agg(distinct n order by n), '{}'::smallint[]) into v_steps
    from unnest(v_progress.skipped_steps || p_step) n;
    update public.date_experience_progress set skipped_steps = v_steps,
      completed_steps = array_remove(v_progress.completed_steps, p_step), updated_at = now()
    where session_id = p_session_id;
  end if;
end;
$$;

create or replace function public.set_date_experience_question(p_session_id uuid, p_level text, p_index smallint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_level is null or p_level not in ('actividad','divertidas','gustos','suenos','romance','profundas') or p_index is null or p_index < 0 or p_index > 100 then
    raise exception 'invalid question selection' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.date_sessions s where s.id = p_session_id and s.status = 'in_progress'
      and public.is_couple_member(s.couple_id)
  ) then raise exception 'experience is unavailable' using errcode = '42501'; end if;
  update public.date_experience_progress set question_level = p_level, question_index = p_index, updated_at = now()
  where session_id = p_session_id;
  if not found then raise exception 'experience has not started' using errcode = '55000'; end if;
end;
$$;

create or replace function public.advance_date_experience_turn(p_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_couple uuid;
  v_current uuid;
  v_next uuid;
begin
  if auth.uid() is null then raise exception 'not authorized' using errcode = '42501'; end if;
  select couple_id into v_couple from public.date_sessions
  where id = p_session_id and status = 'in_progress' for update;
  if v_couple is null or not public.is_couple_member(v_couple) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select turn_user_id into v_current from public.date_experience_progress
  where session_id = p_session_id for update;
  if not found then raise exception 'experience has not started' using errcode = '55000'; end if;
  if v_current <> auth.uid() then raise exception 'wait for your turn' using errcode = '55000'; end if;
  select user_id into v_next from public.couple_members
  where couple_id = v_couple and user_id <> auth.uid();
  if v_next is null then raise exception 'shared space must have two participants' using errcode = '55000'; end if;
  update public.date_experience_progress set turn_user_id = v_next, updated_at = now()
  where session_id = p_session_id;
end;
$$;

create or replace function public.finish_date_experience(p_session_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_couple uuid;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'not authorized' using errcode = '42501'; end if;
  select couple_id into v_couple from public.date_sessions
  where id = p_session_id and status = 'in_progress' for update;
  if v_couple is null or not public.is_couple_member(v_couple) then
    raise exception 'not authorized or experience unavailable' using errcode = '42501';
  end if;
  insert into public.date_experience_confirmations (session_id, user_id)
  values (p_session_id, auth.uid()) on conflict (session_id, user_id) do nothing;
  select count(*) into v_count from public.date_experience_confirmations c
  join public.couple_members m on m.user_id = c.user_id and m.couple_id = v_couple
  where c.session_id = p_session_id;
  if v_count = 2 then
    update public.date_sessions set status = 'completed', updated_at = now()
    where id = p_session_id and status = 'in_progress';
    return true;
  end if;
  return false;
end;
$$;

revoke all on function public.start_date_experience(uuid), public.update_date_experience_step(uuid,smallint,text),
  public.set_date_experience_question(uuid,text,smallint), public.advance_date_experience_turn(uuid),
  public.finish_date_experience(uuid) from public, anon;
grant execute on function public.start_date_experience(uuid), public.update_date_experience_step(uuid,smallint,text),
  public.set_date_experience_question(uuid,text,smallint), public.advance_date_experience_turn(uuid),
  public.finish_date_experience(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'date_experience_progress') then
      execute 'alter publication supabase_realtime add table public.date_experience_progress';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'date_experience_confirmations') then
      execute 'alter publication supabase_realtime add table public.date_experience_confirmations';
    end if;
  end if;
end;
$$;

