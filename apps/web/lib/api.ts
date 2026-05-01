import type { ScheduledTrack } from '@echorift/shared';

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
  fetch(url, { credentials: 'include', signal: withTimeout() });

const adminPost = (url: string, body: unknown, csrfToken: string) =>
  fetch(url, {
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

export async function getTracks(apiBase = ''): Promise<string[]> {
  try {
    return await json<string[]>(await fetch(`${apiBase}/api/tracks`));
  } catch {
    return [];
  }
}

/** Admin ─────────────────────────────────────────────────────── */

export async function adminFiles(): Promise<string[]> {
  return json<string[]>(await adminGet('/api/admin/files'));
}

export async function adminPublished(): Promise<string[]> {
  return json<string[]>(await adminGet('/api/admin/published'));
}

export async function adminScheduled(): Promise<ScheduledTrack[]> {
  return json<ScheduledTrack[]>(await adminGet('/api/admin/scheduled'));
}

export async function publish(
  files: string[],
  scheduled: ScheduledTrack[],
  csrfToken: string,
): Promise<void> {
  await json<unknown>(await adminPost('/api/admin/publish', { files, scheduled }, csrfToken));
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
