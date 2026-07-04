'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { sfx } from '@/lib/game/sfx';
import { SignalRush } from './SignalRush';
import { BodaRush } from './BodaRush';
import { FrequencyDuel } from './FrequencyDuel';
import { ZoneFlood } from './ZoneFlood';

type GameId = 'signal' | 'boda' | 'frequency' | 'flood';
type ArenaPhase = 'intro' | 'play' | 'result';

const GAME_META: Record<GameId, { name: string; tagline: string; emoji: string }> = {
  signal:    { name: 'Signal Rush',    tagline: 'Tap every node before it fades', emoji: '⚡' },
  boda:      { name: 'Boda Rush',      tagline: 'Dodge your way through traffic', emoji: '🛵' },
  frequency: { name: 'Frequency Duel', tagline: 'Echo the beat — get it right',   emoji: '🎵' },
  flood:     { name: 'Zone Flood',     tagline: 'Out-flood the AI for the turf',  emoji: '🌊' },
};

const ALL_GAMES: GameId[] = ['signal', 'boda', 'frequency', 'flood'];

function pickGame(): GameId {
  return ALL_GAMES[Math.floor(Math.random() * ALL_GAMES.length)];
}

function difficultyMeta(d: number): { label: string; color: string } {
  if (d >= 0.7) return { label: 'HARD',   color: '#FF4757' };
  if (d >= 0.4) return { label: 'MEDIUM', color: '#F59E0B' };
  return         { label: 'EASY',   color: '#00E096' };
}

// Diagonal hazard stripes — the GTA-poster accent bar
function Stripes({ color, height = 6 }: { color: string; height?: number }) {
  return (
    <div
      aria-hidden
      style={{
        height,
        width: '100%',
        background: `repeating-linear-gradient(-45deg, ${color} 0 10px, transparent 10px 20px)`,
        opacity: 0.85,
      }}
    />
  );
}

// L-shaped HUD corner brackets around the arena card
function CornerBrackets({ color }: { color: string }) {
  const base: React.CSSProperties = { position: 'absolute', width: 22, height: 22, pointerEvents: 'none' };
  const b = `2px solid ${color}`;
  return (
    <>
      <div style={{ ...base, top: -2, left: -2, borderTop: b, borderLeft: b }} />
      <div style={{ ...base, top: -2, right: -2, borderTop: b, borderRight: b }} />
      <div style={{ ...base, bottom: -2, left: -2, borderBottom: b, borderLeft: b }} />
      <div style={{ ...base, bottom: -2, right: -2, borderBottom: b, borderRight: b }} />
    </>
  );
}

