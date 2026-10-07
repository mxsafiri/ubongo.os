'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/store/game';
import { PLACES, distanceM } from '@/lib/game/places';
import { fmtDistance } from '@/components/life/useLife';
import { Heading, Label, mono, row } from './WorkScreen';

/** PLACES: everywhere you can go in Dar, nearest first. */
export function PlacesScreen() {
  const pos = useGameStore((s) => s.life.pos);
  const hereId = useGameStore((s) => s.life.hereId);
  const selectPlace = useGameStore((s) => s.selectPlace);
  const setActiveTab = useGameStore((s) => s.setActiveTab);
  const places = PLACES.map((p) => ({ p, d: pos ? distanceM(pos, p) : 0 })).sort((a, b) => a.d - b.d);

  const open = (id: string) => {
    selectPlace(id);
    if (window.innerWidth < 1024) setActiveTab('map');
  };

  return (
    <motion.div className="absolute inset-0 z-[15] overflow-y-auto"
      style={{ paddingTop: 'var(--screen-pad-top)', paddingBottom: 'var(--screen-pad-bottom)', background: 'var(--color-bg)' }}
      initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}
      transition={{ type: 'spring', stiffness: 340, damping: 34 }}>
      <div className="flex flex-col gap-3 px-4 pt-2">
        <Heading title="MAHALI" sub="PLACES" />
        <Label>WHERE TO IN DAR?</Label>
        {places.map(({ p, d }) => (
          <button key={p.id} onClick={() => open(p.id)} className="flex items-center gap-3 text-left" style={{ ...row, borderColor: hereId === p.id ? 'var(--color-primary)' : undefined }}>
            <span className="flex items-center justify-center" style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(0,194,255,0.1)', fontSize: 20 }}>{p.icon}</span>
            <div className="flex-1 min-w-0">
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</p>
              <p style={mono}>{p.district.toUpperCase()} · {p.jobs.map((j) => j.titleEn).join(', ').toUpperCase()}</p>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: hereId === p.id ? 'var(--color-primary)' : 'var(--text-secondary)' }}>
              {hereId === p.id ? 'HERE' : pos ? fmtDistance(d) : ''}
            </span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}
