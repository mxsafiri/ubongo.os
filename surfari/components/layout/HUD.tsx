'use client';

import { motion } from 'framer-motion';
import { Waves, Bell, Map, Zap, ListChecks, User } from 'lucide-react';
import { useGameStore, selectPlayer, selectUnreadCount, selectActiveTab } from '@/store/game';
import { formatTokens } from '@/lib/utils';
import type { GameTab } from '@/types';

export default function HUD() {
  const player = useGameStore(selectPlayer);
  const unread = useGameStore(selectUnreadCount);
  const activeTab = useGameStore(selectActiveTab);
  const setActiveTab = useGameStore((s) => s.setActiveTab);

  return (
    <>
      {/* ── Top bar ── */}
      <motion.div
        className="absolute top-0 left-0 right-0 z-[30] flex items-center justify-between px-4 gap-3"
        style={{
          paddingTop: 'calc(var(--safe-top) + 14px)',
          paddingBottom: '14px',
          background: 'linear-gradient(to bottom, rgba(10,14,26,0.92) 0%, transparent 100%)',
          backdropFilter: 'blur(2px)',
        }}
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Waves size={18} style={{ color: 'var(--color-primary)' }} />
          <span style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '16px',
            color: 'var(--text-primary)',
            letterSpacing: '-0.01em',
          }}>
            Surfari
          </span>
        </div>

        {/* Stat chips */}
        <div className="flex items-center gap-2 flex-1 justify-center">
          <StatChip
            value={player ? formatTokens(player.tide_tokens) : '—'}
            label="T"
            color="var(--color-gold)"
            bg="rgba(245,158,11,0.1)"
            border="rgba(245,158,11,0.25)"
          />
          <StatChip
            value={String(player?.zones_owned ?? 0)}
            label="zones"
            color="var(--color-primary)"
            bg="rgba(0,212,255,0.08)"
            border="rgba(0,212,255,0.2)"
          />
          <StatChip
            value={player?.tier ?? '—'}
            label="rank"
            color="var(--color-accent)"
            bg="rgba(124,58,237,0.1)"
            border="rgba(124,58,237,0.25)"
            capitalize
          />
        </div>

        {/* Bell */}
        <button
          className="relative flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0"
          style={{
            background: 'rgba(17,27,39,0.8)',
            border: '1px solid var(--color-border-hi)',
          }}
        >
          <Bell size={14} style={{ color: 'var(--text-secondary)' }} />
          {unread > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 rounded-full text-xs font-bold"
              style={{ background: 'var(--color-danger)', color: '#fff', fontSize: '9px' }}
            >
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </motion.div>

      {/* ── Bottom nav ── */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 z-[30]"
        style={{
          paddingBottom: 'calc(var(--safe-bottom) + 8px)',
          paddingTop: '8px',
          background: 'linear-gradient(to top, rgba(10,14,26,0.97) 60%, transparent 100%)',
        }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-end justify-around px-4">
          <NavBtn
            icon={<Map size={20} />}
            label="Map"
            tab="map"
            activeTab={activeTab}
            onPress={setActiveTab}
          />
          <NavBtn
            icon={<Zap size={20} />}
            label="Surf"
            tab="surf"
            activeTab={activeTab}
            onPress={setActiveTab}
          />

          {/* Centre explore pulse */}
          <button
            className="flex flex-col items-center gap-1 pb-1"
            onClick={() => setActiveTab('explore')}
          >
            <div
              className="relative w-14 h-14 rounded-full flex items-center justify-center"
              style={{
                background: activeTab === 'explore'
                  ? 'linear-gradient(135deg, #00D4FF 0%, #7C3AED 100%)'
                  : 'linear-gradient(135deg, rgba(0,212,255,0.7) 0%, rgba(124,58,237,0.7) 100%)',
                boxShadow: activeTab === 'explore'
                  ? '0 0 32px rgba(0,212,255,0.5), 0 0 64px rgba(124,58,237,0.3)'
                  : '0 0 24px rgba(0,212,255,0.35), 0 0 48px rgba(124,58,237,0.2)',
                transition: 'all 0.25s ease',
              }}
            >
              <Waves size={22} style={{ color: '#fff' }} />
              {activeTab !== 'explore' && (
                <span
                  className="absolute inset-0 rounded-full animate-ping"
                  style={{ background: 'rgba(0,212,255,0.15)', animationDuration: '2.4s' }}
                />
              )}
            </div>
            <span style={{
              fontSize: '10px',
              color: activeTab === 'explore' ? 'var(--color-primary)' : 'rgba(0,212,255,0.7)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.08em',
            }}>
              EXPLORE
            </span>
          </button>

          <NavBtn
            icon={<ListChecks size={20} />}
            label="Tasks"
            tab="tasks"
            activeTab={activeTab}
            onPress={setActiveTab}
          />
          <NavBtn
            icon={<User size={20} />}
            label="Profile"
            tab="profile"
            activeTab={activeTab}
            onPress={setActiveTab}
          />
        </div>
      </motion.div>
    </>
  );
}

function StatChip({
  value, label, color, bg, border, capitalize = false,
}: {
  value: string; label: string; color: string; bg: string; border: string; capitalize?: boolean;
}) {
  return (
    <div
      className="flex items-baseline gap-1 px-2.5 py-1 rounded-lg"
      style={{ background: bg, border: `1px solid ${border}` }}
    >
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        fontSize: '13px',
        color,
        textTransform: capitalize ? 'capitalize' : 'none',
      }}>
        {value}
      </span>
      <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        {label}
      </span>
    </div>
  );
}

function NavBtn({
  icon, label, tab, activeTab, onPress,
}: {
  icon: React.ReactNode;
  label: string;
  tab: GameTab;
  activeTab: GameTab;
  onPress: (tab: GameTab) => void;
}) {
  const isActive = activeTab === tab;
  return (
    <button
      className="flex flex-col items-center gap-1 px-3 py-2"
      onClick={() => onPress(tab)}
    >
      <span style={{ color: isActive ? 'var(--color-primary)' : 'var(--text-muted)', transition: 'color 0.2s' }}>
        {icon}
      </span>
      <span style={{
        fontSize: '10px',
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.06em',
        color: isActive ? 'var(--color-primary)' : 'var(--text-muted)',
        transition: 'color 0.2s',
      }}>
        {label.toUpperCase()}
      </span>
    </button>
  );
}
