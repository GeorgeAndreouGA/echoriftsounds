'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { LoginResult } from '../hooks/useAdminAuth';

interface Props {
  onLogin: (username: string, password: string) => Promise<LoginResult>;
}

function fmtCooldown(sec: number): string {
  if (sec <= 0) return '0s';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

function BorderStroke({ height }: { height: number }) {
  const w = 400;
  const h = Math.max(height, 100);

  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <motion.rect
        x="0.5"
        y="0.5"
        width={w - 1}
        height={h - 1}
        fill="none"
        stroke="#ffb000"
        strokeWidth="1"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.7, ease: 'easeInOut' }}
      />
    </svg>
  );
}

export function LoginForm({ onLogin }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [formHeight, setFormHeight] = useState(320);
  const [cooldownSec, setCooldownSec] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const id = setInterval(() => setCooldownSec((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldownSec]);

  useEffect(() => {
    if (cooldownSec === 0) return;
    setError(`> RATE LIMITED — RETRY IN ${fmtCooldown(cooldownSec)}`);
  }, [cooldownSec]);

  useEffect(() => {
    if (formRef.current) {
      setFormHeight(formRef.current.offsetHeight);
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => setCapsLock(e.getModifierState('CapsLock'));
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldownSec > 0) return;
    setError('');
    setLoading(true);
    const result = await onLogin(username, password);
    if (result.ok) {
      setSuccess(true);
    } else {
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      switch (result.reason) {
        case 'rate-limit':
          setCooldownSec(result.retryAfterSec);
          setError(`> RATE LIMITED — RETRY IN ${fmtCooldown(result.retryAfterSec)}`);
          break;
        case 'forbidden':
          setError('> ACCESS DENIED — IP NOT ALLOWED');
          break;
        case 'network':
          setError('> NETWORK ERROR — RETRY');
          break;
        case 'invalid':
        default:
          setError('> AUTH FAIL — RETRY');
      }
    }
    setLoading(false);
  };

  return (
    <main
      id="main-content"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
        background: '#0a0b06',
      }}
    >
      {/* Titlebar */}
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.4rem 0.75rem',
          background: '#11140c',
          border: '1px solid #8a5f00',
          borderBottom: 'none',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '11px',
          color: '#8a5f00',
          letterSpacing: '0.06em',
        }}
      >
        <span>● ○ ○</span>
        <span style={{ flex: 1, textAlign: 'center' }}>auth.echorift.local — tty1</span>
        {capsLock && (
          <span style={{ color: '#ff3b3b', animation: 'blink 1s step-start infinite', fontSize: '10px' }}>
            CAPS
          </span>
        )}
      </div>

      {/* Form */}
      <motion.form
        ref={formRef}
        onSubmit={handleSubmit}
        animate={shaking ? { x: [-4, 4, -4, 4, -2, 2, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 400,
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          padding: '1.5rem',
          background: '#11140c',
          border: '1px solid #8a5f00',
        }}
      >
        <BorderStroke height={formHeight} />

        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '13px',
            color: '#ffb000',
            letterSpacing: '0.08em',
            textAlign: 'center',
            marginBottom: '0.25rem',
          }}
        >
          ADMIN LOGIN
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label
            htmlFor="username"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '10px',
              color: '#8a5f00',
              letterSpacing: '0.1em',
            }}
          >
            &gt; USERNAME
          </label>
          <input
            id="username"
            type="text"
            className="crt-input"
            placeholder=""
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label
            htmlFor="password"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '10px',
              color: '#8a5f00',
              letterSpacing: '0.1em',
            }}
          >
            &gt; PASSWORD
          </label>
          <input
            id="password"
            type="password"
            className="crt-input"
            placeholder=""
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="crt-error"
            role="alert"
          >
            {error}
          </motion.p>
        )}

        {success && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              color: '#39ff14',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              letterSpacing: '0.06em',
            }}
            role="status"
          >
            &gt; AUTH OK — LOADING PANEL...
          </motion.p>
        )}

        <button
          type="submit"
          className="crt-btn"
          disabled={loading || cooldownSec > 0}
          style={{ width: '100%', justifyContent: 'center', marginTop: '0.25rem' }}
        >
          {loading ? (
            <>
              VERIFYING
              <span aria-hidden="true" style={{ animation: 'blink 0.6s step-start infinite' }}>▮</span>
            </>
          ) : cooldownSec > 0 ? (
            `[ WAIT ${fmtCooldown(cooldownSec)} ]`
          ) : (
            '[ LOGIN ]'
          )}
        </button>
      </motion.form>
    </main>
  );
}
