create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.couples (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Nuestro espacio' check (char_length(name) between 1 and 80),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.couple_members (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (couple_id, user_id)
);

create table public.couple_invites (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.date_catalog (
  id text primary key,
  title text not null,
  category text not null check (category in ('conexión-y-conversación', 'aventuras-y-diversión', 'complicidad-y-equipo', 'romance-y-detalles', 'vida-cotidiana', 'conversaciones-importantes')),
  description text not null,
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  energy text not null check (energy in ('baja', 'media', 'alta')),
  setting text not null check (setting in ('interior', 'exterior', 'indistinto')),
  materials jsonb not null default '[]'::jsonb check (jsonb_typeof(materials) = 'array'),
  preparation text not null,
  prompts jsonb not null check (jsonb_typeof(prompts) = 'array' and jsonb_array_length(prompts) between 4 and 8),
  low_energy_alternative text not null,
  accessibility jsonb not null default '[]'::jsonb check (jsonb_typeof(accessibility) = 'array'),
  consent jsonb not null default '[]'::jsonb check (jsonb_typeof(consent) = 'array'),
  active boolean not null default true,
  sort_order smallint not null unique check (sort_order between 1 and 100),
  created_at timestamptz not null default now()
);

create table public.date_sessions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  status text not null default 'collecting' check (status in ('collecting', 'recommending', 'voting', 'confirmed', 'postponed', 'cancelled', 'in_progress', 'completed')),
  selected_date_id text references public.date_catalog(id),
  scheduled_for timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (couple_id, id)
);

create table public.date_responses (
  session_id uuid not null references public.date_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

-- Shared completion status is separate so a partner never reads private answers.
create table public.date_response_status (
  session_id uuid not null references public.date_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table public.date_recommendations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.date_sessions(id) on delete cascade,
  date_id text not null references public.date_catalog(id),
  position smallint not null check (position between 1 and 3),
  explanation text not null check (char_length(explanation) <= 500),
  preparation text not null check (char_length(preparation) <= 500),
  surprise text check (char_length(surprise) <= 300),
  prompts jsonb not null default '[]'::jsonb check (jsonb_typeof(prompts) = 'array' and jsonb_array_length(prompts) <= 3),
  created_at timestamptz not null default now(),
  unique (session_id, id),
  unique (session_id, position),
  unique (session_id, date_id)
);

create table public.date_votes (
  session_id uuid not null references public.date_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  recommendation_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (session_id, user_id),
  foreign key (session_id, recommendation_id) references public.date_recommendations(session_id, id) on delete cascade
);

create table public.date_memories (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  session_id uuid references public.date_sessions(id) on delete set null,
  title text not null check (char_length(title) between 1 and 120),
  description text check (char_length(description) <= 2000),
  happened_on date,
  favorite_part text check (char_length(favorite_part) <= 1000),
  song text check (char_length(song) <= 500),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (couple_id, session_id) references public.date_sessions(couple_id, id) on delete set null (session_id)
);

create table public.date_memory_confirmations (
  memory_id uuid not null references public.date_memories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  primary key (memory_id, user_id)
);

create table public.memory_photos (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.date_memories(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id),
  object_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic')),
  byte_size integer not null check (byte_size between 1 and 10485760),
  created_at timestamptz not null default now()
);

create table public.private_notes (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  date_id text not null references public.date_catalog(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, date_id)
);

create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  session_id uuid references public.date_sessions(id) on delete set null,
  requested_by uuid not null references auth.users(id),
  kind text not null check (kind in ('recommendations', 'prompts', 'activity')),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'fallback', 'failed')),
  created_at timestamptz not null default now()
);

create index date_sessions_couple_created on public.date_sessions(couple_id, created_at desc);
create index date_memories_couple_date on public.date_memories(couple_id, happened_on desc);
create index memory_photos_memory on public.memory_photos(memory_id);
create index private_notes_owner on public.private_notes(user_id, updated_at desc);
create index couple_members_couple on public.couple_members(couple_id);

create or replace function public.is_couple_member(target_couple uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.couple_members m where m.couple_id = target_couple and m.user_id = (select auth.uid()))
$$;

create or replace function public.create_profile_for_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80), ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.create_profile_for_user();

create or replace function public.create_couple()
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_couple uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if exists (select 1 from public.couple_members where user_id = auth.uid()) then raise exception 'account already belongs to a shared space'; end if;
  insert into public.couples (created_by) values (auth.uid()) returning id into new_couple;
  insert into public.couple_members (couple_id, user_id, role) values (new_couple, auth.uid(), 'owner');
  return new_couple;
