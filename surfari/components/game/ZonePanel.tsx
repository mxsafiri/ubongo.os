'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingUp, Shield, Footprints } from 'lucide-react';
import { useGameStore, selectSelectedZone, selectPlayer } from '@/store/game';
import { ZONE_TIER_COLORS } from '@/lib/game/zones';
import { formatTokens } from '@/lib/utils';
import type { Zone } from '@/types';

const TIER_LABELS: Record<Zone['tier'], string> = {
  crown: 'Crown',
  jungle_deep: 'Jungle Deep',
  coral_ridge: 'Coral Ridge',
  savanna: 'Savanna',
  shoreline: 'Shoreline',
};

const TYPE_LABELS: Record<Zone['type'], string> = {
  street_market: 'Street Market',
  waterfront: 'Waterfront',
  business_district: 'Business District',
  rooftop: 'Rooftop',
  transit_hub: 'Transit Hub',
  night_market: 'Night Market',
  residential: 'Residential',
  landmark: 'Landmark',
};

export default function ZonePanel() {
  const zone = useGameStore(selectSelectedZone);
  const player = useGameStore(selectPlayer);
  const selectZone = useGameStore((s) => s.selectZone);

  const tierColor = zone ? (ZONE_TIER_COLORS[zone.tier] ?? '#4A5A7A') : '#4A5A7A';
  const isOwned = zone?.owner_id === player?.id;

  return (
    <AnimatePresence>
      {zone && (
        <motion.div
          key={zone.id}
          className="absolute bottom-0 left-0 right-0 z-20 rounded-t-3xl px-5 pt-5 pb-8"
          style={{
            background: 'rgba(10,15,30,0.97)',
            border: `1px solid ${tierColor}33`,
            borderBottom: 'none',
            boxShadow: `0 -8px 40px ${tierColor}22`,
            paddingBottom: 'calc(var(--safe-bottom) + 80px)',
          }}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        >
          {/* Handle bar */}
          <div className="flex justify-center mb-4">
            <div
              className="w-10 h-1 rounded-full"
              style={{ background: 'rgba(255,255,255,0.15)' }}
            />
          </div>

          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex flex-col gap-1.5">
              {/* Tier badge */}
              <span
                className="self-start px-2.5 py-0.5 rounded-full text-xs font-semibold"
                style={{
                  background: `${tierColor}22`,
                  border: `1px solid ${tierColor}55`,
                  color: tierColor,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {TIER_LABELS[zone.tier]}
              </span>

              {/* Zone name */}
              <h2
                className="text-xl font-bold leading-tight"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
              >
                {zone.name}
              </h2>

              {/* District + type */}
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {zone.district} · {TYPE_LABELS[zone.type]}
              </p>
            </div>

            <button
              onClick={() => selectZone(null)}
              className="flex items-center justify-center w-8 h-8 rounded-full mt-1"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <X size={16} style={{ color: 'var(--text-secondary)' }} />
            </button>
          </div>

          {/* Owner status */}
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-4 text-sm"
            style={{
              background: zone.owner_id
                ? 'rgba(0,224,150,0.08)'
                : 'rgba(74,90,122,0.15)',
              border: `1px solid ${zone.owner_id ? 'rgba(0,224,150,0.2)' : 'rgba(74,90,122,0.3)'}`,
            }}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: zone.owner_id ? '#00E096' : '#4A5A7A' }}
            />
            {zone.owner_id ? (
              <span style={{ color: 'var(--text-primary)' }}>
                Owned by{' '}
                <span style={{ color: zone.owner_color ?? '#00E096', fontWeight: 600 }}>
                  @{zone.owner_handle}
                </span>
              </span>
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>Unclaimed — first to surf claims it</span>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2.5 mb-5">
            <StatCard
              icon={<TrendingUp size={14} />}
              label="Daily Yield"
              value={formatTokens(zone.daily_yield)}
              color={tierColor}
            />
            <StatCard
              icon={<Shield size={14} />}
              label="Claim"
              value={`${zone.claim_strength}%`}
              color="#7C5CFC"
            />
            <StatCard
              icon={<Footprints size={14} />}
              label="Traces"
              value={zone.trace_count.toString()}
              color="#FF7A35"
            />
          </div>

          {/* CTA */}
          <motion.button
            className="w-full py-3.5 rounded-2xl text-sm font-semibold tracking-wide"
            style={{
              background: isOwned
                ? `linear-gradient(135deg, ${tierColor}cc 0%, ${tierColor}88 100%)`
                : `linear-gradient(135deg, #00C2FF 0%, #7C5CFC 100%)`,
              color: '#F0F4FF',
              fontFamily: 'var(--font-body)',
              boxShadow: isOwned
                ? `0 4px 20px ${tierColor}33`
                : '0 4px 20px rgba(0,194,255,0.25)',
            }}
            whileTap={{ scale: 0.98 }}
          >
            {isOwned ? 'Manage Zone' : 'Surf This Zone'}
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl"
      style={{
        background: 'rgba(17,24,39,0.6)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <span style={{ color }}>{icon}</span>
      <span
        className="text-base font-bold"
        style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
      >
        {value}
      </span>
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
    </div>
  );
}
