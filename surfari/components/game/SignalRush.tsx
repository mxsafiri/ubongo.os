'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { sfx } from '@/lib/game/sfx';
import { Shaker, Burst, ComboFloat } from './juice';

interface Config {
  fadeMs: number;
  maxActive: number;
  target: number;
  timeLimit: number;
}

function getConfig(difficulty: number): Config {
  return {
    fadeMs: Math.round(1500 - difficulty * 700),
    maxActive: difficulty > 0.5 ? 2 : 1,
    target: Math.round(6 + difficulty * 4),
    timeLimit: Math.round(25 - difficulty * 7),
  };
}

type NodeState = 'idle' | 'active' | 'hit' | 'miss';

export function SignalRush({ difficulty, onWin, onLose }: {
  difficulty: number;
  onWin: () => void;
  onLose: () => void;
}) {
  const cfg = useRef(getConfig(difficulty)).current;

  const [phase, setPhase] = useState<'countdown' | 'playing' | 'done'>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [nodes, setNodes] = useState<NodeState[]>(Array(9).fill('idle'));
  const [taps, setTaps] = useState(0);
  const [timeLeft, setTimeLeft] = useState(cfg.timeLimit);
  const [combo, setCombo] = useState(0);
  const [shake, setShake] = useState(0);

  const playingRef = useRef(false);
  const tapsRef = useRef(0);
  const comboRef = useRef(0);
  const activeRef = useRef<Set<number>>(new Set());
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const stopAll = useCallback(() => {
    playingRef.current = false;
    timers.current.forEach(clearTimeout);
    timers.current.clear();
    activeRef.current.clear();
  }, []);

  const spawnNode = useCallback(() => {
    if (!playingRef.current) return;
    if (activeRef.current.size >= cfg.maxActive) return;

    setNodes((prev) => {
      const idles = prev
        .map((s, i) => (s === 'idle' && !activeRef.current.has(i) ? i : -1))
        .filter((i) => i !== -1);
      if (idles.length === 0) return prev;

      const idx = idles[Math.floor(Math.random() * idles.length)];
      activeRef.current.add(idx);

      const timer = setTimeout(() => {
        if (!playingRef.current) return;
        activeRef.current.delete(idx);
        timers.current.delete(idx);
        sfx.miss();
        comboRef.current = 0;
        setCombo(0);
        setShake((s) => s + 1);
        setNodes((p) => p.map((s, i) => (i === idx && s === 'active' ? 'miss' : s)));
        setTimeout(() => {
          setNodes((p) => p.map((s, i) => (i === idx && s === 'miss' ? 'idle' : s)));
          spawnNode();
        }, 350);
      }, cfg.fadeMs);
      timers.current.set(idx, timer);

      return prev.map((s, i) => (i === idx ? 'active' : s));
    });
  }, [cfg]);

  // Countdown
  useEffect(() => {
    if (phase !== 'countdown') return;
    sfx.countdown(countdown);
    if (countdown <= 0) {
      setPhase('playing');
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), countdown === 3 ? 600 : 850);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // Start game
  useEffect(() => {
    if (phase !== 'playing') return;
    playingRef.current = true;
    tapsRef.current = 0;
    spawnNode();
    if (cfg.maxActive > 1) setTimeout(spawnNode, 400);
  }, [phase, cfg, spawnNode]);

  // Game timer countdown
  useEffect(() => {
    if (phase !== 'playing') return;
    if (timeLeft <= 0) {
      stopAll();
      sfx.lose();
      setPhase('done');
      setTimeout(onLose, 500);
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, timeLeft, stopAll, onLose]);

  useEffect(() => () => stopAll(), [stopAll]);

  const tap = useCallback((idx: number) => {
    if (!playingRef.current) return;
    if (!activeRef.current.has(idx)) return;

    const t = timers.current.get(idx);
    if (t) { clearTimeout(t); timers.current.delete(idx); }
    activeRef.current.delete(idx);

    setNodes((prev) => prev.map((s, i) => (i === idx ? 'hit' : s)));
    setTimeout(() => {
      setNodes((prev) => prev.map((s, i) => (i === idx && s === 'hit' ? 'idle' : s)));
      spawnNode();
    }, 250);

    tapsRef.current++;
    setTaps(tapsRef.current);
    comboRef.current++;
    setCombo(comboRef.current);
    sfx.hit(comboRef.current);

    if (tapsRef.current >= cfg.target) {
      stopAll();
      sfx.win();
      setPhase('done');
      setTimeout(onWin, 500);
    }
  }, [cfg, spawnNode, stopAll, onWin]);

  const timerPct = timeLeft / cfg.timeLimit;
  const progressPct = Math.min(taps / cfg.target, 1);

  return (
    <div className="flex flex-col items-center gap-5 w-full px-2">
      {/* Header stats */}
      <div className="w-full flex items-center gap-3">
        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-subtle)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg, var(--color-primary), var(--color-accent))' }}
            animate={{ width: `${progressPct * 100}%` }}
            transition={{ duration: 0.2 }}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ background: timerPct < 0.3 ? 'var(--color-danger)' : 'var(--color-success)', transition: 'background 0.5s' }} />
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '14px',
            fontWeight: 700,
            color: timerPct < 0.3 ? 'var(--color-danger)' : 'var(--text-primary)',
            minWidth: 30,
            transition: 'color 0.5s',
          }}>
            {timeLeft}s
          </span>
        </div>
      </div>

      <div className="w-full flex items-center justify-between px-1">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
          SIGNAL RUSH
        </span>
        <ComboFloat combo={combo} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-secondary)' }}>
          {taps} / {cfg.target} locked
        </span>
      </div>

      {/* Game area */}
      <AnimatePresence mode="wait">
        {phase === 'countdown' ? (
          <motion.div
            key={`cd${countdown}`}
            className="flex items-center justify-center"
            style={{ width: '100%', height: 240 }}
            initial={{ scale: 1.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <span style={{ fontSize: countdown > 0 ? '72px' : '48px', lineHeight: 1 }}>
              {countdown > 0 ? countdown : '⚡'}
            </span>
          </motion.div>
        ) : (
          <Shaker key="grid-shaker" trigger={shake}>
            <motion.div
              key="grid"
              className="grid gap-3 w-full"
              style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              {nodes.map((state, i) => (
                <NodeCell key={i} state={state} onTap={() => tap(i)} />
              ))}
            </motion.div>
          </Shaker>
        )}
      </AnimatePresence>

      {/* Instruction */}
      {phase === 'playing' && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
          TAP GLOWING NODES BEFORE THEY FADE
        </p>
      )}
    </div>
  );
}