end;
$$;

create or replace function public.create_couple_invite()
returns text language plpgsql security definer set search_path = '' as $$
declare member_couple uuid; invitation text; member_count integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select couple_id into member_couple from public.couple_members where user_id = auth.uid() and role = 'owner';
  if member_couple is null then raise exception 'only the space owner can create an invitation'; end if;
  perform 1 from public.couples where id = member_couple for update;
  select count(*) into member_count from public.couple_members where couple_id = member_couple;
  if member_count <> 1 then raise exception 'the shared space is already full'; end if;
  invitation := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.couple_invites (couple_id, token_hash, created_by, expires_at)
  values (member_couple, encode(extensions.digest(invitation, 'sha256'), 'hex'), auth.uid(), now() + interval '7 days');
  return invitation;
end;
$$;

create or replace function public.accept_couple_invite(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare invite_row public.couple_invites; member_count integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_token is null or p_token !~ '^[a-f0-9]{48}$' then raise exception 'invalid invitation'; end if;
  if exists (select 1 from public.couple_members where user_id = auth.uid()) then raise exception 'account already belongs to a shared space'; end if;
  select * into invite_row from public.couple_invites
    where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if not found or invite_row.used_at is not null or invite_row.expires_at <= now() then raise exception 'invitation is invalid, expired, or already used'; end if;
  perform 1 from public.couples where id = invite_row.couple_id for update;
  select count(*) into member_count from public.couple_members where couple_id = invite_row.couple_id;
  if member_count >= 2 then raise exception 'the shared space is full'; end if;
  insert into public.couple_members (couple_id, user_id, role) values (invite_row.couple_id, auth.uid(), 'member');
  update public.couple_invites set used_at = now() where id = invite_row.id;
  return invite_row.couple_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.couples enable row level security;
alter table public.couple_members enable row level security;
alter table public.couple_invites enable row level security;
alter table public.date_catalog enable row level security;
alter table public.date_sessions enable row level security;
alter table public.date_responses enable row level security;
alter table public.date_response_status enable row level security;
alter table public.date_recommendations enable row level security;
alter table public.date_votes enable row level security;
alter table public.date_memories enable row level security;
alter table public.date_memory_confirmations enable row level security;
alter table public.memory_photos enable row level security;
alter table public.private_notes enable row level security;
alter table public.favorites enable row level security;
alter table public.ai_generations enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy couples_read_members on public.couples for select to authenticated using (public.is_couple_member(id));
create policy members_read_same_space on public.couple_members for select to authenticated using (public.is_couple_member(couple_id));
create policy catalog_read_authenticated on public.date_catalog for select to authenticated using (active);
create policy sessions_read_members on public.date_sessions for select to authenticated using (public.is_couple_member(couple_id));
create policy sessions_create_members on public.date_sessions for insert to authenticated with check (public.is_couple_member(couple_id) and created_by = (select auth.uid()) and status = 'collecting' and selected_date_id is null and scheduled_for is null);
create policy responses_read_owner on public.date_responses for select to authenticated using (user_id = (select auth.uid()) and exists (select 1 from public.date_sessions s where s.id = session_id and public.is_couple_member(s.couple_id)));
create policy responses_insert_owner on public.date_responses for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.date_sessions s where s.id = session_id and public.is_couple_member(s.couple_id)));
create policy responses_update_owner on public.date_responses for update to authenticated using (user_id = (select auth.uid()) and exists (select 1 from public.date_sessions s where s.id = session_id and public.is_couple_member(s.couple_id))) with check (user_id = (select auth.uid()) and exists (select 1 from public.date_sessions s where s.id = session_id and public.is_couple_member(s.couple_id)));
create policy response_status_read_members on public.date_response_status for select to authenticated using (exists (select 1 from public.date_sessions s where s.id = session_id and public.is_couple_member(s.couple_id)));
create policy response_status_write_owner on public.date_response_status for all to authenticated using (user_id = (select auth.uid()) and exists (select 1 from public.date_sessions s where s.id = session_id and public.is_couple_member(s.couple_id))) with check (user_id = (select auth.uid()) and exists (select 1 from public.date_sessions s where s.id = session_id and public.is_couple_member(s.couple_id)));
create policy recommendations_read_members on public.date_recommendations for select to authenticated using (exists (select 1 from public.date_sessions s where s.id = session_id and public.is_couple_member(s.couple_id)));
create policy votes_read_members on public.date_votes for select to authenticated using (exists (select 1 from public.date_sessions s where s.id = session_id and public.is_couple_member(s.couple_id)));
create policy votes_insert_owner on public.date_votes for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.date_sessions s where s.id = session_id and public.is_couple_member(s.couple_id)));
create policy votes_update_owner on public.date_votes for update to authenticated using (user_id = (select auth.uid()) and exists (select 1 from public.date_sessions s where s.id = session_id and public.is_couple_member(s.couple_id))) with check (user_id = (select auth.uid()) and exists (select 1 from public.date_sessions s where s.id = session_id and public.is_couple_member(s.couple_id)));
create policy memories_read_members on public.date_memories for select to authenticated using (public.is_couple_member(couple_id));
create policy memories_insert_members on public.date_memories for insert to authenticated with check (public.is_couple_member(couple_id) and created_by = (select auth.uid()));
create policy memories_update_members on public.date_memories for update to authenticated using (public.is_couple_member(couple_id)) with check (public.is_couple_member(couple_id));
create policy memory_confirmations_read_members on public.date_memory_confirmations for select to authenticated using (exists (select 1 from public.date_memories m where m.id = memory_id and public.is_couple_member(m.couple_id)));
create policy memory_confirmations_insert_owner on public.date_memory_confirmations for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.date_memories m where m.id = memory_id and public.is_couple_member(m.couple_id)));
create policy memory_confirmations_delete_owner on public.date_memory_confirmations for delete to authenticated using (user_id = (select auth.uid()));
create policy photos_read_members on public.memory_photos for select to authenticated using (exists (select 1 from public.date_memories m where m.id = memory_id and public.is_couple_member(m.couple_id)));
create policy photos_insert_owner on public.memory_photos for insert to authenticated with check (uploaded_by = (select auth.uid()) and exists (select 1 from public.date_memories m where m.id = memory_id and public.is_couple_member(m.couple_id)));
create policy photos_delete_owner on public.memory_photos for delete to authenticated using (uploaded_by = (select auth.uid()));
create policy notes_read_owner on public.private_notes for select to authenticated using (user_id = (select auth.uid()) and public.is_couple_member(couple_id));
create policy notes_insert_owner on public.private_notes for insert to authenticated with check (user_id = (select auth.uid()) and public.is_couple_member(couple_id));
create policy notes_update_owner on public.private_notes for update to authenticated using (user_id = (select auth.uid()) and public.is_couple_member(couple_id)) with check (user_id = (select auth.uid()) and public.is_couple_member(couple_id));
create policy notes_delete_owner on public.private_notes for delete to authenticated using (user_id = (select auth.uid()));
create policy favorites_read_owner on public.favorites for select to authenticated using (user_id = (select auth.uid()) and public.is_couple_member(couple_id));
create policy favorites_insert_owner on public.favorites for insert to authenticated with check (user_id = (select auth.uid()) and public.is_couple_member(couple_id));
create policy favorites_delete_owner on public.favorites for delete to authenticated using (user_id = (select auth.uid()));
create policy ai_generations_read_members on public.ai_generations for select to authenticated using (public.is_couple_member(couple_id));

