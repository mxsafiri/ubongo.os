'use client';

import { useEffect, useMemo } from 'react';
import { motion, useAnimationControls, AnimatePresence } from 'framer-motion';

/**
 * Shaker — wraps content and plays a shake keyframe every time `trigger`
 * increments. No remount, so child state survives the shake.
 */
export function Shaker({ trigger, children, className }: {
  trigger: number;
  children: React.ReactNode;
  className?: string;
}) {
  const controls = useAnimationControls();

  useEffect(() => {
    if (trigger > 0) {
      controls.start({
        x: [0, -10, 9, -7, 5, -3, 0],
        transition: { duration: 0.45, ease: 'easeOut' },
      });
    }
  }, [trigger, controls]);

  return (
    <motion.div className={className} animate={controls} style={{ width: '100%' }}>
      {children}
    </motion.div>
  );
}

/**
 * Burst — radial particle explosion. Render conditionally at the moment of
 * impact inside a relatively-positioned parent; it centers itself and fades.
 */
export function Burst({ color, count = 9 }: { color: string; count?: number }) {
  const parts = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.6;
        const dist = 26 + Math.random() * 28;
        return {
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist,
          s: 4 + Math.random() * 5,
        };
      }),
    [count],
  );

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-visible">
      {parts.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{ width: p.s, height: p.s, background: color, boxShadow: `0 0 8px ${color}` }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 0.25 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}

/**
 * ComboFloat — "×N COMBO" streak indicator; pops on every increment,
 * only visible from 3 in a row.
 */
export function ComboFloat({ combo }: { combo: number }) {
  return (
    <AnimatePresence>
      {combo >= 3 && (
        <motion.div
          key={combo}
          className="pointer-events-none"
          initial={{ opacity: 0, scale: 1.6, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ type: 'spring', stiffness: 500, damping: 22 }}
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: '15px',
            letterSpacing: '0.04em',
            color: '#FFB800',
            textShadow: '0 0 14px rgba(255,184,0,0.55)',
          }}
        >
          ×{combo} COMBO
        </motion.div>
      )}
    </AnimatePresence>
  );
}
