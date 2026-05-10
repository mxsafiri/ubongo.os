'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingUp, Shield, Waves } from 'lucide-react';
import { ZONE_TIER_COLORS } from '@/lib/game/zones';
import { formatTokens } from '@/lib/utils';
import type { Zone } from '@/types';

const TIER_LABELS: Record<Zone['tier'], string> = {
  crown: 'Crown', jungle_deep: 'Jungle Deep', coral_ridge: 'Coral Ridge',
  savanna: 'Savanna', shoreline: 'Shoreline',
};
const TYPE_LABELS: Record<Zone['type'], string> = {
  street_market: 'Street Market', waterfront: 'Waterfront',
  business_district: 'Business District', rooftop: 'Rooftop',
  transit_hub: 'Transit Hub', night_market: 'Night Market',
  residential: 'Residential', landmark: 'Landmark',
};

interface ZonePopupProps {
  zone: Zone;
  x: number;
  y: number;
  onClose: () => void;
  onSurf: () => void;
}

export function ZonePopup({ zone, x, y, onClose, onSurf }: ZonePopupProps) {
  const tierColor = ZONE_TIER_COLORS[zone.tier] ?? '#3D5470';
  const isClaimed = !!zone.owner_id;

  return (
    <motion.div
      key={zone.id}
      className="absolute z-30 pointer-events-none"
      style={{ left: x, top: y }}
      initial={false}
    >
      {/* Card — centered above the dot, pointer-events re-enabled */}
      <motion.div
        className="pointer-events-auto"
        style={{
          position: 'absolute',
          bottom: 20,
          left: '50%',
          width: 280,
          x: '-50%',
        }}
        initial={{ opacity: 0, scale: 0.8, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.85, y: 6 }}
        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      >
        {/* Card body */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(10,14,26,0.96)',
            border: `1px solid ${tierColor}40`,
            boxShadow: `0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px ${tierColor}20, 0 20px 60px ${tierColor}15`,
            backdropFilter: 'blur(20px)',
          }}
        >
          {/* Header */}
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-start justify-between mb-2">
              <span
                className="px-2 py-0.5 rounded-md text-xs font-semibold"
                style={{
                  background: `${tierColor}18`,
                  border: `1px solid ${tierColor}40`,
                  color: tierColor,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.08em',
                  fontSize: '10px',
                }}
              >
                {TIER_LABELS[zone.tier].toUpperCase()}
              </span>
              <button
                onClick={onClose}
                className="flex items-center justify-center w-6 h-6 rounded-full"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <X size={11} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>

            <h3 style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '17px',
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
              marginBottom: 2,
            }}>
              {zone.name}
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {zone.district} · {TYPE_LABELS[zone.type]}
            </p>
          </div>

          {/* Accent line */}
          <div style={{ height: 1, background: `linear-gradient(90deg, ${tierColor}50, transparent)`, margin: '0 16px' }} />

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2 px-4 py-3">
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <TrendingUp size={11} style={{ color: 'var(--color-gold)', flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
                  {formatTokens(zone.daily_yield)}
                </div>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>YIELD/DAY</div>
              </div>
            </div>
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <Shield size={11} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
                  {isClaimed ? `@${zone.owner_handle}` : 'Open'}
                </div>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
                  {isClaimed ? 'OWNER' : 'UNCLAIMED'}
                </div>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="px-4 pb-4">
            <motion.button
              className="w-full flex items-center justify-center gap-2 rounded-xl relative overflow-hidden"
              style={{
                padding: '11px 16px',
                background: 'linear-gradient(135deg, #00D4FF 0%, #7C3AED 100%)',
                boxShadow: '0 0 0 1px rgba(0,212,255,0.3), 0 6px 24px rgba(0,212,255,0.2)',
              }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.1 }}
              onClick={onSurf}
            >
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.08) 50%, transparent 70%)' }} />
              <Waves size={13} style={{ color: '#fff' }} />
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '13px', color: '#fff', letterSpacing: '0.02em' }}>
                Surf This Zone
              </span>
            </motion.button>
          </div>
        </div>

        {/* Pointer arrow */}
        <div className="flex justify-center" style={{ marginTop: -1 }}>
          <div style={{
            width: 0, height: 0,
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: `8px solid ${tierColor}40`,
          }} />
        </div>
      </motion.div>
    </motion.div>
  );
}