revoke all on public.profiles, public.couples, public.couple_members, public.couple_invites,
  public.date_catalog, public.date_sessions, public.date_responses, public.date_response_status,
  public.date_recommendations, public.date_votes, public.date_memories,
  public.date_memory_confirmations, public.memory_photos, public.private_notes,
  public.favorites, public.ai_generations from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select on public.couples, public.couple_members, public.date_catalog, public.date_recommendations, public.ai_generations to authenticated;
grant select, insert on public.date_sessions to authenticated;
grant select, insert, update on public.date_responses to authenticated;
grant select, insert, update on public.date_response_status to authenticated;
grant select, insert, update on public.date_votes to authenticated;
grant select, insert, update on public.date_memories to authenticated;
grant select, insert, delete on public.date_memory_confirmations to authenticated;
grant select, insert, delete on public.memory_photos to authenticated;
grant select, insert, update, delete on public.private_notes to authenticated;
grant select, insert, delete on public.favorites to authenticated;
grant execute on function public.is_couple_member(uuid) to authenticated;
revoke all on function public.is_couple_member(uuid) from public, anon;
revoke all on function public.create_profile_for_user() from public, anon, authenticated;
revoke all on function public.create_couple() from public, anon;
revoke all on function public.create_couple_invite() from public, anon;
revoke all on function public.accept_couple_invite(text) from public, anon;
grant execute on function public.create_couple(), public.create_couple_invite(), public.accept_couple_invite(text) to authenticated;
