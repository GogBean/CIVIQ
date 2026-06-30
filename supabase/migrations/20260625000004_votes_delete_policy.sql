-- Add policy to allow authenticated users to delete their own votes (toggle upvotes)
create policy "votes_delete_own"
  on public.issue_votes for delete
  using (auth.uid() = user_id);

-- Enable Realtime for issue_votes table
alter publication supabase_realtime add table public.issue_votes;

