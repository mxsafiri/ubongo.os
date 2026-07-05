'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useGameStore, selectPhase, selectMapLoaded, selectActiveTab, selectTheme, selectSidebarCollapsed, selectUnreadCount } from '@/store/game';
import { ChevronsLeft } from 'lucide-react';
import { loadSavedPlayer } from '@/lib/storage';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import Onboarding from '@/components/game/Onboarding';
import { PlantFlow } from '@/components/game/PlantFlow';
import HUD from '@/components/layout/HUD';
import { DesktopSidebar } from '@/components/layout/DesktopSidebar';
import { CityChat } from '@/components/chat/CityChat';
import { Toast } from '@/components/ui/Toast';
import { SurfScreen } from '@/components/screens/SurfScreen';
import { ExploreScreen } from '@/components/screens/ExploreScreen';
import { TasksScreen } from '@/components/screens/TasksScreen';
import { ProfileScreen } from '@/components/screens/ProfileScreen';

const CityMap = dynamic(() => import('@/components/map/CityMap'), { ssr: false });

export default function SurfariPage() {
  const phase = useGameStore(selectPhase);
  const mapLoaded = useGameStore(selectMapLoaded);
  const activeTab = useGameStore(selectActiveTab);
  const theme = useGameStore(selectTheme);
  const setPhase = useGameStore((s) => s.setPhase);
  const setPlayer = useGameStore((s) => s.setPlayer);
  const fetchZones = useGameStore((s) => s.fetchZones);
  const sidebarCollapsed = useGameStore(selectSidebarCollapsed);
  const unread = useGameStore(selectUnreadCount);
  const setSidebarCollapsed = useGameStore((s) => s.setSidebarCollapsed);
  const isDesktop = useIsDesktop();

  // Restore session from localStorage on first mount (uses player_id — PIN not required)
  useEffect(() => {
    const saved = loadSavedPlayer();
    if (!saved?.id) return;
    fetch('/api/game/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: saved.id }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.player) return;
        setPlayer({ ...data.player, geo_lat: null, geo_lng: null });
        useGameStore.getState().setPhase('exploring');
      })
      .catch(() => {/* silent — onboarding shows normally */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Advance when map loads (only if not already restored)
  useEffect(() => {
    if (mapLoaded && phase === 'loading') {
      const t = setTimeout(() => setPhase('onboarding'), 800);
      return () => clearTimeout(t);
    }
  }, [mapLoaded, phase, setPhase]);

  // Fetch live zone data from DB when the player enters exploring
  useEffect(() => {
    if (phase === 'exploring') fetchZones();
  }, [phase, fetchZones]);

  // Sync theme class to document root
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // Hard fallback — never stuck on loading > 5s
  useEffect(() => {
    if (phase !== 'loading') return;
    const t = setTimeout(() => setPhase('onboarding'), 5000);
    return () => clearTimeout(t);
  }, [phase, setPhase]);

  const showHUD = phase === 'exploring' || phase === 'surfing' || phase === 'challenge' || phase === 'result';
  const mapActive = !isDesktop && (activeTab === 'map' || activeTab === 'explore');

  /* ── Desktop layout ── */
  if (isDesktop) {
    return (
      <div className="surfari-root flex flex-row overflow-hidden">
        {/* Map — full left side, always at 100% */}
        <div className="flex-1 relative">
          <CityMap />
          {/* Atmosphere */}
          <div className="absolute inset-0 pointer-events-none"
            style={{
              background: `
                radial-gradient(ellipse 50% 35% at 10% 90%, rgba(0,153,194,0.05) 0%, transparent 70%),
                radial-gradient(ellipse 40% 30% at 90% 10%, rgba(109,40,217,0.04) 0%, transparent 70%)
              `,
            }}
          />
          {phase === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 rounded-full border-2 animate-spin"
                style={{ borderColor: 'rgba(0,194,255,0.2)', borderTopColor: '#00C2FF' }} />
            </div>
          )}
          {phase === 'onboarding' && <Onboarding />}
          {showHUD && <PlantFlow />}
          <Toast />

          {/* Re-open HUD when collapsed — floating button over the map */}
          {showHUD && sidebarCollapsed && (
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="absolute top-4 right-4 z-30 flex items-center gap-2 px-3 py-2"
              style={{
                background: 'rgba(9,13,24,0.85)',
                border: '1px solid rgba(0,194,255,0.35)',
                backdropFilter: 'blur(10px)',
                boxShadow: '0 4px 18px rgba(0,0,0,0.4)',
              }}
              aria-label="Open HUD"
            >
              <ChevronsLeft size={14} style={{ color: '#00C2FF' }} />
              <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '15px', letterSpacing: '0.14em', color: '#F0F6FF', lineHeight: 1 }}>
                HUD
              </span>
              {unread > 0 && (
                <span className="w-4 h-4 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--color-danger)', fontSize: '9px', color: '#fff', fontWeight: 700 }}>
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Right sidebar — collapsible so the map is the main stage */}
        {showHUD && !sidebarCollapsed && <DesktopSidebar />}
      </div>
    );
  }

  /* ── Mobile layout (unchanged) ── */
  return (
    <div className="surfari-root">
      <div
        className="absolute inset-0"
        style={{
          opacity: mapActive ? 1 : 0.35,
          filter: mapActive ? 'none' : 'blur(3px)',
          transition: 'opacity 0.35s ease, filter 0.35s ease',
          pointerEvents: mapActive ? 'auto' : 'none',
        }}
      >
        <CityMap />
      </div>

      <div className="absolute inset-0 pointer-events-none z-[1]"
        style={{
          background: `
            radial-gradient(ellipse 50% 35% at 10% 90%, rgba(0,153,194,0.05) 0%, transparent 70%),
            radial-gradient(ellipse 40% 30% at 90% 10%, rgba(109,40,217,0.04) 0%, transparent 70%)
          `,
        }}
      />

      {phase === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full border-2 animate-spin"
            style={{ borderColor: 'rgba(0,194,255,0.2)', borderTopColor: '#00C2FF' }} />
        </div>
      )}

      {phase === 'onboarding' && <Onboarding />}

      {showHUD && (
        <AnimatePresence mode="wait">
          {activeTab === 'surf'    && <SurfScreen key="surf" />}
          {activeTab === 'explore' && <ExploreScreen key="explore" />}
          {activeTab === 'tasks'   && <TasksScreen key="tasks" />}
          {activeTab === 'profile' && <ProfileScreen key="profile" />}
        </AnimatePresence>
      )}

      {showHUD && <PlantFlow />}
      {showHUD && <CityChat />}
      {showHUD && <Toast />}
      {showHUD && <HUD />}
    </div>
  );
}
