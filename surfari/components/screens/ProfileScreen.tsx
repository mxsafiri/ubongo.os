'use client';

import { motion } from 'framer-motion';
import { User, TrendingUp, MapPin, Footprints, Star, LogIn } from 'lucide-react';
import { useGameStore, selectPlayer } from '@/store/game';
import { formatTokens } from '@/lib/utils';

const TIER_COLORS: Record<string, string> = {
  surfari: 'var(--color-secondary)',
  district: 'var(--color-primary)',
  baron: 'var(--color-accent)',
  architect: 'var(--color-gold)',
  apex: '#B45309',
};

const TIER_LABELS: Record<string, string> = {
  surfari: 'Surfari', district: 'District', baron: 'Baron',
  architect: 'Architect', apex: 'Apex',
};

export function ProfileScreen() {
  const player = useGameStore(selectPlayer);

  if (!player) {
    return (
      <motion.div
        className="absolute inset-0 z-[15] flex flex-col items-center justify-center"
        style={{ paddingTop: 'calc(var(--safe-top) + 72px)', paddingBottom: 'calc(var(--safe-bottom) + 88px)' }}
        initial={{ opacity: 0, x: 32 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 32 }}
        transition={{ type: 'spring', stiffness: 340, damping: 34 }}
      >
        <div className="flex flex-col items-center gap-6 px-8 text-center">
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center"
            style={{ background: 'rgba(109,40,217,0.08)', border: '1px solid rgba(109,40,217,0.18)' }}
          >
            <User size={32} style={{ color: 'var(--color-accent)', opacity: 0.7 }} />
          </div>

          <div>
            <p style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '22px',
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
              marginBottom: '8px',
            }}>
              Not connected
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: '240px' }}>
              Sign in to track your zones, tokens, and rank across Dar es Salaam.
            </p>
          </div>

          <button
            className="flex items-center gap-2 px-6 py-3 rounded-xl"
            style={{
              background: 'rgba(109,40,217,0.08)',
              border: '1px solid rgba(109,40,217,0.22)',
              color: 'var(--color-accent)',
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: '14px',
            }}
          >
            <LogIn size={15} />
            Sign In
          </button>
        </div>
      </motion.div>
    );
  }

  const tierColor = TIER_COLORS[player.tier] ?? 'var(--color-primary)';

  return (
    <motion.div
      className="absolute inset-0 z-[15] flex flex-col"
      style={{ paddingTop: 'calc(var(--safe-top) + 72px)', paddingBottom: 'calc(var(--safe-bottom) + 88px)' }}
      initial={{ opacity: 0, x: 32 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 32 }}
      transition={{ type: 'spring', stiffness: 340, damping: 34 }}
    >
      <div className="flex-1 overflow-y-auto px-4" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Avatar + identity */}
        <div
          className="flex items-center gap-4 p-4 rounded-2xl mb-4"
          style={{
            background: 'var(--surface-panel)',
            border: `1px solid ${tierColor}20`,
            backdropFilter: 'blur(20px)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: player.avatar_color, boxShadow: `0 0 20px ${player.avatar_color}50` }}
          >
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '22px', color: '#fff' }}>
              {player.handle[0].toUpperCase()}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '18px', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              @{player.handle}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
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
                {TIER_LABELS[player.tier]?.toUpperCase()}
              </span>
              <Star size={10} style={{ color: tierColor }} />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {player.reputation} REP
              </span>
            </div>
          </div>

          <div className="text-right flex-shrink-0">
            <p style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '18px', color: 'var(--color-gold)' }}>
              {formatTokens(player.tide_tokens)}
            </p>
            <p style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>TIDE</p>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <StatCard icon={<MapPin size={14} />} label="Zones Owned" value={String(player.zones_owned)} color="var(--color-primary)" />
          <StatCard icon={<TrendingUp size={14} />} label="Assets" value={String(player.assets_owned)} color="var(--color-gold)" />
          <StatCard icon={<Footprints size={14} />} label="Traces Left" value={String(player.traces_left)} color="var(--color-secondary)" />
          <StatCard icon={<Footprints size={14} />} label="Traces Received" value={String(player.traces_received)} color="var(--color-accent)" />
        </div>

        <div
          className="px-4 py-3 rounded-xl"
          style={{ background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)' }}
        >
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            LAST ACTIVE · {new Date(player.last_active).toLocaleDateString()}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: string; color: string;
}) {
  return (
    <div
      className="px-4 py-4 rounded-2xl"
      style={{ background: 'var(--surface-panel)', border: '1px solid var(--border-subtle)', backdropFilter: 'blur(12px)', boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex items-center gap-1.5 mb-2" style={{ color, opacity: 0.8 }}>
        {icon}
        <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
          {label.toUpperCase()}
        </span>
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '28px', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
        {value}
      </span>
    </div>
  );
}
