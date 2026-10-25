-- Katha v1 schema.
-- Safe on a fresh project and safe to re-run. On a database that still has the
-- old notes/replies tables, run migrations/20261025100000_migrate_legacy_notes.sql
-- right after this file.
--
-- Write model: clients never insert stories, voice notes, chain letters, places,
-- "I felt this too", views, postcards, comments, DM requests or DM messages.
-- Those go through the api container, which checks GPS, moderates text and
-- writes with the service_role key (bypasses RLS). Clients write directly only:
-- their profile, reports, blocks, DM accept/decline, and read receipts.
-- Notifications are written by triggers.

-- ===== Helpers =====

create or replace function public.distance_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language sql immutable parallel safe as $$
  select 6371000 * 2 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )))
$$;

-- ===== Profiles & places =====

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);

create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 200),
  lat double precision not null,
  lng double precision not null,
  radius_m int not null default 50 check (radius_m between 10 and 500),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Upgrade the pre-v1 places table: rename radius_meters, and stop a deleted
-- account from cascading away the place and everything pinned to it.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'places' and column_name = 'radius_meters'
  ) then
    alter table public.places rename column radius_meters to radius_m;
  end if;

  alter table public.places drop constraint if exists places_created_by_fkey;
  alter table public.places alter column created_by drop not null;
  alter table public.places
    add constraint places_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;

  alter table public.places drop constraint if exists places_lat_range;
  alter table public.places drop constraint if exists places_lng_range;
  alter table public.places add constraint places_lat_range check (lat between -90 and 90);
  alter table public.places add constraint places_lng_range check (lng between -180 and 180);
end $$;

create index if not exists places_lat_lng_idx on public.places (lat, lng);

-- ===== Content (created only at the place) =====
-- Context fields on every item: feeling, time_of_day, weather_label,
-- weather_temp (degrees Fahrenheit), campus_moment. All optional.

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete restrict,
  author_id uuid not null references public.profiles(id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 200),
  photo_path text,
  feeling text check (feeling in ('calm','homesick','hopeful','tired','grateful','lonely','happy','nervous')),
  time_of_day text check (time_of_day in ('dawn','morning','afternoon','evening','late_night')),
  weather_label text,
  weather_temp real,
  campus_moment text,
  created_at timestamptz not null default now()
);

create index if not exists stories_place_created_idx on public.stories (place_id, created_at desc);
create index if not exists stories_author_idx on public.stories (author_id, created_at desc);

create table if not exists public.voice_notes (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete restrict,
  author_id uuid not null references public.profiles(id) on delete cascade,
  audio_path text not null,
  duration_s real not null check (duration_s > 0 and duration_s <= 45),
  transcript text,
  feeling text check (feeling in ('calm','homesick','hopeful','tired','grateful','lonely','happy','nervous')),
  time_of_day text check (time_of_day in ('dawn','morning','afternoon','evening','late_night')),
  weather_label text,
  weather_temp real,
  campus_moment text,
  created_at timestamptz not null default now()
);

create index if not exists voice_notes_place_created_idx on public.voice_notes (place_id, created_at desc);
create index if not exists voice_notes_author_idx on public.voice_notes (author_id, created_at desc);

