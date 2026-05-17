'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const PADS = [
  { id: 0, label: 'KALI', emoji: '🔵', color: '#0099c2', glow: 'rgba(0,153,194,0.7)' },
  { id: 1, label: 'PORI', emoji: '🟢', color: '#00c878', glow: 'rgba(0,200,120,0.7)' },
  { id: 2, label: 'JOTO', emoji: '🟡', color: '#f59e0b', glow: 'rgba(245,158,11,0.7)' },
  { id: 3, label: 'MOTO', emoji: '🔴', color: '#ef4444', glow: 'rgba(239,68,68,0.7)' },
] as const;

const ROUNDS = 3;
const WINS_NEEDED = 2;

interface Config {
  seqLen: number;       // length of sequence to echo
  flashMs: number;      // ms each pad lights up
  pauseMs: number;      // ms between flashes
}

function getConfig(difficulty: number): Config {
  return {
    seqLen: Math.round(3 + difficulty * 2),
    flashMs: Math.round(800 - difficulty * 300),
    pauseMs: Math.round(500 - difficulty * 150),
  };
}

type Phase = 'countdown' | 'watching' | 'echoing' | 'round-result' | 'done';

function makeSeq(len: number): number[] {
  return Array.from({ length: len }, () => Math.floor(Math.random() * 4));
}

