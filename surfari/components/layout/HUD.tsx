'use client';

import { motion } from 'framer-motion';
import { Waves, Bell, Map, Zap, BarChart2, CheckSquare, User } from 'lucide-react';
import { useGameStore, selectPlayer, selectUnreadCount } from '@/store/game';
import { formatTokens } from '@/lib/utils';

export default function HUD() {
  const player = useGameStore(selectPlayer);
  const unreadCount = useGameStore(selectUnreadCount);

  return (
    <>
      {/* Top bar */}
      <motion.div
        className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4"
        style={{
          paddingTop: 'calc(var(--safe-top) + 12px)',
          paddingBottom: '12px',
          background: 'linear-gradient(to bottom, rgba(6,8,16,0.9) 0%, transparent 100%)',
        }}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2">
          <Waves size={20} style={{ color: '#00C2FF' }} />
          <span
            className="text-lg font-bold tracking-tight"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
          >
            Surfari
          </span>
        </div>

        {/* Right side: tokens + bell */}
        <div className="flex items-center gap-3">
          {player && (
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{
                background: 'rgba(255,184,0,0.1)',
                border: '1px solid rgba(255,184,0,0.3)',
              }}
            >
              <span
                className="text-sm font-semibold"
                style={{ color: '#FFB800', fontFamily: 'var(--font-mono)' }}
              >
                {formatTokens(player.tide_tokens)}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>T</span>
            </div>
          )}

          <button
            className="relative flex items-center justify-center w-9 h-9 rounded-full"
            style={{
              background: 'rgba(17,24,39,0.7)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <Bell size={16} style={{ color: 'var(--text-secondary)' }} />
            {unreadCount > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 rounded-full text-xs font-bold"
                style={{ background: '#FF4757', color: '#F0F4FF', fontSize: '10px' }}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>
      </motion.div>

      {/* Bottom nav */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-around px-2"
        style={{
          paddingBottom: 'calc(var(--safe-bottom) + 12px)',
          paddingTop: '12px',
          background: 'linear-gradient(to top, rgba(6,8,16,0.95) 0%, transparent 100%)',
        }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
      >
        <NavButton icon={<Map size={20} />} label="Map" active />
        <NavButton icon={<Zap size={20} />} label="Surf" />

        {/* Center stats pill */}
        <div
          className="flex items-center gap-3 px-4 py-2 rounded-2xl"
          style={{
            background: 'rgba(17,24,39,0.9)',
            border: '1px solid rgba(0,194,255,0.2)',
          }}
        >
          <div className="text-center">
            <div
              className="text-base font-bold leading-none"
              style={{ color: '#00C2FF', fontFamily: 'var(--font-mono)' }}
            >
              {player?.zones_owned ?? 0}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>zones</div>
          </div>
          <div className="w-px h-6" style={{ background: 'rgba(255,255,255,0.08)' }} />
          <div className="text-center">
            <div
              className="text-base font-bold leading-none capitalize"
              style={{ color: '#7C5CFC', fontFamily: 'var(--font-mono)' }}
            >
              {player?.tier ?? '—'}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>rank</div>
          </div>
        </div>

        <NavButton icon={<CheckSquare size={20} />} label="Tasks" />
        <NavButton icon={<User size={20} />} label="Profile" />
      </motion.div>
    </>
  );
}

function NavButton({
  icon,
  label,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <button className="flex flex-col items-center gap-1 px-3 py-1.5">
      <span style={{ color: active ? '#00C2FF' : 'var(--text-muted)' }}>{icon}</span>
      <span
        className="text-xs"
        style={{
          color: active ? '#00C2FF' : 'var(--text-muted)',
          fontFamily: 'var(--font-body)',
        }}
      >
        {label}
      </span>
    </button>
  );
}