export function GameArena({ zoneName, ownerHandle, difficulty, onWin, onLose, onAbort }: {
  zoneName: string;
  ownerHandle?: string | null;
  difficulty: number;
  onWin: () => void;
  onLose: () => void;
  onAbort: () => void;
}) {
  const game = useRef<GameId>(pickGame()).current;
  const meta = GAME_META[game];
  const diff = difficultyMeta(difficulty);

  const [phase, setPhase] = useState<ArenaPhase>('intro');
  const [outcome, setOutcome] = useState<'win' | 'lose' | null>(null);

  // Arena opens from a button tap, so this call is inside a user gesture —
  // create the AudioContext now so game sounds are allowed to play.
  useEffect(() => { sfx.unlock(); }, []);

  // Auto-advance the versus splash; tapping it skips ahead
  useEffect(() => {
    if (phase !== 'intro') return;
    const t = setTimeout(() => setPhase('play'), 2400);
    return () => clearTimeout(t);
  }, [phase]);

  // ESC bails out (not during the result splash)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'result') onAbort();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, onAbort]);

  const handleWin = useCallback(() => {
    setOutcome('win');
    setPhase('result');
    setTimeout(onWin, 2100);
  }, [onWin]);

  const handleLose = useCallback(() => {
    setOutcome('lose');
    setPhase('result');
    setTimeout(onLose, 2100);
  }, [onLose]);

  const GameComponent =
    game === 'signal'      ? SignalRush
    : game === 'boda'      ? BodaRush
    : game === 'frequency' ? FrequencyDuel
    : ZoneFlood;

  const vsLine = ownerHandle ? `VS @${ownerHandle.toUpperCase()}` : 'OPEN TURF';

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center"
      style={{
        background: 'rgba(5,8,15,0.72)',
        backdropFilter: 'blur(12px) saturate(1.3)',
        // Everything inside the arena speaks in condensed caps
        ['--font-display' as string]: 'var(--font-arcade)',
      } as React.CSSProperties}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Vignette — draws the eye to center */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)' }} />
      {/* Scanlines */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 3px)' }} />

      <AnimatePresence mode="wait">
        {/* ══════════ VERSUS SPLASH ══════════ */}
        {phase === 'intro' && (
          <motion.button
            key="intro"
            className="relative flex flex-col items-center gap-5 px-8 outline-none"
            style={{ maxWidth: 560, width: '100%', cursor: 'pointer', background: 'none', border: 'none' }}
            onClick={() => setPhase('play')}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.06 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          >
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.4em', color: '#8BA3BE' }}>
              ENTERING TURF WAR
            </span>

            <motion.span
              style={{ fontSize: '76px', lineHeight: 1, filter: 'drop-shadow(0 0 24px rgba(0,194,255,0.5))' }}
              initial={{ scale: 0.4, rotate: -12 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 14, delay: 0.1 }}
            >
              {meta.emoji}
            </motion.span>

            <div className="flex flex-col items-center gap-1">
              <h1 style={{
                fontFamily: 'var(--font-arcade)',
                fontSize: 'clamp(52px, 12vw, 84px)',
                lineHeight: 0.95,
                letterSpacing: '0.03em',
                background: 'linear-gradient(160deg, #00C2FF 20%, #7C5CFC 80%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
                textShadow: 'none',
                filter: 'drop-shadow(0 4px 24px rgba(0,194,255,0.35))',
              }}>
                {meta.name}
              </h1>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#8BA3BE', letterSpacing: '0.1em' }}>
                {meta.tagline.toUpperCase()}
              </p>
            </div>

            <Stripes color={`${diff.color}55`} />

            <div className="flex flex-col items-center gap-1.5">
              <span style={{
                fontFamily: 'var(--font-arcade)',
                fontSize: '30px',
                letterSpacing: '0.06em',
                color: '#F0F6FF',
                lineHeight: 1,
              }}>
                {zoneName.toUpperCase()}
              </span>
              <span style={{
                fontFamily: 'var(--font-arcade)',
                fontSize: '22px',
                letterSpacing: '0.1em',
                color: ownerHandle ? '#FF4757' : '#00E096',
                lineHeight: 1,
                textShadow: `0 0 18px ${ownerHandle ? 'rgba(255,71,87,0.6)' : 'rgba(0,224,150,0.6)'}`,
              }}>
                {vsLine}
              </span>
            </div>

            <div className="px-5 py-1.5"
              style={{
                border: `1.5px solid ${diff.color}`,
                color: diff.color,
                fontFamily: 'var(--font-arcade)',
                fontSize: '19px',
                letterSpacing: '0.25em',
                boxShadow: `0 0 20px ${diff.color}44, inset 0 0 12px ${diff.color}22`,
              }}>
              {diff.label}
            </div>

            <motion.span
              style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.3em', color: '#4A6484' }}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.4, repeat: Infinity }}
            >
              TAP TO START
            </motion.span>
          </motion.button>
        )}

        {/* ══════════ GAME ══════════ */}
        {phase === 'play' && (
          <motion.div
            key="play"
            className="relative flex flex-col"
            style={{ width: 'min(540px, calc(100vw - 20px))', maxHeight: '100dvh' }}
            initial={{ opacity: 0, y: 26, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
          >
            {/* Header strip */}
            <div className="flex items-center gap-3 px-1 pb-2.5">
              <button
                onClick={onAbort}
                className="flex items-center justify-center flex-shrink-0"
                style={{
                  width: 34, height: 34,
                  background: 'rgba(240,246,255,0.06)',
                  border: '1px solid rgba(240,246,255,0.14)',
                  color: '#8BA3BE',
                }}
                aria-label="Abort challenge"
              >
                <X size={15} />
              </button>
              <div className="flex-1 min-w-0 flex items-baseline gap-2.5">
                <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '26px', lineHeight: 1, color: '#F0F6FF', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                  {meta.name}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#8BA3BE', letterSpacing: '0.08em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {zoneName.toUpperCase()} · {vsLine}
                </span>
              </div>
              <span className="flex-shrink-0 px-2.5 py-1" style={{
                border: `1px solid ${diff.color}`,
                color: diff.color,
                fontFamily: 'var(--font-arcade)',
                fontSize: '15px',
                letterSpacing: '0.18em',
                lineHeight: 1.1,
              }}>
                {diff.label}
              </span>
            </div>

            {/* Arena card — gradient frame + HUD corner brackets */}
            <div className="relative" style={{ padding: 1, background: 'linear-gradient(140deg, rgba(0,194,255,0.55), rgba(124,92,252,0.4) 55%, rgba(0,194,255,0.2))' }}>
              <CornerBrackets color="#00C2FF" />
              <div
                className="overflow-y-auto px-5 py-6"
                style={{
                  background: 'rgba(9,13,24,0.94)',
                  maxHeight: 'calc(100dvh - 120px)',
                }}
              >
                <GameComponent difficulty={difficulty} onWin={handleWin} onLose={handleLose} />
              </div>
            </div>

            <p className="hidden lg:block text-center pt-2" style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.25em', color: '#4A6484' }}>
              ESC TO BAIL
            </p>
          </motion.div>
        )}

        {/* ══════════ RESULT SPLASH ══════════ */}
        {phase === 'result' && outcome && (
          <motion.div
            key="result"
            className="relative flex flex-col items-center gap-4 px-8 w-full"
            style={{ maxWidth: 560 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Stripes color={outcome === 'win' ? 'rgba(0,224,150,0.5)' : 'rgba(255,71,87,0.45)'} />

            <motion.span
              style={{ fontSize: '84px', lineHeight: 1 }}
              initial={{ scale: 0.3, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 13 }}
            >
              {outcome === 'win' ? '🏆' : '💨'}
            </motion.span>

            <motion.h1
              style={{
                fontFamily: 'var(--font-arcade)',
                fontSize: 'clamp(56px, 14vw, 96px)',
                lineHeight: 0.95,
                letterSpacing: '0.04em',
                textAlign: 'center',
                ...(outcome === 'win'
                  ? {
                      background: 'linear-gradient(160deg, #00E096 20%, #00C2FF 80%)',
                      WebkitBackgroundClip: 'text',
                      backgroundClip: 'text',
                      color: 'transparent',
                      filter: 'drop-shadow(0 4px 28px rgba(0,224,150,0.4))',
                    }
                  : {
                      color: '#FF4757',
                      textShadow: '0 0 32px rgba(255,71,87,0.55)',
                    }),
              }}
              initial={{ scale: 1.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.08 }}
            >
              {outcome === 'win' ? 'TURF SECURED' : 'REPELLED'}
            </motion.h1>

            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#8BA3BE', letterSpacing: '0.12em', textAlign: 'center' }}>
              {outcome === 'win'
                ? `${zoneName.toUpperCase()} · ${ownerHandle ? 'TAKEN FROM @' + ownerHandle.toUpperCase() : 'CLAIMED'}`
                : `${zoneName.toUpperCase()} SLIPS AWAY · RUN IT BACK`}
            </p>

            <Stripes color={outcome === 'win' ? 'rgba(0,224,150,0.5)' : 'rgba(255,71,87,0.45)'} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
