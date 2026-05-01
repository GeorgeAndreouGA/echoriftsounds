'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Countdown, isPast } from './Countdown';

interface Props {
  value: string;
  onChange: (isoValue: string) => void;
}

const MONTH_LABELS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const WEEKDAYS = ['Mo','Tu','We','Th','Fr','Sa','Su'];

const pad2 = (n: number) => n.toString().padStart(2, '0');

function parseIsoSafe(iso: string): Date {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return new Date(Date.now() + 3_600_000);
  return d;
}

function humanTarget(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())} ${pad2(d.getDate())} ${MONTH_LABELS[d.getMonth()]}`;
}

function buildMonthGrid(year: number, month: number): (number | null)[] {
  const first = new Date(year, month, 1);
  const firstWeekday = (first.getDay() + 6) % 7; // 0=Mon … 6=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

type DigitPos = 'ht' | 'hu' | 'mt' | 'mu';

interface DigitCellProps {
  digit: number;
  label: string;
  onBump: (delta: 1 | -1) => void;
}

function DigitCell({ digit, label, onBump }: DigitCellProps) {
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    onBump(e.deltaY < 0 ? 1 : -1);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); onBump(1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); onBump(-1); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem' }}>
      <button
        type="button"
        aria-label={`Increment ${label}`}
        onClick={() => onBump(1)}
        style={chevronStyle}
      >
        ▲
      </button>
      <div
        role="spinbutton"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={9}
        aria-valuenow={digit}
        tabIndex={0}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        style={digitCellStyle}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={digit}
            initial={{ opacity: 0, filter: 'blur(2px)', y: -4 }}
            animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
            exit={{ opacity: 0, filter: 'blur(2px)', y: 4 }}
            transition={{ duration: 0.12 }}
            style={{ display: 'inline-block' }}
          >
            {digit}
          </motion.span>
        </AnimatePresence>
      </div>
      <button
        type="button"
        aria-label={`Decrement ${label}`}
        onClick={() => onBump(-1)}
        style={chevronStyle}
      >
        ▼
      </button>
    </div>
  );
}

export function CrtScheduler({ value, onChange }: Props) {
  const selected = parseIsoSafe(value);

  const [viewYear, setViewYear] = useState(selected.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected.getMonth());

  useEffect(() => {
    const d = parseIsoSafe(value);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }, [value]);

  const emit = useCallback((d: Date) => onChange(d.toISOString()), [onChange]);

  const bumpDigit = useCallback((pos: DigitPos, delta: 1 | -1) => {
    const d = parseIsoSafe(value);
    let h = d.getHours();
    let m = d.getMinutes();

    if (pos === 'ht') {
      const tens = Math.floor(h / 10);
      let units = h % 10;
      const newTens = (tens + delta + 3) % 3;
      let newH = newTens * 10 + units;
      if (newH > 23) { units = 3; newH = newTens * 10 + units; }
      h = newH;
    } else if (pos === 'hu') {
      const tens = Math.floor(h / 10);
      const units = h % 10;
      const maxUnits = tens === 2 ? 3 : 9;
      const mod = maxUnits + 1;
      const newUnits = (units + delta + mod) % mod;
      h = tens * 10 + newUnits;
    } else if (pos === 'mt') {
      const tens = Math.floor(m / 10);
      const units = m % 10;
      const newTens = (tens + delta + 6) % 6;
      m = newTens * 10 + units;
    } else {
      const tens = Math.floor(m / 10);
      const units = m % 10;
      const newUnits = (units + delta + 10) % 10;
      m = tens * 10 + newUnits;
    }

    d.setHours(h, m, 0, 0);
    emit(d);
  }, [value, emit]);

  const selectDay = (day: number) => {
    const d = parseIsoSafe(value);
    const next = new Date(viewYear, viewMonth, day, d.getHours(), d.getMinutes(), 0, 0);
    emit(next);
  };

  const shiftMonth = (delta: number) => {
    const m = viewMonth + delta;
    const y = viewYear + Math.floor(m / 12);
    const nm = ((m % 12) + 12) % 12;
    setViewYear(y);
    setViewMonth(nm);
  };

  const cells = buildMonthGrid(viewYear, viewMonth);
  const today = new Date();
  const isCurrentMonthView =
    viewYear === today.getFullYear() && viewMonth === today.getMonth();
  const isSelectedMonthView =
    viewYear === selected.getFullYear() && viewMonth === selected.getMonth();

  const h = selected.getHours();
  const m = selected.getMinutes();
  const ht = Math.floor(h / 10);
  const hu = h % 10;
  const mt = Math.floor(m / 10);
  const mu = m % 10;

  const iso = selected.toISOString();
  const past = isPast(iso);

  return (
    <div style={panelStyle}>
      <div style={titleStyle}>┌─ SCHEDULE RELEASE ─</div>

      <div style={contentRowStyle}>
        {/* Clock */}
        <div style={clockGroupStyle}>
          <DigitCell digit={ht} label="hours tens"  onBump={(d) => bumpDigit('ht', d)} />
          <DigitCell digit={hu} label="hours units" onBump={(d) => bumpDigit('hu', d)} />
          <span style={colonStyle}>:</span>
          <DigitCell digit={mt} label="minutes tens"  onBump={(d) => bumpDigit('mt', d)} />
          <DigitCell digit={mu} label="minutes units" onBump={(d) => bumpDigit('mu', d)} />
        </div>

        {/* Calendar */}
        <div style={calendarStyle} role="grid" aria-label="Calendar">
          <div style={calendarHeaderStyle}>
            <button
              type="button"
              className="crt-btn small"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              style={navBtnStyle}
            >
              ◀
            </button>
            <span style={{ flex: 1, textAlign: 'center', color: '#ffb000' }}>
              {MONTH_LABELS[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              className="crt-btn small"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              style={navBtnStyle}
            >
              ▶
            </button>
          </div>

          <div style={weekdayRowStyle} role="row">
            {WEEKDAYS.map((w) => (
              <span key={w} role="columnheader" style={weekdayCellStyle}>{w}</span>
            ))}
          </div>

          <div style={daysGridStyle}>
            {cells.map((day, idx) => {
              if (day === null) {
                return <span key={`e-${idx}`} style={emptyDayStyle} aria-hidden>··</span>;
              }
              const isToday = isCurrentMonthView && day === today.getDate();
              const isSelected = isSelectedMonthView && day === selected.getDate();
              const cellDate = new Date(viewYear, viewMonth, day);
              const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
              const isPastDay = cellDate < todayMidnight;
              return (
                <button
                  key={day}
                  type="button"
                  role="gridcell"
                  aria-label={`${day} ${MONTH_LABELS[viewMonth]} ${viewYear}`}
                  aria-selected={isSelected}
                  disabled={isPastDay}
                  onClick={() => selectDay(day)}
                  style={dayCellStyle(isToday, isSelected, isPastDay)}
                >
                  {pad2(day)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={statusLineStyle} aria-live="polite">
        {past ? (
          <span style={{ color: '#ff3b3b', letterSpacing: '0.04em' }}>[ INVALID — IN PAST ]</span>
        ) : (
          <>
            <Countdown time={iso} />
            <span style={{ color: '#8a5f00' }}>→ REL @ {humanTarget(selected)}</span>
          </>
        )}
      </div>
    </div>
  );
}

/* ── styles ───────────────────────────────────────────────────────────── */

const panelStyle: React.CSSProperties = {
  border: '1px solid #8a5f00',
  padding: '0.6rem 0.7rem 0.5rem',
  marginTop: '0.3rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '11px',
  color: '#8a5f00',
  background: '#0a0b06',
};

const titleStyle: React.CSSProperties = {
  color: '#8a5f00',
  letterSpacing: '0.08em',
  fontSize: '10px',
};

const contentRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '1rem',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
};

const clockGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.25rem',
  padding: '0.25rem 0.4rem',
};

const chevronStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#8a5f00',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '12px',
  cursor: 'pointer',
  padding: '0.05rem 0.3rem',
  lineHeight: 1,
};

const digitCellStyle: React.CSSProperties = {
  width: '1.7rem',
  height: '2.1rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid #ffb000',
  background: '#0a0b06',
  color: '#ffb000',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '24px',
  fontWeight: 700,
  letterSpacing: 0,
  textShadow: '0 0 4px rgba(255,176,0,0.6)',
  cursor: 'ns-resize',
  userSelect: 'none',
  outline: 'none',
};

const colonStyle: React.CSSProperties = {
  color: '#ffb000',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '24px',
  fontWeight: 700,
  padding: '0 0.15rem',
  alignSelf: 'center',
  animation: 'blink 1s step-start infinite',
};

const calendarStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.2rem',
  minWidth: '15rem',
  flex: 1,
};

const calendarHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  letterSpacing: '0.06em',
};

const navBtnStyle: React.CSSProperties = {
  fontSize: '10px',
  padding: '0.1rem 0.4rem',
  lineHeight: 1,
};

const weekdayRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: '0.1rem',
  borderBottom: '1px solid #1a1f12',
  paddingBottom: '0.15rem',
};

const weekdayCellStyle: React.CSSProperties = {
  textAlign: 'center',
  fontSize: '10px',
  color: '#8a5f00',
  letterSpacing: '0.04em',
};

const daysGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: '0.1rem',
};

const emptyDayStyle: React.CSSProperties = {
  textAlign: 'center',
  color: '#1a1f12',
  fontSize: '11px',
  padding: '0.15rem 0',
};

function dayCellStyle(isToday: boolean, isSelected: boolean, isPastDay: boolean): React.CSSProperties {
  let color = '#ffb000';
  let background = 'transparent';
  let border = '1px solid transparent';
  if (isPastDay) color = '#3a2900';
  else if (isToday) color = '#39ff14';
  if (isSelected) {
    background = '#ffb000';
    color = '#0a0b06';
    border = '1px solid #ffd96b';
  }
  return {
    textAlign: 'center',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    fontWeight: isSelected || isToday ? 700 : 400,
    padding: '0.15rem 0',
    background,
    border,
    color,
    cursor: isPastDay ? 'not-allowed' : 'pointer',
    letterSpacing: 0,
  };
}

const statusLineStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  paddingTop: '0.25rem',
  borderTop: '1px solid #1a1f12',
};
