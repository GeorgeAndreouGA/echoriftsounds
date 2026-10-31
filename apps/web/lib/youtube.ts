'use client';

/**
 * Thin wrapper around the YouTube IFrame Player API so WaveformPlayerInner can
 * treat it like the small media-control surface it actually needs — play/
 * pause/seek/duration/currentTime/volume — without hand-rolling postMessage
 * plumbing or caring about the API's own singleton-callback quirks.
 *
 * Two singleton concerns the IFrame API forces on any caller:
 *   - `window.onYouTubeIframeAPIReady` is called exactly once, globally, when
 *     the script finishes loading — so only the FIRST caller may register it;
 *     every later caller (a new track expanding after an earlier one already
 *     loaded the API) must just await the cached promise.
 *   - The `<script src=".../iframe_api">` tag itself must only be inserted
 *     once, for the same reason.
 */

// Minimal ambient surface for the pieces of the IFrame API this file actually
// calls. There's no @types/youtube dependency in this project; hand-rolling
// just what's used keeps this self-contained and avoids an install.
declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement | string, opts: YTPlayerOptions) => YTPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayerOptions {
  videoId: string;
  playerVars?: Record<string, number | string>;
  origin?: string;
  host?: string;
  events?: {
    onReady?: (e: { target: YTPlayer }) => void;
    onStateChange?: (e: { data: number; target: YTPlayer }) => void;
    onError?: (e: { data: number }) => void;
  };
}

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead?: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  setVolume(volume: number): void;
  destroy(): void;
}

const IFRAME_API_SRC = 'https://www.youtube.com/iframe_api';

let apiReadyPromise: Promise<void> | null = null;

/** Load the IFrame API script exactly once, however many players mount. */
function loadYoutubeIframeApi(): Promise<void> {
  if (apiReadyPromise) return apiReadyPromise;

  apiReadyPromise = new Promise((resolve) => {
    if (typeof window === 'undefined') return;
    if (window.YT?.Player) {
      resolve();
      return;
    }

    // Chain onto whatever is already registered rather than clobbering it —
    // harmless today (nothing else on this page uses the IFrame API), but
    // it's the only safe way to share a single global callback name.
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };

    if (!document.querySelector(`script[src="${IFRAME_API_SRC}"]`)) {
      const script = document.createElement('script');
      script.src = IFRAME_API_SRC;
      document.head.appendChild(script);
    }
  });

  return apiReadyPromise;
}

export type YoutubePlayerState =
  | 'unstarted'
  | 'ended'
  | 'playing'
  | 'paused'
  | 'buffering'
  | 'cued';

const STATE_NAMES: Record<number, YoutubePlayerState> = {
  [-1]: 'unstarted',
  0: 'ended',
  1: 'playing',
  2: 'paused',
  3: 'buffering',
  5: 'cued',
};

// How often to poll getCurrentTime() while playing. The IFrame API has no
// native timeupdate-equivalent event, so this is the only way to drive a
// scrub bar off it. 200ms is frequent enough to read as live without the
// postMessage round-trip becoming a meaningful cost.
const POLL_MS = 200;

export interface YoutubeControllerCallbacks {
  /** Fires once the player is ready; `duration` is known from this point on. */
  onReady?: (duration: number) => void;
  onStateChange?: (state: YoutubePlayerState) => void;
  /** YouTube IFrame API error codes: 2 invalid param, 5 HTML5 error, 100 not
   * found/removed, 101 | 150 embedding disallowed by the uploader. */
  onError?: (code: number) => void;
  /** Called on every poll tick while playing, and once immediately after any
   * seek, so the caller's scrub bar never waits a full tick to catch up. */
  onTick?: (currentTime: number) => void;
}

/**
 * Creates a YouTube player bound to `el` and returns a small controller over
 * it. `el` must already be in the DOM — the IFrame API renders into it
 * directly, replacing its contents.
 */
export class YoutubeController {
  private player: YTPlayer | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  constructor(
    private readonly el: HTMLElement,
    private readonly videoId: string,
    private readonly callbacks: YoutubeControllerCallbacks,
  ) {
    void this.init();
  }

  private async init(): Promise<void> {
    await loadYoutubeIframeApi();
    if (this.destroyed || !window.YT) return;

    this.player = new window.YT.Player(this.el, {
      videoId: this.videoId,
      // `origin` hardens the embed per YouTube's own recommendation. `host`
      // routes the actual iframe at the privacy-enhanced youtube-nocookie.com
      // domain rather than youtube.com — matches the CSP's frame-src in
      // middleware.ts. The rest of playerVars hides every bit of YouTube's
      // own chrome so the CRT controls remain the only interactive surface.
      origin: window.location.origin,
      host: 'https://www.youtube-nocookie.com',
      playerVars: {
        controls: 0,
        disablekb: 1,
        modestbranding: 1,
        rel: 0,
        fs: 0,
        playsinline: 1,
      },
      events: {
        onReady: (e) => {
          if (this.destroyed) return;
          this.callbacks.onReady?.(e.target.getDuration());
        },
        onStateChange: (e) => {
          if (this.destroyed) return;
          const state = STATE_NAMES[e.data] ?? 'unstarted';
          this.callbacks.onStateChange?.(state);
          if (state === 'playing') this.startPolling();
          else this.stopPolling();
        },
        onError: (e) => {
          if (this.destroyed) return;
          this.callbacks.onError?.(e.data);
        },
      },
    });
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      if (!this.player) return;
      this.callbacks.onTick?.(this.player.getCurrentTime());
    }, POLL_MS);
  }

  private stopPolling(): void {
    if (!this.pollTimer) return;
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  play(): void {
    this.player?.playVideo();
  }

  pause(): void {
    this.player?.pauseVideo();
  }

  /**
   * Seeks and immediately reports the new position via onTick, so the
   * caller's drawn cursor doesn't wait for the next poll tick to catch up.
   */
  seekTo(seconds: number): void {
    if (!this.player) return;
    this.player.seekTo(seconds, true);
    this.callbacks.onTick?.(seconds);
  }

  getCurrentTime(): number {
    return this.player?.getCurrentTime() ?? 0;
  }

  getDuration(): number {
    return this.player?.getDuration() ?? 0;
  }

  isPlaying(): boolean {
    return this.player?.getPlayerState() === 1;
  }

  /** 0–100, unlike the Web Audio/HTMLMediaElement convention of 0–1. */
  setVolume(volume: number): void {
    this.player?.setVolume(volume);
  }

  destroy(): void {
    this.destroyed = true;
    this.stopPolling();
    this.player?.destroy();
    this.player = null;
  }
}
