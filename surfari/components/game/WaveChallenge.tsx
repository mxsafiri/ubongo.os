'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ROUNDS = 3;
const WINS_NEEDED = 2;
const BASE_PERIOD_MS = 2400; // ms for one full left→right sweep, round 1

// Zone center shifts slightly each round so players can't muscle-memory the position
const ZONE_OFFSETS = [0, 0.08, -0.08];

function getZone(round: number, difficulty: number) {
  const width = 0.44 - difficulty * 0.24; // 0.44 (easy) → 0.20 (fortified)
  const center = 0.5 + ZONE_OFFSETS[(round - 1) % 3];
  return {
    start: Math.max(0.04, center - width / 2),
    end: Math.min(0.96, center + width / 2),
  };
}

export function WaveChallenge({ difficulty, onWin, onLose }: {
  difficulty: number; // 0 easy → 1 hard
  onWin: () => void;
  onLose: () => void;
}) {
  const [phase, setPhase] = useState<'countdown' | 'playing' | 'hit' | 'miss' | 'done'>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [round, setRound] = useState(1);
  const [wins, setWins] = useState(0);
  const [frozenPos, setFrozenPos] = useState<number | null>(null);
  const [zone, setZone] = useState(() => getZone(1, difficulty));

  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const posRef = useRef(0);
  const dotRef = useRef<HTMLDivElement>(null);

  const stopAnim = useCallback(() => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, []);

  const startAnim = useCallback((r: number) => {
    const period = BASE_PERIOD_MS * Math.pow(0.80, r - 1); // ~20% faster each round
    startRef.current = performance.now();
    const tick = (ts: number) => {
      const t = (ts - startRef.current) % (period * 2);
      const pos = t < period ? t / period : 2 - t / period;
      posRef.current = pos;
      if (dotRef.current) dotRef.current.style.left = `calc(${pos * 100}% - 12px)`;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // Countdown tick
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdown <= 0) { setPhase('playing'); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), countdown === 3 ? 600 : 850);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // Start / stop animation when phase changes
  useEffect(() => {
    if (phase === 'playing') { setFrozenPos(null); startAnim(round); }
    else stopAnim();
  }, [phase, round, startAnim, stopAnim]);

  useEffect(() => () => stopAnim(), [stopAnim]);

  const lockIn = useCallback(() => {
    if (phase !== 'playing') return;
    stopAnim();
    const pos = posRef.current;
    setFrozenPos(pos);

    const hit = pos >= zone.start && pos <= zone.end;
    setPhase(hit ? 'hit' : 'miss');

    const newWins = wins + (hit ? 1 : 0);
    const remaining = ROUNDS - round;
    const canStillWin = newWins < WINS_NEEDED && remaining >= WINS_NEEDED - newWins;

    setTimeout(() => {
      if (newWins >= WINS_NEEDED) {
        setPhase('done'); setTimeout(onWin, 480);
      } else if (round >= ROUNDS || !canStillWin) {
        setPhase('done'); setTimeout(onLose, 480);
      } else {
        const next = round + 1;
        setWins(newWins);
        setRound(next);
        setZone(getZone(next, difficulty));
        setCountdown(2);
        setPhase('countdown');
      }
    }, 1000);
  }, [phase, zone, round, wins, difficulty, onWin, onLose, stopAnim]);

  const dotPos = frozenPos ?? 0;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Round indicators */}
      <div className="flex flex-col items-center gap-1.5">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
          WAVE LOCK · ROUND {round}/{ROUNDS}
        </span>
        <div className="flex gap-2">
          {Array.from({ length: ROUNDS }, (_, i) => (
            <div key={i} className="w-2.5 h-2.5 rounded-full"
              style={{
                background: i < wins ? 'var(--color-success)' :
                            i === round - 1 && phase !== 'done' ? 'var(--color-primary)' : 'var(--border-mid)',
                transition: 'background 0.3s',
              }} />
          ))}
        </div>
      </div>

      {/* Game area */}
      <div style={{ minHeight: 110, width: '100%' }}>
        <AnimatePresence mode="wait">
          {phase === 'countdown' && (
            <motion.div key={`cd${countdown}`}
              className="flex flex-col items-center justify-center gap-1"
              style={{ height: 110 }}
              initial={{ scale: 1.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.3 }}>
              <span style={{ fontSize: countdown > 0 ? '52px' : '36px', lineHeight: 1 }}>
                {countdown > 0 ? countdown : '🌊'}
              </span>
              {countdown === 0 && (
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--color-primary)', fontWeight: 700 }}>GO!</p>
              )}
            </motion.div>
          )}

          {(phase === 'playing' || phase === 'hit' || phase === 'miss') && (
            <motion.div key="wavebar" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3" style={{ paddingTop: 12 }}>
              {/* The bar */}
              <div className="relative w-full rounded-full overflow-hidden"
                style={{ height: 44, background: 'var(--surface-subtle)', border: '1px solid var(--border-mid)' }}>
                {/* Target zone */}
                <div className="absolute top-0 bottom-0"
                  style={{
                    left: `${zone.start * 100}%`,
                    width: `${(zone.end - zone.start) * 100}%`,
                    background: phase === 'hit' ? 'rgba(0,224,150,0.35)' :
                               phase === 'miss' ? 'rgba(239,68,68,0.2)' : 'rgba(0,224,150,0.22)',
                    borderLeft: `1.5px solid ${phase === 'hit' ? 'rgba(0,224,150,0.7)' : phase === 'miss' ? 'rgba(239,68,68,0.5)' : 'rgba(0,224,150,0.55)'}`,
                    borderRight: `1.5px solid ${phase === 'hit' ? 'rgba(0,224,150,0.7)' : phase === 'miss' ? 'rgba(239,68,68,0.5)' : 'rgba(0,224,150,0.55)'}`,
                    transition: 'background 0.2s',
                  }} />
                {/* Moving dot — updated via direct DOM ref for 60fps smoothness */}
                <div
                  ref={dotRef}
                  className="absolute top-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    width: 24, height: 24,
                    left: phase !== 'playing' ? `calc(${dotPos * 100}% - 12px)` : '-12px',
                    background: phase === 'hit' ? 'var(--color-success)' :
                               phase === 'miss' ? 'var(--color-danger)' : '#fff',
                    boxShadow: phase === 'hit' ? '0 0 16px rgba(0,224,150,0.9)' :
                               phase === 'miss' ? '0 0 16px rgba(239,68,68,0.9)' :
                               '0 0 12px rgba(255,255,255,0.85)',
                    transition: phase !== 'playing' ? 'background 0.2s, box-shadow 0.2s' : 'none',
                  }}
                />
              </div>
              {/* Round result */}
              <AnimatePresence>
                {phase === 'hit' && (
                  <motion.p key="hit" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                    style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '13px', color: 'var(--color-success)' }}>
                    ✓ Locked in!
                  </motion.p>
                )}
                {phase === 'miss' && (
                  <motion.p key="miss" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                    style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '13px', color: 'var(--color-danger)' }}>
                    ✗ Missed the wave
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {phase === 'done' && (
            <motion.div key="done" className="flex items-center justify-center" style={{ height: 110 }}
              initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 280, damping: 18 }}>
              <span style={{ fontSize: '56px' }}>{wins >= WINS_NEEDED ? '🌊' : '💨'}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Lock-in button */}
      <motion.button
        onClick={lockIn}
        disabled={phase !== 'playing'}
        className="w-full rounded-2xl"
        style={{
          padding: '15px',
          background: phase === 'playing'
            ? 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)'
            : 'var(--surface-subtle)',
          border: phase !== 'playing' ? '1px solid var(--border-mid)' : 'none',
          boxShadow: phase === 'playing' ? '0 4px 24px rgba(0,153,194,0.38)' : 'none',
          transition: 'all 0.2s',
          cursor: phase === 'playing' ? 'pointer' : 'default',
        }}
        whileTap={phase === 'playing' ? { scale: 0.93 } : undefined}
      >
        <span style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: '17px',
          color: phase === 'playing' ? '#fff' : 'var(--text-muted)',
          letterSpacing: '0.02em',
        }}>
          {phase === 'countdown' ? 'GET READY…' : phase === 'playing' ? 'LOCK IT IN' : '…'}
        </span>
      </motion.button>
    </div>
  );
}