create table if not exists public.chains (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null unique references public.places(id) on delete restrict,
  theme_prompt text check (char_length(theme_prompt) between 1 and 200),
  latest_letter_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.chain_letters (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references public.chains(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  answers_letter_id uuid references public.chain_letters(id) on delete set null,
  text text not null check (char_length(btrim(text)) between 1 and 1000),
  feeling text check (feeling in ('calm','homesick','hopeful','tired','grateful','lonely','happy','nervous')),
  time_of_day text check (time_of_day in ('dawn','morning','afternoon','evening','late_night')),
  weather_label text,
  weather_temp real,
  campus_moment text,
  created_at timestamptz not null default now()
);

-- Concurrency backstop for the chain: a letter can be answered only once, and
-- a chain can have only one opening letter. The api also checks latest_letter_id.
create unique index if not exists chain_letters_answers_once_idx
  on public.chain_letters (answers_letter_id) where answers_letter_id is not null;
create unique index if not exists chain_letters_one_opening_idx
  on public.chain_letters (chain_id) where answers_letter_id is null;
create index if not exists chain_letters_author_idx on public.chain_letters (author_id, created_at desc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chains_latest_letter_fkey') then
    alter table public.chains
      add constraint chains_latest_letter_fkey
      foreign key (latest_letter_id) references public.chain_letters(id) on delete set null;
  end if;
end $$;

-- A new letter becomes its chain's latest in the same transaction as the insert,
-- so the pointer can never lag behind the letters.
create or replace function public.set_chain_latest_letter()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.chains set latest_letter_id = new.id where id = new.chain_id;
  return new;
end $$;

drop trigger if exists chain_letters_set_latest on public.chain_letters;
create trigger chain_letters_set_latest
  after insert on public.chain_letters
  for each row execute function public.set_chain_latest_letter();

-- ===== Reactions, views, comments =====

create table if not exists public.felt_this_too (
  item_type text not null check (item_type in ('story','voice_note','chain_letter')),
  item_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_type, item_id, user_id)
);

create table if not exists public.item_views (
  item_type text not null check (item_type in ('story','voice_note','chain_letter')),
  item_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (item_type, item_id, user_id)
);

create index if not exists item_views_item_idx on public.item_views (item_type, item_id);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists comments_story_idx on public.comments (story_id, created_at);
create index if not exists comments_author_idx on public.comments (author_id, created_at desc);

-- ===== DMs =====

create table if not exists public.dm_threads (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  source_comment_id uuid references public.comments(id) on delete set null,
  status text not null default 'requested' check (status in ('requested','accepted','declined')),
  opening_message text check (char_length(opening_message) <= 500),
  created_at timestamptz not null default now(),
  check (requester_id <> recipient_id)
);

alter table public.dm_threads
  add column if not exists opening_message text check (char_length(opening_message) <= 500);

-- One thread per pair of people, whoever asked first.
create unique index if not exists dm_threads_pair_idx on public.dm_threads (
  least(requester_id, recipient_id), greatest(requester_id, recipient_id)
);

create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.dm_threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists dm_messages_thread_idx on public.dm_messages (thread_id, created_at);

-- ===== Postcards, notifications, safety =====

-- AI watercolor of the place for one story, voice note or chain letter.
create table if not exists public.postcards (
  id uuid primary key default gen_random_uuid(),
  story_id uuid references public.stories(id) on delete cascade,
  voice_note_id uuid references public.voice_notes(id) on delete cascade,
  chain_letter_id uuid references public.chain_letters(id) on delete cascade,
  image_path text not null,
  created_at timestamptz not null default now()
);

alter table public.postcards alter column story_id drop not null;
alter table public.postcards add column if not exists voice_note_id uuid references public.voice_notes(id) on delete cascade;
alter table public.postcards add column if not exists chain_letter_id uuid references public.chain_letters(id) on delete cascade;
alter table public.postcards drop constraint if exists postcards_one_item;
alter table public.postcards add constraint postcards_one_item
  check (num_nonnulls(story_id, voice_note_id, chain_letter_id) = 1);

create unique index if not exists postcards_story_once_idx on public.postcards (story_id) where story_id is not null;
create unique index if not exists postcards_voice_once_idx on public.postcards (voice_note_id) where voice_note_id is not null;
create unique index if not exists postcards_letter_once_idx on public.postcards (chain_letter_id) where chain_letter_id is not null;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('comment','chain_reply','dm_request','dm_message')),
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  item_type text not null check (item_type in ('story','voice_note','chain_letter','comment','dm_message')),
  item_id uuid not null,
  reason text check (char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  unique (reporter_id, item_type, item_id)
);

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- True when the signed-in user and `other` have blocked each other in either direction.
create or replace function public.blocked_with(other uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = auth.uid() and blocked_id = other)
       or (blocker_id = other and blocked_id = auth.uid())
  )
$$;

-- ===== Row Level Security =====