function NodeCell({ state, onTap }: { state: NodeState; onTap: () => void }) {
  const isActive = state === 'active';
  const isHit = state === 'hit';
  const isMiss = state === 'miss';

  return (
    <motion.button
      onClick={onTap}
      disabled={!isActive}
      className="relative rounded-2xl flex items-center justify-center"
      style={{
        aspectRatio: '1',
        cursor: isActive ? 'pointer' : 'default',
        background: isActive
          ? 'radial-gradient(circle at 38% 32%, #00e0b0 0%, #0099c2 100%)'
          : isHit
          ? 'radial-gradient(circle at 38% 32%, #00ff99, #00c878)'
          : isMiss
          ? 'rgba(239,68,68,0.18)'
          : 'var(--surface-subtle)',
        border: isActive
          ? '1.5px solid rgba(0,224,176,0.6)'
          : isMiss
          ? '1.5px solid rgba(239,68,68,0.4)'
          : '1px solid var(--border-mid)',
        boxShadow: isActive
          ? '0 0 28px rgba(0,224,176,0.65), inset 0 0 12px rgba(255,255,255,0.12)'
          : isHit
          ? '0 0 20px rgba(0,255,153,0.5)'
          : 'none',
        transition: 'background 0.15s, box-shadow 0.15s, border-color 0.15s',
      }}
      whileTap={isActive ? { scale: 0.84 } : undefined}
    >
      <AnimatePresence>
        {isActive && (
          <motion.div
            key="pulse"
            className="w-4 h-4 rounded-full"
            style={{ background: 'rgba(255,255,255,0.9)' }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
          />
        )}
        {isHit && (
          <motion.span
            key="hit"
            style={{ fontSize: '22px' }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 600, damping: 18 }}
          >
            ✓
          </motion.span>
        )}
        {isHit && <Burst key="burst" color="#00ffb0" />}
        {isMiss && (
          <motion.span
            key="miss"
            style={{ fontSize: '18px', color: 'var(--color-danger)' }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
          >
            ✗
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
