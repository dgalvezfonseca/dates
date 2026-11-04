-- Keep one active planning flow per shared space. Postponed/cancelled sessions
-- remain in history and can be followed by a new planning flow.
create unique index date_sessions_one_active_per_couple
  on public.date_sessions (couple_id)
  where status in ('collecting', 'recommending', 'voting', 'confirmed', 'in_progress');

create table public.date_confirmations (
  session_id uuid not null references public.date_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  recommendation_id uuid not null,
  confirmed_at timestamptz not null default now(),
  primary key (session_id, user_id),
  foreign key (session_id, recommendation_id)
    references public.date_recommendations(session_id, id) on delete cascade
);
alter table public.date_confirmations enable row level security;
create policy date_confirmations_read_members on public.date_confirmations
  for select to authenticated using (
    exists (select 1 from public.date_sessions s where s.id = session_id and public.is_couple_member(s.couple_id))
  );
revoke all on public.date_confirmations from public, anon, authenticated;
grant select on public.date_confirmations to authenticated;

-- All state-changing RPCs bind the caller to auth.uid(), check membership,
-- and pin the search path because they run with the migration owner privileges.
create or replace function public.start_or_resume_date_session(p_couple_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_session uuid;
begin
  if v_user is null or not public.is_couple_member(p_couple_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  perform 1 from public.couples where id = p_couple_id for update;
  select id into v_session from public.date_sessions
    where couple_id = p_couple_id and status in ('collecting', 'recommending', 'voting', 'confirmed', 'in_progress')
    order by created_at desc limit 1;
  if v_session is null then
    insert into public.date_sessions (couple_id, created_by)
    values (p_couple_id, v_user) returning id into v_session;
  end if;
  return v_session;
end;
$$;

create or replace function public.save_date_response(p_session_id uuid, p_answers jsonb, p_submit boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_couple uuid;
  v_partner_submitted boolean;
begin
  if v_user is null or p_answers is null or jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 8192 then
    raise exception 'invalid response' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_answers) as keys(key) where key not in ('activity','mood','time','setting','discover','avoid')) then
    raise exception 'invalid response field' using errcode = '22023';
  end if;
  select couple_id into v_couple from public.date_sessions where id = p_session_id and status = 'collecting' for update;
  if v_couple is null or not public.is_couple_member(v_couple) then
    raise exception 'session is unavailable' using errcode = '42501';
  end if;
  if p_answers ? 'avoid' and (jsonb_typeof(p_answers->'avoid') <> 'array' or jsonb_array_length(p_answers->'avoid') > 10) then
    raise exception 'invalid restrictions' using errcode = '22023';
  end if;
  insert into public.date_responses(session_id,user_id,answers,submitted_at,updated_at)
  values (p_session_id,v_user,p_answers,case when p_submit then now() else null end,now())
  on conflict (session_id,user_id) do update set answers=excluded.answers, submitted_at=excluded.submitted_at, updated_at=now();
  insert into public.date_response_status(session_id,user_id,submitted_at,updated_at)
  values (p_session_id,v_user,case when p_submit then now() else null end,now())
  on conflict (session_id,user_id) do update set submitted_at=excluded.submitted_at, updated_at=now();
  select exists (select 1 from public.date_response_status s where s.session_id=p_session_id and s.user_id <> v_user and s.submitted_at is not null)
    into v_partner_submitted;
  return jsonb_build_object('submitted',p_submit,'partner_submitted',v_partner_submitted);
end;
$$;

create or replace function public.generate_date_recommendations(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_couple uuid;
  v_members uuid[];
  v_a jsonb;
  v_b jsonb;
  v_count integer;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'not authorized' using errcode='42501'; end if;
  select couple_id into v_couple from public.date_sessions where id=p_session_id for update;
  if v_couple is null or not public.is_couple_member(v_couple) then raise exception 'not authorized' using errcode='42501'; end if;
  select array_agg(user_id order by user_id) into v_members from public.couple_members where couple_id=v_couple;
  if cardinality(v_members) <> 2 or (select count(*) from public.date_response_status where session_id=p_session_id and user_id=any(v_members) and submitted_at is not null) <> 2 then
    raise exception 'both participants must submit first' using errcode='55000';
  end if;
  select answers into v_a from public.date_responses where session_id=p_session_id and user_id=v_members[1] and submitted_at is not null;
  select answers into v_b from public.date_responses where session_id=p_session_id and user_id=v_members[2] and submitted_at is not null;
  select count(*) into v_count from public.date_recommendations where session_id=p_session_id;
  if v_count not in (0,3) then raise exception 'incomplete recommendation set' using errcode='55000'; end if;
  if v_count=0 then
    with inputs as (
      select v_a as a, v_b as b
    ), scored as (
      select d.*,
        (case when d.category = case coalesce(a->>'activity','') when 'romantica' then 'romance-y-detalles' when 'aventura' then 'aventuras-y-diversión' when 'diversión' then 'aventuras-y-diversión' when 'conversación' then 'conexión-y-conversación' when 'creatividad' then 'complicidad-y-equipo' when 'algo-tranquilo' then 'vida-cotidiana' else '' end then 2 else 0 end
        + case when d.category = case coalesce(b->>'activity','') when 'romantica' then 'romance-y-detalles' when 'aventura' then 'aventuras-y-diversión' when 'diversión' then 'aventuras-y-diversión' when 'conversación' then 'conexión-y-conversación' when 'creatividad' then 'complicidad-y-equipo' when 'algo-tranquilo' then 'vida-cotidiana' else '' end then 2 else 0 end
        + case when (a->>'discover'='suenos' and d.category in ('conexión-y-conversación','conversaciones-importantes')) or (a->>'discover'='divertido' and d.category='aventuras-y-diversión') or (a->>'discover'='pensamiento' and d.category in ('conexión-y-conversación','conversaciones-importantes')) or (a->>'discover'='colaborar' and d.category='complicidad-y-equipo') then 1 else 0 end
        + case when (b->>'discover'='suenos' and d.category in ('conexión-y-conversación','conversaciones-importantes')) or (b->>'discover'='divertido' and d.category='aventuras-y-diversión') or (b->>'discover'='pensamiento' and d.category in ('conexión-y-conversación','conversaciones-importantes')) or (b->>'discover'='colaborar' and d.category='complicidad-y-equipo') then 1 else 0 end
        + case when d.energy='baja' and (a->>'mood'='necesito-tranquilidad' or b->>'mood'='necesito-tranquilidad') then 2 else 0 end
        + case when d.energy='alta' and (a->>'mood'='mucha-energia' or b->>'mood'='mucha-energia') then 1 else 0 end
        + case when d.category='aventuras-y-diversión' and (a->>'mood'='distraerme' or b->>'mood'='distraerme') then 1 else 0 end
        + case when d.category in ('conexión-y-conversación','romance-y-detalles') and (a->>'mood'='conectar' or b->>'mood'='conectar') then 1 else 0 end
        + case when d.setting='indistinto' or coalesce(a->>'setting','cualquiera')='indistinto' or coalesce(b->>'setting','cualquiera')='indistinto' or a->>'setting'=b->>'setting' or (d.setting=any(array[a->>'setting',b->>'setting'])) then 1 else 0 end
        + case when (a->>'time'='1-2-horas' or b->>'time'='1-2-horas') and d.duration_minutes<=120 then 2 when (a->>'time'='medio-dia' or b->>'time'='medio-dia') and d.duration_minutes<=300 then 1 else 0 end
        ) as score
      from public.date_catalog d cross join inputs
      where d.active
        and not (d.id=any(array(select jsonb_array_elements_text(coalesce(a->'avoid','[]'::jsonb))) || array(select jsonb_array_elements_text(coalesce(b->'avoid','[]'::jsonb)))))
        and ((coalesce(a->>'time','')<>'1-2-horas' and coalesce(b->>'time','')<>'1-2-horas') or d.duration_minutes<=120)
        and ((coalesce(a->>'time','')<>'medio-dia' and coalesce(b->>'time','')<>'medio-dia') or d.duration_minutes<=300)
        and not exists (select 1 from public.date_sessions old where old.couple_id=v_couple and old.status='completed' and old.selected_date_id=d.id)
    ), top as (
      select *, row_number() over (order by score desc,sort_order) as pos from scored
    )
    insert into public.date_recommendations(session_id,date_id,position,explanation,preparation,prompts)
      select p_session_id,id,pos::smallint,
        case when score>=5 then 'Recoge varios de sus intereses y deja espacio para que cada quien aporte a su manera.' when score>=2 then 'Equilibra curiosidad y comodidad con una experiencia que pueden adaptar entre los dos.' else 'Una opción flexible para descubrir algo nuevo, sin tener que coincidir en todo.' end,
        left(preparation,500), (select coalesce(jsonb_agg(q.value),'[]'::jsonb) from (select value from jsonb_array_elements(prompts) with ordinality as x(value,n) order by n limit 3) q)
      from top where pos<=3;
    get diagnostics v_count = row_count;
    if v_count <> 3 then raise exception 'not enough activities after restrictions; adjust one or more restrictions' using errcode='22023'; end if;
  end if;
  update public.date_sessions set status='voting',updated_at=now() where id=p_session_id and status in ('collecting','recommending','voting');
  select jsonb_agg(jsonb_build_object('id',r.id,'date_id',r.date_id,'position',r.position,'explanation',r.explanation,'preparation',r.preparation,'prompts',r.prompts,'title',d.title,'category',d.category,'duration_minutes',d.duration_minutes,'energy',d.energy,'setting',d.setting) order by r.position)
    into v_result from public.date_recommendations r join public.date_catalog d on d.id=r.date_id where r.session_id=p_session_id;
  return v_result;
end;
$$;

create or replace function public.vote_date_recommendation(p_session_id uuid,p_recommendation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_couple uuid;
begin
  if auth.uid() is null then raise exception 'not authorized' using errcode='42501'; end if;
  select couple_id into v_couple from public.date_sessions where id=p_session_id for update;
  if v_couple is null or not public.is_couple_member(v_couple) or not exists(select 1 from public.date_sessions where id=p_session_id and status='voting') then raise exception 'session is not open for voting' using errcode='55000'; end if;
  if not exists(select 1 from public.date_recommendations where id=p_recommendation_id and session_id=p_session_id) then raise exception 'invalid recommendation' using errcode='22023'; end if;
  insert into public.date_votes(session_id,user_id,recommendation_id) values(p_session_id,auth.uid(),p_recommendation_id)
    on conflict(session_id,user_id) do update set recommendation_id=excluded.recommendation_id,updated_at=now();
  delete from public.date_confirmations where session_id=p_session_id and user_id=auth.uid();
end;
$$;

create or replace function public.confirm_date_recommendation(p_session_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_couple uuid; v_recommendation uuid; v_members uuid[]; v_matches integer;
begin
  if auth.uid() is null then raise exception 'not authorized' using errcode='42501'; end if;
  select couple_id into v_couple from public.date_sessions where id=p_session_id for update;
  if v_couple is null or not public.is_couple_member(v_couple) then raise exception 'not authorized' using errcode='42501'; end if;
  select recommendation_id into v_recommendation from public.date_votes where session_id=p_session_id and user_id=auth.uid();
  if v_recommendation is null then raise exception 'vote before confirming' using errcode='55000'; end if;
  select array_agg(user_id order by user_id) into v_members from public.couple_members where couple_id=v_couple;
  select count(*) into v_matches from public.date_votes where session_id=p_session_id and user_id=any(v_members) and recommendation_id=v_recommendation;
  if cardinality(v_members) <> 2 or v_matches <> 2 then raise exception 'both participants must choose the same experience' using errcode='55000'; end if;
  insert into public.date_confirmations(session_id,user_id,recommendation_id) values(p_session_id,auth.uid(),v_recommendation)
    on conflict(session_id,user_id) do update set recommendation_id=excluded.recommendation_id,confirmed_at=now();
  if (select count(*) from public.date_confirmations where session_id=p_session_id and user_id=any(v_members) and recommendation_id=v_recommendation)=2 then
    update public.date_sessions set status='confirmed',selected_date_id=(select date_id from public.date_recommendations where id=v_recommendation and session_id=p_session_id),updated_at=now() where id=p_session_id and status='voting';
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.close_date_session(p_session_id uuid,p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_couple uuid;
begin
  if p_status not in ('postponed','cancelled') or auth.uid() is null then raise exception 'invalid request' using errcode='22023'; end if;
  select couple_id into v_couple from public.date_sessions where id=p_session_id for update;
  if v_couple is null or not public.is_couple_member(v_couple) then raise exception 'not authorized' using errcode='42501'; end if;
  update public.date_sessions set status=p_status,updated_at=now() where id=p_session_id and status in ('collecting','voting','confirmed');
  if not found then raise exception 'session cannot be changed' using errcode='55000'; end if;
end;
$$;

revoke insert, update on public.date_sessions, public.date_responses, public.date_response_status, public.date_votes from authenticated;
grant select on public.date_sessions, public.date_responses, public.date_response_status, public.date_votes to authenticated;
revoke all on function public.start_or_resume_date_session(uuid), public.save_date_response(uuid,jsonb,boolean), public.generate_date_recommendations(uuid), public.vote_date_recommendation(uuid,uuid), public.confirm_date_recommendation(uuid), public.close_date_session(uuid,text) from public, anon;
grant execute on function public.start_or_resume_date_session(uuid), public.save_date_response(uuid,jsonb,boolean), public.generate_date_recommendations(uuid), public.vote_date_recommendation(uuid,uuid), public.confirm_date_recommendation(uuid), public.close_date_session(uuid,text) to authenticated;
