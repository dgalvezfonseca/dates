create or replace function public.confirm_date_recommendation(p_session_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_couple uuid; v_status text; v_recommendation uuid; v_members uuid[]; v_matches integer;
begin
  if auth.uid() is null then raise exception 'not authorized' using errcode='42501'; end if;
  select couple_id,status into v_couple,v_status from public.date_sessions where id=p_session_id for update;
  if v_couple is null or not public.is_couple_member(v_couple) then raise exception 'not authorized' using errcode='42501'; end if;
  if v_status='confirmed' then
    return exists (
      select 1 from public.date_confirmations mine
      join public.date_confirmations partner on partner.session_id=mine.session_id and partner.user_id<>mine.user_id and partner.recommendation_id=mine.recommendation_id
      join public.date_recommendations r on r.session_id=mine.session_id and r.id=mine.recommendation_id
      where mine.session_id=p_session_id and mine.user_id=auth.uid() and v_couple is not null
        and r.date_id=(select selected_date_id from public.date_sessions where id=p_session_id)
    );
  end if;
  if v_status<>'voting' then raise exception 'session is not open for confirmation' using errcode='55000'; end if;
  select recommendation_id into v_recommendation from public.date_votes where session_id=p_session_id and user_id=auth.uid();
  if v_recommendation is null then raise exception 'vote before confirming' using errcode='55000'; end if;
  select array_agg(user_id order by user_id) into v_members from public.couple_members where couple_id=v_couple;
  select count(*) into v_matches from public.date_votes where session_id=p_session_id and user_id=any(v_members) and recommendation_id=v_recommendation;
  if cardinality(v_members)<>2 or v_matches<>2 then raise exception 'both participants must choose the same experience' using errcode='55000'; end if;
  insert into public.date_confirmations(session_id,user_id,recommendation_id) values(p_session_id,auth.uid(),v_recommendation)
    on conflict(session_id,user_id) do update set recommendation_id=excluded.recommendation_id,confirmed_at=now();
  if (select count(*) from public.date_confirmations where session_id=p_session_id and user_id=any(v_members) and recommendation_id=v_recommendation)=2 then
    update public.date_sessions set status='confirmed',selected_date_id=(select date_id from public.date_recommendations where id=v_recommendation and session_id=p_session_id),updated_at=now() where id=p_session_id and status='voting';
    if not found then raise exception 'session state changed during confirmation' using errcode='55000'; end if;
    return true;
  end if;
  return false;
end;
$$;

revoke all on function public.confirm_date_recommendation(uuid) from public, anon;
grant execute on function public.confirm_date_recommendation(uuid) to authenticated;
