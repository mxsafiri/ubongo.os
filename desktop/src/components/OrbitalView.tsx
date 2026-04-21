/**
 * OrbitalView — the primary interface.
 *
 * Central ColorOrb with dock-style action tiles orbiting around it.
 * Tap the orb  → focuses the always-visible ask bar.
 * Hold the orb → starts voice push-to-talk (hold > 280 ms).
 * Release       → submits the spoken transcript.
 * Click a tile  → executes that action prompt.
 *
 * The orbit rotates slowly; each tile counter-rotates so the icon stays upright.
 *
 * Visual language: macOS dock — vibrant rounded-2xl tiles, specular shine,
 * spring-lift on hover, tooltip above. Designed to be *visible* against the
 * dark backdrop, not muted.
 */

import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FolderSearch,
  Rocket,
  Globe,
  Music,
  Zap,
  Mic,
} from "lucide-react";
import { ColorOrb } from "@/components/ui/color-orb";

interface OrbitNode {
  id: string;
  label: string;
  icon: React.ReactNode;
  prompt: string;
  angle: number; // degrees on the orbit
  /** Tailwind background for the tile. Gradients welcome. */
  color: string;
}

const ORBIT_NODES: OrbitNode[] = [
  {
    id: "find",
    label: "Find",
    icon: <FolderSearch className="w-5 h-5" />,
    prompt: "Find files in my Downloads folder",
    angle: 0,
    color: "bg-gradient-to-br from-sky-400 to-blue-600",
  },
  {
    id: "open",
    label: "Launch",
    icon: <Rocket className="w-5 h-5" />,
    prompt: "Open Spotify",
    angle: 72,
    color: "bg-gradient-to-br from-violet-500 to-indigo-700",
  },
  {
    id: "search",
    label: "Search",
    icon: <Globe className="w-5 h-5" />,
    prompt: "Search for the latest AI news",
    angle: 144,
    color: "bg-gradient-to-br from-cyan-400 to-teal-600",
  },
  {
    id: "music",
    label: "Music",
    icon: <Music className="w-5 h-5" />,
    prompt: "Play my Liked Songs",
    angle: 216,
    color: "bg-gradient-to-br from-pink-500 to-fuchsia-600",
  },
  {
    id: "automate",
    label: "Automate",
    icon: <Zap className="w-5 h-5" />,
    prompt: "Automate my morning routine",
    angle: 288,
    color: "bg-gradient-to-br from-amber-400 to-orange-600",
  },
];

const ORBIT_RADIUS = 140;
const SPIN_DURATION = 40; // seconds per full rotation
const TILE_SIZE = 52;
const HOLD_THRESHOLD_MS = 280;

interface Props {
  onNodeClick: (prompt: string) => void;
  onOrbClick: () => void;
  /** Called when hold gesture crosses the threshold — start recording. */
  onOrbHoldStart?: () => void;
  /** Called when the held pointer releases — stop recording. */
  onOrbHoldEnd?: () => void;
  isRunning: boolean;
  /** True while the voice capture is active. */
  isListening?: boolean;
}

/* ── Single dock-style orbiting tile ─────────────────────────────── */

