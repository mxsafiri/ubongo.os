'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { Waves } from 'lucide-react';
import type { Zone } from '@/types';

interface ZoneCardProps {
  zone: Zone;
  tierColor: string;
  tierLabel: string;
  typeLabel: string;
  className?: string;
}

const TYPE_DESCRIPTIONS: Record<Zone['type'], string> = {
  street_market:     'Buy, sell, and negotiate in the city\'s pulse.',
  waterfront:        'Where the coast meets commerce.',
  business_district: 'The heart of trade and power.',
  rooftop:           'Above the city, below the sky.',
  transit_hub:       'Movement and momentum flow through here.',
  night_market:      'The city comes alive after dark.',
  residential:       'Community, culture, and real life.',
  landmark:          'A landmark that defines the city.',
};

export function ZoneCard({ zone, tierColor, tierLabel, typeLabel, className }: ZoneCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const rotateX = useTransform(mouseY, [-50, 50], [5, -5]);
  const rotateY = useTransform(mouseX, [-50, 50], [-5, 5]);
  const springRotateX = useSpring(rotateX, { stiffness: 300, damping: 30 });
  const springRotateY = useSpring(rotateY, { stiffness: 300, damping: 30 });

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    mouseX.set(e.clientX - (rect.left + rect.width / 2));
    mouseY.set(e.clientY - (rect.top + rect.height / 2));
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
    setIsHovered(false);
  };

  const coordLabel = `${Math.abs(zone.lat).toFixed(4)}° ${zone.lat < 0 ? 'S' : 'N'}, ${Math.abs(zone.lng).toFixed(4)}° ${zone.lng < 0 ? 'W' : 'E'}`;

  return (
    <motion.div
      ref={containerRef}
      className={`relative w-full cursor-pointer select-none ${className ?? ''}`}
      style={{ perspective: 1000 }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <motion.div
        className="relative w-full overflow-hidden rounded-2xl"
        style={{
          rotateX: springRotateX,
          rotateY: springRotateY,
          transformStyle: 'preserve-3d',
          background: 'var(--color-surface2)',
          border: `1px solid ${tierColor}30`,
          boxShadow: isHovered ? `0 8px 32px ${tierColor}20` : 'none',
        }}
        animate={{ height: isExpanded ? 220 : 110 }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      >
        {/* Expanded: animated mini street map */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <div className="absolute inset-0" style={{ background: 'var(--color-bg)' }} />

              {/* Street grid SVG */}
              <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                {/* Primary roads */}
                {[33, 66].map((y, i) => (
                  <motion.line key={`h${i}`} x1="0%" y1={`${y}%`} x2="100%" y2={`${y}%`}
                    stroke={tierColor} strokeOpacity="0.2" strokeWidth="3"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                    transition={{ duration: 0.7, delay: 0.2 + i * 0.1 }} />
                ))}
                {[30, 70].map((x, i) => (
                  <motion.line key={`v${i}`} x1={`${x}%`} y1="0%" x2={`${x}%`} y2="100%"
                    stroke={tierColor} strokeOpacity="0.15" strokeWidth="2.5"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                    transition={{ duration: 0.6, delay: 0.35 + i * 0.1 }} />
                ))}
                {/* Secondary streets */}
                {[18, 50, 82].map((y, i) => (
                  <motion.line key={`hs${i}`} x1="0%" y1={`${y}%`} x2="100%" y2={`${y}%`}
                    stroke={tierColor} strokeOpacity="0.07" strokeWidth="1"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                    transition={{ duration: 0.4, delay: 0.5 + i * 0.08 }} />
                ))}
                {[15, 45, 55, 85].map((x, i) => (
                  <motion.line key={`vs${i}`} x1={`${x}%`} y1="0%" x2={`${x}%`} y2="100%"
                    stroke={tierColor} strokeOpacity="0.06" strokeWidth="1"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                    transition={{ duration: 0.4, delay: 0.55 + i * 0.07 }} />
                ))}
              </svg>

              {/* Block fills */}
              {[
                { top: '10%', left: '5%', w: '18%', h: '18%', delay: 0.45 },
                { top: '40%', left: '8%', w: '14%', h: '22%', delay: 0.5 },
                { top: '12%', left: '35%', w: '22%', h: '15%', delay: 0.55 },
                { top: '68%', left: '32%', w: '16%', h: '20%', delay: 0.52 },
                { top: '8%', left: '75%', w: '18%', h: '24%', delay: 0.48 },
                { top: '70%', left: '78%', w: '14%', h: '18%', delay: 0.56 },
              ].map((b, i) => (
                <motion.div key={i}
                  className="absolute rounded-sm"
                  style={{
                    top: b.top, left: b.left, width: b.w, height: b.h,
                    background: `${tierColor}18`,
                    border: `1px solid ${tierColor}25`,
                  }}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: b.delay }}
                />
              ))}

              {/* Location pin */}
              <motion.div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                initial={{ scale: 0, y: -16 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 22, delay: 0.3 }}
              >
                <div className="relative flex items-center justify-center w-8 h-8 rounded-full"
                  style={{ background: tierColor, boxShadow: `0 0 20px ${tierColor}80` }}>
                  <Waves size={14} color="#fff" />
                  {/* Ripple */}
                  <span className="absolute inset-0 rounded-full animate-ping"
                    style={{ background: `${tierColor}40`, animationDuration: '1.8s' }} />
                </div>
              </motion.div>

              {/* Fade bottom */}
              <div className="absolute inset-x-0 bottom-0 h-16"
                style={{ background: `linear-gradient(to top, var(--color-surface2), transparent)` }} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collapsed: subtle grid */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          animate={{ opacity: isExpanded ? 0 : 1 }}
          transition={{ duration: 0.25 }}
          style={{
            backgroundImage: `linear-gradient(${tierColor}12 1px, transparent 1px), linear-gradient(90deg, ${tierColor}12 1px, transparent 1px)`,
            backgroundSize: '28px 28px',
          }}
        />

        {/* Glow orb */}
        <div className="absolute pointer-events-none"
          style={{
            width: 160, height: 160, borderRadius: '50%',
            background: `radial-gradient(circle, ${tierColor}15 0%, transparent 70%)`,
            top: -40, right: -20,
          }} />

        {/* Content */}
        <div className="relative z-10 h-full flex flex-col justify-between p-4">
          {/* Top row */}
          <div className="flex items-start justify-between">
            <span className="px-2 py-0.5 rounded-md text-xs font-semibold"
              style={{
                background: `${tierColor}18`,
                border: `1px solid ${tierColor}40`,
                color: tierColor,
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.08em',
                fontSize: '10px',
              }}>
              {tierLabel.toUpperCase()}
            </span>

            <motion.div
              className="flex items-center gap-1.5 px-2 py-1 rounded-full"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: tierColor }} />
              <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: '0.12em' }}>
                {zone.state.toUpperCase()}
              </span>
            </motion.div>
          </div>

          {/* Bottom row */}
          <div>
            <motion.h3
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: '18px',
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
                marginBottom: '2px',
              }}
              animate={{ x: isHovered ? 3 : 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              {zone.name}
            </motion.h3>

            <AnimatePresence>
              {isExpanded ? (
                <motion.p
                  key="coords"
                  initial={{ opacity: 0, y: -6, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -6, height: 0 }}
                  style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}
                >
                  {coordLabel}
                </motion.p>
              ) : (
                <motion.p
                  key="type"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{ fontSize: '12px', color: 'var(--text-secondary)' }}
                >
                  {typeLabel}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Accent underline */}
            <motion.div
              className="mt-2 h-px"
              style={{ background: `linear-gradient(90deg, ${tierColor}60, transparent)` }}
              animate={{ scaleX: isHovered || isExpanded ? 1 : 0.25, originX: 0 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            />
          </div>
        </div>
      </motion.div>

      {/* Tap hint */}
      <motion.p
        className="absolute -bottom-5 left-1/2 text-center whitespace-nowrap"
        style={{ x: '-50%', fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
        animate={{ opacity: isHovered && !isExpanded ? 1 : 0, y: isHovered ? 0 : 4 }}
        transition={{ duration: 0.2 }}
      >
        tap to reveal map
      </motion.p>
    </motion.div>
  );
}
