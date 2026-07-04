'use client';

import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { SignalRush } from './SignalRush';
import { BodaRush } from './BodaRush';
import { FrequencyDuel } from './FrequencyDuel';
import { ZoneFlood } from './ZoneFlood';

type GameId = 'signal' | 'boda' | 'frequency' | 'flood';

const GAME_META: Record<GameId, { name: string; tagline: string; emoji: string }> = {
  signal: { name: 'Signal Rush',     tagline: 'Tap every node before it fades', emoji: '⚡' },
  boda:   { name: 'Boda Rush',       tagline: 'Dodge your way through traffic',  emoji: '🛵' },
  frequency: { name: 'Frequency Duel', tagline: 'Echo the beat — get it right',  emoji: '🎵' },
  flood:  { name: 'Zone Flood',      tagline: 'Out-flood the AI for the zone',   emoji: '🌊' },
};

const ALL_GAMES: GameId[] = ['signal', 'boda', 'frequency', 'flood'];

function pickGame(): GameId {
  return ALL_GAMES[Math.floor(Math.random() * ALL_GAMES.length)];
}

function difficultyLabel(d: number): { label: string; color: string; bg: string; border: string } {
  if (d >= 0.7) return { label: 'HARD',   color: 'var(--color-danger)',   bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.28)' };
  if (d >= 0.4) return { label: 'MEDIUM', color: 'var(--color-warning)',  bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.28)' };
  return         { label: 'EASY',   color: 'var(--color-success)',  bg: 'rgba(0,224,150,0.08)',   border: 'rgba(0,224,150,0.28)' };
}

export function GameArena({ zoneName, difficulty, onWin, onLose, onAbort }: {
  zoneName: string;
  difficulty: number;
  onWin: () => void;
  onLose: () => void;
  onAbort: () => void;
}) {
  const game = useRef<GameId>(pickGame()).current;
  const meta = GAME_META[game];
  const diff = difficultyLabel(difficulty);

  const GameComponent =
    game === 'signal'    ? SignalRush
    : game === 'boda'    ? BodaRush
    : game === 'frequency' ? FrequencyDuel
    : ZoneFlood;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[60] flex flex-col"
        style={{ background: 'rgba(7,10,18,0.82)', backdropFilter: 'blur(14px) saturate(1.2)' }}
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 30 }}
        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      >
        {/* ── Header ── */}
        <div
          className="flex-shrink-0 flex items-center gap-3 px-4 pb-3"
          style={{
            paddingTop: 'max(env(safe-area-inset-top), 16px)',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--surface-panel)',
          }}
        >
          <button
            onClick={onAbort}
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--surface-subtle)', border: '1px solid var(--border-mid)' }}
          >
            <X size={14} style={{ color: 'var(--text-muted)' }} />
          </button>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span style={{ fontSize: '22px', lineHeight: 1 }}>{meta.emoji}</span>
            <div className="min-w-0">
              <p style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: '16px',
                color: 'var(--text-primary)',
                letterSpacing: '-0.01em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {meta.name}
              </p>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {zoneName} · {meta.tagline}
              </p>
            </div>
          </div>

          <span
            className="flex-shrink-0 px-2.5 py-1 rounded-lg"
            style={{
              background: diff.bg,
              border: `1px solid ${diff.border}`,
              color: diff.color,
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.06em',
            }}
          >
            {diff.label}
          </span>
        </div>

        {/* ── Game area ── */}
        <div className="flex-1 overflow-y-auto flex flex-col justify-center px-5 py-6"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}>
          <GameComponent
            difficulty={difficulty}
            onWin={onWin}
            onLose={onLose}
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
