import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type IssueCategory =
  | 'Pothole'
  | 'Water Leakage'
  | 'Streetlight'
  | 'Waste'
  | 'Road Damage'
  | 'Flooding'
  | 'Other';

export interface SubmitIssueParams {
  userId: string;
  imageKey: string;
  imageUrl: string;
  category: IssueCategory;
  description: string | null;
  latitude: number;
  longitude: number;
}

export interface SubmittedIssue {
  id: string;
  status: 'pending';
  created_at: string;
}

// ─── SLA Configuration ───────────────────────────────────────────────────────

/**
 * Default SLA deadline in hours for a newly submitted issue.
 * Gemini classification will refine severity; until then we use a safe default.
 * PRD specifies 72 hours for standard issues.
 */
const DEFAULT_SLA_HOURS = 72;

function computeSlaDeadline(): string {
  const deadline = new Date();
  deadline.setHours(deadline.getHours() + DEFAULT_SLA_HOURS);
  return deadline.toISOString();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Inserts a new civic issue row into the `issues` table with status = 'pending'.
 *
 * - ward_id:   left null; the gemini-tag Edge Function will fill it in via
 *              PostGIS ST_Contains after classification.
 * - severity:  defaults to 3 (medium); Gemini will override after classification.
 * - embedding: null until gemini-tag writes it.
 * - All AI columns (summary, recommended_department, risk_level, etc.) remain
 *   null until gemini-tag processes the record.
 *
 * @param params  Issue fields collected from the report form + upload result.
 * @returns       The created issue's `id`, `status`, and `created_at`.
 * @throws        On any Supabase insert error.
 */
export async function submitIssue(
  params: SubmitIssueParams,
): Promise<SubmittedIssue> {
  const { userId, imageKey, imageUrl, category, description, latitude, longitude } = params;

  // PostGIS geography literal for a WGS-84 point: POINT(lon lat)
  const locationWkt = `POINT(${longitude} ${latitude})`;

  const { data, error } = await supabase
    .from('issues')
    .insert({
      user_id: userId,
      image_key: imageKey,
      image_url: imageUrl,
      category,
      description: description?.trim() || null,
      severity: 3,            // default until Gemini overrides
      status: 'pending',
      location: locationWkt,  // Supabase accepts WKT strings for geography columns
      ward_id: null,          // filled by gemini-tag Edge Function
      sla_deadline: computeSlaDeadline(),
    })
    .select('id, status, created_at')
    .single();

  if (error) {
    throw new Error(`Failed to submit issue: ${error.message}`);
  }

  if (!data) {
    throw new Error('Issue insert returned no data.');
  }

  return data as SubmittedIssue;
}

export interface IssueDetails {
  id: string;
  user_id: string | null;
  ward_id: string | null;
  category: string;
  severity: number;
  status: string;
  location: any;
  image_url: string;
  image_key: string;
  description: string | null;
  summary: string | null;
  recommended_department: string | null;
  risk_level: string | null;
  estimated_priority: string | null;
  confidence: number | null;
  sla_deadline?: string | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Fetches an issue by its ID from Supabase.
 */
export async function getIssueById(id: string): Promise<IssueDetails> {
  const { data, error } = await supabase
    .from('issues')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    throw new Error(`Failed to fetch issue: ${error.message}`);
  }

  if (!data) {
    throw new Error(`No issue found with ID ${id}`);
  }

  return data as IssueDetails;
}

export interface Vote {
  id: string;
  issue_id: string;
  user_id: string;
  type: 'upvote' | 'verify_resolved';
  created_at: string;
}

/**
 * Toggles an upvote on an issue for a user.
 */
export async function toggleUpvote(
  issueId: string,
  userId: string,
  hasUpvoted: boolean,
): Promise<void> {
  if (hasUpvoted) {
    const { error } = await supabase
      .from('issue_votes')
      .delete()
      .eq('issue_id', issueId)
      .eq('user_id', userId)
      .eq('type', 'upvote');

    if (error) {
      throw new Error(`Failed to remove upvote: ${error.message}`);
    }
  } else {
    const { error } = await supabase
      .from('issue_votes')
      .insert({
        issue_id: issueId,
        user_id: userId,
        type: 'upvote',
      });

    if (error) {
      throw new Error(`Failed to add upvote: ${error.message}`);
    }
  }
}

