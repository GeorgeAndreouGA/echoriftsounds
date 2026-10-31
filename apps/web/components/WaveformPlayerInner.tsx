'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Variants } from 'framer-motion';
import { animate, motion, useAnimationControls, useMotionValue, useTransform } from 'framer-motion';
import type WaveSurferType from 'wavesurfer.js';
import { extractYoutubeVideoId } from '@echorift/shared';
import { useActiveTrack, autoPlayOnNext } from '../lib/activeTrack';
import { useCoarsePointer } from '../lib/useCoarsePointer';
import { useMotionTier } from '../lib/motion/useMotionTier';
import { useDecayMount, useVariants } from './motion/variants';
import { DUR, EASE, s } from './motion/tokens';
import { withBase } from '../lib/api';
import { YoutubeController, type YoutubePlayerState } from '../lib/youtube';
import {
  PlayIcon,
  PauseIcon,
  PrevIcon,
  NextIcon,
  DownloadIcon,
  StatusDot,
  Caret,
} from './icons/CrtIcons';

type Loop = 'OFF' | 'ONE' | 'ALL';

interface Props {
  file: string;
  /**
   * The YouTube video this track plays through. Playback is YouTube-backed,
   * not streamed off disk — null means the track predates that requirement
   * (migratePublished leaves legacy entries at null) and has no playable
   * source yet, so this renders a blocked state instead of a player. The
   * DOWNLOAD button is unaffected either way: it's always `/audio/<file>`.
   */
  youtubeUrl: string | null;
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** Half the hover bubble's min-width — how far from each end it stops tracking. */
const BUBBLE_HALF = 30;

// Rate limit on the touch overlay's real YouTube seeks during a drag (see
// touchSeekLastRef above) — the visual cursor still moves every pointermove.
const TOUCH_SEEK_THROTTLE_MS = 150;

// The peaks fetch gets a deadline, like every admin call already does. Without
// one a stalled response leaves the player showing LOADING forever.
const PEAKS_TIMEOUT_MS = 15_000;
// The API answers 202 while it generates. Poll a bounded number of times, then
// give up and play without a waveform rather than hanging on it.
const PEAKS_POLL_ATTEMPTS = 6;
const PEAKS_POLL_DELAY_MS = 5_000;

// The IFrame API has to load its script, construct the embed and fetch the
// video's own metadata before it calls onReady — generous because that's a
// real network round trip to YouTube, not a local call. Longer than
// PEAKS_TIMEOUT_MS on purpose: this is the slower of the two things being
// awaited together below.
const YT_READY_TIMEOUT_MS = 20_000;

// Drawn when there are no peaks: a flat, dim line. Not decoration — it is the
// visual half of "no waveform available", paired with the header text, and it
// keeps the bar present so scrubbing and the playhead still have somewhere to
// live. 128 bars is enough to look deliberate at any width.
const FLAT_PEAKS: number[] = Array.from({ length: 128 }, () => 0.04);

interface PeaksPayload {
  peaks: number[];
  duration: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch pre-computed peaks, tolerating the 202 the API returns while it
 * generates them. Returns null when they cannot be had — the caller must then
 * play the track WITHOUT a waveform, never by decoding it in the browser.
 */
async function fetchPeaks(
  file: string,
  isAborted: () => boolean,
): Promise<PeaksPayload | null> {
  for (let attempt = 0; attempt < PEAKS_POLL_ATTEMPTS; attempt++) {
    if (isAborted()) return null;
    let res: Response;
    try {
      res = await fetch(withBase(`/api/tracks/${encodeURIComponent(file)}/peaks`), {
        cache: 'force-cache',
        signal: AbortSignal.timeout(PEAKS_TIMEOUT_MS),
      });
    } catch {
      return null; // network error or timeout — not worth another 5 attempts
    }

    if (res.ok) {
      try {
        const { peaks, duration } = (await res.json()) as PeaksPayload;
        if (Array.isArray(peaks) && peaks.length > 0 && duration > 0) {
          return { peaks, duration };
        }
      } catch {
        /* malformed body — treat as unavailable */
      }
      return null;
    }

    // Anything other than "generating" is final: 404 unknown file, 429, 5xx.
    if (res.status !== 202) return null;

    const retryAfter = Number(res.headers.get('Retry-After'));
    await sleep(
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : PEAKS_POLL_DELAY_MS,
    );
  }
  return null;
}

function CtrlBtn({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="ctrl-btn cur-pointer"
      style={{
        background: 'transparent',
        border: '1px solid #8a5f00',
        color: '#ffb000',
        fontFamily: "var(--font-jetbrains-mono), monospace",
        fontSize: '11px',
        padding: '0.25rem 0.5rem',
        lineHeight: 1,
        borderRadius: 0,
        transition: 'border-color 0.1s, background 0.1s',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = '#ffb000';
        (e.currentTarget as HTMLElement).style.background = 'rgba(255,176,0,0.08)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = '#8a5f00';
        (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      {children}
    </button>
  );
}

/**
 * The bright edge of the beam, riding the leading edge of beamDraw's clip wipe.
 * Same duration and easing as the wipe, so the two stay welded together — if
 * beamDraw's timing changes, this follows automatically.
 *
 * 'full' only: it's the last 5% of the effect and the first thing worth dropping.
 */
function BeamBar() {
  return (
    <motion.div
      aria-hidden
      initial={{ left: '0%', opacity: 0.9 }}
      animate={{ left: '100%', opacity: 0.9 }}
      transition={{ duration: s(DUR.d5), ease: [...EASE.cut] }}
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: 2,
        background: '#ffd96b',
        boxShadow: '0 0 8px 1px rgba(255,217,107,0.8)',
        pointerEvents: 'none',
      }}
    />
  );
}

/**
 * The strike where a seek lands. Mount-and-decay, unmounted on completion — same
 * shape as TrackCard's PhosphorTrail, and it carries the same obligation: the
 * CALLER must refuse to mount it at tier 'none', because toVariants' 'none' branch
 * returns hidden:{opacity:1} and a decay's "final state" is invisible. See flashAt.
 *
 * `left` is set once at mount and never animated, so it needs no motion value — a
 * click is not a per-frame event and one setState per seek is correct.
 */
function BeamLand({
  pct,
  variants,
  onDone,
}: {
  pct: number;
  variants: Variants;
  onDone: () => void;
}) {
  return (
    <motion.div
      aria-hidden
      variants={variants}
      initial="hidden"
      animate="visible"
      onAnimationComplete={onDone}
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: `${pct * 100}%`,
        width: 2,
        marginLeft: -1,
        background: '#ffd96b',
        pointerEvents: 'none',
      }}
    />
  );
}

/**
 * The DOWNLOAD button is identical across every state (linked, missing,
 * broken) because it's fully independent of YouTube — always `/audio/<file>`.
 * Pulled out so the blocked states below don't duplicate it.
 */
function DownloadButton({ file }: { file: string }) {
  return (
    <a
      href={withBase(`/audio/${encodeURIComponent(file)}`)}
      download={file}
      className="crt-btn small dl-btn"
      aria-label={`Download ${file}`}
    >
      <DownloadIcon size={12} />
      <span className="dl-text">DOWNLOAD</span>
    </a>
  );
}

/** Rendered instead of the waveform/video when there's no playable source —
 * either the track predates the YouTube requirement, or its link is broken. */
function BlockedPlayerFrame({
  file,
  message,
}: {
  file: string;
  message: string;
}) {
  return (
    <div className="crt-player-frame" aria-label={`Player for ${file}`}>
      <div className="crt-player-header">
        <span style={{ color: '#ff9933' }}>{message}</span>
      </div>
      <div
        style={{
          padding: '1rem 0.75rem',
          color: '#8a5f00',
          fontSize: '11px',
          fontFamily: "var(--font-jetbrains-mono), monospace",
          letterSpacing: '0.04em',
        }}
      >
        &gt; PLAYBACK UNAVAILABLE. THE FILE CAN STILL BE DOWNLOADED BELOW.
      </div>
      <div className="crt-player-controls">
        <div className="ctrl-group">
          <DownloadButton file={file} />
        </div>
      </div>
    </div>
  );
}

export function WaveformPlayerInner({ file, youtubeUrl }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurferType | null>(null);
  const ytRef = useRef<YoutubeController | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  // ── Hover readout ────────────────────────────────────────────────────────
  // Deliberately NOT a MotionSpec. SPECS describes a transition between two
  // declared states over a fixed duration; a pointer-tracked position has no
  // `from`, no `to` and no duration, and routing it through toVariants would hand
  // it to the 'none' branch — which collapses everything to opacity:1. That is
  // right for decoration and wrong here: a reduced-motion visitor still needs to
  // see where they are pointing on a 30-minute mix. The hairline and timecode are
  // INFORMATION and survive at every tier; only the fade and glow are decoration.
  // Same category as BeamBar below — hand-written against the tokens.
  const hoverX = useMotionValue(0);
  const hoverOpacity = useMotionValue(0);
  // The preview fill spans playhead → cursor, and the playhead keeps moving while
  // the pointer sits still. Driving it off a motion value rather than the
  // `currentTime` state keeps the fill live during playback without the fill
  // itself ever causing a render.
  const playheadX = useMotionValue(0);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const deltaRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const pendingX = useRef(0);
  const lastLabel = useRef('');
  const boxW = useRef(0);
  const boxLeft = useRef(0);

  // The tier-'none' gate lives inside useDecayMount, not here — beamLand decays
  // to opacity 0, and toVariants' 'none' branch would otherwise pin it bright.
  const land = useDecayMount<number>('beamLand');

  const scrubRef = useRef(false);
  const wasPlayingRef = useRef(false);
  // Throttles the touch-overlay's ACTUAL YouTube seeks during a drag — each one
  // is a real IFrame postMessage round trip, unlike the old local Range-request
  // seeks this overlay used to issue. The visual cursor still updates every
  // pointermove regardless; only the real seek is rate-limited.
  const touchSeekLastRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // Peaks could not be fetched: the track is fully playable, the waveform is a
  // flat placeholder, and the header says so instead of pretending.
  const [noWaveform, setNoWaveform] = useState(false);
  // The YouTube embed itself failed (deleted/private/embedding disallowed) or
  // never became ready in time — distinct from `!youtubeUrl`, which is the
  // track simply never having had a link at all.
  const [videoUnavailable, setVideoUnavailable] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [loop, setLoop] = useState<Loop>('OFF');
  const [glitching, setGlitching] = useState(false);
  // Fires once per decode, on the loading → ready edge, so the beam paints the
  // waveform it just finished decoding. Not tied to `!isLoading`, which is also
  // true for every subsequent re-render.
  const [beamDrawing, setBeamDrawing] = useState(false);
  const beamControls = useAnimationControls();
  const beamDraw = useVariants('beamDraw');

  const tier = useMotionTier();
  // Kept separate from the tier on purpose: this asks "is there a pointer?" (for
  // the touch scrub overlay below), not "how much motion is allowed?".
  const coarsePointer = useCoarsePointer();

  const { filteredFiles, setActiveFile } = useActiveTrack();

  // Wavesurfer's 'finish' handler is registered once at mount; without these
  // refs it captures the loop/goNext values from that first render and never
  // sees later updates, so cycling LOOP modes mid-playback was a no-op.
  const loopRef = useRef<Loop>('OFF');
  loopRef.current = loop;
  const goNextRef = useRef<() => void>(() => {});

  const triggerGlitch = useCallback(() => {
    setGlitching(true);
    setTimeout(() => setGlitching(false), 180);
  }, []);

  const goNext = useCallback(() => {
    const idx = filteredFiles.indexOf(file);
    if (idx >= 0 && idx < filteredFiles.length - 1) {
      triggerGlitch();
      setTimeout(() => setActiveFile(filteredFiles[idx + 1]), 90);
    }
  }, [file, filteredFiles, setActiveFile, triggerGlitch]);
  goNextRef.current = goNext;

  const goPrev = useCallback(() => {
    const idx = filteredFiles.indexOf(file);
    if (idx > 0) {
      triggerGlitch();
      setTimeout(() => setActiveFile(filteredFiles[idx - 1]), 90);
    }
  }, [file, filteredFiles, setActiveFile, triggerGlitch]);

  const cycleLoop = useCallback(() => {
    setLoop((l) => (l === 'OFF' ? 'ONE' : l === 'ONE' ? 'ALL' : 'OFF'));
  }, []);

  const seek = useCallback((delta: number) => {
    const yt = ytRef.current;
    if (!yt) return;
    const d = yt.getDuration();
    if (!d) return;
    // seekTo reports the new position via onTick (registered in the main
    // effect below) immediately, synchronously — that's what moves the drawn
    // cursor and `currentTime` without waiting for the next poll tick.
    yt.seekTo(Math.max(0, Math.min(d, yt.getCurrentTime() + delta)));
  }, []);

  /**
   * Pointer x → position ratio, measured against the CANVAS and nothing else.
   *
   * Never derive this from an overlay's own rect. `.crt-player-waveform` is the
   * positioned ancestor and carries `padding: 0.5rem 0.75rem 0`, and an absolutely
   * positioned child resolves against its ancestor's PADDING box — so an overlay
   * pinned `left:0; right:0` is 24px wider than the canvas and straddles it by 12px
   * a side. Measured on a 390px viewport: canvas x=38 w=314, overlay x=26 w=338.
   *
   * That was a live bug in the touch overlay: ~1.8% of duration of seek error,
   * worst at the edges and exactly zero at the centre — which is why it never
   * looked broken, and why testing only the middle proves nothing. On a 30-minute
   * mix it was ~32 seconds, and it meant touch and click disagreed with each other.
   */
  const ratioFromClientX = useCallback((clientX: number) => {
    const r = containerRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return null;
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  }, []);

  /**
   * The only place pointer position is read. Runs at most once per frame and
   * performs ZERO React renders:
   *   - geometry goes to a motion value, which framer writes straight to
   *     `transform` from its own rAF loop (compositor-only, no layout, no paint);
   *   - text goes to `textContent` directly, gated on the string actually changing.
   *     fmt() is second-resolution, so that is ~1 DOM write per second of sweeping
   *     rather than 60. There is nothing for React to diff against — we already
   *     know the new string.
   *
   * The rAF gate is not optional: high-rate mice deliver pointer events at
   * 500-1000Hz, and without it that is 1000 getBoundingClientRect() calls a second
   * on a 1-CPU box. With it, <=60, and the browser skips them entirely when the tab
   * is hidden.
   */
  const applyHover = useCallback(() => {
    rafRef.current = 0;
    const box = containerRef.current;
    const ws = wsRef.current;
    if (!box || !ws) return;

    const rect = box.getBoundingClientRect();
    if (rect.width === 0) return;
    boxW.current = rect.width;

    const px = Math.min(rect.width, Math.max(0, pendingX.current - rect.left));
    hoverX.set(px);

    const t = (px / rect.width) * (ws.getDuration() || 0);
    const label = fmt(t);
    if (label === lastLabel.current) return;
    lastLabel.current = label;
    if (bubbleRef.current) bubbleRef.current.textContent = label;
    if (deltaRef.current) {
      const d = t - ws.getCurrentTime();
      deltaRef.current.textContent = `${d < 0 ? '-' : '+'}${fmt(Math.abs(d))}`;
    }
  }, [hoverX]);

  const onWaveformPointerMove = useCallback(
    (e: React.PointerEvent) => {
      pendingX.current = e.clientX;
      if (!rafRef.current) rafRef.current = requestAnimationFrame(applyHover);
    },
    [applyHover],
  );
  // The wavesurfer listeners are registered once per track and would otherwise
  // capture the first render's closure.
  const applyHoverRef = useRef(applyHover);
  applyHoverRef.current = applyHover;
  const playheadXRef = useRef(playheadX);
  playheadXRef.current = playheadX;

  // Registered once per track, so the wavesurfer listeners would otherwise capture
  // the first render's closure.
  const flashAtRef = useRef(land.fire);
  flashAtRef.current = land.fire;

  /** Only the 110ms opacity ramp is tier-gated. The position never is. */
  const fadeReadout = useCallback(
    (to: number) => {
      animate(hoverOpacity, to, {
        duration: tier === 'none' ? 0 : s(DUR.d1),
        ease: [...EASE.snap],
      });
    },
    [hoverOpacity, tier],
  );
  const fadeReadoutRef = useRef(fadeReadout);
  fadeReadoutRef.current = fadeReadout;

  /**
   * Keeps the bubble inside the waveform box near the ends. Chained off hoverX so
   * it stays on the motion-value path — clamping in the pointer handler would have
   * meant reading width in React and re-rendering.
   */
  const bubbleShift = useTransform(hoverX, (x) => {
    const w = boxW.current;
    if (!w) return 0;
    return Math.min(w - BUBBLE_HALF, Math.max(BUBBLE_HALF, x)) - x;
  });

  // The jump span: from wherever playback is now, to wherever the pointer is.
  // Composed from two motion values, so it stays correct whether the pointer
  // moves, the playhead moves, or both — and neither path re-renders.
  const hoverXAbs = useTransform(hoverX, (x) => x + boxLeft.current);
  const fillLeft = useTransform(
    [hoverX, playheadX],
    ([h, p]: number[]) => Math.min(h, p) + boxLeft.current,
  );
  const fillWidth = useTransform([hoverX, playheadX], ([h, p]: number[]) => Math.abs(h - p));

  /**
   * boxW feeds the bubble clamp and the playhead's px position. Kept fresh by an
   * observer rather than measured per audioprocess — that handler fires many times
   * a second and a getBoundingClientRect in it would be a forced layout each time.
   */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const sync = () => {
      boxW.current = el.getBoundingClientRect().width;
      // The overlays are positioned against .crt-player-waveform's PADDING box,
      // but every x we compute is measured from the CANVAS edge — the same 12px
      // discrepancy that made the touch overlay seek wrong. Carry the offset
      // explicitly rather than hardcoding the padding, which is in rem.
      boxLeft.current = el.offsetLeft;
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A hover left stranded by the window losing focus never gets a pointerleave.
  // Same for a drag: wavesurfer's drag stream listens on document for pointerup /
  // pointercancel / pointerout, which covers nearly everything except alt-tabbing
  // with the button held — without this bail that leaves the track permanently
  // paused behind a highlighted frame.
  useEffect(() => {
    const onBlur = () => {
      fadeReadoutRef.current(0);
      lastLabel.current = '';
      if (!scrubRef.current) return;
      scrubRef.current = false;
      frameRef.current?.removeAttribute('data-scrubbing');
      if (wasPlayingRef.current) {
        ytRef.current?.play();
        wasPlayingRef.current = false;
      }
    };
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('blur', onBlur);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    // No link (legacy track) or an unparseable one (shouldn't happen — the
    // server validates on publish — but defensive): nothing to set up. The
    // JSX below renders BlockedPlayerFrame instead in both cases.
    const videoId = youtubeUrl ? extractYoutubeVideoId(youtubeUrl) : null;
    if (!youtubeUrl || !videoId) {
      setIsLoading(false);
      setVideoUnavailable(!!youtubeUrl && !videoId);
      return;
    }
    if (!containerRef.current || !videoContainerRef.current) return;

    let ws: WaveSurferType | null = null;
    let yt: YoutubeController | null = null;
    let aborted = false;

    // The effect re-runs on `file`/`youtubeUrl` without remounting, so last
    // track's outcome would otherwise carry over into this one's header.
    setIsLoading(true);
    setNoWaveform(false);
    setVideoUnavailable(false);

    // Mirrors playback position into a motion value for the preview fill, and
    // into the React state that drives the timecode text. Declared here (not
    // inside the IIFE below) because the YouTube controller's callbacks are
    // constructed before `ws` exists — closures over the `ws`/`yt` `let`s
    // above see their later-assigned values once this actually runs, exactly
    // like the pre-YouTube version did for its media element.
    const syncPlayhead = (t: number) => {
      setCurrentTime(t);
      const d = ws?.getDuration() ?? 0;
      playheadXRef.current.set(d > 0 ? (t / d) * boxW.current : 0);
      // Visual-only cursor move — wavesurfer has no real media backing it, so
      // this never issues a network request.
      ws?.setTime(t);
    };

    // Built via a resolve/reject pair captured here, rather than constructing
    // `yt` inside the Promise executor itself — assigning the outer `let yt`
    // from within that nested closure defeats TypeScript's narrowing of it
    // everywhere else in this effect (it sees the declared type as possibly
    // `never` past that point). Constructing `yt` directly in this scope,
    // right after, keeps its type exactly `YoutubeController` from here on.
    let resolveReady!: (dur: number) => void;
    let rejectReady!: (err: Error) => void;
    const ytReady = new Promise<number>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });

    const readyTimer = setTimeout(
      () => rejectReady(new Error('YouTube player timed out')),
      YT_READY_TIMEOUT_MS,
    );
    yt = new YoutubeController(videoContainerRef.current!, videoId, {
      onReady: (dur) => {
        clearTimeout(readyTimer);
        resolveReady(dur);
      },
      onError: (code) => {
        clearTimeout(readyTimer);
        rejectReady(new Error(`YouTube error ${code}`));
      },
      onStateChange: (state: YoutubePlayerState) => {
        // Guarded: scrubbing pauses/resumes playback itself, and without
        // this the header would flash NOW PLAYING → STANDBY → NOW PLAYING
        // on every drag.
        if (state === 'playing' && !scrubRef.current) setIsPlaying(true);
        if (state === 'paused' && !scrubRef.current) setIsPlaying(false);
        if (state === 'ended') {
          setIsPlaying(false);
          if (loopRef.current === 'ONE') {
            yt?.seekTo(0);
            yt?.play();
          } else if (loopRef.current === 'ALL') {
            autoPlayOnNext.pending = true;
            goNextRef.current();
          }
        }
      },
      onTick: syncPlayhead,
    });

    (async () => {
      const [{ default: WaveSurfer }, data, dur] = await Promise.all([
        import('wavesurfer.js'),
        // Pre-computed peaks, or none at all — never a browser-side decode.
        // The waveform reflects the HDD master; playback is YouTube's own
        // copy of the same content, which is why `dur` below prefers
        // YouTube's own reported duration — that's what seeking actually
        // operates against.
        fetchPeaks(file, () => aborted),
        ytReady,
      ]);
      if (aborted) return;

      setNoWaveform(!data);
      setDuration(dur);

      ws = WaveSurfer.create({
        container: containerRef.current!,
        waveColor: '#8a5f00',
        progressColor: '#ffb000',
        cursorColor: '#ffd96b',
        cursorWidth: 2,
        barWidth: 2,
        barGap: 1,
        barRadius: 0,
        height: 64,
        normalize: true,
        // Mouse users could not scrub at all before this — the option defaults
        // false. It is also a precondition for the dragstart/drag/dragend events
        // existing: wavesurfer only calls initDrag() when this is truthy, so
        // there is no hooks-without-behaviour option to pick instead. No
        // `media`/`url` here: this instance never plays anything itself, it
        // only draws the peaks and reports pointer gestures — YouTube (via
        // `yt`, already constructed above) is the sole playback authority.
        dragToSeek: true,
        peaks: [data ? data.peaks : FLAT_PEAKS],
        duration: dur,
      });
      wsRef.current = ws;
      ytRef.current = yt;
      yt?.setVolume(80);

      setIsLoading(false);
      if (autoPlayOnNext.pending) {
        autoPlayOnNext.pending = false;
        yt?.play();
      }

      ws.on('click', (relX: unknown) => {
        flashAtRef.current(relX as number);
        ytRef.current?.seekTo((relX as number) * dur);
      });

      /**
       * Scrub like tape: pause on grab, resume on release. wavesurfer's own
       * renderProgress() tracks the pointer at full frame rate regardless —
       * this is about the ACTUAL YouTube playback, not the visual.
       */
      ws.on('dragstart', () => {
        scrubRef.current = true;
        wasPlayingRef.current = ytRef.current?.isPlaying() ?? false;
        if (wasPlayingRef.current) ytRef.current?.pause();
        frameRef.current?.setAttribute('data-scrubbing', '');
        // Once the real playhead is tracking the pointer it IS the cursor; two
        // lines on the same pixel is noise. The bubble stays — the target
        // timecode is the one thing the playhead doesn't tell you.
        fadeReadoutRef.current(0);
      });

      ws.on('drag', (relX: unknown) => {
        const box = containerRef.current;
        if (!box) return;
        const rect = box.getBoundingClientRect();
        pendingX.current = rect.left + (relX as number) * rect.width;
        if (!rafRef.current) rafRef.current = requestAnimationFrame(applyHoverRef.current);
      });

      ws.on('dragend', (relX: unknown) => {
        scrubRef.current = false;
        frameRef.current?.removeAttribute('data-scrubbing');
        ws?.seekTo(relX as number);
        ytRef.current?.seekTo((relX as number) * dur);
        flashAtRef.current(relX as number);
        if (wasPlayingRef.current) {
          ytRef.current?.play();
          wasPlayingRef.current = false;
        }
      });
      ws.on('error', (err: unknown) => {
        console.error('[WaveformPlayer]', err);
        setIsLoading(false);
      });
    })().catch((err) => {
      console.error('[WaveformPlayer]', err);
      if (!aborted) {
        setVideoUnavailable(true);
        setIsLoading(false);
      }
    });

    return () => {
      aborted = true;
      ws?.destroy();
      yt?.destroy();
      wsRef.current = null;
      ytRef.current = null;
    };
  }, [file, youtubeUrl]);

