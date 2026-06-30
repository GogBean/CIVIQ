-- Enable RLS on all remaining tables
alter table public.issues enable row level security;
alter table public.issue_votes enable row level security;
alter table public.issue_status_log enable row level security;
alter table public.escalations enable row level security;
alter table public.badges enable row level security;

-- ── issues ──────────────────────────────────────────────────────────────────

-- Any authenticated user can read all issues (for map discovery)
create policy "issues_select_public"
  on public.issues for select
  using (auth.role() = 'authenticated');

-- A user can only insert issues as themselves
create policy "issues_insert_own"
  on public.issues for insert
  with check (auth.uid() = user_id);

-- A user can update only their own issues
-- (status transitions by the Edge Function run as service_role, bypassing RLS)
create policy "issues_update_own"
  on public.issues for update
  using (auth.uid() = user_id);

-- ── issue_votes ──────────────────────────────────────────────────────────────

create policy "votes_select_public"
  on public.issue_votes for select
  using (auth.role() = 'authenticated');

create policy "votes_insert_own"
  on public.issue_votes for insert
  with check (auth.uid() = user_id);

-- ── issue_status_log ─────────────────────────────────────────────────────────

create policy "status_log_select_public"
  on public.issue_status_log for select
  using (auth.role() = 'authenticated');

-- ── escalations ───────────────────────────────────────────────────────────────

create policy "escalations_select_public"
  on public.escalations for select
  using (auth.role() = 'authenticated');

-- ── badges ────────────────────────────────────────────────────────────────────

create policy "badges_select_own"
  on public.badges for select
  using (auth.uid() = user_id);