alter table public.profiles      enable row level security;
alter table public.places        enable row level security;
alter table public.stories       enable row level security;
alter table public.voice_notes   enable row level security;
alter table public.chains        enable row level security;
alter table public.chain_letters enable row level security;
alter table public.felt_this_too enable row level security;
alter table public.item_views    enable row level security;
alter table public.comments      enable row level security;
alter table public.dm_threads    enable row level security;
alter table public.dm_messages   enable row level security;
alter table public.postcards     enable row level security;
alter table public.notifications enable row level security;
alter table public.reports       enable row level security;
alter table public.blocks        enable row level security;

-- Profiles
drop policy if exists "read profiles"      on public.profiles;
drop policy if exists "insert own profile" on public.profiles;
drop policy if exists "update own profile" on public.profiles;
create policy "read profiles"      on public.profiles for select to authenticated using (true);
create policy "insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "update own profile" on public.profiles for update to authenticated using (auth.uid() = id);

-- Places: readable by everyone signed in; created by the api only.
drop policy if exists "read places"       on public.places;
drop policy if exists "create places"     on public.places;
drop policy if exists "update own places" on public.places;
drop policy if exists "delete own places" on public.places;
create policy "read places" on public.places for select to authenticated using (true);

-- Stories: public from anywhere, hidden across a block.
drop policy if exists "read stories" on public.stories;
create policy "read stories" on public.stories for select to authenticated
  using (not public.blocked_with(author_id));

-- Voice notes and chain letters: authors only. Everyone else unlocks them
-- through the api, which checks GPS and returns content plus signed URLs.
drop policy if exists "read own voice notes" on public.voice_notes;
create policy "read own voice notes" on public.voice_notes for select to authenticated
  using (author_id = auth.uid());

drop policy if exists "read chains" on public.chains;
create policy "read chains" on public.chains for select to authenticated using (true);

drop policy if exists "read own chain letters" on public.chain_letters;
create policy "read own chain letters" on public.chain_letters for select to authenticated
  using (author_id = auth.uid());

-- "I felt this too" and views: each user sees only their own rows.
drop policy if exists "read own felt" on public.felt_this_too;
create policy "read own felt" on public.felt_this_too for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "read own views" on public.item_views;
create policy "read own views" on public.item_views for select to authenticated
  using (user_id = auth.uid());

-- Comments, DM requests and DM messages are written by the api (moderation and
-- block checks happen there). Clients read them, delete their own comments,
-- answer DM requests and mark messages read.

-- Comments: readable from anywhere. The stories subquery applies stories' RLS,
-- so comments on a blocked author's story are hidden.
drop policy if exists "read comments"       on public.comments;
drop policy if exists "create comments"     on public.comments;
drop policy if exists "delete own comments" on public.comments;
create policy "read comments" on public.comments for select to authenticated
  using (
    not public.blocked_with(author_id)
    and exists (select 1 from public.stories s where s.id = story_id)
  );
create policy "delete own comments" on public.comments for delete to authenticated
  using (author_id = auth.uid());

-- DM threads: only the recipient may accept or decline, and only while the request is open.
drop policy if exists "read own threads"    on public.dm_threads;
drop policy if exists "request thread"      on public.dm_threads;
drop policy if exists "answer thread"       on public.dm_threads;
create policy "read own threads" on public.dm_threads for select to authenticated
  using (
    auth.uid() in (requester_id, recipient_id)
    and not public.blocked_with(case when requester_id = auth.uid() then recipient_id else requester_id end)
  );
create policy "answer thread" on public.dm_threads for update to authenticated
  using (recipient_id = auth.uid() and status = 'requested')
  with check (status in ('accepted','declined'));

revoke update on public.dm_threads from anon, authenticated;
grant update (status) on public.dm_threads to authenticated;

-- DM messages: participants of an unblocked thread.
drop policy if exists "read thread messages" on public.dm_messages;
drop policy if exists "send message"         on public.dm_messages;
drop policy if exists "mark message read"    on public.dm_messages;
create policy "read thread messages" on public.dm_messages for select to authenticated
  using (exists (select 1 from public.dm_threads t where t.id = thread_id));
