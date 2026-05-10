'use client';

import { motion } from 'framer-motion';
import { Waves, MapPin, TrendingUp, Shield } from 'lucide-react';
import { useGameStore, selectSelectedZone } from '@/store/game';
import { ZONE_TIER_COLORS } from '@/lib/game/zones';
import { formatTokens } from '@/lib/utils';

const TIER_LABELS: Record<string, string> = {
  crown: 'Crown', jungle_deep: 'Jungle Deep', coral_ridge: 'Coral Ridge',
  savanna: 'Savanna', shoreline: 'Shoreline',
};

const slideUp = {
  initial: { opacity: 0, y: 32 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 24 },
  transition: { type: 'spring' as const, stiffness: 340, damping: 34 },
};

export function SurfScreen() {
  const zone = useGameStore(selectSelectedZone);
  const setActiveTab = useGameStore((s) => s.setActiveTab);
  const selectZone = useGameStore((s) => s.selectZone);

  if (!zone) {
    return (
      <motion.div
        className="absolute inset-0 z-[15] flex flex-col items-center justify-center"
        style={{ paddingTop: 'calc(var(--safe-top) + 72px)', paddingBottom: 'calc(var(--safe-bottom) + 88px)' }}
        {...slideUp}
      >
        <div className="flex flex-col items-center gap-5 px-8 text-center">
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center"
            style={{ background: 'rgba(0,153,194,0.08)', border: '1px solid rgba(0,153,194,0.18)' }}
          >
            <MapPin size={32} style={{ color: 'var(--color-primary)', opacity: 0.7 }} />
          </div>

          <div>
            <p style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: '20px',
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
              marginBottom: '8px',
            }}>
              No zone selected
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Open the map, tap any glowing zone dot, then come back here to start a challenge.
            </p>
          </div>

          <button
            onClick={() => setActiveTab('map')}
            className="px-6 py-3 rounded-xl"
            style={{
              background: 'rgba(0,153,194,0.08)',
              border: '1px solid rgba(0,153,194,0.22)',
              color: 'var(--color-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              letterSpacing: '0.08em',
            }}
          >
            OPEN MAP
          </button>
        </div>
      </motion.div>
    );
  }

  const tierColor = ZONE_TIER_COLORS[zone.tier] ?? '#3D5470';
  const isClaimed = !!zone.owner_id;

  return (
    <motion.div
      className="absolute inset-0 z-[15] flex flex-col justify-end"
      style={{ paddingBottom: 'calc(var(--safe-bottom) + 88px)' }}
      {...slideUp}
    >
      <div
        className="mx-4 rounded-3xl overflow-hidden"
        style={{
          background: 'var(--surface-card)',
          border: `1px solid ${tierColor}22`,
          backdropFilter: 'blur(24px)',
          boxShadow: `var(--shadow-popup), 0 0 0 1px ${tierColor}10`,
        }}
      >
        {/* Tier accent bar */}
        <div style={{ height: 3, background: `linear-gradient(90deg, ${tierColor}, transparent)` }} />

        <div className="px-5 pt-4 pb-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <span
              className="px-2 py-0.5 rounded-md"
              style={{
                background: `${tierColor}14`,
                border: `1px solid ${tierColor}35`,
                color: tierColor,
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                letterSpacing: '0.08em',
              }}
            >
              {TIER_LABELS[zone.tier]?.toUpperCase()}
            </span>
            <button
              onClick={() => selectZone(null)}
              style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
            >
              CLEAR
            </button>
          </div>

          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '22px',
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
            marginBottom: '2px',
          }}>
            {zone.name}
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            {zone.district} · {zone.type.replace(/_/g, ' ')}
          </p>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2.5 mb-4">
            <StatTile icon={<TrendingUp size={12} />} label="DAILY YIELD" value={formatTokens(zone.daily_yield)} color="var(--color-gold)" />
            <StatTile icon={<Shield size={12} />} label={isClaimed ? 'OWNER' : 'STATUS'} value={isClaimed ? `@${zone.owner_handle}` : 'Unclaimed'} color={isClaimed ? 'var(--color-accent)' : 'var(--text-secondary)'} />
          </div>

          {/* CTA */}
          <motion.button
            className="w-full flex items-center justify-center gap-2.5 rounded-2xl relative overflow-hidden"
            style={{
              padding: '14px 20px',
              background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)',
              boxShadow: '0 4px 20px rgba(0,153,194,0.28)',
            }}
            whileTap={{ scale: 0.975 }}
            transition={{ duration: 0.12 }}
          >
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%)' }} />
            <Waves size={15} style={{ color: '#fff' }} />
            <span style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: '14px',
              color: '#fff',
              letterSpacing: '0.02em',
            }}>
              {isClaimed ? 'Challenge Owner' : 'Claim This Zone'}
            </span>
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

function StatTile({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: string; color: string;
}) {
  return (
    <div
      className="flex flex-col gap-1.5 px-3 py-3 rounded-xl"
      style={{ background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex items-center gap-1.5" style={{ color, opacity: 0.85 }}>
        {icon}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.08em' }}>{label}</span>
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>
        {value}
      </span>
    </div>
  );
}
