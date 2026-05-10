'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, Shield, Footprints, Waves } from 'lucide-react';
import { useGameStore, selectSelectedZone, selectPlayer } from '@/store/game';
import { ZONE_TIER_COLORS } from '@/lib/game/zones';
import { formatTokens } from '@/lib/utils';
import { ZoneCard } from '@/components/ui/zone-card';
import type { Zone } from '@/types';

export const TIER_LABELS: Record<Zone['tier'], string> = {
  crown:       'Crown',
  jungle_deep: 'Jungle Deep',
  coral_ridge: 'Coral Ridge',
  savanna:     'Savanna',
  shoreline:   'Shoreline',
};

export const TYPE_LABELS: Record<Zone['type'], string> = {
  street_market:     'Street Market',
  waterfront:        'Waterfront',
  business_district: 'Business District',
  rooftop:           'Rooftop',
  transit_hub:       'Transit Hub',
  night_market:      'Night Market',
  residential:       'Residential',
  landmark:          'Landmark',
};

export default function ZonePanel() {
  const zone = useGameStore(selectSelectedZone);
  const player = useGameStore(selectPlayer);
  const selectZone = useGameStore((s) => s.selectZone);

  const tierColor = zone ? (ZONE_TIER_COLORS[zone.tier] ?? '#3D5470') : '#3D5470';
  const isOwned = zone?.owner_id === player?.id;
  const isClaimed = !!zone?.owner_id;

  return (
    <AnimatePresence>
      {zone && (
        <motion.div
          key={zone.id}
          className="absolute bottom-0 left-0 right-0 z-20 rounded-t-3xl"
          style={{
            background: 'var(--color-surface)',
            border: `1px solid ${tierColor}28`,
            borderBottom: 'none',
            boxShadow: `0 -16px 60px rgba(0,0,0,0.65), 0 -1px 0 ${tierColor}20`,
            paddingBottom: 'calc(var(--safe-bottom) + 84px)',
          }}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 340, damping: 34 }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-9 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }} />
          </div>

          {/* Zone card hero */}
          <div className="px-4 pb-2">
            <ZoneCard
              zone={zone}
              tierColor={tierColor}
              tierLabel={TIER_LABELS[zone.tier]}
              typeLabel={TYPE_LABELS[zone.type]}
            />
          </div>

          {/* Divider */}
          <div className="mx-4 my-4" style={{ height: '1px', background: `linear-gradient(90deg, transparent, ${tierColor}30, transparent)` }} />

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 px-4 mb-4">
            <StatCard icon={<TrendingUp size={12} />} label="YIELD" value={formatTokens(zone.daily_yield)} color="var(--color-gold)" />
            <StatCard icon={<Shield size={12} />} label="CLAIM" value={`${zone.claim_strength}%`} color="var(--color-accent)" />
            <StatCard icon={<Footprints size={12} />} label="TRACES" value={zone.trace_count.toString()} color="var(--color-secondary)" />
          </div>

          {/* Owner status */}
          <div className="mx-4 mb-4 flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{
              background: isClaimed ? 'rgba(16,137,129,0.08)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isClaimed ? 'rgba(16,137,129,0.2)' : 'rgba(255,255,255,0.05)'}`,
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: isClaimed ? 'var(--color-success)' : 'var(--text-muted)' }} />
            {isClaimed ? (
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Owned by{' '}
                <span style={{ color: zone.owner_color ?? 'var(--color-success)', fontWeight: 600 }}>
                  @{zone.owner_handle}
                </span>
              </span>
            ) : (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                Unclaimed — first to surf claims it
              </span>
            )}
          </div>

          {/* CTA */}
          <div className="px-4">
            <motion.button
              className="w-full flex items-center justify-center gap-2.5 rounded-2xl relative overflow-hidden"
              style={{
                padding: '14px 20px',
                background: isOwned
                  ? `linear-gradient(135deg, ${tierColor}dd 0%, ${tierColor}88 100%)`
                  : 'linear-gradient(135deg, #00D4FF 0%, #7C3AED 100%)',
                boxShadow: isOwned
                  ? `0 0 0 1px ${tierColor}44, 0 8px 32px ${tierColor}33`
                  : '0 0 0 1px rgba(0,212,255,0.3), 0 8px 32px rgba(0,212,255,0.2)',
              }}
              whileTap={{ scale: 0.975 }}
              transition={{ duration: 0.12 }}
              onClick={() => selectZone(null)}
            >
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.07) 50%, transparent 70%)' }} />
              <Waves size={15} style={{ color: 'rgba(255,255,255,0.9)', flexShrink: 0 }} />
              <span style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: '14px',
                letterSpacing: '0.02em',
                color: '#fff',
              }}>
                {isOwned ? 'Manage Zone' : 'Surf This Zone'}
              </span>
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: string; color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 py-3 px-2 rounded-xl"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <span style={{ color, opacity: 0.8 }}>{icon}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '16px', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
        {value}
      </span>
      <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
        {label}
      </span>
    </div>
  );
}
