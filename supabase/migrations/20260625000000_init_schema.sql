-- Enable PostGIS and pgvector extensions
create extension if not exists postgis;
create extension if not exists vector;
create extension if not exists pg_net;

-- Enums for Statuses and Vote Types
create type issue_status as enum (
  'pending', 
  'open', 
  'escalated', 
  'in_progress', 
  'pending_verification', 
  'verified_resolved', 
  'closed'
);

create type vote_type as enum (
  'upvote', 
  'verify_resolved'
);

-- Wards Table
create table wards (
  id uuid primary key default gen_random_uuid(),
  ward_number text not null unique,
  ward_name text not null,
  district text not null,
  municipality text not null,
  local_body_type text not null,
  councillor_name text,
  councillor_email text,
  ward_office_email text,
  assistant_engineer_email text,
  health_inspector_email text,
  boundary geography(MultiPolygon, 4326),
  source text,
  last_updated timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Users Table (linked to Supabase auth.users)
create table users (
  id uuid references auth.users on delete cascade primary key,
  phone text unique not null,
  ward_id uuid references wards(id),
  language text default 'en' not null,
  points integer default 0 not null,
  push_token text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Issues Table
create table issues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  ward_id uuid references wards(id) on delete set null,
  category text not null,
  severity integer check (severity between 1 and 5) not null,
  status issue_status default 'pending'::issue_status not null,
  location geography(Point, 4326) not null,
  image_url text not null,
  image_key text not null,
  description text,
  embedding vector(512),
  
  -- AI outputs
  summary text,
  recommended_department text,
  risk_level text,
  estimated_priority text,
  confidence double precision,
  
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  resolved_at timestamp with time zone,
  sla_deadline timestamp with time zone not null
);

-- Issue Votes Table
create table issue_votes (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid references issues(id) on delete cascade not null,
  user_id uuid references users(id) on delete cascade not null,
  type vote_type not null,
  photo_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (issue_id, user_id, type)
);

-- Issue Status Log Table
create table issue_status_log (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid references issues(id) on delete cascade not null,
  old_status issue_status,
  new_status issue_status not null,
  changed_by uuid references users(id) on delete set null,
  reason text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Escalations Table
create table escalations (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid references issues(id) on delete cascade not null,
  channel text not null,
  sent_at timestamp with time zone default timezone('utc'::text, now()) not null,
  response_received jsonb
);

-- Badges Table
create table badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  badge_type text not null,
  awarded_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Database Indexes for Optimization
create index issues_location_idx on issues using gist (location);
create index issues_embedding_hnsw_idx on issues using hnsw (embedding vector_cosine_ops);
create index issues_user_id_idx on issues (user_id);
create index issues_ward_id_idx on issues (ward_id);
create index issues_status_idx on issues (status);
create index issue_votes_issue_id_idx on issue_votes (issue_id);
create index issue_status_log_issue_id_idx on issue_status_log (issue_id);
create index wards_boundary_idx on wards using gist (boundary);

-- Automatic updated_at trigger helper
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_issues_updated_at
  before update on issues
  for each row
  execute function update_updated_at_column();

-- Automatic status change logging trigger
create or replace function log_issue_status_change()
returns trigger as $$
begin
  if (old.status is null or old.status <> new.status) then
    insert into issue_status_log (issue_id, old_status, new_status, changed_by, reason)
    values (new.id, old.status, new.status, new.user_id, 'Status updated');
  end if;
  return new;
end;
$$ language plpgsql;

create trigger log_status_change
  after insert or update on issues
  for each row
  execute function log_issue_status_change();

-- Helper function to map GPS location coordinates to a Ward boundary
create or replace function find_ward_by_location(lon double precision, lat double precision)
returns uuid as $$
declare
  target_ward_id uuid;
begin
  select id into target_ward_id 
  from wards 
  where ST_Contains(boundary::geometry, ST_SetSRID(ST_Point(lon, lat), 4326)) 
  limit 1;
  
  return target_ward_id;
end;
$$ language plpgsql security definer;
