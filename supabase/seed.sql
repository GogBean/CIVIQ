-- Seed file to populate the public.wards table with mock Bengaluru wards for testing
-- Shantal Nagar ward covers the default coordinates (12.9716, 77.5946) used in the mobile client.

-- Clean up any existing seeded wards to avoid unique key conflicts
TRUNCATE TABLE public.wards CASCADE;

INSERT INTO public.wards (
  ward_number,
  ward_name,
  district,
  municipality,
  local_body_type,
  councillor_name,
  councillor_email,
  ward_office_email,
  assistant_engineer_email,
  health_inspector_email,
  boundary,
  source
) VALUES (
  '111',
  'Shantala Nagar',
  'Bengaluru Urban',
  'Bruhat Bengaluru Mahanagara Palike',
  'Corporation',
  'Rajesh Kumar',
  'rajesh.kumar@bbmp.gov.in',
  'shantalanagar.ward@bbmp.gov.in',
  'ae.shantalanagar@bbmp.gov.in',
  'hi.shantalanagar@bbmp.gov.in',
  ST_GeographyFromText('SRID=4326;MULTIPOLYGON(((77.585 12.965, 77.605 12.965, 77.605 12.980, 77.585 12.980, 77.585 12.965)))'),
  'Seeded test ward boundaries'
), (
  '112',
  'Vasanth Nagar',
  'Bengaluru Urban',
  'Bruhat Bengaluru Mahanagara Palike',
  'Corporation',
  'Sunitha Reddy',
  'sunitha.reddy@bbmp.gov.in',
  'vasanthnagar.ward@bbmp.gov.in',
  'ae.vasanthnagar@bbmp.gov.in',
  'hi.vasanthnagar@bbmp.gov.in',
  ST_GeographyFromText('SRID=4326;MULTIPOLYGON(((77.585 12.980, 77.605 12.980, 77.605 12.995, 77.585 12.995, 77.585 12.980)))'),
  'Seeded test ward boundaries'
), (
  '113',
  'Richmond Town',
  'Bengaluru Urban',
  'Bruhat Bengaluru Mahanagara Palike',
  'Corporation',
  'Amit Patel',
  'amit.patel@bbmp.gov.in',
  'richmondtown.ward@bbmp.gov.in',
  'ae.richmondtown@bbmp.gov.in',
  'hi.richmondtown@bbmp.gov.in',
  ST_GeographyFromText('SRID=4326;MULTIPOLYGON(((77.585 12.950, 77.605 12.950, 77.605 12.965, 77.585 12.965, 77.585 12.950)))'),
  'Seeded test ward boundaries'
);
