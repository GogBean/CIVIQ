-- ── Fix public.users for email+password auth ──────────────────────────────────
--
-- Problems fixed:
--   1. phone was NOT NULL — email/password signups have no phone
--   2. email column missing — signup code inserts email
--   3. name column missing — signup code inserts name
--   4. No INSERT RLS policy — signup insert was blocked
--   5. Auth trigger inserted phone — must not be required for email signups

-- 1. Ensure phone column exists and is nullable
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE public.users
  ALTER COLUMN phone DROP NOT NULL;


-- 2. Add email column if it does not exist
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email TEXT;

-- 3. Add name column if it does not exist
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS name TEXT;

-- 4. Add INSERT RLS policy so authenticated users can insert their own profile
DROP POLICY IF EXISTS "Allow users to insert their own profile" ON public.users;
CREATE POLICY "Allow users to insert their own profile"
  ON public.users
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 5. Update the auth trigger to handle email/password signups correctly
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, name, phone, language, points)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'name', ''),
    NULLIF(NEW.phone, ''),
    'en',
    0
  )
  ON CONFLICT (id) DO UPDATE
    SET email = COALESCE(EXCLUDED.email, public.users.email),
        name = COALESCE(EXCLUDED.name, public.users.name),
        phone = COALESCE(EXCLUDED.phone, public.users.phone);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

