'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Waves, Bell, Map, Zap, ListChecks, User, Sun, Moon, Radio } from 'lucide-react';
import { useGameStore, selectPlayer, selectActiveTab, selectTheme, selectUnreadCount, selectSelectedZone } from '@/store/game';
import { formatTokens } from '@/lib/utils';
import { SurfScreen } from '@/components/screens/SurfScreen';
import { ExploreScreen } from '@/components/screens/ExploreScreen';
import { TasksScreen } from '@/components/screens/TasksScreen';
import { ProfileScreen } from '@/components/screens/ProfileScreen';
import { ZoneChat } from '@/components/chat/ZoneChat';
import type { GameTab } from '@/types';

const TABS: { tab: GameTab; icon: React.ReactNode; label: string }[] = [
  { tab: 'map',     icon: <Map size={16} />,       label: 'MAP' },
  { tab: 'surf',    icon: <Zap size={16} />,       label: 'SURF' },
  { tab: 'explore', icon: <Waves size={16} />,     label: 'EXPLORE' },
  { tab: 'tasks',   icon: <ListChecks size={16} />, label: 'TASKS' },
  { tab: 'profile', icon: <User size={16} />,      label: 'PROFILE' },
];

export function DesktopSidebar() {
  const player = useGameStore(selectPlayer);
  const activeTab = useGameStore(selectActiveTab);
  const theme = useGameStore(selectTheme);
  const unread = useGameStore(selectUnreadCount);
  const selectedZone = useGameStore(selectSelectedZone);
  const setActiveTab = useGameStore((s) => s.setActiveTab);
  const toggleTheme = useGameStore((s) => s.toggleTheme);
  const markRead = useGameStore((s) => s.markNotificationRead);
  const notifications = useGameStore((s) => s.notifications);

  return (
    <aside
      className="flex flex-col h-full"
      style={{
        width: 420,
        flexShrink: 0,
        background: 'var(--color-bg)',
        borderLeft: '1px solid var(--border-subtle)',
      }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center gap-3 px-5 py-4"
        style={{ borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2">
          <Waves size={18} style={{ color: 'var(--color-primary)' }} />
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            Surfari
          </span>
        </div>

        {/* Player chips */}
        <div className="flex items-center gap-1.5 flex-1 justify-center overflow-hidden">
          {player ? (
            <>
              <Chip value={formatTokens(player.tide_tokens)} label="T" color="var(--color-gold)" bg="rgba(217,119,6,0.1)" border="rgba(217,119,6,0.25)" />
              <Chip value={String(player.zones_owned)} label="zones" color="var(--color-primary)" bg="rgba(0,153,194,0.08)" border="rgba(0,153,194,0.2)" />
              <Chip value={player.tier} label="" color="var(--color-accent)" bg="rgba(109,40,217,0.08)" border="rgba(109,40,217,0.2)" capitalize />
            </>
          ) : (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>not connected</span>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <IconBtn onClick={toggleTheme} aria-label="Toggle theme">
            {theme === 'dark' ? <Sun size={13} style={{ color: 'var(--color-gold)' }} /> : <Moon size={13} style={{ color: 'var(--text-secondary)' }} />}
          </IconBtn>
          <div className="relative">
            <IconBtn aria-label="Notifications">
              <Bell size={13} style={{ color: 'var(--text-secondary)' }} />
            </IconBtn>
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                style={{ background: 'var(--color-danger)', fontSize: '9px', color: '#fff', fontWeight: 700 }}>
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Tab nav ── */}
      <div className="flex" style={{ borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        {TABS.map(({ tab, icon, label }) => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex-1 flex flex-col items-center gap-1 py-2.5 relative"
              style={{ transition: 'color 0.18s' }}
            >
              <span style={{ color: active ? 'var(--color-primary)' : 'var(--text-muted)' }}>{icon}</span>
              <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', color: active ? 'var(--color-primary)' : 'var(--text-muted)', fontWeight: active ? 600 : 400 }}>
                {label}
              </span>
              {active && (
                <motion.div
                  layoutId="desktop-tab-indicator"
                  className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t-full"
                  style={{ background: 'var(--color-primary)' }}
                  transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Screen content ── */}
      <div className="desktop-panel flex-1 relative overflow-hidden min-h-0">
        <AnimatePresence mode="wait">
          {activeTab === 'map' && (
            <motion.div key="map-hint" className="absolute inset-0 flex flex-col items-center justify-center gap-3"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Map size={32} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
                Click any zone on the map<br />to view details and claim it.
              </p>
            </motion.div>
          )}
          {activeTab === 'surf'    && <SurfScreen key="surf" />}
          {activeTab === 'explore' && <ExploreScreen key="explore" />}
          {activeTab === 'tasks'   && <TasksScreen key="tasks" />}
          {activeTab === 'profile' && <ProfileScreen key="profile" />}
        </AnimatePresence>
      </div>

      {/* ── Always-on chat ── */}
      <div
        className="flex flex-col"
        style={{ height: 260, borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}
      >
        <div
          className="flex items-center gap-2 px-4 py-2"
          style={{ borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}
        >
          <Radio size={12} style={{ color: 'var(--color-primary)' }} />
          <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', flex: 1 }}>
            {selectedZone ? selectedZone.name : 'City Chat · Dar es Salaam'}
          </span>
          {selectedZone && (
            <button
              onClick={() => useGameStore.getState().selectZone(null)}
              style={{ fontSize: '10px', color: 'var(--color-primary)', fontFamily: 'var(--font-mono)' }}
            >
              ALL
            </button>
          )}
        </div>
        <div className="flex-1 min-h-0">
          <ZoneChat zoneId={selectedZone?.id} />
        </div>
      </div>
    </aside>
  );
}

function Chip({ value, label, color, bg, border, capitalize }: {
  value: string; label: string; color: string; bg: string; border: string; capitalize?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1 px-2 py-0.5 rounded-lg" style={{ background: bg, border: `1px solid ${border}`, flexShrink: 0 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '12px', color, textTransform: capitalize ? 'capitalize' : 'none' }}>
        {value}
      </span>
      {label && <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{label}</span>}
    </div>
  );
}

function IconBtn({ children, onClick, 'aria-label': aria }: { children: React.ReactNode; onClick?: () => void; 'aria-label'?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={aria}
      className="flex items-center justify-center w-7 h-7 rounded-lg"
      style={{ background: 'var(--surface-subtle)', border: '1px solid var(--border-mid)' }}
    >
      {children}
    </button>
  );
}
