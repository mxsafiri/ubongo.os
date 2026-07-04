'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { sfx } from '@/lib/game/sfx';
import { Shaker } from './juice';

const GAME_H = 280;     // px — visible play area
const PLAYER_Y = 230;   // px from top — player row
const OBS_H = 40;       // obstacle height px
const LANES = 3;
const TICK_MS = 48;     // ~20fps
const EMOJIS = ['🚐', '🕳️', '⛔', '🐐'];

interface Config {
  speed: number;          // px per tick
  spawnMs: number;        // ms between obstacles
  lives: number;
  timeLimit: number;      // seconds to survive
}

function getConfig(difficulty: number): Config {
  return {
    speed: Math.round(5 + difficulty * 6),
    spawnMs: Math.round(1400 - difficulty * 500),
    lives: difficulty > 0.6 ? 1 : difficulty > 0.3 ? 2 : 3,
    timeLimit: Math.round(16 + difficulty * 4),
  };
}

interface Obs {
  id: number;
  lane: number;
  y: number;
  emoji: string;
}

export function BodaRush({ difficulty, onWin, onLose }: {
  difficulty: number;
  onWin: () => void;
  onLose: () => void;
}) {
  const cfg = useRef(getConfig(difficulty)).current;

  const [phase, setPhase] = useState<'countdown' | 'playing' | 'done'>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [obs, setObs] = useState<Obs[]>([]);
  const [playerLane, setPlayerLane] = useState(1);
  const [lives, setLives] = useState(cfg.lives);
  const [timeLeft, setTimeLeft] = useState(cfg.timeLimit);
  const [shake, setShake] = useState(0);
  const [damageFlash, setDamageFlash] = useState(0);

  const playingRef = useRef(false);
  const playerLaneRef = useRef(1);
  const livesRef = useRef(cfg.lives);
  const nextIdRef = useRef(0);
  const lastSpawnRef = useRef(0);

  const switchLane = useCallback((dir: -1 | 1) => {
    if (!playingRef.current) return;
    setPlayerLane((prev) => {
      const next = Math.max(0, Math.min(LANES - 1, prev + dir));
      if (next !== prev) sfx.whoosh();
      playerLaneRef.current = next;
      return next;
    });
  }, []);

  // Tap handler: left half = move left, right half = move right
  const handleTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!playingRef.current) return;
    const el = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const midX = el.left + el.width / 2;
    switchLane(x < midX ? -1 : 1);
  }, [switchLane]);

  // Keyboard steering — arrows or A/D on desktop
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { e.preventDefault(); switchLane(-1); }
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { e.preventDefault(); switchLane(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [switchLane]);

  // Countdown
  useEffect(() => {
    if (phase !== 'countdown') return;
    sfx.countdown(countdown);
    if (countdown <= 0) { setPhase('playing'); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), countdown === 3 ? 600 : 850);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // Game timer
  useEffect(() => {
    if (phase !== 'playing') return;
    if (timeLeft <= 0) {
      playingRef.current = false;
      sfx.win();
      setPhase('done');
      setTimeout(onWin, 500);
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, timeLeft, onWin]);

  // Game loop
  useEffect(() => {
    if (phase !== 'playing') return;
    playingRef.current = true;
    lastSpawnRef.current = Date.now();

    const tick = setInterval(() => {
      if (!playingRef.current) return;
      const now = Date.now();

      setObs((prev) => {
        const moved: Obs[] = [];
        let hitThisTick = false;

        for (const o of prev) {
          const ny = o.y + cfg.speed;
          // Collision: obstacle reaches player row, same lane
          if (ny >= PLAYER_Y - OBS_H / 2 && ny <= PLAYER_Y + OBS_H / 2 && o.lane === playerLaneRef.current) {
            hitThisTick = true;
            continue; // remove obstacle
          }
          if (ny < GAME_H + OBS_H) {
            moved.push({ ...o, y: ny });
          }
        }

        if (hitThisTick) {
          livesRef.current--;
          setLives(livesRef.current);
          sfx.crash();
          setShake((s) => s + 1);
          setDamageFlash((f) => f + 1);
          if (livesRef.current <= 0) {
            playingRef.current = false;
            sfx.lose();
            setPhase('done');
            setTimeout(onLose, 500);
          }
        }

        // Spawn
        if (now - lastSpawnRef.current >= cfg.spawnMs) {
          lastSpawnRef.current = now;
          const lane = Math.floor(Math.random() * LANES);
          moved.push({
            id: nextIdRef.current++,
            lane,
            y: -OBS_H,
            emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
          });
        }

        return moved;
      });
    }, TICK_MS);

    return () => {
      clearInterval(tick);
      playingRef.current = false;
    };
  }, [phase, cfg, onLose]);

  const LANE_W = 100 / LANES;

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Lives + timer */}
      <div className="w-full flex items-center justify-between px-1">
        <div className="flex gap-1">
          {Array.from({ length: cfg.lives }, (_, i) => (
            <span key={i} style={{ fontSize: '18px', opacity: i < lives ? 1 : 0.2, transition: 'opacity 0.3s' }}>❤️</span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>BODA RUSH</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: timeLeft <= 5 ? 'var(--color-success)' : 'var(--text-primary)', minWidth: 30 }}>
            {timeLeft}s
          </span>
        </div>
      </div>

      {/* Game area */}
      <AnimatePresence mode="wait">
        {phase === 'countdown' ? (
          <motion.div
            key={`cd${countdown}`}
            className="flex items-center justify-center"
            style={{ width: '100%', height: GAME_H }}
            initial={{ scale: 1.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <span style={{ fontSize: countdown > 0 ? '72px' : '48px', lineHeight: 1 }}>
              {countdown > 0 ? countdown : '🛵'}
            </span>
          </motion.div>
        ) : (
          <Shaker key="road-shaker" trigger={shake}>
          <motion.div
            key="road"
            className="relative w-full rounded-2xl overflow-hidden select-none"
            style={{
              height: GAME_H,
              background: 'linear-gradient(180deg, #0d1117 0%, #111827 100%)',
              border: '1px solid var(--border-mid)',
              cursor: 'pointer',
              touchAction: 'none',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={handleTap}
            onTouchStart={handleTap}
          >
            {/* Lane dividers */}
            {[1, 2].map((i) => (
              <div key={i} className="absolute top-0 bottom-0" style={{ left: `${(i / LANES) * 100}%`, width: 1, background: 'rgba(255,255,255,0.07)' }} />
            ))}

            {/* Road lines (decorative) */}
            {[0, 1, 2].map((lane) => (
              <div key={lane} className="absolute" style={{
                left: `${(lane / LANES) * 100 + LANE_W / 2 - 0.5}%`,
                width: 2,
                top: 0,
                bottom: 0,
                background: 'repeating-linear-gradient(180deg, rgba(255,255,255,0.12) 0px, rgba(255,255,255,0.12) 18px, transparent 18px, transparent 36px)',
              }} />
            ))}

            {/* Obstacles */}
            {obs.map((o) => (
              <div key={o.id} className="absolute flex items-center justify-center"
                style={{
                  left: `${(o.lane / LANES) * 100}%`,
                  width: `${LANE_W}%`,
                  top: o.y,
                  height: OBS_H,
                  fontSize: '28px',
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}>
                {o.emoji}
              </div>
            ))}

            {/* Player */}
            <motion.div
              className="absolute flex items-center justify-center"
              style={{
                width: `${LANE_W}%`,
                height: OBS_H,
                top: PLAYER_Y - OBS_H / 2,
                fontSize: '28px',
              }}
              animate={{ left: `${(playerLane / LANES) * 100}%` }}
              transition={{ type: 'spring', stiffness: 600, damping: 30 }}
            >
              🛵
            </motion.div>

            {/* Tap zones hint */}
            <div className="absolute bottom-0 left-0 right-0 flex pointer-events-none"
              style={{ opacity: phase === 'playing' ? 0.18 : 0 }}>
              <div className="flex-1 flex items-center justify-center py-2">
                <span style={{ fontSize: '18px' }}>◀</span>
              </div>
              <div className="flex-1 flex items-center justify-center py-2">
                <span style={{ fontSize: '18px' }}>▶</span>
              </div>
            </div>

            {/* Damage flash — red vignette that replays on every hit */}
            <AnimatePresence>
              {damageFlash > 0 && (
                <motion.div
                  key={damageFlash}
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: 'radial-gradient(circle, transparent 35%, rgba(239,68,68,0.5) 100%)' }}
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.55 }}
                />
              )}
            </AnimatePresence>
          </motion.div>
          </Shaker>
        )}
      </AnimatePresence>

      {phase === 'playing' && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
          TAP OR ← → TO DODGE — SURVIVE {cfg.timeLimit}s
        </p>
      )}
    </div>
  );
}