create policy "mark message read" on public.dm_messages for update to authenticated
  using (
    sender_id <> auth.uid()
    and exists (select 1 from public.dm_threads t where t.id = thread_id)
  );

revoke update on public.dm_messages from anon, authenticated;
grant update (read_at) on public.dm_messages to authenticated;

-- Postcards follow their item's visibility: story watercolors are public like
-- stories; voice note and chain letter watercolors are readable by their author
-- (everyone else receives them from the api's unlock, at the place).
drop policy if exists "read postcards" on public.postcards;
create policy "read postcards" on public.postcards for select to authenticated
  using (
    exists (select 1 from public.stories s where s.id = story_id)
    or exists (select 1 from public.voice_notes v where v.id = voice_note_id)
    or exists (select 1 from public.chain_letters l where l.id = chain_letter_id)
  );

-- Notifications: own only; the client may only mark them read.
drop policy if exists "read own notifications" on public.notifications;
drop policy if exists "mark notification read" on public.notifications;
create policy "read own notifications" on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy "mark notification read" on public.notifications for update to authenticated
  using (user_id = auth.uid());

revoke update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Reports and blocks: own rows.
drop policy if exists "read own reports" on public.reports;
drop policy if exists "create report"    on public.reports;
create policy "read own reports" on public.reports for select to authenticated
  using (reporter_id = auth.uid());
create policy "create report" on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());

drop policy if exists "read own blocks" on public.blocks;
drop policy if exists "create block"    on public.blocks;
drop policy if exists "remove block"    on public.blocks;
create policy "read own blocks" on public.blocks for select to authenticated
  using (blocker_id = auth.uid());
create policy "create block" on public.blocks for insert to authenticated
  with check (blocker_id = auth.uid());
create policy "remove block" on public.blocks for delete to authenticated
  using (blocker_id = auth.uid());

-- ===== Read helpers =====

-- Places in a map area with counts, recent feelings and last activity. Never
-- returns content or authors, so locked items can be teased from anywhere.
create or replace function public.place_summaries(
  south double precision, north double precision,
  west double precision, east double precision
) returns table (
  id uuid, name text, description text,
  lat double precision, lng double precision, radius_m int,
  story_count int, voice_count int, has_chain boolean,
  last_activity timestamptz, feelings text[]
)
language sql stable security definer set search_path = '' as $$
  with items as (
    select s.place_id, s.feeling, s.created_at from public.stories s
      where not public.blocked_with(s.author_id)
    union all
    select v.place_id, v.feeling, v.created_at from public.voice_notes v
      where not public.blocked_with(v.author_id)
    union all
    select c.place_id, l.feeling, l.created_at from public.chain_letters l
      join public.chains c on c.id = l.chain_id
      where not public.blocked_with(l.author_id)
  )
  select
    p.id, p.name, p.description, p.lat, p.lng, p.radius_m,
    (select count(*) from public.stories s where s.place_id = p.id and not public.blocked_with(s.author_id))::int,
    (select count(*) from public.voice_notes v where v.place_id = p.id and not public.blocked_with(v.author_id))::int,
    exists (select 1 from public.chains c where c.place_id = p.id and c.latest_letter_id is not null),
    (select max(i.created_at) from items i where i.place_id = p.id),
    array(
      select i.feeling from items i
      where i.place_id = p.id and i.feeling is not null
      order by i.created_at desc limit 20
    )
  from public.places p
  where p.lat between south and north
    and (case when west <= east then p.lng between west and east
              else p.lng >= west or p.lng <= east end)
$$;

-- "I felt this too" counts, visible only to the author of each item.
create or replace function public.my_felt_counts()
returns table (item_type text, item_id uuid, count int)
language sql stable security definer set search_path = '' as $$
  select f.item_type, f.item_id, count(*)::int
  from public.felt_this_too f
  where (f.item_type = 'story' and exists (
          select 1 from public.stories s where s.id = f.item_id and s.author_id = auth.uid()))
     or (f.item_type = 'voice_note' and exists (
          select 1 from public.voice_notes v where v.id = f.item_id and v.author_id = auth.uid()))
     or (f.item_type = 'chain_letter' and exists (
          select 1 from public.chain_letters l where l.id = f.item_id and l.author_id = auth.uid()))
  group by f.item_type, f.item_id
