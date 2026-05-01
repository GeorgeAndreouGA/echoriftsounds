'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type WaveSurferType from 'wavesurfer.js';
import { useActiveTrack, autoPlayOnNext } from '../lib/activeTrack';
import { useCoarsePointer } from '../lib/useCoarsePointer';

type Loop = 'OFF' | 'ONE' | 'ALL';

interface Props {
  file: string;
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
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
      className="ctrl-btn"
      style={{
        background: 'transparent',
        border: '1px solid #8a5f00',
        color: '#ffb000',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '11px',
        padding: '0.25rem 0.5rem',
        cursor: 'pointer',
        lineHeight: 1,
        borderRadius: 0,
        transition: 'border-color 0.1s, background 0.1s',
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

export function WaveformPlayerInner({ file }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurferType | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [loop, setLoop] = useState<Loop>('OFF');
  const [glitching, setGlitching] = useState(false);

  const reduceMotion = useReducedMotion();
  const coarsePointer = useCoarsePointer();
  const lightFx = !!reduceMotion || coarsePointer;

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
    if (!wsRef.current) return;
    const d = wsRef.current.getDuration();
    const c = wsRef.current.getCurrentTime();
    wsRef.current.seekTo(Math.max(0, Math.min(1, (c + delta) / d)));
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    let ws: WaveSurferType | null = null;
    let mediaEl: HTMLAudioElement | null = null;
    let aborted = false;

    (async () => {
      const { default: WaveSurfer } = await import('wavesurfer.js');
      if (aborted) return;

      // Try pre-computed peaks first (avoids full-file decode in browser).
      // If the peaks aren't generated yet, fall through to url: mode so the
      // waveform always loads — peaks mode is an optimisation, not a gate.
      let peaksOpts: Partial<{ peaks: number[][]; duration: number; media: HTMLAudioElement }> = {};
      try {
        const peaksRes = await fetch(
          `/api/tracks/${encodeURIComponent(file)}/peaks`,
          { cache: 'force-cache' },
        );
        if (peaksRes.ok) {
          const { peaks, duration: dur } = (await peaksRes.json()) as {
            peaks: number[];
            duration: number;
          };
          if (!aborted) {
            mediaEl = document.createElement('audio');
            mediaEl.preload = 'metadata';
            mediaEl.src = `/music/${encodeURIComponent(file)}`;
            peaksOpts = { peaks: [peaks], duration: dur, media: mediaEl };
            setDuration(dur);
          }
        }
      } catch {
        // peaks not ready — wavesurfer will load via url: below
      }
      if (aborted) return;

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
        ...(!peaksOpts.peaks && { url: `/music/${encodeURIComponent(file)}` }),
        ...peaksOpts,
      });
      wsRef.current = ws;
      ws.setVolume(0.8);

      ws.on('ready', (dur: unknown) => {
        setDuration(dur as number);
        setIsLoading(false);
        if (autoPlayOnNext.pending) {
          autoPlayOnNext.pending = false;
          ws?.play();
        }
      });
      // peaks mode sets duration immediately and fires ready synchronously
      if (peaksOpts.peaks) {
        setIsLoading(false);
        if (autoPlayOnNext.pending) {
          autoPlayOnNext.pending = false;
          ws.play();
        }
      }

      ws.on('audioprocess', (t: unknown) => setCurrentTime(t as number));
      ws.on('seeking', (t: unknown) => setCurrentTime(t as number));
      ws.on('play', () => setIsPlaying(true));
      ws.on('pause', () => setIsPlaying(false));
      ws.on('finish', () => {
        setIsPlaying(false);
        if (loopRef.current === 'ONE') {
          ws?.seekTo(0);
          ws?.play();
        } else if (loopRef.current === 'ALL') {
          autoPlayOnNext.pending = true;
          goNextRef.current();
        }
      });
      ws.on('error', (err: unknown) => {
        console.error('[WaveformPlayer]', err);
        setIsLoading(false);
      });
    })().catch((err) => {
      console.error('[WaveformPlayer]', err);
      setIsLoading(false);
    });

    return () => {
      aborted = true;
      ws?.destroy();
      if (mediaEl) {
        mediaEl.pause();
        mediaEl.src = '';
        mediaEl.load();
      }
    };
  }, [file]);

  // Keyboard shortcuts (when active)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case ' ': e.preventDefault(); wsRef.current?.playPause(); break;
        case 'ArrowLeft': seek(-5); break;
        case 'ArrowRight': seek(5); break;
        case 'j': case 'J': seek(-10); break;
        case 'l': case 'L': seek(10); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [seek]);

  const ext = file.split('.').pop()?.toUpperCase() ?? 'WAV';

  // On reduced-motion or coarse-pointer mobile, drop the GPU-heavy filter
  // keyframes (saturate + hue-rotate force a full re-raster of the player
  // frame) but keep the scaleY wobble — animations stay, jank goes.
  const glitchAnim = glitching
    ? lightFx
      ? { scaleY: [1, 0.97, 1.01, 1] }
      : { scaleY: [1, 0.96, 1.02, 1], filter: ['none', 'saturate(3) hue-rotate(20deg)', 'none'] }
    : {};

  return (
    <motion.div
      ref={frameRef}
      className="crt-player-frame"
      data-fx="heavy"
      aria-label={`Player for ${file}`}
      animate={glitchAnim}
      transition={{ duration: 0.18 }}
    >
      {/* Header */}
      <div className="crt-player-header">
        {isLoading ? (
          <>
            <span>LOADING</span>
            <span aria-hidden="true" style={{ animation: 'blink 0.8s step-start infinite' }}>▮</span>
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
              <div
                style={{
                  position: 'absolute',
                  height: '100%',
                  width: '30%',
                  background: '#ffb000',
                  animation: 'scan-beam 1.2s linear infinite',
                }}
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
              <span style={{ color: '#8a5f00' }}>◉ STANDBY</span>
            )}
            <span style={{ flex: 1 }} />
            <span style={{ color: '#8a5f00', fontSize: '10px', letterSpacing: '0.05em' }}>
              {fmt(duration)} {ext}
            </span>
          </>
        )}
      </div>

      {/* Waveform */}
      <div
        className="crt-player-waveform"
        style={{
          opacity: isLoading ? 0.3 : 1,
          transition: 'opacity 0.3s',
          position: 'relative',
        }}
      >
        <div
          ref={containerRef}
          style={{ minHeight: 64 }}
          aria-label="Waveform visualization"
        />
        {coarsePointer && !isLoading && (
          <div
            role="presentation"
            onPointerDown={(e) => {
              const ws = wsRef.current;
              if (!ws) return;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = (e.clientX - rect.left) / rect.width;
              ws.seekTo(Math.max(0, Math.min(1, ratio)));
            }}
            onPointerMove={(e) => {
              const ws = wsRef.current;
              if (!ws || e.buttons === 0) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = (e.clientX - rect.left) / rect.width;
              ws.seekTo(Math.max(0, Math.min(1, ratio)));
            }}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: -6,
              bottom: -6,
              touchAction: 'pan-y',
              cursor: 'pointer',
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
            ⏮
          </CtrlBtn>
          <CtrlBtn onClick={() => wsRef.current?.playPause()} label={isPlaying ? 'Pause' : 'Play'}>
            {isPlaying ? '❚❚' : '▶'}
          </CtrlBtn>
          <CtrlBtn onClick={goNext} label="Next track">
            ⏭
          </CtrlBtn>
        </div>

        <div className="ctrl-group">
        <button
          onClick={cycleLoop}
          aria-label={`Loop: ${loop}`}
          className="ctrl-btn"
          style={{
            background: 'transparent',
            border: '1px solid',
            borderColor: loop !== 'OFF' ? '#ffb000' : '#8a5f00',
            color: loop !== 'OFF' ? '#ffb000' : '#8a5f00',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '11px',
            padding: '0.25rem 0.5rem',
            cursor: 'pointer',
            lineHeight: 1,
            letterSpacing: '0.06em',
            borderRadius: 0,
          }}
        >
          LOOP {loop}
        </button>

        <a
          href={`/music/${encodeURIComponent(file)}`}
          download={file}
          className="crt-btn small dl-btn"
          aria-label={`Download ${file}`}
        >
          ⬇<span className="dl-text">&nbsp;DOWNLOAD</span>
        </a>
        </div>
      </div>
    </motion.div>
  );
}