  /**
   * Jump to an absolute position, with the same landing acknowledgement a click
   * gets. This is what stops the feature being pointer-only: hover is a pointer
   * affordance with no keyboard analogue, but "seek anywhere" absolutely has one,
   * and its absence was the real gap.
   */
  const seekToPct = useCallback(
    (pct: number) => {
      const ws = wsRef.current;
      const yt = ytRef.current;
      if (!ws || !yt) return;
      const p = Math.min(1, Math.max(0, pct));
      ws.seekTo(p); // visual only — see the note above the effect that creates `ws`
      const d = yt.getDuration();
      if (d) yt.seekTo(p * d);
      flashAtRef.current(p);
    },
    [],
  );

  // Keyboard shortcuts (when active)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case ' ': {
          e.preventDefault();
          const yt = ytRef.current;
          if (yt) { if (yt.isPlaying()) yt.pause(); else yt.play(); }
          break;
        }
        case 'ArrowLeft': seek(-5); break;
        case 'ArrowRight': seek(5); break;
        case 'j': case 'J': seek(-10); break;
        case 'l': case 'L': seek(10); break;
        case 'Home': e.preventDefault(); seekToPct(0); break;
        // Not 1.0: seeking to the exact end fires `finish`, which would advance
        // the track under LOOP ALL rather than parking at the end.
        case 'End': e.preventDefault(); seekToPct(0.999); break;
        default:
          if (/^[0-9]$/.test(e.key)) {
            e.preventDefault();
            seekToPct(Number(e.key) / 10);
          }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [seek, seekToPct]);

  const ext = file.split('.').pop()?.toUpperCase() ?? 'WAV';
  const hoverEnabled = !coarsePointer && !isLoading;

  // 'light' drops the GPU-heavy filter keyframes (saturate + hue-rotate force a
  // full re-raster of the player frame) but keeps the scaleY wobble — animations
  // stay, jank goes. 'none' drops the glitch entirely: it is decoration, and the
  // track still changes without it.
  // The beam sweep on first decode. 'none' skips it: the waveform is information,
  // and information should not wait on decoration.
  const wasLoading = useRef(isLoading);
  useEffect(() => {
    const justReady = wasLoading.current && !isLoading;
    wasLoading.current = isLoading;
    if (!justReady || tier === 'none') return;

    let cancelled = false;
    setBeamDrawing(true);
    beamControls.set('hidden');
    beamControls.start('visible').then(() => {
      if (!cancelled) setBeamDrawing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isLoading, tier, beamControls]);

  const glitchAnim =
    !glitching || tier === 'none'
      ? {}
      : tier === 'light'
        ? { scaleY: [1, 0.97, 1.01, 1] }
        : {
            scaleY: [1, 0.96, 1.02, 1],
            filter: ['none', 'saturate(3) hue-rotate(20deg)', 'none'],
          };

  // Hooks above all run unconditionally every render regardless of which of
  // these paths is taken — only the JSX they produce differs.
  if (!youtubeUrl) {
    return <BlockedPlayerFrame file={file} message="NO VIDEO LINKED" />;
  }
  if (videoUnavailable) {
    return <BlockedPlayerFrame file={file} message="VIDEO UNAVAILABLE" />;
  }

  return (
    <motion.div
      ref={frameRef}
      className="crt-player-frame"
      data-fx="heavy"
      aria-label={`Player for ${file}`}
      animate={glitchAnim}
      transition={{ duration: s(DUR.d3), ease: [...EASE.cut] }}
    >
      {/* Header */}
      <div className="crt-player-header">
        {isLoading ? (
          <>
            <span>LOADING</span>
            <Caret speed={0.8} />
            <div
              style={{
                flex: 1,
                height: '2px',
                background: '#1a1f12',
                overflow: 'hidden',
                position: 'relative',
                marginLeft: '0.5rem',
              }}
            >
              {/* The reduced-motion guard in globals.css clamps every animation to
                  0.01ms / 1 iteration. scan-beam's 100% frame is opacity:0, so the
                  clamp doesn't slow this bar down — it deletes it, leaving no
                  loading affordance at all. Give 'none' a static bar instead. */}
              <div
                style={
                  tier === 'none'
                    ? { position: 'absolute', height: '100%', width: '100%', background: '#ffb000', opacity: 0.4 }
                    : {
                        position: 'absolute',
                        height: '100%',
                        width: '30%',
                        background: '#ffb000',
                        animation: 'scan-beam 1.2s linear infinite',
                      }
                }
              />
            </div>
          </>
        ) : (
          <>
            {isPlaying ? (
              <>
                <span className="crt-status-dot" />
                <span style={{ color: '#39ff14', letterSpacing: '0.06em' }}>NOW PLAYING</span>
              </>
            ) : (
              <span
                style={{
                  color: '#8a5f00',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <StatusDot /> STANDBY
              </span>
            )}
            <span style={{ flex: 1 }} />
            {noWaveform && (
              <span
                role="status"
                title="Waveform data could not be loaded. Playback and seeking still work."
                style={{
                  color: '#ff9933',
                  fontSize: '10px',
                  letterSpacing: '0.05em',
                  marginRight: '0.6rem',
                }}
              >
                WAVEFORM UNAVAILABLE
              </span>
            )}
            <span style={{ color: '#8a5f00', fontSize: '10px', letterSpacing: '0.05em' }}>
              {fmt(duration)} {ext}
            </span>
          </>
        )}
      </div>

      {/* Video — the actual playback source, kept off-screen (not shown to
          the listener); see the comment on .crt-player-video in globals.css. */}
      <div className="crt-player-video">
        <div ref={videoContainerRef} aria-hidden />
      </div>

      {/* Waveform */}
      <div
        className="crt-player-waveform"
        style={{
          opacity: isLoading ? 0.3 : 1,
          transition: `opacity var(--dur-4) var(--ease-decay)`,
          position: 'relative',
        }}
        // The listener lives here, not on the readout — the readout is
        // pointerEvents:'none' so wavesurfer keeps owning 100% of pointer input
        // and there is exactly one seek authority.
        onPointerMove={hoverEnabled ? onWaveformPointerMove : undefined}
        onPointerEnter={hoverEnabled ? () => fadeReadout(1) : undefined}
        onPointerLeave={
          hoverEnabled
            ? () => {
                fadeReadout(0);
                lastLabel.current = '';
              }
            : undefined
        }
      >
        {/* The clip lives on a wrapper, not on containerRef itself — wavesurfer
            owns that node's styles and measures it to size the canvas.
            Driven by controls rather than initial/animate or a key: the element is
            already mounted when the beam fires, and remounting it to restart the
            animation would destroy the canvas wavesurfer just drew into. */}
        <motion.div animate={beamControls} variants={beamDraw}>
          {/* aria-hidden, not aria-label: a label on a <div> with no role is
              dropped by most AT, so the old one announced nothing. A bar chart of
              amplitudes conveys nothing useful anyway — the timecode below and the
              keyboard seeks carry the real semantics. */}
          <div ref={containerRef} style={{ minHeight: 64 }} aria-hidden />
        </motion.div>
        {beamDrawing && tier === 'full' && <BeamBar />}
        {land.token && (
          <BeamLand
            key={land.token.k}
            pct={land.token.payload}
            variants={land.variants}
            onDone={land.clear}
          />
        )}

        {/* Hover readout — fine pointers only. There is no hover state on a
            touchscreen, the bubble would sit under the finger, and it would be
            pure DOM + listener cost on the weakest devices in the fleet. That
            makes this and the touch overlay below mutually exclusive. */}
        {/* Preview fill — the span you would jump across, from the playhead to the
            pointer. Shares hoverOpacity, so it hides during a drag for free: by
            then wavesurfer's own progress fill is already tracking the pointer and
            a second highlight over the same span would just be noise. */}
        {hoverEnabled && (
          <motion.div
            aria-hidden
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: fillLeft,
              width: fillWidth,
              opacity: hoverOpacity,
              background: 'rgba(255,222,140,0.95)',
              // Blends with the canvas underneath instead of covering it, so the
              // highlight traces the ACTUAL bars rather than painting a flat block
              // over the gaps between them. Follows every track's real shape with
              // no per-frame work and no risk of drifting out of alignment with
              // wavesurfer's bar layout.
              mixBlendMode: 'overlay',
              borderLeft: '1px solid rgba(255,214,120,0.75)',
              borderRight: '1px solid rgba(255,214,120,0.75)',
              pointerEvents: 'none',
            }}
          />
        )}

        {hoverEnabled && (
          <motion.div
            aria-hidden
            style={{
              position: 'absolute',
              left: 0,
              top: -6,
              bottom: -6,
              width: 0,
              x: hoverXAbs,
              opacity: hoverOpacity,
              pointerEvents: 'none',
            }}
          >
            {/* Beam spotlight — the pool of light where the beam is pointed. A
                glow, so by the same rule as the hairline's it is decoration and
                only renders at the full tier. */}
            {tier === 'full' && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: -70,
                  width: 140,
                  background:
                    'radial-gradient(ellipse at center, rgba(255,224,150,0.40) 0%, rgba(255,176,0,0.18) 45%, transparent 72%)',
                }}
              />
            )}
            {/* Hairline. Distinct from wavesurfer's playhead on three axes —
                1px vs 2px, dim amber vs hot #ffd96b, dashed vs solid — so the
                two are never confused. The dash is a background gradient rather
                than a border so it stays compositor-friendly. */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: -0.5,
                width: 1,
                backgroundImage:
                  'repeating-linear-gradient(to bottom, rgba(255,224,150,0.95) 0 4px, transparent 4px 8px)',
                boxShadow: tier === 'full' ? '0 0 6px rgba(255,214,120,0.8)' : 'none',
              }}
            />
            {/* Target timecode. Not a duplicate of .crt-player-timecode below:
                that shows where you ARE, this shows where you would LAND. On a
                30-minute mix that difference is the whole point of the feature. */}
            <motion.div
              style={{
                position: 'absolute',
                // Inside the waveform, not above it. TrackCard wraps the expanded
                // player in overflow:hidden for its height animation, so a bubble
                // sitting at bottom:100% gets its top line clipped off — and the
                // absolute timecode is the line that matters most.
                top: 2,
                left: 0,
                x: bubbleShift,
                translateX: '-50%',
                padding: '2px 5px',
                minWidth: BUBBLE_HALF * 2,
                textAlign: 'center',
                background: '#0a0b06',
                border: '1px solid #8a5f00',
                fontSize: 10,
                lineHeight: 1.35,
                letterSpacing: '0.06em',
                whiteSpace: 'nowrap',
              }}
            >
              <div ref={bubbleRef} style={{ color: '#ffb000' }}>
                0:00
              </div>
              {/* The signed delta is the number that is genuinely hard to derive
                  from two absolutes, and it costs nothing — same rAF, same write. */}
              <div ref={deltaRef} style={{ color: '#8a5f00' }}>
                +0:00
              </div>
            </motion.div>
          </motion.div>
        )}

        {coarsePointer && !isLoading && (
          <div
            role="presentation"
            onPointerDown={(e) => {
              const ws = wsRef.current;
              const yt = ytRef.current;
              if (!ws || !yt) return;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              const ratio = ratioFromClientX(e.clientX);
              if (ratio === null) return;
              ws.seekTo(ratio);
              const d = yt.getDuration();
              if (d) yt.seekTo(ratio * d);
              touchSeekLastRef.current = Date.now();
            }}
            onPointerMove={(e) => {
              const ws = wsRef.current;
              const yt = ytRef.current;
              if (!ws || !yt || e.buttons === 0) return;
              const ratio = ratioFromClientX(e.clientX);
              if (ratio === null) return;
              ws.seekTo(ratio); // visual every move; the real seek is throttled below
              const now = Date.now();
              if (now - touchSeekLastRef.current < TOUCH_SEEK_THROTTLE_MS) return;
              touchSeekLastRef.current = now;
              const d = yt.getDuration();
              if (d) yt.seekTo(ratio * d);
            }}
            onPointerUp={(e) => {
              const yt = ytRef.current;
              if (!yt) return;
              // Commit the final position even if it landed inside the
              // throttle window above, so a drag never ends short of where
              // the visual cursor (and the finger) actually stopped.
              const ratio = ratioFromClientX(e.clientX);
              if (ratio === null) return;
              const d = yt.getDuration();
              if (d) yt.seekTo(ratio * d);
            }}
            className="cur-pointer"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: -6,
              bottom: -6,
              touchAction: 'pan-y',
            }}
          />
        )}
      </div>

      {/* Timecode */}
      <div className="crt-player-timecode" aria-live="off" aria-label={`Time: ${fmt(currentTime)} of ${fmt(duration)}`}>
        {fmt(currentTime)} / {fmt(duration || 0)}
      </div>

      {/* Controls */}
      <div className="crt-player-controls">
        <div className="ctrl-group">
          <CtrlBtn onClick={goPrev} label="Previous track">
            <PrevIcon />
          </CtrlBtn>
          <CtrlBtn
            onClick={() => {
              const yt = ytRef.current;
              if (yt) { if (yt.isPlaying()) yt.pause(); else yt.play(); }
            }}
            label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </CtrlBtn>
          <CtrlBtn onClick={goNext} label="Next track">
            <NextIcon />
          </CtrlBtn>
        </div>

        <div className="ctrl-group">
        <button
          onClick={cycleLoop}
          aria-label={`Loop: ${loop}`}
          className="ctrl-btn cur-pointer"
          style={{
            background: 'transparent',
            border: '1px solid',
            borderColor: loop !== 'OFF' ? '#ffb000' : '#8a5f00',
            color: loop !== 'OFF' ? '#ffb000' : '#8a5f00',
            fontFamily: "var(--font-jetbrains-mono), monospace",
            fontSize: '11px',
            padding: '0.25rem 0.5rem',
            lineHeight: 1,
            letterSpacing: '0.06em',
            borderRadius: 0,
          }}
        >
          LOOP {loop}
        </button>

        <DownloadButton file={file} />
        </div>
      </div>
    </motion.div>
  );
}
