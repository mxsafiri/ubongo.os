'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingUp, Shield, Footprints, ArrowRight } from 'lucide-react';
import { useGameStore, selectSelectedZone, selectPlayer } from '@/store/game';
import { ZONE_TIER_COLORS } from '@/lib/game/zones';
import { formatTokens } from '@/lib/utils';
import type { Zone } from '@/types';

const TIER_LABELS: Record<Zone['tier'], string> = {
  crown:       'Crown',
  jungle_deep: 'Jungle Deep',
  coral_ridge: 'Coral Ridge',
  savanna:     'Savanna',
  shoreline:   'Shoreline',
};

const TYPE_LABELS: Record<Zone['type'], string> = {
  street_market:     'Street Market',
  waterfront:        'Waterfront',
  business_district: 'Business District',
  rooftop:           'Rooftop',
  transit_hub:       'Transit Hub',
  night_market:      'Night Market',
  residential:       'Residential',
  landmark:          'Landmark',
};

const TIER_GRADIENTS: Record<string, string> = {
  crown:       'linear-gradient(135deg, rgba(245,158,11,0.25) 0%, rgba(245,158,11,0.05) 100%)',
  jungle_deep: 'linear-gradient(135deg, rgba(124,58,237,0.25) 0%, rgba(124,58,237,0.05) 100%)',
  coral_ridge: 'linear-gradient(135deg, rgba(0,212,255,0.2) 0%, rgba(0,212,255,0.04) 100%)',
  savanna:     'linear-gradient(135deg, rgba(16,137,129,0.25) 0%, rgba(16,137,129,0.05) 100%)',
  shoreline:   'linear-gradient(135deg, rgba(255,107,53,0.25) 0%, rgba(255,107,53,0.05) 100%)',
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
          className="absolute bottom-0 left-0 right-0 z-20"
          style={{ paddingBottom: 'calc(var(--safe-bottom) + 72px)' }}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 340, damping: 34 }}
        >
          {/* Hero image area */}
          <div
            className="relative overflow-hidden"
            style={{
              height: '120px',
              background: TIER_GRADIENTS[zone.tier] ?? TIER_GRADIENTS.shoreline,
              borderTop: `1px solid ${tierColor}44`,
            }}
          >
            {/* Ambient grid pattern */}
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `
                  linear-gradient(${tierColor}18 1px, transparent 1px),
                  linear-gradient(90deg, ${tierColor}18 1px, transparent 1px)
                `,
                backgroundSize: '32px 32px',
              }}
            />
            {/* Glow orb */}
            <div
              className="absolute"
              style={{
                width: '200px',
                height: '200px',
                borderRadius: '50%',
                background: `radial-gradient(circle, ${tierColor}30 0%, transparent 70%)`,
                top: '-60px',
                right: '-40px',
              }}
            />
            {/* Drag handle */}
            <div className="absolute top-3 left-0 right-0 flex justify-center">
              <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }} />
            </div>

            {/* Tier pill + close — absolute within hero */}
            <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between">
              <span
                className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                style={{
                  background: `${tierColor}22`,
                  border: `1px solid ${tierColor}55`,
                  color: tierColor,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.06em',
                }}
              >
                {TIER_LABELS[zone.tier].toUpperCase()}
              </span>

              <button
                onClick={() => selectZone(null)}
                className="flex items-center justify-center w-7 h-7 rounded-full"
                style={{
                  background: 'rgba(10,14,26,0.7)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                <X size={13} style={{ color: 'var(--text-secondary)' }} />
              </button>
            </div>
          </div>

          {/* Card body */}
          <div
            className="px-5 pt-4 pb-5"
            style={{
              background: 'var(--color-surface)',
              borderTop: 'none',
            }}
          >
            {/* Zone name + district */}
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '22px',
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
              marginBottom: '4px',
            }}>
              {zone.name}
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              {zone.district} · {TYPE_LABELS[zone.type]}
            </p>

            {/* Owner status */}
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-4"
              style={{
                background: isClaimed ? 'rgba(16,137,129,0.1)' : 'rgba(61,84,112,0.15)',
                border: `1px solid ${isClaimed ? 'rgba(16,137,129,0.25)' : 'rgba(61,84,112,0.3)'}`,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: isClaimed ? 'var(--color-success)' : 'var(--text-muted)' }}
              />
              {isClaimed ? (
                <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                  Owned by{' '}
                  <span style={{ color: zone.owner_color ?? 'var(--color-success)', fontWeight: 600 }}>
                    @{zone.owner_handle}
                  </span>
                </span>
              ) : (
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  Unclaimed — first to surf claims it
                </span>
              )}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2.5 mb-5">
              <StatCard
                icon={<TrendingUp size={13} />}
                label="Daily Yield"
                value={formatTokens(zone.daily_yield)}
                color="var(--color-gold)"
              />
              <StatCard
                icon={<Shield size={13} />}
                label="Claim"
                value={`${zone.claim_strength}%`}
                color="var(--color-accent)"
              />
              <StatCard
                icon={<Footprints size={13} />}
                label="Traces"
                value={zone.trace_count.toString()}
                color="var(--color-secondary)"
              />
            </div>

            {/* CTA */}
            <motion.button
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold"
              style={{
                background: isOwned
                  ? `linear-gradient(135deg, ${tierColor} 0%, ${tierColor}99 100%)`
                  : 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)',
                color: '#fff',
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: '15px',
                letterSpacing: '-0.01em',
                boxShadow: isOwned
                  ? `0 4px 24px ${tierColor}44`
                  : '0 4px 24px rgba(0,212,255,0.3)',
              }}
              whileTap={{ scale: 0.985 }}
              transition={{ duration: 0.15 }}
            >
              {isOwned ? 'Manage Zone' : 'Surf This Zone'}
              <ArrowRight size={16} />
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
    <div
      className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl"
      style={{
        background: 'var(--color-surface2)',
        border: '1px solid var(--color-border)',
      }}
    >
      <span style={{ color }}>{icon}</span>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        fontSize: '15px',
        color: 'var(--text-primary)',
      }}>
        {value}
      </span>
      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        {label}
      </span>
    </div>
  );
}