function OrbitTile({
  node,
  onClick,
}: {
  node: OrbitNode;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  return (
    <motion.button
      className="relative flex flex-col items-center pointer-events-auto group"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setPressed(false);
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      whileTap={{ scale: 0.92 }}
    >
      {/* Tooltip — floats above the tile */}
      <motion.div
        initial={false}
        animate={{
          opacity: hovered ? 1 : 0,
          y: hovered ? -6 : 2,
          scale: hovered ? 1 : 0.85,
        }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-slate-900/90 backdrop-blur-sm border border-white/10 text-[11px] font-medium text-slate-100 whitespace-nowrap pointer-events-none shadow-lg z-10"
      >
        {node.label}
      </motion.div>

      {/* Tile */}
      <motion.div
        className={`relative rounded-2xl flex items-center justify-center text-white overflow-hidden shadow-[0_8px_24px_-4px_rgba(0,0,0,0.6)] ring-1 ring-white/15 ${node.color}`}
        style={{ width: TILE_SIZE, height: TILE_SIZE }}
        animate={{
          y: pressed ? 2 : hovered ? -8 : 0,
          scale: hovered ? 1.12 : 1,
        }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
      >
        {/* Icon */}
        <motion.div
          animate={{ scale: hovered ? 1.1 : 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
          className="relative z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
        >
          {node.icon}
        </motion.div>

        {/* Specular shine */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-br from-white/40 via-white/10 to-transparent rounded-2xl"
          animate={{ opacity: hovered ? 0.55 : 0.25 }}
          transition={{ duration: 0.2 }}
        />

        {/* Bottom inner shadow for depth */}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/20 to-transparent rounded-b-2xl pointer-events-none" />
      </motion.div>

      {/* Active indicator dot */}
      <motion.div
        className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white/70"
        animate={{
          scale: pressed ? 1.8 : hovered ? 1.2 : 0.8,
          opacity: hovered ? 1 : 0.45,
        }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    </motion.button>
  );
}

/* ── Main orbital view ───────────────────────────────────────────── */

export function OrbitalView({
  onNodeClick,
  onOrbClick,
  onOrbHoldStart,
  onOrbHoldEnd,
  isRunning,
  isListening = false,
}: Props) {
  // Hold-gesture state — plain refs to avoid re-renders on rapid pointer events.
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasHoldRef   = useRef(false);

  const handlePointerDown = () => {
    wasHoldRef.current = false;
    holdTimerRef.current = setTimeout(() => {
      wasHoldRef.current = true;
      onOrbHoldStart?.();
    }, HOLD_THRESHOLD_MS);
  };

  const handlePointerUp = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (wasHoldRef.current) {
      onOrbHoldEnd?.();
      // wasHoldRef stays true until onClick clears it so onClick can skip focus.
    }
  };

  const handleClick = () => {
    if (wasHoldRef.current) {
      wasHoldRef.current = false; // consumed by hold — don't focus ask bar
      return;
    }
    onOrbClick();
  };

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: ORBIT_RADIUS * 2 + 120, height: ORBIT_RADIUS * 2 + 120 }}
    >
      {/* Orbit ring — subtle circle */}
      <div
        className="absolute rounded-full border border-white/[0.06]"
        style={{ width: ORBIT_RADIUS * 2, height: ORBIT_RADIUS * 2 }}
      />

      {/* Inner ring */}
      <div
        className="absolute rounded-full border border-white/[0.03]"
        style={{ width: ORBIT_RADIUS * 1.3, height: ORBIT_RADIUS * 1.3 }}
      />

      {/* Rotating container — pointer-events pass through so the orb remains clickable */}
      <motion.div
        className="absolute pointer-events-none"
        style={{ width: ORBIT_RADIUS * 2, height: ORBIT_RADIUS * 2 }}
        animate={{ rotate: 360 }}
        transition={{ duration: SPIN_DURATION, repeat: Infinity, ease: "linear" }}
      >
        {ORBIT_NODES.map((node) => {
          const rad = (node.angle * Math.PI) / 180;
          const x = Math.cos(rad) * ORBIT_RADIUS + ORBIT_RADIUS;
          const y = Math.sin(rad) * ORBIT_RADIUS + ORBIT_RADIUS;

          return (
            <div
              key={node.id}
              className="absolute"
              style={{ left: x, top: y, transform: "translate(-50%, -50%)" }}
            >
              {/* Counter-rotate so the tile stays upright while the orbit spins */}
              <motion.div
                animate={{ rotate: -360 }}
                transition={{
                  duration: SPIN_DURATION,
                  repeat: Infinity,
                  ease: "linear",
                }}
              >
                <OrbitTile node={node} onClick={() => onNodeClick(node.prompt)} />
              </motion.div>
            </div>
          );
        })}
      </motion.div>

      {/* Central orb — the heart */}
      <div className="relative z-10 flex flex-col items-center gap-3">
        {/* Listening ring — expands outward when recording */}
        <AnimatePresence>
          {isListening && (
            <motion.div
              key="listen-ring"
              className="absolute rounded-full border-2 border-rose-400/70 pointer-events-none"
              initial={{ width: 80, height: 80, opacity: 0, scale: 0.9 }}
              animate={{
                width: [80, 120, 80],
                height: [80, 120, 80],
                opacity: [0.8, 0.3, 0.8],
                scale: 1,
              }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </AnimatePresence>

        <motion.button
          className="relative cursor-pointer select-none"
          onClick={handleClick}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}  // cancel hold if pointer drifts off
          onPointerCancel={handlePointerUp}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          animate={
            isListening
              ? { scale: [1, 1.06, 1], transition: { duration: 1.2, repeat: Infinity } }
              : isRunning
              ? { scale: [1, 1.05, 1], transition: { duration: 1.5, repeat: Infinity } }
              : {}
          }
          title="Tap to type · Hold to speak"
        >
          <ColorOrb
            dimension="80px"
            spinDuration={isListening ? 2 : isRunning ? 4 : 15}
            tones={
              isListening
                ? {
                    base: "oklch(12% 0.03 15)",
                    accent1: "oklch(65% 0.22 15)",   // rose
                    accent2: "oklch(70% 0.18 350)",  // pink
                    accent3: "oklch(58% 0.24 30)",   // orange-red
                  }
                : {
                    base: "oklch(12% 0.02 264)",
                    accent1: "oklch(65% 0.2 280)",
                    accent2: "oklch(72% 0.18 230)",
                    accent3: "oklch(58% 0.22 310)",
                  }
            }
          />
          {/* Glow behind orb */}
          <div
            className={`absolute inset-0 -z-10 rounded-full blur-2xl scale-150 transition-colors duration-500 ${
              isListening ? "bg-rose-500/25" : "bg-indigo-500/20"
            }`}
          />
        </motion.button>

        {/* Listening / hint label below orb */}
        <AnimatePresence mode="wait">
          {isListening ? (
            <motion.div
              key="listening"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-1.5"
            >
              <Mic className="w-3 h-3 text-rose-400" />
              <span className="font-mono text-[10px] tracking-[0.22em] text-rose-400 uppercase">
                Listening
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.3 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="font-mono text-[9px] tracking-[0.18em] text-slate-600 uppercase"
            >
              hold to speak
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
