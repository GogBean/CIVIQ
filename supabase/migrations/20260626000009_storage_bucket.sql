-- Create issue-images storage bucket (public read access)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'issue-images',
  'issue-images',
  true,
  10485760,  -- 10 MB per file
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

-- Allow authenticated users to upload to their own folder
create policy "Authenticated users can upload issue images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'issue-images'
    and (storage.foldername(name))[1] = 'issues'
  );

-- Allow public (unauthenticated) read access to all issue images
create policy "Public read access for issue images"
  on storage.objects for select
  to public
  using (bucket_id = 'issue-images');

-- Allow users to delete only their own uploaded objects
create policy "Users can delete their own issue images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'issue-images'
    and auth.uid()::text = (storage.foldername(name))[2]
  );