$$;

revoke execute on function public.place_summaries(double precision, double precision, double precision, double precision) from public, anon;
revoke execute on function public.my_felt_counts() from public, anon;
grant execute on function public.place_summaries(double precision, double precision, double precision, double precision) to authenticated;
grant execute on function public.my_felt_counts() to authenticated;

-- ===== Notifications (written by triggers) =====

create or replace function public.notify_comment()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  story_author uuid;
  story_place uuid;
begin
  select s.author_id, s.place_id into story_author, story_place
  from public.stories s where s.id = new.story_id;
  if story_author is not null and story_author <> new.author_id then
    insert into public.notifications (user_id, type, payload)
    values (story_author, 'comment', jsonb_build_object(
      'story_id', new.story_id,
      'comment_id', new.id,
      'place_name', (select name from public.places where id = story_place),
      'from_name', (select display_name from public.profiles where id = new.author_id)
    ));
  end if;
  return new;
end $$;

create or replace function public.notify_chain_reply()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  answered_author uuid;
  chain_place uuid;
begin
  if new.answers_letter_id is null then return new; end if;
  select author_id into answered_author from public.chain_letters where id = new.answers_letter_id;
  select place_id into chain_place from public.chains where id = new.chain_id;
  if answered_author is not null and answered_author <> new.author_id then
    insert into public.notifications (user_id, type, payload)
    values (answered_author, 'chain_reply', jsonb_build_object(
      'place_id', chain_place,
      'place_name', (select name from public.places where id = chain_place)
    ));
  end if;
  return new;
end $$;

create or replace function public.notify_dm_request()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, type, payload)
  values (new.recipient_id, 'dm_request', jsonb_build_object(
    'thread_id', new.id,
    'from_name', (select display_name from public.profiles where id = new.requester_id)
  ));
  return new;
end $$;

create or replace function public.notify_dm_message()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  other uuid;
begin
  select case when t.requester_id = new.sender_id then t.recipient_id else t.requester_id end
  into other from public.dm_threads t where t.id = new.thread_id;
  insert into public.notifications (user_id, type, payload)
  values (other, 'dm_message', jsonb_build_object(
    'thread_id', new.thread_id,
    'from_name', (select display_name from public.profiles where id = new.sender_id)
  ));
  return new;
end $$;

drop trigger if exists comments_notify on public.comments;
create trigger comments_notify after insert on public.comments
  for each row execute function public.notify_comment();

drop trigger if exists chain_letters_notify on public.chain_letters;
create trigger chain_letters_notify after insert on public.chain_letters
  for each row execute function public.notify_chain_reply();

drop trigger if exists dm_threads_notify on public.dm_threads;
create trigger dm_threads_notify after insert on public.dm_threads
  for each row execute function public.notify_dm_request();

drop trigger if exists dm_messages_notify on public.dm_messages;
create trigger dm_messages_notify after insert on public.dm_messages
  for each row execute function public.notify_dm_message();

-- ===== Storage =====
-- story-photos and postcards are public images. voice-notes is private:
-- authors read their own files (stored under <author_id>/...); everyone else
-- gets a short-lived signed URL from the api after the GPS check.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('story-photos', 'story-photos', true,  5242880, array['image/jpeg','image/png','image/webp']),
  ('voice-notes',  'voice-notes',  false, 2097152, array['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav']),
  ('postcards',    'postcards',    true,  5242880, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

drop policy if exists "authors read own voice files" on storage.objects;
create policy "authors read own voice files" on storage.objects for select to authenticated
  using (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = auth.uid()::text);

-- ===== Realtime =====

do $$
declare
  t text;
begin
  foreach t in array array['notifications','dm_messages','dm_threads'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
