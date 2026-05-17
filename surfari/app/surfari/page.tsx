'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useGameStore, selectPhase, selectMapLoaded, selectActiveTab, selectPlayer, selectTheme } from '@/store/game';
import Onboarding from '@/components/game/Onboarding';
import HUD from '@/components/layout/HUD';
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
  const player = useGameStore(selectPlayer);
  const theme = useGameStore(selectTheme);
  const setPhase = useGameStore((s) => s.setPhase);
  const fetchZones = useGameStore((s) => s.fetchZones);

  // Advance when map loads
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

  // Hard fallback — never stay stuck on loading for more than 5s
  useEffect(() => {
    if (phase !== 'loading') return;
    const t = setTimeout(() => setPhase('onboarding'), 5000);
    return () => clearTimeout(t);
  }, [phase, setPhase]);

  const showHUD = phase === 'exploring' || phase === 'surfing' || phase === 'challenge' || phase === 'result';
  const mapActive = activeTab === 'map' || activeTab === 'explore';

  return (
    <div className="surfari-root">
      {/* Map — always mounted, dimmed when a content screen is active */}
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

      {/* Atmosphere vignette — subtle brand tinting on corners */}
      <div
        className="absolute inset-0 pointer-events-none z-[1]"
        style={{
          background: `
            radial-gradient(ellipse 50% 35% at 10% 90%, rgba(0,153,194,0.05) 0%, transparent 70%),
            radial-gradient(ellipse 40% 30% at 90% 10%, rgba(109,40,217,0.04) 0%, transparent 70%)
          `,
        }}
      />

      {/* Loading spinner */}
      {phase === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div
            className="w-10 h-10 rounded-full border-2 animate-spin"
            style={{
              borderColor: 'rgba(0,194,255,0.2)',
              borderTopColor: '#00C2FF',
            }}
          />
        </div>
      )}

      {/* Onboarding overlay */}
      {phase === 'onboarding' && <Onboarding />}

      {/* Screen overlays — rendered above map, below HUD */}
      {showHUD && (
        <AnimatePresence mode="wait">
          {activeTab === 'surf' && <SurfScreen key="surf" />}
          {activeTab === 'explore' && <ExploreScreen key="explore" />}
          {activeTab === 'tasks' && <TasksScreen key="tasks" />}
          {activeTab === 'profile' && <ProfileScreen key="profile" />}
        </AnimatePresence>
      )}

      {/* Floating city chat — visible whenever HUD is up */}
      {showHUD && <CityChat />}

      {/* Toast notifications — above everything */}
      {showHUD && <Toast />}

      {/* HUD — always on top */}
      {showHUD && <HUD />}
    </div>
  );
}
