import { supabase } from './supabase';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

// --- Types ---------------------------------------------------------------

export interface UploadResult {
  imageKey: string;
  imageUrl: string;
}

export interface UploadProgress {
  percent: number;    // 0-100
  loaded: number;     // bytes uploaded
  total: number;      // total bytes
}

export type UploadProgressCallback = (progress: UploadProgress) => void;

// --- Configuration -------------------------------------------------------

const BUCKET = 'issue-images';
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

// --- Internal Helpers ----------------------------------------------------

/**
 * Determines the MIME type from a file URI.
 * Falls back to 'image/jpeg' for all unrecognised extensions.
 */
function getMimeType(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
  };
  return map[ext] ?? 'image/jpeg';
}

/**
 * Sleeps for `ms` milliseconds.
 */
const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

/**
 * Reads a local image URI into an uploadable binary body.
 * Expo FileSystem's File API handles Android picker/cache URIs reliably.
 */
async function readUploadBodyFromUri(
  uri: string,
): Promise<{ body: Blob | ArrayBuffer; size: number }> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    const body = await response.blob();
    return { body, size: body.size };
  }

  const file = new File(uri);
  const body = await file.arrayBuffer();
  return { body, size: file.size };
}

// --- Public API: uploadIssueImage ---------------------------------------

/**
 * Uploads a civic issue image directly to Supabase Storage (`issue-images` bucket).
 *
 * Steps:
 *   1. Verifies the authenticated user (required for RLS on storage objects).
 *   2. Reads the local image URI into a binary body.
 *   3. Uploads to `issue-images/{userId}/{uuid}.{ext}` with retry/backoff.
 *   4. Returns the public URL and the storage key.
 *
 * Note: Supabase Storage JS SDK does not expose per-chunk progress events.
 *       The onProgress callback fires at 0% (start) and 100% (completion).
 *
 * @param imageUri     Local file URI from expo-image-picker.
 * @param onProgress   Optional callback for upload progress (0 or 100%).
 * @param signal       Optional AbortSignal to cancel before the upload begins.
 * @returns            `{ imageKey, imageUrl }` to be stored in the issues row.
 *
 * @throws             On all unrecoverable errors after MAX_RETRIES attempts.
 */
export async function uploadIssueImage(
  imageUri: string,
  onProgress?: UploadProgressCallback,
  signal?: AbortSignal,
): Promise<UploadResult> {
  const contentType = getMimeType(imageUri);
  const ext = imageUri.split('.').pop()?.toLowerCase() ?? 'jpg';

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('User must be authenticated to upload images.');
  }

  const imageKey = `issues/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  onProgress?.({ percent: 0, loaded: 0, total: 0 });

  if (signal?.aborted) {
    throw new DOMException('Upload aborted by caller.', 'AbortError');
  }

  const { body: fileBody, size: fileSize } = await readUploadBodyFromUri(imageUri);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('Upload aborted by caller.', 'AbortError');
    }

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(imageKey, fileBody, { contentType, upsert: false });

    if (!uploadError) break;

    if (attempt === MAX_RETRIES) {
      throw new Error(
        `Storage upload failed after ${MAX_RETRIES} attempts: ${uploadError.message}`,
      );
    }

    onProgress?.({ percent: 0, loaded: 0, total: fileSize });
    await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
  }

  onProgress?.({ percent: 100, loaded: fileSize, total: fileSize });

  const {
    data: { publicUrl },
  } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(imageKey);

  return { imageKey, imageUrl: publicUrl };
}
