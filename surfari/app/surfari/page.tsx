'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useGameStore, selectPhase, selectMapLoaded, selectActiveTab } from '@/store/game';
import Onboarding from '@/components/game/Onboarding';
import HUD from '@/components/layout/HUD';
import { SurfScreen } from '@/components/screens/SurfScreen';
import { ExploreScreen } from '@/components/screens/ExploreScreen';
import { TasksScreen } from '@/components/screens/TasksScreen';
import { ProfileScreen } from '@/components/screens/ProfileScreen';

const CityMap = dynamic(() => import('@/components/map/CityMap'), { ssr: false });

export default function SurfariPage() {
  const phase = useGameStore(selectPhase);
  const mapLoaded = useGameStore(selectMapLoaded);
  const activeTab = useGameStore(selectActiveTab);
  const setPhase = useGameStore((s) => s.setPhase);

  // Advance when map loads
  useEffect(() => {
    if (mapLoaded && phase === 'loading') {
      const t = setTimeout(() => setPhase('onboarding'), 800);
      return () => clearTimeout(t);
    }
  }, [mapLoaded, phase, setPhase]);

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

      {/* Atmosphere vignette */}
      <div
        className="absolute inset-0 pointer-events-none z-[1]"
        style={{
          background: `
            radial-gradient(ellipse 60% 40% at 20% 80%, rgba(0,194,255,0.06) 0%, transparent 70%),
            radial-gradient(ellipse 50% 40% at 80% 20%, rgba(124,92,252,0.06) 0%, transparent 70%),
            radial-gradient(ellipse 40% 30% at 60% 90%, rgba(255,122,53,0.04) 0%, transparent 60%)
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

      {/* HUD — always on top */}
      {showHUD && <HUD />}
    </div>
  );
}