export function FrequencyDuel({ difficulty, onWin, onLose }: {
  difficulty: number;
  onWin: () => void;
  onLose: () => void;
}) {
  const cfg = useRef(getConfig(difficulty)).current;

  const [phase, setPhase] = useState<Phase>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [round, setRound] = useState(1);
  const [wins, setWins] = useState(0);
  const [seq, setSeq] = useState<number[]>([]);
  const [litPad, setLitPad] = useState<number | null>(null);    // which pad is flashing
  const [echoIdx, setEchoIdx] = useState(0);                    // how many pads player has echoed
  const [roundWin, setRoundWin] = useState<boolean | null>(null);
  const [wrongPad, setWrongPad] = useState<number | null>(null);

  const echoIdxRef = useRef(0);
  const seqRef = useRef<number[]>([]);
  const phaseRef = useRef<Phase>('countdown');
  phaseRef.current = phase;

  // Countdown tick
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdown <= 0) {
      const s = makeSeq(cfg.seqLen);
      setSeq(s);
      seqRef.current = s;
      setPhase('watching');
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), countdown === 3 ? 600 : 850);
    return () => clearTimeout(t);
  }, [phase, countdown, cfg]);

  // Flash sequence
  useEffect(() => {
    if (phase !== 'watching') return;
    let cancelled = false;
    let i = 0;

    const flash = () => {
      if (cancelled || i >= seqRef.current.length) {
        if (!cancelled) {
          setLitPad(null);
          setEchoIdx(0);
          echoIdxRef.current = 0;
          setPhase('echoing');
        }
        return;
      }
      setLitPad(seqRef.current[i]);
      setTimeout(() => {
        if (cancelled) return;
        setLitPad(null);
        setTimeout(() => {
          i++;
          flash();
        }, cfg.pauseMs);
      }, cfg.flashMs);
    };

    const delay = setTimeout(flash, 400);
    return () => { cancelled = true; clearTimeout(delay); };
  }, [phase, cfg]);

  // Player echo input
  const tapPad = useCallback((padId: number) => {
    if (phaseRef.current !== 'echoing') return;
    const expected = seqRef.current[echoIdxRef.current];

    if (padId !== expected) {
      // Wrong pad — round lost
      setWrongPad(padId);
      setLitPad(expected); // show correct
      setRoundWin(false);
      setPhase('round-result');
      return;
    }

    setLitPad(padId);
    setTimeout(() => setLitPad(null), 200);

    const next = echoIdxRef.current + 1;
    echoIdxRef.current = next;
    setEchoIdx(next);

    if (next >= seqRef.current.length) {
      // Completed sequence — round won
      setRoundWin(true);
      setPhase('round-result');
    }
  }, []);

  // After round result, advance or finish
  useEffect(() => {
    if (phase !== 'round-result') return;
    const t = setTimeout(() => {
      const newWins = wins + (roundWin ? 1 : 0);
      const remaining = ROUNDS - round;
      const canStillWin = newWins < WINS_NEEDED && remaining >= WINS_NEEDED - newWins;

      if (newWins >= WINS_NEEDED) {
        setPhase('done');
        setTimeout(onWin, 400);
      } else if (round >= ROUNDS || !canStillWin) {
        setPhase('done');
        setTimeout(onLose, 400);
      } else {
        const nextSeq = makeSeq(cfg.seqLen);
        setSeq(nextSeq);
        seqRef.current = nextSeq;
        setWins(newWins);
        setRound((r) => r + 1);
        setLitPad(null);
        setWrongPad(null);
        setRoundWin(null);
        setEchoIdx(0);
        echoIdxRef.current = 0;
        setCountdown(2);
        setPhase('countdown');
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [phase, round, wins, roundWin, cfg, onWin, onLose]);

  const instruction =
    phase === 'watching' ? 'WATCH THE SEQUENCE'
    : phase === 'echoing' ? `ECHO IT BACK — ${echoIdx}/${seq.length}`
    : phase === 'round-result' ? (roundWin ? '✓ PERFECT!' : '✗ WRONG BEAT')
    : phase === 'countdown' ? 'GET READY'
    : '';

  return (
    <div className="flex flex-col items-center gap-5 w-full">
      {/* Round dots + instruction */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex gap-2">
          {Array.from({ length: ROUNDS }, (_, i) => (
            <div key={i} className="w-2.5 h-2.5 rounded-full transition-all duration-300"
              style={{
                background: i < wins ? 'var(--color-success)'
                  : i === round - 1 && phase !== 'done' ? 'var(--color-primary)'
                  : 'var(--border-mid)',
              }} />
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.p
            key={instruction}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.2 }}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              letterSpacing: '0.1em',
              color: phase === 'round-result'
                ? (roundWin ? 'var(--color-success)' : 'var(--color-danger)')
                : 'var(--text-muted)',
              fontWeight: phase === 'round-result' ? 700 : 400,
            }}
          >
            {instruction}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Countdown overlay or pad grid */}
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
              {countdown > 0 ? countdown : '🎵'}
            </span>
          </motion.div>
        ) : (
          <motion.div
            key="pads"
            className="grid gap-3 w-full"
            style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            {PADS.map((pad) => {
              const isLit = litPad === pad.id;
              const isWrong = wrongPad === pad.id;
              const canTap = phase === 'echoing';

              return (
                <motion.button
                  key={pad.id}
                  onClick={() => tapPad(pad.id)}
                  disabled={!canTap}
                  className="rounded-2xl flex flex-col items-center justify-center gap-1.5"
                  style={{
                    aspectRatio: '1.2',
                    background: isLit
                      ? pad.color
                      : isWrong
                      ? 'rgba(239,68,68,0.25)'
                      : 'var(--surface-subtle)',
                    border: isLit
                      ? `2px solid ${pad.color}`
                      : '1px solid var(--border-mid)',
                    boxShadow: isLit
                      ? `0 0 36px ${pad.glow}, inset 0 0 16px rgba(255,255,255,0.15)`
                      : 'none',
                    cursor: canTap ? 'pointer' : 'default',
                    transition: 'background 0.12s, box-shadow 0.12s, border-color 0.12s',
                  }}
                  whileTap={canTap ? { scale: 0.9 } : undefined}
                >
                  <span style={{ fontSize: '28px', filter: isLit ? 'brightness(1.2)' : 'brightness(0.6)', transition: 'filter 0.12s' }}>
                    {pad.emoji}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    color: isLit ? '#fff' : 'var(--text-muted)',
                    transition: 'color 0.12s',
                  }}>
                    {pad.label}
                  </span>
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Echo progress dots */}
      {phase === 'echoing' && (
        <div className="flex gap-1.5">
          {seq.map((padId, i) => (
            <div key={i} className="w-2 h-2 rounded-full transition-all duration-200"
              style={{
                background: i < echoIdx
                  ? PADS[padId].color
                  : 'var(--border-mid)',
              }} />
          ))}
        </div>
      )}
    </div>
  );
}
