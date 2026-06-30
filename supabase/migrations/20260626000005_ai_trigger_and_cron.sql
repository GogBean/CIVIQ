-- ─── AI Trigger: call gemini-tag edge function on new issue insert ─────────────
-- Requires: pg_net extension (enabled in init_schema.sql via `create extension pg_net`)
-- Requires: SUPABASE_URL and WEBHOOK_SECRET set as Supabase secrets.
--
-- The function reads Supabase project URL from pg_settings (vault) so we embed it
-- as a placeholder that the Edge Function secret SUPABASE_URL resolves at runtime.
-- We use net.http_post to call the Edge Function asynchronously.

create or replace function trigger_gemini_tag()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  supabase_url   text;
  webhook_secret text;
  payload        jsonb;
begin
  select value into supabase_url
  from public.app_settings
  where key = 'supabase_url'
  limit 1;

  select value into webhook_secret
  from public.app_settings
  where key = 'webhook_secret'
  limit 1;

  if supabase_url is null or supabase_url = '' then
    return new;
  end if;

  payload := jsonb_build_object('record', row_to_json(new));

  perform net.http_post(
    url := supabase_url || '/functions/v1/gemini-tag',
    body := payload,
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(webhook_secret, ''),
      'x-webhook-secret', coalesce(webhook_secret, '')
    ),
    timeout_milliseconds := 10000
  );

  return new;
end;
$$;

-- Attach trigger to issues table — fires AFTER INSERT
drop trigger if exists on_issue_inserted_trigger_gemini on public.issues;
create trigger on_issue_inserted_trigger_gemini
  after insert on public.issues
  for each row
  execute function trigger_gemini_tag();

-- ─── Grant pg_net execution rights to postgres role ──────────────────────────
-- (pg_net is already owned by supabase_admin, but the postgres role needs usage)
grant usage on schema net to postgres;

-- ─── Escalation Scheduler: daily pg_cron job ─────────────────────────────────
-- Requires: pg_cron extension. Enable via Supabase Dashboard → Database → Extensions.
-- The job runs at 08:00 UTC every day.
-- NOTE: pg_cron must be enabled in the dashboard first (it's not enabled by default).
--       After enabling, run this migration or execute the cron.schedule() call manually.

-- We guard with DO block so migration doesn't fail if pg_cron isn't yet enabled.
do $$
declare
  supabase_url   text;
  webhook_secret text;
begin
  begin
    supabase_url   := current_setting('app.supabase_url');
    webhook_secret := current_setting('app.webhook_secret');
  exception when others then
    -- Settings not configured — skip scheduling
    return;
  end;

  -- Remove existing schedule if any (idempotent)
  begin
    execute 'select cron.unschedule($1)' using 'civiq-daily-escalation';
  exception when others then
    -- pg_cron not yet enabled or job not found — skip
    null;
  end;

  -- Schedule daily escalation at 08:00 UTC
  begin
    execute 'select cron.schedule($1, $2, $3)'
      using 'civiq-daily-escalation',
            '0 8 * * *',
            format(
              $cmd$
                select net.http_post(
                  url     := %L,
                  headers := '{"Content-Type":"application/json","x-webhook-secret":%L}'::jsonb,
                  body    := '{}'
                );
              $cmd$,
              supabase_url || '/functions/v1/escalate-issues',
              webhook_secret
            );
  exception when others then
    -- pg_cron extension not available / failed to schedule
    null;
  end;
end;
$$;
