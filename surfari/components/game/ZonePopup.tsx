'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, TrendingUp, Shield, MessageCircle, BarChart2, Waves } from 'lucide-react';
import { ZONE_TIER_COLORS } from '@/lib/game/zones';
import { formatTokens } from '@/lib/utils';
import { ZoneChat } from '@/components/chat/ZoneChat';
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
  const [tab, setTab] = useState<'info' | 'chat'>('info');
  const tierColor = ZONE_TIER_COLORS[zone.tier] ?? '#3D5470';
  const isClaimed = !!zone.owner_id;

  return (
    <motion.div
      key={zone.id}
      className="absolute z-[20] pointer-events-none"
      style={{ left: x, top: y }}
      initial={false}
    >
      <motion.div
        className="pointer-events-auto"
        style={{ position: 'absolute', bottom: 20, left: '50%', width: 292, x: '-50%' }}
        initial={{ opacity: 0, scale: 0.8, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.85, y: 6 }}
        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      >
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'var(--surface-card)',
            border: `1px solid ${tierColor}30`,
            boxShadow: `var(--shadow-popup), 0 0 0 1px ${tierColor}15`,
            backdropFilter: 'blur(20px)',
          }}
        >
          {/* Tier accent bar */}
          <div style={{ height: 3, background: `linear-gradient(90deg, ${tierColor}, transparent)` }} />

          {/* Header */}
          <div className="px-4 pt-3 pb-2">
            <div className="flex items-start justify-between mb-1.5">
              <span
                className="px-2 py-0.5 rounded-md"
                style={{
                  background: `${tierColor}14`, border: `1px solid ${tierColor}35`, color: tierColor,
                  fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.08em',
                }}
              >
                {TIER_LABELS[zone.tier].toUpperCase()}
              </span>
              <button
                onClick={onClose}
                className="flex items-center justify-center w-6 h-6 rounded-full"
                style={{ background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)' }}
              >
                <X size={11} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>
            <h3 style={{
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '17px',
              color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.15, marginBottom: 2,
            }}>
              {zone.name}
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {zone.district} · {TYPE_LABELS[zone.type]}
            </p>
          </div>

          {/* Tab switcher */}
          <div className="flex mx-4 mb-2 gap-1 p-0.5 rounded-xl"
            style={{ background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)' }}>
            {([
              ['info', <BarChart2 key="i" size={11} />, 'Info'],
              ['chat', <MessageCircle key="c" size={11} />, 'Chat'],
            ] as const).map(([t, icon, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg"
                style={{
                  background: tab === t ? 'var(--surface-card)' : 'transparent',
                  boxShadow: tab === t ? 'var(--shadow-card)' : 'none',
                  transition: 'all 0.18s',
                }}
              >
                <span style={{ color: tab === t ? tierColor : 'var(--text-muted)' }}>{icon}</span>
                <span style={{
                  fontSize: '11px', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
                  color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontWeight: tab === t ? 600 : 400,
                }}>
                  {label}
                </span>
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === 'info' ? (
            <div className="grid grid-cols-2 gap-2 px-4 pb-3">
              <StatTile icon={<TrendingUp size={11} />} label="YIELD/DAY" value={formatTokens(zone.daily_yield)} color="var(--color-gold)" />
              <StatTile
                icon={<Shield size={11} />}
                label={isClaimed ? 'OWNER' : 'STATUS'}
                value={isClaimed ? `@${zone.owner_handle}` : 'Open'}
                color={isClaimed ? 'var(--color-accent)' : 'var(--text-secondary)'}
              />
              {isClaimed && (
                <div className="col-span-2 px-2.5 py-2 rounded-xl"
                  style={{ background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)' }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>CLAIM STRENGTH</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{zone.claim_strength}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full" style={{ background: 'var(--border-mid)' }}>
                    <div className="h-full rounded-full" style={{
                      width: `${zone.claim_strength}%`,
                      background: zone.claim_strength >= 70 ? 'var(--color-success)' : zone.claim_strength >= 40 ? 'var(--color-warning)' : 'var(--color-danger)',
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ height: 220 }}>
              <ZoneChat zoneId={zone.id} />
            </div>
          )}

          {/* CTA — always visible */}
          <div className="px-4 pb-4">
            <div style={{ height: 1, background: 'var(--border-subtle)', marginBottom: 12 }} />
            <motion.button
              className="w-full flex items-center justify-center gap-2 rounded-xl relative overflow-hidden"
              style={{
                padding: '11px 16px',
                background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)',
                boxShadow: '0 4px 16px rgba(0,153,194,0.25)',
              }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.1 }}
              onClick={onSurf}
            >
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%)' }} />
              <Waves size={13} style={{ color: '#fff' }} />
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '13px', color: '#fff', letterSpacing: '0.02em' }}>
                {isClaimed ? `Challenge @${zone.owner_handle}` : 'Claim This Zone'}
              </span>
            </motion.button>
          </div>
        </div>

        {/* Arrow */}
        <div className="flex justify-center" style={{ marginTop: -1 }}>
          <div style={{
            width: 0, height: 0,
            borderLeft: '8px solid transparent', borderRight: '8px solid transparent',
            borderTop: `8px solid ${tierColor}30`,
          }} />
        </div>
      </motion.div>
    </motion.div>
  );
}

function StatTile({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl"
      style={{ background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)' }}>
      <span style={{ color, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{value}</div>
        <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>{label}</div>
      </div>
    </div>
  );
}
