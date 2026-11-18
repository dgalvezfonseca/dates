-- Let a person who created a circle but is still alone in it accept the other person's invitation.
--
-- Before: accept_couple_invite rejected anyone already in couple_members, so pressing "Crear círculo"
-- by mistake locked the account out of joining forever (production had 4 one-owner circles and no
-- used invitation). After: if the caller is the ONLY member and owner of their own circle, and that
-- circle has no shared activity, the empty circle is closed in the same transaction and the caller
-- joins the inviting circle. Personal favorites and private notes move with the caller. Everything
-- else is unchanged: a circle that already has two people, or any shared activity, still blocks it,
-- circles stay capped at two, the token is single-use and hashed, and no new grants are added.

create or replace function public.accept_couple_invite(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  invite_row public.couple_invites;
  member_count integer;
  own_couple uuid;
  own_role text;
  own_count integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_token is null or p_token !~ '^[a-f0-9]{48}$' then raise exception 'invalid invitation'; end if;

  select * into invite_row from public.couple_invites
    where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if not found or invite_row.used_at is not null or invite_row.expires_at <= now() then
    raise exception 'invitation is invalid, expired, or already used';
  end if;

  select couple_id, role into own_couple, own_role from public.couple_members where user_id = auth.uid();
  if own_couple is not null then
    if own_couple = invite_row.couple_id then raise exception 'invitation belongs to your own shared space'; end if;
    perform 1 from public.couples where id = own_couple for update;
    select count(*) into own_count from public.couple_members where couple_id = own_couple;
    if own_role <> 'owner' or own_count <> 1 then raise exception 'account already belongs to a shared space'; end if;
    if exists (select 1 from public.date_sessions where couple_id = own_couple)
       or exists (select 1 from public.date_memories where couple_id = own_couple)
       or exists (select 1 from public.private_notes where couple_id = own_couple and (user_id <> auth.uid() or session_id is not null))
       or exists (select 1 from public.favorites where couple_id = own_couple and user_id <> auth.uid()) then
      raise exception 'your shared space already has shared activity';
    end if;
    -- ai_generations exists in production but not in staging (documented drift); only query it if present.
    if to_regclass('public.ai_generations') is not null then
      if exists (select 1 from public.ai_generations where couple_id = own_couple) then
        raise exception 'your shared space already has shared activity';
      end if;
    end if;
  end if;

  perform 1 from public.couples where id = invite_row.couple_id for update;
  select count(*) into member_count from public.couple_members where couple_id = invite_row.couple_id;
  if member_count >= 2 then raise exception 'the shared space is full'; end if;

  if own_couple is not null then
    update public.favorites set couple_id = invite_row.couple_id where couple_id = own_couple and user_id = auth.uid();
    update public.private_notes set couple_id = invite_row.couple_id where couple_id = own_couple and user_id = auth.uid();
    -- Cascades only to the caller's own membership and that circle's unused invitations.
    delete from public.couples where id = own_couple;
  end if;

  insert into public.couple_members (couple_id, user_id, role) values (invite_row.couple_id, auth.uid(), 'member');
  update public.couple_invites set used_at = now() where id = invite_row.id;
  return invite_row.couple_id;
end;
$$;

revoke all on function public.accept_couple_invite(text) from public, anon;
grant execute on function public.accept_couple_invite(text) to authenticated;
