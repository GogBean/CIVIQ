-- ─── RPC: Find nearby issues for duplicate detection ─────────────────────────
-- Returns issues of the same category within `radius_meters` of the given point.
-- Called by the check-duplicate Edge Function.
-- Returns embedding column so the Edge Function can do cosine similarity in TS.

create or replace function find_nearby_issues(
  lat             double precision,
  lon             double precision,
  category_filter text,
  radius_meters   double precision default 200.0
)
returns table (
  id               uuid,
  category         text,
  severity         integer,
  status           text,
  summary          text,
  description      text,
  embedding        vector(512),
  distance_meters  double precision
)
language sql
security definer
stable
as $$
  select
    i.id,
    i.category,
    i.severity,
    i.status::text,
    i.summary,
    i.description,
    i.embedding,
    ST_Distance(
      i.location::geography,
      ST_SetSRID(ST_Point(lon, lat), 4326)::geography
    ) as distance_meters
  from public.issues i
  where
    i.category = category_filter
    and i.status <> 'pending'
    and ST_DWithin(
      i.location::geography,
      ST_SetSRID(ST_Point(lon, lat), 4326)::geography,
      radius_meters
    )
  order by distance_meters asc
  limit 10;
$$;

-- Grant execute to authenticated users (called via Edge Function with service role,
-- but also allow anon/authenticated for completeness)
grant execute on function find_nearby_issues(double precision, double precision, text, double precision)
  to authenticated, anon, service_role;
