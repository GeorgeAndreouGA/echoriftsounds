import type { Category, PublishedTrack, ScheduledTrack } from '@echorift/shared';

/**
 * Subpath the whole app is served under (e.g. '/music'), baked into the build
 * via NEXT_PUBLIC_BASE_PATH. Empty string when served at the domain root.
 * Every app-absolute API/asset URL must be prefixed with this so requests
 * resolve under the subpath instead of the domain root.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** Prefix an app-absolute path ('/api/...', '/music/...', '/') with BASE_PATH. */
export const withBase = (path: string): string => `${BASE_PATH}${path}`;

const json = async <T>(res: Response): Promise<T> => {
  if (!res.ok) {
    let body = '';
    try { body = await res.text(); } catch { /* ignore */ }
    const detail = body ? ` — "${body}"` : '';
    throw new Error(`${res.status} ${res.statusText}${detail}`);
  }
  return res.json() as Promise<T>;
};

function withTimeout(ms = 15_000): AbortSignal {
  return AbortSignal.timeout(ms);
}

const adminGet = (url: string) =>
  fetch(withBase(url), { credentials: 'include', signal: withTimeout() });

const adminPost = (url: string, body: unknown, csrfToken: string) =>
  fetch(withBase(url), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'csrf-token': csrfToken,
    },
    credentials: 'include',
    body: JSON.stringify(body),
    signal: withTimeout(),
  });

/** Public ───────────────────────────────────────────────────── */

/** Already in the admin-defined display order. */
export async function getTracks(apiBase = ''): Promise<PublishedTrack[]> {
  try {
    return await json<PublishedTrack[]>(await fetch(`${apiBase}${BASE_PATH}/api/tracks`));
  } catch {
    return [];
  }
}

export async function getCategories(apiBase = ''): Promise<Category[]> {
  try {
    return await json<Category[]>(await fetch(`${apiBase}${BASE_PATH}/api/categories`));
  } catch {
    return [];
  }
}

/** Admin ─────────────────────────────────────────────────────── */

export async function adminFiles(): Promise<string[]> {
  return json<string[]>(await adminGet('/api/admin/files'));
}

export async function adminPublished(): Promise<PublishedTrack[]> {
  return json<PublishedTrack[]>(await adminGet('/api/admin/published'));
}

export async function adminScheduled(): Promise<ScheduledTrack[]> {
  return json<ScheduledTrack[]>(await adminGet('/api/admin/scheduled'));
}

export async function adminCategories(): Promise<Category[]> {
  return json<Category[]>(await adminGet('/api/admin/categories'));
}

/** One file + the YouTube link it plays through — 1:1, unlike category. */
export interface PublishFile {
  file: string;
  youtubeUrl: string;
}

export async function publish(
  files: PublishFile[],
  scheduled: (ScheduledTrack & { youtubeUrl: string })[],
  csrfToken: string,
  category: string | null = null,
): Promise<void> {
  await json<unknown>(
    await adminPost('/api/admin/publish', { files, scheduled, category }, csrfToken),
  );
}

export async function createCategory(name: string, csrfToken: string): Promise<Category> {
  return json<Category>(await adminPost('/api/admin/categories', { name }, csrfToken));
}

export async function renameCategory(
  id: string,
  name: string,
  csrfToken: string,
): Promise<Category> {
  return json<Category>(await adminPost('/api/admin/categories/rename', { id, name }, csrfToken));
}

export async function deleteCategories(ids: string[], csrfToken: string): Promise<void> {
  await json<unknown>(await adminPost('/api/admin/categories/delete', { ids }, csrfToken));
}

/** Move published tracks into a category. A real category is required. */
export async function assignCategory(
  files: string[],
  category: string | null,
  csrfToken: string,
): Promise<void> {
  await json<unknown>(
    await adminPost('/api/admin/tracks/category', { files, category }, csrfToken),
  );
}

/** Set the display order. `files` must be every published file, in the new order. */
export async function reorderTracks(files: string[], csrfToken: string): Promise<void> {
  await json<unknown>(await adminPost('/api/admin/tracks/reorder', { files }, csrfToken));
}

/** Set/fix the YouTube link an already-published track plays through. */
export async function updateYoutubeUrl(
  files: string[],
  youtubeUrl: string,
  csrfToken: string,
): Promise<void> {
  await json<unknown>(
    await adminPost('/api/admin/tracks/youtube', { files, youtubeUrl }, csrfToken),
  );
}

export async function unpublish(filesToDelete: string[], csrfToken: string): Promise<void> {
  await json<unknown>(await adminPost('/api/admin/delete', { filesToDelete }, csrfToken));
}

export async function removeScheduled(
  scheduledToDelete: string[],
  csrfToken: string,
): Promise<void> {
  await json<unknown>(
    await adminPost('/api/admin/scheduled/delete', { scheduledToDelete }, csrfToken),
  );
}

export async function cancelPeaks(files: string[], csrfToken: string): Promise<void> {
  await json<unknown>(await adminPost('/api/admin/peaks/cancel', { files }, csrfToken));
}
