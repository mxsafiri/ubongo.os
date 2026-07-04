'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flag, X } from 'lucide-react';
import { useGameStore, selectPlantSite } from '@/store/game';
import { GameArena } from './GameArena';

// PlantFlow — build-your-own-turf. The player taps bare ground on the map,
// confirms, wins a game, and a new zone with their name on it joins the city.
export function PlantFlow() {
  const plantSite = useGameStore(selectPlantSite);
  const player = useGameStore((s) => s.player);
  const setPlantSite = useGameStore((s) => s.setPlantSite);
  const plantTurf = useGameStore((s) => s.plantTurf);
  const addNotification = useGameStore((s) => s.addNotification);
  const setActiveTab = useGameStore((s) => s.setActiveTab);

  const [gameOpen, setGameOpen] = useState(false);

  const cancel = useCallback(() => {
    setGameOpen(false);
    setPlantSite(null);
  }, [setPlantSite]);

  const handleWin = useCallback(async () => {
    setGameOpen(false);
    const zone = await plantTurf();
    if (zone && player) {
      addNotification({
        type: 'zone_claimed',
        title: `🚩 ${zone.name} is on the map!`,
        message: `Your turf now earns 400 Tide/day. Reinforce it before someone comes for it.`,
      });
      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zone_id: null,
          player_id: player.id,
          player_handle: player.handle,
          player_color: player.avatar_color,
          content: `🚩 @${player.handle} planted new turf in Dar — ${zone.name}!`,
          msg_type: 'event',
        }),
      });
      setActiveTab('surf');
    } else {
      addNotification({
        type: 'system',
        title: 'Turf not planted',
        message: 'Could not build here — you may be at the 5-turf cap.',
      });
      setPlantSite(null);
    }
  }, [plantTurf, player, addNotification, setActiveTab, setPlantSite]);

  const handleLose = useCallback(() => {
    setGameOpen(false);
    setPlantSite(null);
    addNotification({
      type: 'zone_contested',
      title: '💨 The block said no',
      message: 'Win the game to plant your flag. Run it back.',
    });
  }, [setPlantSite, addNotification]);

  if (!player) return null;

  return (
    <>
      <AnimatePresence>
        {plantSite && !gameOpen && (
          <motion.div
            key="plant-confirm"
            className="fixed left-1/2 z-[55] flex flex-col"
            style={{
              transform: 'translateX(-50%)',
              bottom: 'calc(var(--screen-pad-bottom, 24px) + 12px)',
              width: 'min(400px, calc(100vw - 32px))',
              ['--font-display' as string]: 'var(--font-arcade)',
            } as React.CSSProperties}
            initial={{ opacity: 0, y: 28, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            <div style={{ padding: 1, background: 'linear-gradient(140deg, rgba(0,224,150,0.65), rgba(0,194,255,0.35))' }}>
              <div className="relative px-5 py-4" style={{ background: 'rgba(9,13,24,0.95)' }}>
                <button
                  onClick={cancel}
                  className="absolute top-3 right-3 flex items-center justify-center"
                  style={{ width: 26, height: 26, background: 'rgba(240,246,255,0.06)', border: '1px solid rgba(240,246,255,0.14)' }}
                  aria-label="Cancel"
                >
                  <X size={12} style={{ color: '#8BA3BE' }} />
                </button>

                <div className="flex items-center gap-2 mb-1">
                  <Flag size={15} style={{ color: '#00E096' }} />
                  <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '24px', lineHeight: 1, color: '#F0F6FF', letterSpacing: '0.05em' }}>
                    PLANT YOUR FLAG
                  </span>
                </div>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#8BA3BE', letterSpacing: '0.04em', marginBottom: 14, lineHeight: 1.5 }}>
                  Win the game and this block becomes YOUR turf.
                  <span style={{ color: '#F59E0B' }}> 400 T/DAY</span> · challengeable by rivals
                </p>

                <div className="flex gap-2">
                  <motion.button
                    className="flex-1 py-2.5"
                    style={{
                      background: 'linear-gradient(135deg, #00E096, #0099C2)',
                      fontFamily: 'var(--font-arcade)',
                      fontSize: '19px',
                      letterSpacing: '0.12em',
                      color: '#04110C',
                      lineHeight: 1,
                    }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setGameOpen(true)}
                  >
                    LET&apos;S GO
                  </motion.button>
                  <button
                    className="px-4 py-2.5"
                    style={{
                      border: '1px solid rgba(240,246,255,0.16)',
                      fontFamily: 'var(--font-arcade)',
                      fontSize: '16px',
                      letterSpacing: '0.1em',
                      color: '#8BA3BE',
                      lineHeight: 1,
                    }}
                    onClick={cancel}
                  >
                    BAIL
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {gameOpen && plantSite && (
        <GameArena
          zoneName="New Turf"
          ownerHandle={null}
          difficulty={0.25}
          onWin={handleWin}
          onLose={handleLose}
          onAbort={cancel}
        />
      )}
    </>
  );
}
