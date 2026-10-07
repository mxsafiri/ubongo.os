'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/store/game';
import { TRAVEL, placeById } from '@/lib/game/places';

/** "Heading to Posta by boda… Skip" while you're on the move. */
export function TravelBanner() {
  const travel = useGameStore((s) => s.life.travel);
  const setLife = useGameStore((s) => s.setLife);
  if (!travel || travel.status !== 'moving') return null;
  const place = placeById[travel.placeId];
  if (!place) return null;
  const t = TRAVEL[travel.mode];
  return (
    <motion.div className="absolute z-[26] inset-x-0 mx-auto w-max max-w-[calc(100%-24px)] flex items-center gap-2"
      style={{ top: 'calc(var(--screen-pad-top, 16px) + 8px)' }}
      initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex items-center gap-2 px-4 py-2" style={{ borderRadius: 999, background: 'rgba(9,13,24,0.88)', border: '1px solid rgba(0,194,255,0.45)', boxShadow: '0 4px 16px rgba(0,0,0,0.35)' }}>
        <span style={{ fontSize: 16 }}>{t.emoji}</span>
        <span style={{ fontFamily: 'var(--font-arcade)', fontSize: 15, letterSpacing: '0.08em', color: '#F0F6FF', whiteSpace: 'nowrap' }}>
          UNAELEKEA {place.name.toUpperCase()}{travel.etaS ? ` · ~${travel.etaS}S` : ''}
        </span>
      </div>
      <button onClick={() => setLife({ travel: { ...travel, skip: true } })} aria-label="Skip the trip"
        className="px-3 py-2" style={{ borderRadius: 999, background: 'rgba(9,13,24,0.88)', border: '1px solid rgba(240,246,255,0.2)', fontFamily: 'var(--font-arcade)', fontSize: 14, letterSpacing: '0.1em', color: '#8BA3BE' }}>
        RUKA ⏭
      </button>
    </motion.div>
  );
}
