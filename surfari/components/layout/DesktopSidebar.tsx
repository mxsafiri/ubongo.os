'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Waves, Bell, Map, Zap, ListChecks, User, Sun, Moon, Radio, Crosshair, Flag } from 'lucide-react';
import { useGameStore, selectPlayer, selectActiveTab, selectTheme, selectUnreadCount, selectSelectedZone, selectNearbyZones } from '@/store/game';
import { formatTokens } from '@/lib/utils';
import { SurfScreen } from '@/components/screens/SurfScreen';
import { ExploreScreen } from '@/components/screens/ExploreScreen';
import { TasksScreen } from '@/components/screens/TasksScreen';
import { ProfileScreen } from '@/components/screens/ProfileScreen';
import { ZoneChat } from '@/components/chat/ZoneChat';
import type { GameTab, Zone } from '@/types';

const TABS: { tab: GameTab; icon: React.ReactNode; label: string }[] = [
  { tab: 'map',     icon: <Map size={15} />,        label: 'INTEL' },
  { tab: 'surf',    icon: <Zap size={15} />,        label: 'SURF' },
  { tab: 'explore', icon: <Waves size={15} />,      label: 'EXPLORE' },
  { tab: 'tasks',   icon: <ListChecks size={15} />, label: 'OPS' },
  { tab: 'profile', icon: <User size={15} />,       label: 'PROFILE' },
];

const TIER_RANKS: Record<string, string> = {
  surfari: 'ROOKIE',
  district: 'HUSTLER',
  baron: 'BARON',
  architect: 'ARCHITECT',
  apex: 'APEX',
};

