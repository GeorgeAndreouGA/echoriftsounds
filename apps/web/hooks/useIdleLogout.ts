'use client';

import { useEffect } from 'react';

export function useIdleLogout(ms: number, onIdle?: () => void | Promise<void>) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const fire = async () => {
      if (onIdle) await onIdle();
      window.location.href = '/';
    };

    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(fire, ms);
    };

    window.addEventListener('mousemove', reset);
    window.addEventListener('keypress', reset);
    window.addEventListener('click', reset);
    reset();

    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', reset);
      window.removeEventListener('keypress', reset);
      window.removeEventListener('click', reset);
    };
  }, [ms, onIdle]);
}
