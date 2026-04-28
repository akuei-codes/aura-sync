-- ============================================================================
-- ZYNK — Production Schema (Supabase Postgres)
-- ============================================================================
-- Run in Supabase SQL Editor. Idempotent.
--
-- Architecture:
--   • Server uses postgres.js with DATABASE_URL (Supavisor pooler) — NOT PostgREST.
--   • Realtime broadcast uses Supabase Realtime websocket bus — frontend only.
--   • Therefore: no RLS needed for the postgres.js path (server-side, trusted).
--     RLS IS enabled defensively so PostgREST/anon keys cannot read data —
--     all writes go through trusted server functions.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.session_status as enum ('draft','live','ended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.projection_mode as enum ('auto','abstract','silhouette');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.hype_kind as enum ('drop','scratch','callout','vinyl','ambient','build','transition');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- updated_at trigger helper
-- ----------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ----------------------------------------------------------------------------
-- SESSIONS
-- ----------------------------------------------------------------------------
create table if not exists public.sessions (
  id                          uuid primary key default gen_random_uuid(),
  slug                        text not null unique,
  title                       text not null,
  vibe                        text not null,
  status                      public.session_status not null default 'draft',

  -- DJ auth (raw token never stored; clients hold it, server verifies hash)
  dj_token_hash               text not null,

  -- Spotify OAuth (tokens are encrypted at rest by Supabase disk encryption;
  -- never expose these to the client)
  spotify_user_id             text,
  spotify_refresh_token       text,
  spotify_access_token        text,
  spotify_access_expires_at   timestamptz,
  spotify_device_id           text,

  -- Live state
  crowd_energy                double precision not null default 0.55
                              check (crowd_energy between 0 and 1),
  autopilot                   boolean not null default true,
  projection_mode             public.projection_mode not null default 'auto',

  -- Counters (maintained by triggers — never recount on read)
  reaction_count_total        integer not null default 0,
  vote_count_total            integer not null default 0,
  mix_drop_count              integer not null default 0,
  listener_estimate           integer not null default 0,

  started_at                  timestamptz,
  ended_at                    timestamptz,
  planned_duration_minutes    integer,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists sessions_status_idx on public.sessions(status);
create index if not exists sessions_slug_idx   on public.sessions(slug);

drop trigger if exists trg_sessions_updated_at on public.sessions;
create trigger trg_sessions_updated_at
  before update on public.sessions
  for each row execute procedure public.tg_set_updated_at();

-- ----------------------------------------------------------------------------
-- CURRENT TRACK (one row per session — what the DJ deck is playing right now)
-- ----------------------------------------------------------------------------
create table if not exists public.current_track (
  session_id          uuid primary key references public.sessions(id) on delete cascade,
  spotify_track_id    text not null,
  uri                 text not null,
  title               text not null,
  artist              text not null,
  album_image_url     text,
  preview_url         text,         -- 30s clip URL for audience playback
  duration_ms         integer not null,
  bpm                 real,
  key_pitch_class     smallint,     -- 0..11 (Spotify audio-features `key`)
  mode                smallint,     -- 0 minor / 1 major
  energy              real,         -- 0..1 from Spotify audio-features
  -- Position sync: position_ms_at = position at instant `position_set_at`.
  -- Audience computes live position = position_ms_at + (now - position_set_at).
  position_ms_at      integer not null default 0,
  position_set_at     timestamptz not null default now(),
  is_paused           boolean not null default false,
  started_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists trg_current_track_updated_at on public.current_track;
create trigger trg_current_track_updated_at
  before update on public.current_track
  for each row execute procedure public.tg_set_updated_at();

-- ----------------------------------------------------------------------------
-- QUEUE
-- ----------------------------------------------------------------------------
create table if not exists public.queue_items (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references public.sessions(id) on delete cascade,
  spotify_track_id    text not null,
  uri                 text not null,
  title               text not null,
  artist              text not null,
  album_image_url     text,
  preview_url         text,
  duration_ms         integer not null,
  bpm                 real,
  key_pitch_class     smallint,
  mode                smallint,
  energy              real,
  danceability        real,
  -- vote_count maintained by trigger on vote_records
  vote_count          integer not null default 0,
  requested_by        text,
  ai_score            real,         -- AI DJ ranking score (0..1)
  -- ai_picked indicates this was inserted by the autopilot, not a request
  ai_picked           boolean not null default false,
  played_at           timestamptz,  -- null = still in queue, set = already played
  created_at          timestamptz not null default now(),
  unique (session_id, spotify_track_id, played_at)  -- one pending request per track
);

create index if not exists queue_session_pending_idx
  on public.queue_items(session_id, vote_count desc, created_at)
  where played_at is null;

create index if not exists queue_session_history_idx
  on public.queue_items(session_id, played_at desc)
  where played_at is not null;

-- ----------------------------------------------------------------------------
-- VOTES (one per (session, client, track), enforced by unique index)
-- ----------------------------------------------------------------------------
create table if not exists public.vote_records (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions(id) on delete cascade,
  queue_item_id   uuid not null references public.queue_items(id) on delete cascade,
  client_id       text not null,
  created_at      timestamptz not null default now()
);

create unique index if not exists vote_session_client_track_uq
  on public.vote_records(session_id, client_id, queue_item_id);

create index if not exists vote_queue_item_idx
  on public.vote_records(queue_item_id);

-- Maintain queue_items.vote_count + sessions.vote_count_total
create or replace function public.tg_vote_counts()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    update public.queue_items set vote_count = vote_count + 1 where id = new.queue_item_id;
    update public.sessions    set vote_count_total = vote_count_total + 1 where id = new.session_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.queue_items set vote_count = greatest(0, vote_count - 1) where id = old.queue_item_id;
    update public.sessions    set vote_count_total = greatest(0, vote_count_total - 1) where id = old.session_id;
    return old;
  end if;
  return null;
end $$;

drop trigger if exists trg_vote_counts on public.vote_records;
create trigger trg_vote_counts
  after insert or delete on public.vote_records
  for each row execute procedure public.tg_vote_counts();

-- ----------------------------------------------------------------------------
-- REACTIONS (ephemeral hype emoji)
-- ----------------------------------------------------------------------------
create table if not exists public.reactions (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions(id) on delete cascade,
  emoji           text not null check (char_length(emoji) between 1 and 16),
  client_id       text,
  created_at      timestamptz not null default now()
);

create index if not exists reactions_session_created_idx
  on public.reactions(session_id, created_at desc);

create or replace function public.tg_reaction_count()
returns trigger language plpgsql as $$
begin
  update public.sessions set reaction_count_total = reaction_count_total + 1 where id = new.session_id;
  return new;
end $$;

drop trigger if exists trg_reaction_count on public.reactions;
create trigger trg_reaction_count
  after insert on public.reactions
  for each row execute procedure public.tg_reaction_count();

-- ----------------------------------------------------------------------------
-- HYPE EVENTS (AI DJ callouts, transitions, drops — feed for /dj sidebar)
-- ----------------------------------------------------------------------------
create table if not exists public.hype_events (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions(id) on delete cascade,
  kind            public.hype_kind not null,
  label           text not null,
  meta            jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists hype_session_created_idx
  on public.hype_events(session_id, created_at desc);

-- ----------------------------------------------------------------------------
-- ENERGY SNAPSHOTS (for recap energy curve)
-- ----------------------------------------------------------------------------
create table if not exists public.energy_snapshots (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions(id) on delete cascade,
  energy          real not null check (energy between 0 and 1),
  sampled_at      timestamptz not null default now()
);

create index if not exists energy_session_sampled_idx
  on public.energy_snapshots(session_id, sampled_at);

-- ----------------------------------------------------------------------------
-- AUDIENCE PRESENCE (heartbeat from each connected client)
-- ----------------------------------------------------------------------------
create table if not exists public.audience_presence (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions(id) on delete cascade,
  client_id       text not null,
  nickname        text,
  seen_at         timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create unique index if not exists audience_presence_session_client_uq
  on public.audience_presence(session_id, client_id);

create index if not exists audience_presence_session_seen_idx
  on public.audience_presence(session_id, seen_at desc);

-- Helper: live listener count for a session in the last 30 seconds
create or replace function public.live_listener_count(p_session_id uuid)
returns integer language sql stable as $$
  select count(*)::int from public.audience_presence
  where session_id = p_session_id and seen_at > now() - interval '30 seconds';
$$;

-- ----------------------------------------------------------------------------
-- RECAP MOMENTS (post-session highlights)
-- ----------------------------------------------------------------------------
create table if not exists public.recap_moments (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions(id) on delete cascade,
  at_offset_ms    integer not null,
  kind            text not null,
  label           text not null,
  created_at      timestamptz not null default now()
);

create index if not exists recap_session_idx
  on public.recap_moments(session_id, at_offset_ms);

-- ----------------------------------------------------------------------------
-- SUPABASE REALTIME — broadcast schema changes to the websocket bus
-- ----------------------------------------------------------------------------
-- Frontend subscribes via `supabase.channel(...).on('postgres_changes', ...)`
-- to the tables it cares about. Only enabled for tables the audience watches.
alter publication supabase_realtime add table public.queue_items;
alter publication supabase_realtime add table public.reactions;
alter publication supabase_realtime add table public.hype_events;
alter publication supabase_realtime add table public.current_track;
alter publication supabase_realtime add table public.sessions;

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
-- All data access goes through trusted server functions using DATABASE_URL.
-- We enable RLS and add NO policies, which means PostgREST + anon key get
-- nothing — but Realtime postgres_changes still sees inserts/updates because
-- it runs as `supabase_realtime_admin` which bypasses RLS.
--
-- For the `sessions` table we redact spotify tokens via a secure view because
-- realtime broadcasts whole rows. Audience never reads `sessions` directly via
-- realtime — only via server functions — so this is belt-and-braces.
alter table public.sessions          enable row level security;
alter table public.current_track     enable row level security;
alter table public.queue_items       enable row level security;
alter table public.vote_records      enable row level security;
alter table public.reactions         enable row level security;
alter table public.hype_events       enable row level security;
alter table public.energy_snapshots  enable row level security;
alter table public.audience_presence enable row level security;
alter table public.recap_moments     enable row level security;

-- Realtime-safe public projection of sessions (no tokens)
create or replace view public.sessions_public
with (security_invoker = on) as
select id, slug, title, vibe, status, crowd_energy, autopilot, projection_mode,
       reaction_count_total, vote_count_total, mix_drop_count, listener_estimate,
       started_at, ended_at, planned_duration_minutes, created_at, updated_at
from public.sessions;