export function DesktopSidebar() {
  const player = useGameStore(selectPlayer);
  const activeTab = useGameStore(selectActiveTab);
  const theme = useGameStore(selectTheme);
  const unread = useGameStore(selectUnreadCount);
  const selectedZone = useGameStore(selectSelectedZone);
  const setActiveTab = useGameStore((s) => s.setActiveTab);
  const toggleTheme = useGameStore((s) => s.toggleTheme);

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
      {/* ── Player plate ── */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}
      >
        {player ? (
          <>
            {/* Avatar block */}
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{
                width: 44, height: 44,
                background: player.avatar_color,
                boxShadow: `0 0 18px ${player.avatar_color}66`,
              }}
            >
              <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '26px', color: '#fff', lineHeight: 1 }}>
                {player.handle[0]?.toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span style={{
                  fontFamily: 'var(--font-arcade)', fontSize: '24px', lineHeight: 1,
                  color: 'var(--text-primary)', letterSpacing: '0.04em',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  @{player.handle.toUpperCase()}
                </span>
              </div>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.28em',
                color: 'var(--color-accent)',
              }}>
                RANK · {TIER_RANKS[player.tier] ?? player.tier.toUpperCase()}
              </span>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center gap-2">
            <Waves size={18} style={{ color: 'var(--color-primary)' }} />
            <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '22px', color: 'var(--text-primary)', letterSpacing: '0.06em' }}>SURFARI</span>
          </div>
        )}

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

      {/* ── Stat strip ── */}
      {player && (
        <div className="flex" style={{ borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <StatBlock label="TIDE" value={formatTokens(player.tide_tokens)} color="var(--color-gold)" />
          <StatBlock label="TURF" value={String(player.zones_owned)} color="var(--color-primary)" />
          <StatBlock label="REP" value={String(player.reputation)} color="var(--color-accent)" />
        </div>
      )}

      {/* ── Tab nav ── */}
      <div className="flex" style={{ borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        {TABS.map(({ tab, icon, label }) => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex-1 flex flex-col items-center gap-0.5 py-2 relative"
              style={{ transition: 'color 0.18s' }}
            >
              <span style={{ color: active ? 'var(--color-primary)' : 'var(--text-muted)' }}>{icon}</span>
              <span style={{
                fontSize: '12px', fontFamily: 'var(--font-arcade)', letterSpacing: '0.14em',
                color: active ? 'var(--color-primary)' : 'var(--text-muted)', lineHeight: 1,
              }}>
                {label}
              </span>
              {active && (
                <motion.div
                  layoutId="desktop-tab-indicator"
                  className="absolute bottom-0 left-2 right-2"
                  style={{ height: 2, background: 'linear-gradient(90deg, var(--color-primary), var(--color-accent))' }}
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
          {activeTab === 'map'     && <WarReport key="war-report" />}
          {activeTab === 'surf'    && <SurfScreen key="surf" />}
          {activeTab === 'explore' && <ExploreScreen key="explore" />}
          {activeTab === 'tasks'   && <TasksScreen key="tasks" />}
          {activeTab === 'profile' && <ProfileScreen key="profile" />}
        </AnimatePresence>
      </div>

      {/* ── Always-on chat ── */}
      <div
        className="flex flex-col"
        style={{ height: 250, borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}
      >
        <div
          className="flex items-center gap-2 px-4 py-2"
          style={{ borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}
        >
          <Radio size={12} style={{ color: 'var(--color-primary)' }} />
          <span style={{ fontSize: '13px', fontFamily: 'var(--font-arcade)', letterSpacing: '0.14em', color: 'var(--text-secondary)', flex: 1, lineHeight: 1 }}>
            {selectedZone ? selectedZone.name.toUpperCase() : 'LIVE WIRE · DAR ES SALAAM'}
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

/* ── WAR REPORT — the INTEL tab. Territory, income, targets. ── */
function WarReport() {
  const player = useGameStore(selectPlayer);
  const zones = useGameStore(selectNearbyZones);
  const selectZone = useGameStore((s) => s.selectZone);
  const setActiveTab = useGameStore((s) => s.setActiveTab);

  const owned = player ? zones.filter((z) => z.owner_id === player.id) : [];
  const dailyIncome = owned.reduce((sum, z) => sum + (z.daily_yield ?? 0) - (z.upkeep_cost ?? 0), 0);
  const controlPct = zones.length > 0 ? Math.round((owned.length / zones.length) * 100) : 0;

  const findTarget = () => {
    const targets = zones.filter((z) => !player || z.owner_id !== player.id);
    if (targets.length === 0) return;
    // Prefer unclaimed, then weakest enemy hold
    const unclaimed = targets.filter((z) => !z.owner_id);
    const pool = unclaimed.length > 0 ? unclaimed : [...targets].sort((a, b) => (a.claim_strength ?? 0) - (b.claim_strength ?? 0));
    const pick = pool[Math.floor(Math.random() * Math.min(pool.length, 3))];
    selectZone(pick);
    setActiveTab('surf');
  };

  return (
    <motion.div
      key="war-report"
      className="absolute inset-0 flex flex-col overflow-y-auto px-4 py-4 gap-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div style={{ width: 3, height: 22, background: 'linear-gradient(180deg, var(--color-primary), var(--color-accent))' }} />
        <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '26px', lineHeight: 1, color: 'var(--text-primary)', letterSpacing: '0.08em' }}>
          WAR REPORT
        </span>
      </div>

      {/* Big numbers */}
      <div className="grid grid-cols-3 gap-2">
        <BigStat label="TURF HELD" value={String(owned.length)} color="var(--color-primary)" />
        <BigStat label="NET / DAY" value={formatTokens(Math.max(dailyIncome, 0))} color="var(--color-gold)" />
        <BigStat label="CITY GRIP" value={`${controlPct}%`} color="var(--color-accent)" />
      </div>

      {/* Holdings */}
      {owned.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.3em', color: 'var(--text-muted)' }}>
            YOUR HOLDINGS
          </span>
          {owned.map((z) => (
            <HoldingRow key={z.id} zone={z} onClick={() => { selectZone(z); setActiveTab('surf'); }} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-6 px-4 text-center"
          style={{ border: '1px dashed var(--border-mid)' }}>
          <Flag size={22} style={{ color: 'var(--color-success)', opacity: 0.8 }} />
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '20px', lineHeight: 1.1, color: 'var(--text-primary)', letterSpacing: '0.05em' }}>
            NO TURF YET
          </p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Tap a beacon on the map to take a zone — or click any empty street to plant your own flag and build from nothing.
          </p>
        </div>
      )}

      {/* Find target CTA */}
      <button
        onClick={findTarget}
        className="flex items-center justify-center gap-2.5 py-3 mt-auto"
        style={{
          background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
          boxShadow: '0 4px 20px rgba(0,153,194,0.3)',
        }}
      >
        <Crosshair size={16} style={{ color: '#fff' }} />
        <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '19px', letterSpacing: '0.14em', color: '#fff', lineHeight: 1 }}>
          FIND A TARGET
        </span>
      </button>
    </motion.div>
  );
}

function HoldingRow({ zone, onClick }: { zone: Zone; onClick: () => void }) {
  const strength = zone.claim_strength ?? 0;
  const barColor = strength >= 70 ? 'var(--color-success)' : strength >= 40 ? 'var(--color-warning)' : 'var(--color-danger)';
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2.5 text-left"
      style={{ background: 'var(--surface-subtle)', borderLeft: `3px solid ${barColor}` }}
    >
      <div className="flex-1 min-w-0">
        <p style={{
          fontFamily: 'var(--font-arcade)', fontSize: '16px', lineHeight: 1.1, color: 'var(--text-primary)',
          letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {zone.name.toUpperCase()}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1" style={{ background: 'var(--border-mid)', maxWidth: 110 }}>
            <div className="h-full" style={{ width: `${strength}%`, background: barColor }} />
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-muted)' }}>{strength}%</span>
        </div>
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-gold)', flexShrink: 0 }}>
        +{formatTokens(zone.daily_yield)}/d
      </span>
    </button>
  );
}

function BigStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-3" style={{ background: 'var(--surface-subtle)', borderTop: `2px solid ${color}` }}>
      <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '28px', lineHeight: 1, color }}>{value}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.24em', color: 'var(--text-muted)' }}>{label}</span>
    </div>
  );
}

function StatBlock({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex-1 flex items-baseline justify-center gap-1.5 py-2" style={{ borderRight: '1px solid var(--border-subtle)' }}>
      <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '20px', lineHeight: 1, color }}>{value}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.2em', color: 'var(--text-muted)' }}>{label}</span>
    </div>
  );
}

function IconBtn({ children, onClick, 'aria-label': aria }: { children: React.ReactNode; onClick?: () => void; 'aria-label'?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={aria}
      className="flex items-center justify-center w-7 h-7"
      style={{ background: 'var(--surface-subtle)', border: '1px solid var(--border-mid)' }}
    >
      {children}
    </button>
  );
}
