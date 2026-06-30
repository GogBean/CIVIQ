-- Enable RLS on users and wards
alter table public.users enable row level security;
alter table public.wards enable row level security;

-- Policies for public.users
create policy "Allow users to read their own profile"
  on public.users
  for select
  using (auth.uid() = id);

create policy "Allow users to update their own profile"
  on public.users
  for update
  using (auth.uid() = id);

-- Policies for public.wards
create policy "Allow public read access to wards"
  on public.wards
  for select
  using (true);

-- Trigger to sync auth.users to public.users on signup
create or replace function public.handle_new_auth_user()
returns trigger as $$
begin
  insert into public.users (id, phone, language, points)
  values (
    new.id,
    coalesce(new.phone, ''),
    'en',
    0
  )
  on conflict (id) do update
  set phone = coalesce(new.phone, public.users.phone);
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();
