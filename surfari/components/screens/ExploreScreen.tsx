'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, MapPin } from 'lucide-react';
import { useGameStore } from '@/store/game';
import { DAR_ZONES, ZONE_TIER_COLORS } from '@/lib/game/zones';
import type { Zone } from '@/types';

const TIER_ORDER = ['crown', 'jungle_deep', 'coral_ridge', 'savanna', 'shoreline'] as const;
const TIER_LABELS: Record<string, string> = {
  crown: 'Crown', jungle_deep: 'Jungle Deep', coral_ridge: 'Coral Ridge',
  savanna: 'Savanna', shoreline: 'Shoreline',
};

export function ExploreScreen() {
  const [query, setQuery] = useState('');
  const selectZone = useGameStore((s) => s.selectZone);
  const setActiveTab = useGameStore((s) => s.setActiveTab);

  const filtered = query.trim()
    ? DAR_ZONES.filter((z) =>
        z.name.toLowerCase().includes(query.toLowerCase()) ||
        z.district.toLowerCase().includes(query.toLowerCase())
      )
    : DAR_ZONES;

  const grouped = TIER_ORDER.reduce<Record<string, Zone[]>>((acc, tier) => {
    const zones = filtered.filter((z) => z.tier === tier);
    if (zones.length) acc[tier] = zones;
    return acc;
  }, {});

  const handleZoneTap = (zone: Zone) => {
    selectZone(zone);
    setActiveTab('map');
  };

  return (
    <motion.div
      className="absolute inset-0 z-[15] flex flex-col"
      style={{
        paddingTop: 'calc(var(--safe-top) + 72px)',
        paddingBottom: 'calc(var(--safe-bottom) + 88px)',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Search bar */}
      <div className="px-4 pb-3">
        <div
          className="flex items-center gap-2.5 px-4 py-3 rounded-2xl"
          style={{
            background: 'rgba(17,27,39,0.95)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(20px)',
          }}
        >
          <Search size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search zones or districts…"
            className="flex-1 bg-transparent outline-none"
            style={{
              fontSize: '14px',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
            }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{ color: 'var(--text-muted)', fontSize: '12px' }}>✕</button>
          )}
        </div>
      </div>

      {/* Zone count */}
      <div className="px-4 mb-2">
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {filtered.length} ZONES
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
        {Object.entries(grouped).map(([tier, zones]) => (
          <div key={tier}>
            {/* Tier header */}
            <div className="flex items-center gap-2 mb-2">
              <span
                className="px-2 py-0.5 rounded-md"
                style={{
                  background: `${ZONE_TIER_COLORS[tier]}18`,
                  border: `1px solid ${ZONE_TIER_COLORS[tier]}35`,
                  color: ZONE_TIER_COLORS[tier],
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  letterSpacing: '0.08em',
                }}
              >
                {TIER_LABELS[tier]?.toUpperCase()}
              </span>
              <div style={{ height: 1, flex: 1, background: `${ZONE_TIER_COLORS[tier]}20` }} />
            </div>

            {/* Zone rows */}
            <div className="space-y-1.5">
              {zones.map((zone) => (
                <ZoneRow key={zone.id} zone={zone} onTap={handleZoneTap} />
              ))}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search size={28} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
            <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>No zones match "{query}"</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ZoneRow({ zone, onTap }: { zone: Zone; onTap: (z: Zone) => void }) {
  const tierColor = ZONE_TIER_COLORS[zone.tier] ?? '#4A5A7A';
  const isClaimed = !!zone.owner_id;

  return (
    <motion.button
      className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left"
      style={{
        background: 'rgba(17,27,39,0.8)',
        border: '1px solid rgba(255,255,255,0.05)',
        backdropFilter: 'blur(12px)',
      }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onTap(zone)}
    >
      {/* Dot */}
      <div
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ background: tierColor, boxShadow: `0 0 6px ${tierColor}80` }}
      />

      <div className="flex-1 min-w-0">
        <p style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: '14px',
          color: 'var(--text-primary)',
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {zone.name}
        </p>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
          {zone.district} · {zone.type.replace(/_/g, ' ')}
        </p>
      </div>

      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: 'var(--color-gold)',
          fontWeight: 600,
        }}>
          {zone.daily_yield.toLocaleString()}T
        </span>
        <span style={{
          fontSize: '9px',
          color: isClaimed ? 'var(--color-success)' : 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
        }}>
          {isClaimed ? `@${zone.owner_handle}` : 'OPEN'}
        </span>
      </div>

      <MapPin size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
    </motion.button>
  );
}
