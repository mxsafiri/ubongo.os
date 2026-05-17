'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const GRID_N = 6;
const COLORS = ['#0099c2', '#00c878', '#f59e0b', '#ef4444', '#9333ea'] as const;
const COLOR_LABELS = ['KALI', 'PORI', 'JOTO', 'MOTO', 'SIRI'];
const MAX_TURNS = 22; // total turns (player + AI combined)

function makeGrid(): number[] {
  return Array.from({ length: GRID_N * GRID_N }, () => Math.floor(Math.random() * COLORS.length));
}

function idx(r: number, c: number): number {
  return r * GRID_N + c;
}

function bfsFlood(grid: number[], territory: Set<number>, newColor: number): Set<number> {
  const updated = new Set(territory);
  const queue: number[] = [];

  // Seed: all cells adjacent to territory with newColor
  for (const cell of territory) {
    const r = Math.floor(cell / GRID_N);
    const c = cell % GRID_N;
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < GRID_N && nc >= 0 && nc < GRID_N) {
        const ni = idx(nr, nc);
        if (!updated.has(ni) && grid[ni] === newColor) {
          queue.push(ni);
          updated.add(ni);
        }
      }
    }
  }

  // BFS expand from queued cells
  let qi = 0;
  while (qi < queue.length) {
    const cell = queue[qi++];
    const r = Math.floor(cell / GRID_N);
    const c = cell % GRID_N;
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < GRID_N && nc >= 0 && nc < GRID_N) {
        const ni = idx(nr, nc);
        if (!updated.has(ni) && grid[ni] === newColor) {
          queue.push(ni);
          updated.add(ni);
        }
      }
    }
  }

  // Also repaint all territory cells with newColor
  for (const cell of territory) updated.add(cell);

  return updated;
}

function aiPickColor(grid: number[], aiTerritory: Set<number>, playerTerritory: Set<number>, difficulty: number): number {
  if (difficulty < 0.4) {
    // Random AI
    return Math.floor(Math.random() * COLORS.length);
  }
  // Greedy: pick color that maximizes AI territory size
  let best = 0;
  let bestSize = -1;
  for (let c = 0; c < COLORS.length; c++) {
    const testGrid = [...grid];
    // Temporarily repaint player territory to a neutral color so AI flood doesn't bleed through
    const size = bfsFlood(testGrid, aiTerritory, c).size;
    if (size > bestSize) { bestSize = size; best = c; }
  }
  return best;
}

type Phase = 'playing' | 'done';

