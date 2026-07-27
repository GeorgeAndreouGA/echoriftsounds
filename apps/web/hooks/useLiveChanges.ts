'use client';

import { useEffect, useRef } from 'react';
import { withBase } from '../lib/api';

/**
 * Calls `onChange` whenever the server announces that tracks or categories
 * changed, so open pages stay current without a refresh.
 *
 * The stream carries no data — just a tick — so the caller refetches through
 * its own endpoints and keeps its own auth. EventSource reconnects on its own
 * after a drop, and the server replays a change event to every new subscriber,
 * so a reconnect also repairs anything missed while disconnected.
 */
export function useLiveChanges(onChange: () => void, enabled = true) {
  // Keep the latest callback without re-opening the stream on every render.
  const handler = useRef(onChange);
  handler.current = onChange;

  useEffect(() => {
    if (!enabled) return;
    const es = new EventSource(withBase('/api/tracks/stream'));
    const onEvent = () => handler.current();
    es.addEventListener('change', onEvent);
    return () => {
      es.removeEventListener('change', onEvent);
      es.close();
    };
  }, [enabled]);
}
