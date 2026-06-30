-- Create app_settings table if it does not exist
create table if not exists public.app_settings (
  key text primary key,
  value text not null
);

-- Enable Row Level Security (without creating any policies)
alter table public.app_settings enable row level security;
