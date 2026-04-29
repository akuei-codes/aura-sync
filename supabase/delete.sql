-- ============================================================================
-- ZYNK — Teardown Script
-- ============================================================================
-- Run this in the Supabase SQL Editor BEFORE re-running schema.sql.
-- Drops every ZYNK object (tables, views, functions, types, triggers,
-- and removes tables from the supabase_realtime publication) so schema.sql
-- can be applied from a clean slate.
--
-- ⚠️  This deletes ALL session data. There is no undo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Remove tables from the realtime publication (ignore if not a member)
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'queue_items','reactions','hype_events','current_track','sessions'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime drop table public.%I', t);
    exception when others then
      -- table wasn't in the publication (or publication doesn't exist) — ignore
      null;
    end;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Drop the public view (depends on sessions)
-- ----------------------------------------------------------------------------
drop view if exists public.sessions_public cascade;

-- ----------------------------------------------------------------------------
-- 3. Drop tables (CASCADE handles triggers, indexes, FKs, vote_records, etc.)
-- ----------------------------------------------------------------------------
drop table if exists public.recap_moments       cascade;
drop table if exists public.audience_presence   cascade;
drop table if exists public.energy_snapshots    cascade;
drop table if exists public.hype_events         cascade;
drop table if exists public.reactions           cascade;
drop table if exists public.vote_records        cascade;
drop table if exists public.queue_items         cascade;
drop table if exists public.current_track       cascade;
drop table if exists public.sessions            cascade;

-- ----------------------------------------------------------------------------
-- 4. Drop helper functions
-- ----------------------------------------------------------------------------
drop function if exists public.live_listener_count(uuid) cascade;
drop function if exists public.tg_reaction_count()       cascade;
drop function if exists public.tg_vote_counts()          cascade;
drop function if exists public.tg_set_updated_at()       cascade;

-- ----------------------------------------------------------------------------
-- 5. Drop enums
-- ----------------------------------------------------------------------------
drop type if exists public.hype_kind       cascade;
drop type if exists public.projection_mode cascade;
drop type if exists public.session_status  cascade;

-- ============================================================================
-- Done. Now run supabase/schema.sql to recreate everything fresh.
-- ============================================================================
