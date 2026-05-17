'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/game';

const TYPE_CONFIG = {
  zone_claimed:       { icon: '🏴', accent: 'var(--color-success)' },
  challenge_received: { icon: '⚔️', accent: 'var(--color-secondary)' },
  zone_contested:     { icon: '🔥', accent: 'var(--color-warning)' },
  token_earned:       { icon: '💰', accent: 'var(--color-gold)' },
  system:             { icon: '📡', accent: 'var(--color-primary)' },
};

export function Toast() {
  const notifications = useGameStore((s) => s.notifications);
  const markRead = useGameStore((s) => s.markNotificationRead);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visible = notifications.find((n) => !n.read) ?? null;
  const cfg = visible ? TYPE_CONFIG[visible.type] : null;

  useEffect(() => {
    if (!visible) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => markRead(visible.id), 4500);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [visible?.id]);

  return (
    <AnimatePresence>
      {visible && cfg && (
        <motion.div
          key={visible.id}
          className="absolute left-4 right-4 z-[40]"
          style={{ top: 'calc(var(--safe-top) + 76px)' }}
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        >
          <button
            className="w-full flex items-start gap-3 px-4 py-3 rounded-2xl text-left"
            style={{
              background: 'var(--surface-card)',
              border: `1px solid ${cfg.accent}35`,
              boxShadow: `var(--shadow-popup), 0 0 0 1px ${cfg.accent}12`,
              backdropFilter: 'blur(20px)',
            }}
            onClick={() => markRead(visible.id)}
          >
            <span style={{ fontSize: '20px', lineHeight: 1.2, flexShrink: 0, marginTop: 1 }}>{cfg.icon}</span>
            <div className="flex-1 min-w-0">
              <p style={{
                fontFamily: 'var(--font-display)', fontWeight: 600,
                fontSize: '14px', color: 'var(--text-primary)', marginBottom: 2,
              }}>
                {visible.title}
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {visible.message}
              </p>
            </div>
            {/* Progress bar */}
            <motion.div
              className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full"
              style={{ background: cfg.accent, opacity: 0.4, transformOrigin: 'left' }}
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: 4.5, ease: 'linear' }}
            />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
