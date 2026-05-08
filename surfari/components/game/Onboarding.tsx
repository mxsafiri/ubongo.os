'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Waves } from 'lucide-react';
import { useGameStore } from '@/store/game';
import { randomPlayerColor, randomPattern, formatTokens } from '@/lib/utils';

type Step = 'welcome' | 'handle' | 'tagging';

export default function Onboarding() {
  const [step, setStep] = useState<Step>('welcome');
  const [handle, setHandle] = useState('');
  const [error, setError] = useState('');
  const { setPlayer, setPhase } = useGameStore();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleEnter() {
    setStep('handle');
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function handlePlantTag() {
    const trimmed = handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (trimmed.length < 2) {
      setError('Handle must be at least 2 characters');
      return;
    }
    setError('');
    setStep('tagging');
    locateAndCreate(trimmed);
  }

  function locateAndCreate(h: string) {
    const fallback = { lat: -6.8160, lng: 39.2803 };

    const create = (lat: number, lng: number) => {
      const player = {
        id: `player-${Date.now()}`,
        handle: h,
        avatar_color: randomPlayerColor(),
        avatar_pattern: randomPattern(),
        origin_zone_id: null,
        tide_tokens: 100_000,
        tier: 'surfari' as const,
        reputation: 0,
        zones_owned: 0,
        assets_owned: 0,
        traces_left: 0,
        traces_received: 0,
        created_at: new Date().toISOString(),
        last_active: new Date().toISOString(),
        geo_lat: lat,
        geo_lng: lng,
      };
      setPlayer(player);
      setTimeout(() => setPhase('exploring'), 2000);
    };

    if (!navigator.geolocation) {
      create(fallback.lat, fallback.lng);
      return;
    }

    const timer = setTimeout(() => create(fallback.lat, fallback.lng), 5000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        create(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        clearTimeout(timer);
        create(fallback.lat, fallback.lng);
      },
      { timeout: 4500, maximumAge: 60000 }
    );
  }

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center">
      {/* Dark overlay */}
      <motion.div
        className="absolute inset-0"
        style={{ background: 'rgba(6,8,16,0.85)', backdropFilter: 'blur(4px)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      />

      <AnimatePresence mode="wait">
        {step === 'welcome' && (
          <motion.div
            key="welcome"
            className="relative z-10 flex flex-col items-center gap-6 px-8 text-center"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl"
              style={{ background: 'rgba(0,194,255,0.12)', border: '1px solid rgba(0,194,255,0.3)' }}>
              <Waves size={32} style={{ color: '#00C2FF' }} />
            </div>

            <div>
              <h1
                className="text-4xl font-bold tracking-tight"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
              >
                Surfari
              </h1>
              <p className="mt-2 text-base" style={{ color: 'var(--text-secondary)' }}>
                Own the city. Ride every zone.
              </p>
            </div>

            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              <span
                className="inline-block w-2 h-2 rounded-full animate-pulse"
                style={{ background: '#00E096' }}
              />
              The city is already moving
            </div>

            <motion.button
              onClick={handleEnter}
              className="mt-2 px-8 py-3 rounded-xl text-sm font-semibold tracking-wide"
              style={{
                background: 'linear-gradient(135deg, #00C2FF 0%, #7C5CFC 100%)',
                color: '#F0F4FF',
                fontFamily: 'var(--font-body)',
              }}
              whileTap={{ scale: 0.97 }}
              whileHover={{ opacity: 0.9 }}
            >
              Enter the City
            </motion.button>
          </motion.div>
        )}

        {step === 'handle' && (
          <motion.div
            key="handle"
            className="relative z-10 flex flex-col gap-5 px-8 w-full max-w-sm"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.4 }}
          >
            <h2
              className="text-2xl font-bold"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
            >
              Claim your handle
            </h2>

            <div
              className="flex items-center gap-2 px-4 py-3 rounded-xl"
              style={{
                background: 'rgba(17,24,39,0.8)',
                border: '1px solid rgba(0,194,255,0.25)',
              }}
            >
              <span style={{ color: '#00C2FF', fontFamily: 'var(--font-mono)' }}>@</span>
              <input
                ref={inputRef}
                value={handle}
                onChange={(e) => { setHandle(e.target.value); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handlePlantTag()}
                placeholder="your_handle"
                maxLength={20}
                className="flex-1 bg-transparent outline-none text-base"
                style={{
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  caretColor: '#00C2FF',
                }}
              />
            </div>

            {error && (
              <p className="text-sm" style={{ color: '#FF4757' }}>{error}</p>
            )}

            <div
              className="flex items-center justify-between px-4 py-3 rounded-xl text-sm"
              style={{ background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.2)' }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>Starting capital</span>
              <span style={{ color: '#FFB800', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                {formatTokens(100_000)} Tide
              </span>
            </div>

            <motion.button
              onClick={handlePlantTag}
              className="py-3 rounded-xl text-sm font-semibold tracking-wide"
              style={{
                background: handle.trim().length >= 2
                  ? 'linear-gradient(135deg, #00C2FF 0%, #7C5CFC 100%)'
                  : 'rgba(74,90,122,0.4)',
                color: handle.trim().length >= 2 ? '#F0F4FF' : 'var(--text-muted)',
                fontFamily: 'var(--font-body)',
                transition: 'background 0.2s',
              }}
              whileTap={{ scale: 0.97 }}
            >
              Plant My Tag
            </motion.button>
          </motion.div>
        )}

        {step === 'tagging' && (
          <motion.div
            key="tagging"
            className="relative z-10 flex flex-col items-center gap-5 px-8 text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <motion.div
              className="w-16 h-16 rounded-full"
              style={{ background: 'rgba(0,194,255,0.15)', border: '2px solid #00C2FF' }}
              animate={{ scale: [1, 1.15, 1], opacity: [0.8, 1, 0.8] }}
              transition={{ duration: 1.4, repeat: Infinity }}
            />
            <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
              Planting your tag in the city…
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
