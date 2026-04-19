/**
 * OrbitalView — the primary interface.
 *
 * Central ColorOrb with dock-style action tiles orbiting around it.
 * Click the orb → morphs into input. Click a tile → executes that action.
 * The orbit rotates slowly; each tile counter-rotates so the icon stays upright.
 *
 * Visual language: macOS dock — vibrant rounded-2xl tiles, specular shine,
 * spring-lift on hover, tooltip above. Designed to be *visible* against the
 * dark backdrop, not muted.
 */

import React, { useState } from "react";
import { motion } from "motion/react";
import {
  FolderSearch,
  Rocket,
  Globe,
  Music,
  Zap,
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

interface Props {
  onNodeClick: (prompt: string) => void;
  onOrbClick: () => void;
  isRunning: boolean;
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

export function OrbitalView({ onNodeClick, onOrbClick, isRunning }: Props) {
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
      <motion.button
        className="relative z-10 cursor-pointer"
        onClick={onOrbClick}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        animate={
          isRunning
            ? {
                scale: [1, 1.05, 1],
                transition: { duration: 1.5, repeat: Infinity },
              }
            : {}
        }
      >
        <ColorOrb
          dimension="80px"
          spinDuration={isRunning ? 4 : 15}
          tones={{
            base: "oklch(12% 0.02 264)",
            accent1: "oklch(65% 0.2 280)",
            accent2: "oklch(72% 0.18 230)",
            accent3: "oklch(58% 0.22 310)",
          }}
        />
        {/* Glow behind orb */}
        <div className="absolute inset-0 -z-10 rounded-full bg-indigo-500/20 blur-2xl scale-150" />
      </motion.button>
    </div>
  );
}
