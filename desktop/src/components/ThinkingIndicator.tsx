/**
 * ThinkingIndicator — the "something is happening" animation.
 *
 * What you see while ubongo is processing an intent:
 *  - A row of pulsing voice-style bars (five, staggered, breathing).
 *  - A phase label that cycles ("Understanding… → Planning… → Gathering… → Composing…")
 *    with a shimmer sweep across each word as it appears.
 *  - Your original prompt echoed below in muted quote style so you remember
 *    what you asked.
 *
 * Keep it lightweight — this replaces the boring "Thinking…" task card
 * during the pre-tool-call phase. Once tool steps arrive, App.tsx switches
 * to the structured Plan component instead.
 */

import React from "react";
import { motion, AnimatePresence } from "motion/react";

const PHASES = [
  "Understanding your intent",
  "Planning the approach",
  "Gathering context",
  "Composing a response",
];

interface Props {
  /** The user's prompt, echoed in muted style */
  prompt?: string;
  /** Optional override for the phase text (e.g. "Calling search…") */
  phaseOverride?: string;
}

export function ThinkingIndicator({ prompt, phaseOverride }: Props) {
  const [phaseIdx, setPhaseIdx] = React.useState(0);

  // Cycle phases while no override
  React.useEffect(() => {
    if (phaseOverride) return;
    const t = setInterval(() => {
      setPhaseIdx((i) => (i + 1) % PHASES.length);
    }, 1800);
    return () => clearInterval(t);
  }, [phaseOverride]);

  const label = phaseOverride ?? PHASES[phaseIdx];

  return (
    <div className="w-full flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.035] to-white/[0.01] px-4 py-3 overflow-hidden">
      {/* ── Animated voice bars ── */}
      <VoiceBars />

      {/* ── Phase label + echoed prompt ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="relative h-[22px] overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.2, 0.65, 0.3, 0.9] }}
              className="absolute inset-0 flex items-center"
            >
              <ShimmerText text={label + "…"} />
            </motion.div>
          </AnimatePresence>
        </div>
        {prompt && (
          <p className="text-[12px] text-slate-500 truncate italic">
            “{prompt}”
          </p>
        )}
      </div>

      {/* ── Trailing ellipsis dots ── */}
      <Dots />
    </div>
  );
}

/* ── Voice-style pulsing bars (5 bars, staggered) ─────────────── */

function VoiceBars() {
  const bars = [0, 1, 2, 3, 4];
  return (
    <div className="flex items-center gap-[3px] h-7 shrink-0" aria-hidden="true">
      {bars.map((i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full bg-gradient-to-b from-indigo-400 to-violet-500"
          animate={{
            height: ["30%", "90%", "50%", "100%", "40%"],
            opacity: [0.5, 1, 0.7, 1, 0.5],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.12,
          }}
          style={{ height: "30%" }}
        />
      ))}
    </div>
  );
}

/* ── Shimmering text (gradient sweeps across) ─────────────────── */

function ShimmerText({ text }: { text: string }) {
  return (
    <span
      className="text-[14px] font-medium tracking-tight bg-clip-text text-transparent"
      style={{
        backgroundImage:
          "linear-gradient(90deg, rgba(226,232,240,0.55) 0%, rgba(226,232,240,0.55) 40%, rgba(255,255,255,1) 50%, rgba(226,232,240,0.55) 60%, rgba(226,232,240,0.55) 100%)",
        backgroundSize: "200% 100%",
        animation: "shimmer-sweep 2.2s linear infinite",
      }}
    >
      {text}
    </span>
  );
}

/* ── Trailing ellipsis dots ───────────────────────────────────── */

function Dots() {
  const dots = [0, 1, 2];
  return (
    <div className="flex items-center gap-1 shrink-0" aria-hidden="true">
      {dots.map((i) => (
        <motion.span
          key={i}
          className="w-1 h-1 rounded-full bg-indigo-400"
          animate={{ opacity: [0.25, 1, 0.25], scale: [0.8, 1.15, 0.8] }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.18,
          }}
        />
      ))}
    </div>
  );
}

export default ThinkingIndicator;
