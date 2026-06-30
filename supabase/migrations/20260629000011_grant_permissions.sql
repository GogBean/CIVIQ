-- Grant table-level permissions in the public schema to standard Supabase roles
-- RLS handles row-level filtering, but table-level privileges (GRANTs) are checked first by Postgres.
-- This ensures the 'authenticated', 'anon', and 'service_role' roles have access to perform operations.

-- Grant permissions on all existing tables in public schema
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wards TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.issues TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.issue_votes TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.issue_status_log TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.escalations TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.badges TO authenticated, anon, service_role;

-- Grant permissions on app_settings if it exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_settings') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated, anon, service_role;
  END IF;
END $$;

-- Grant usage on all sequences in the public schema
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon, service_role;