export function ZoneFlood({ difficulty, onWin, onLose }: {
  difficulty: number;
  onWin: () => void;
  onLose: () => void;
}) {
  const [grid, setGrid] = useState<number[]>(() => makeGrid());
  const [playerT, setPlayerT] = useState<Set<number>>(() => new Set([idx(0, 0)]));
  const [aiT, setAiT] = useState<Set<number>>(() => new Set([idx(GRID_N - 1, GRID_N - 1)]));
  const [turnsLeft, setTurnsLeft] = useState(MAX_TURNS);
  const [phase, setPhase] = useState<Phase>('playing');
  const [playerColor, setPlayerColor] = useState(() => 0); // current player territory color
  const [aiColor, setAiColor] = useState(() => COLORS.length - 1);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [animatingCell, setAnimatingCell] = useState<number | null>(null);

  const checkWin = useCallback((pT: Set<number>, aT: Set<number>, turns: number) => {
    const total = GRID_N * GRID_N;
    if (pT.size + aT.size >= total || turns <= 0) {
      setPhase('done');
      if (pT.size > aT.size) {
        setTimeout(onWin, 600);
      } else {
        setTimeout(onLose, 600);
      }
      return true;
    }
    return false;
  }, [onWin, onLose]);

  // AI turn after player move
  useEffect(() => {
    if (phase !== 'playing' || isPlayerTurn) return;

    const t = setTimeout(() => {
      setGrid((prevGrid) => {
        setPlayerT((pT) => {
          setAiT((aT) => {
            const color = aiPickColor(prevGrid, aT, pT, difficulty);
            const newAiT = bfsFlood(prevGrid, aT, color);

            // Repaint grid for AI territory
            const newGrid = [...prevGrid];
            for (const cell of newAiT) newGrid[cell] = color;

            setAiColor(color);
            setGrid(newGrid);
            setTurnsLeft((t) => {
              const next = t - 1;
              if (!checkWin(pT, newAiT, next)) {
                setIsPlayerTurn(true);
              }
              return next;
            });
            return newAiT;
          });
          return pT;
        });
        return prevGrid; // return value unused, actual grid set above
      });
    }, 480);

    return () => clearTimeout(t);
  }, [isPlayerTurn, phase, difficulty, checkWin]);

  const pickColor = useCallback((colorIdx: number) => {
    if (!isPlayerTurn || phase !== 'playing') return;

    setGrid((prevGrid) => {
      setPlayerT((pT) => {
        const newPT = bfsFlood(prevGrid, pT, colorIdx);

        // Repaint grid cells to reflect player color
        const newGrid = [...prevGrid];
        for (const cell of newPT) newGrid[cell] = colorIdx;
        setGrid(newGrid);

        setPlayerColor(colorIdx);
        setTurnsLeft((t) => {
          const next = t - 1;
          setAiT((aT) => {
            if (!checkWin(newPT, aT, next)) {
              setIsPlayerTurn(false);
            }
            return aT;
          });
          return next;
        });

        return newPT;
      });
      return prevGrid;
    });
  }, [isPlayerTurn, phase, checkWin]);

  const total = GRID_N * GRID_N;
  const playerPct = Math.round((playerT.size / total) * 100);
  const aiPct = Math.round((aiT.size / total) * 100);

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Score bar */}
      <div className="w-full flex items-center gap-2">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: COLORS[playerColor], fontWeight: 700 }}>YOU {playerPct}%</span>
        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-subtle)' }}>
          <motion.div
            className="h-full rounded-full"
            animate={{ width: `${playerPct}%` }}
            transition={{ duration: 0.3 }}
            style={{ background: COLORS[playerColor] }}
          />
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: COLORS[aiColor], fontWeight: 700 }}>{aiPct}% AI</span>
      </div>

      <div className="w-full flex items-center justify-between px-1">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
          ZONE FLOOD
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: isPlayerTurn ? 'var(--color-primary)' : 'var(--text-muted)' }}>
          {isPlayerTurn ? 'YOUR TURN' : 'AI…'} · {turnsLeft} left
        </span>
      </div>

      {/* Grid */}
      <div
        className="grid rounded-xl overflow-hidden"
        style={{
          gridTemplateColumns: `repeat(${GRID_N}, 1fr)`,
          gap: 2,
          width: '100%',
          background: 'var(--border-mid)',
          border: '2px solid var(--border-mid)',
        }}
      >
        {grid.map((colorIdx, i) => {
          const isPlayer = playerT.has(i);
          const isAi = aiT.has(i);
          const base = COLORS[colorIdx];

          return (
            <motion.div
              key={i}
              className="relative"
              style={{
                aspectRatio: '1',
                background: base,
                outline: isPlayer
                  ? '2px solid rgba(255,255,255,0.55)'
                  : isAi
                  ? '2px solid rgba(0,0,0,0.45)'
                  : 'none',
                outlineOffset: '-2px',
              }}
              animate={{ opacity: 1 }}
            >
              {isPlayer && (
                <div className="absolute inset-0 flex items-center justify-center" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.8)', fontWeight: 700 }}>
                  ▲
                </div>
              )}
              {isAi && (
                <div className="absolute inset-0 flex items-center justify-center" style={{ fontSize: '9px', color: 'rgba(0,0,0,0.7)', fontWeight: 700 }}>
                  ▼
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Color picker */}
      <AnimatePresence>
        {phase === 'playing' && (
          <motion.div
            className="flex gap-2 w-full"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: isPlayerTurn ? 1 : 0.4, y: 0 }}
          >
            {COLORS.map((color, i) => (
              <motion.button
                key={i}
                onClick={() => pickColor(i)}
                disabled={!isPlayerTurn || i === playerColor}
                className="flex-1 rounded-xl py-2.5 flex flex-col items-center gap-1"
                style={{
                  background: color,
                  opacity: i === playerColor ? 0.35 : 1,
                  border: i === playerColor ? '2px solid rgba(255,255,255,0.3)' : '2px solid transparent',
                  cursor: isPlayerTurn && i !== playerColor ? 'pointer' : 'default',
                  transition: 'opacity 0.2s',
                }}
                whileTap={isPlayerTurn && i !== playerColor ? { scale: 0.92 } : undefined}
              >
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: '#fff', fontWeight: 700, letterSpacing: '0.06em' }}>
                  {COLOR_LABELS[i]}
                </span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
