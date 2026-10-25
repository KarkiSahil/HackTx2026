-- Moves pre-v1 notes/replies into the v1 tables. Run after supabase/schema.sql.
-- Runs once: it renames notes -> legacy_notes and replies -> legacy_replies,
-- so a second run finds no notes table and does nothing. Nothing is dropped;
-- the legacy tables keep every original row, readable by its own author.
--
--   memory notes -> stories (text over 200 chars is shortened; full text stays in legacy_notes)
--   letter notes -> chain_letters, one chain per place, linked oldest to newest
--   replies on memories -> comments; replies on letters stay only in legacy_replies
--   notes without a place -> nearest place whose radius contains them, else a new "Pinned spot"

begin;

create function pg_temp.time_of_day_at(ts timestamptz) returns text
language sql stable as $$
  select case
    when h >= 5  and h < 7  then 'dawn'
    when h >= 7  and h < 12 then 'morning'
    when h >= 12 and h < 17 then 'afternoon'
    when h >= 17 and h < 22 then 'evening'
    else 'late_night'
  end
  from (select extract(hour from ts at time zone 'America/Chicago')::int as h) s
$$;

do $$
declare
  n record;
  target_place uuid;
  target_chain uuid;
  previous_letter uuid;
  new_id uuid;
begin
  if to_regclass('public.notes') is null then
    raise notice 'No notes table found; nothing to migrate.';
    return;
  end if;

  alter table public.notes rename to legacy_notes;
  alter table public.replies rename to legacy_replies;

  create temporary table story_map (note_id uuid primary key, story_id uuid not null) on commit drop;

  for n in select * from public.legacy_notes order by created_at loop
    target_place := n.place_id;

    if target_place is null then
      select p.id into target_place
      from public.places p
      where public.distance_m(p.lat, p.lng, n.latitude, n.longitude) <= p.radius_m
      order by public.distance_m(p.lat, p.lng, n.latitude, n.longitude)
      limit 1;
    end if;

    if target_place is null then
      insert into public.places (name, lat, lng, radius_m, created_by)
      values ('Pinned spot', n.latitude, n.longitude, 50, n.author_id)
      returning id into target_place;
    end if;

    if n.kind = 'letter' then
      insert into public.chains (place_id) values (target_place)
      on conflict (place_id) do nothing;

      select id, latest_letter_id into target_chain, previous_letter
      from public.chains where place_id = target_place;

      insert into public.chain_letters (chain_id, author_id, answers_letter_id, text, time_of_day, created_at)
      values (target_chain, n.author_id, previous_letter, n.content, pg_temp.time_of_day_at(n.created_at), n.created_at)
      returning id into new_id;

      update public.chains set latest_letter_id = new_id where id = target_chain;
    else
      insert into public.stories (place_id, author_id, text, time_of_day, created_at)
      values (
        target_place,
        n.author_id,
        case when char_length(n.content) > 200 then left(n.content, 199) || '…' else n.content end,
        pg_temp.time_of_day_at(n.created_at),
        n.created_at
      )
      returning id into new_id;

      insert into story_map values (n.id, new_id);
    end if;
  end loop;

  insert into public.comments (story_id, author_id, text, created_at)
  select m.story_id, r.author_id, r.content, r.created_at
  from public.legacy_replies r
  join story_map m on m.note_id = r.note_id
  order by r.created_at;

  -- Old policies let any signed-in user read these; now only the author can.
  drop policy if exists "read active notes" on public.legacy_notes;
  drop policy if exists "create notes"      on public.legacy_notes;
  drop policy if exists "update own notes"  on public.legacy_notes;
  drop policy if exists "delete own notes"  on public.legacy_notes;
  drop policy if exists "read replies"       on public.legacy_replies;
  drop policy if exists "create replies"     on public.legacy_replies;
  drop policy if exists "delete own replies" on public.legacy_replies;

  create policy "read own legacy notes" on public.legacy_notes for select to authenticated
    using (author_id = auth.uid());
  create policy "read own legacy replies" on public.legacy_replies for select to authenticated
    using (author_id = auth.uid());

  raise notice 'Migrated % stories, % chain letters, % comments.',
    (select count(*) from story_map),
    (select count(*) from public.legacy_notes where kind = 'letter'),
    (select count(*) from public.legacy_replies r join story_map m on m.note_id = r.note_id);
end $$;

commit;
