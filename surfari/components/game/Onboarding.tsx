'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Waves, AlertCircle } from 'lucide-react';
import { useGameStore } from '@/store/game';
import { randomPlayerColor, randomPattern, formatTokens } from '@/lib/utils';
import { savePlayer } from '@/lib/storage';

type Step = 'welcome' | 'handle' | 'tagging' | 'error';

export default function Onboarding() {
  const [step, setStep] = useState<Step>('welcome');
  const [handle, setHandle] = useState('');
  const [error, setError] = useState('');
  const [apiError, setApiError] = useState('');
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

  async function createPlayer(h: string, lat: number, lng: number) {
    const res = await fetch('/api/game/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handle: h,
        avatar_color: randomPlayerColor(),
        avatar_pattern: randomPattern(),
        geo_lat: lat,
        geo_lng: lng,
      }),
    });

    if (!res.ok) {
      const { error: msg } = await res.json().catch(() => ({ error: 'Unknown error' }));
      setApiError(msg ?? 'Could not connect to the city. Try again.');
      setStep('error');
      return;
    }

    const { player, returning } = await res.json();

    const playerCard = {
      id: player.id,
      handle: player.handle,
      avatar_color: player.avatar_color,
      avatar_pattern: player.avatar_pattern,
      origin_zone_id: player.origin_zone_id ?? null,
      tide_tokens: player.tide_tokens,
      tier: player.tier,
      reputation: player.reputation,
      zones_owned: player.zones_owned,
      assets_owned: player.assets_owned,
      traces_left: player.traces_left,
      traces_received: player.traces_received,
      created_at: player.created_at,
      last_active: player.last_active,
      geo_lat: lat,
      geo_lng: lng,
    };

    setPlayer(playerCard);
    savePlayer(playerCard);

    // Short delay so the tagging animation feels intentional
    setTimeout(() => setPhase('exploring'), returning ? 800 : 1600);
  }

  function locateAndCreate(h: string) {
    const fallback = { lat: -6.8160, lng: 39.2803 };

    if (!navigator.geolocation) {
      createPlayer(h, fallback.lat, fallback.lng);
      return;
    }

    const timer = setTimeout(() => createPlayer(h, fallback.lat, fallback.lng), 5000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        createPlayer(h, pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        clearTimeout(timer);
        createPlayer(h, fallback.lat, fallback.lng);
      },
      { timeout: 4500, maximumAge: 60000 }
    );
  }

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center">
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0"
        style={{ background: 'rgba(244,247,255,0.88)', backdropFilter: 'blur(6px)' }}
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
            <div
              className="flex items-center justify-center w-16 h-16 rounded-2xl"
              style={{ background: 'rgba(0,153,194,0.1)', border: '1px solid rgba(0,153,194,0.25)' }}
            >
              <Waves size={32} style={{ color: 'var(--color-primary)' }} />
            </div>

            <div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '36px', color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>
                Surfari
              </h1>
              <p style={{ marginTop: '6px', fontSize: '15px', color: 'var(--text-secondary)' }}>
                Own the city. Ride every zone.
              </p>
            </div>

            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--color-success)' }} />
              The city is already moving
            </div>

            <motion.button
              onClick={handleEnter}
              className="mt-2 px-8 py-3 rounded-xl text-sm font-semibold"
              style={{
                background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)',
                color: '#fff',
                fontFamily: 'var(--font-display)',
                letterSpacing: '0.01em',
                boxShadow: '0 4px 16px rgba(0,153,194,0.25)',
              }}
              whileTap={{ scale: 0.97 }}
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
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '24px', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Claim your handle
            </h2>

            <div
              className="flex items-center gap-2 px-4 py-3 rounded-xl"
              style={{
                background: 'var(--surface-panel)',
                border: '1px solid rgba(0,153,194,0.3)',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <span style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-mono)' }}>@</span>
              <input
                ref={inputRef}
                value={handle}
                onChange={(e) => { setHandle(e.target.value); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handlePlantTag()}
                placeholder="your_handle"
                maxLength={20}
                className="flex-1 bg-transparent outline-none text-base"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', caretColor: 'var(--color-primary)' }}
              />
            </div>

            {error && (
              <p style={{ fontSize: '13px', color: 'var(--color-danger)' }}>{error}</p>
            )}

            <div
              className="flex items-center justify-between px-4 py-3 rounded-xl"
              style={{ background: 'rgba(217,119,6,0.07)', border: '1px solid rgba(217,119,6,0.18)' }}
            >
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Starting capital</span>
              <span style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '14px' }}>
                {formatTokens(100_000)} Tide
              </span>
            </div>

            <motion.button
              onClick={handlePlantTag}
              className="py-3 rounded-xl text-sm font-semibold"
              style={{
                background: handle.trim().length >= 2
                  ? 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)'
                  : 'var(--surface-subtle)',
                color: handle.trim().length >= 2 ? '#fff' : 'var(--text-muted)',
                fontFamily: 'var(--font-display)',
                transition: 'all 0.2s',
                boxShadow: handle.trim().length >= 2 ? '0 4px 16px rgba(0,153,194,0.25)' : 'none',
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
              className="w-16 h-16 rounded-full border-2"
              style={{ borderColor: 'var(--color-primary)', background: 'rgba(0,153,194,0.1)' }}
              animate={{ scale: [1, 1.15, 1], opacity: [0.8, 1, 0.8] }}
              transition={{ duration: 1.4, repeat: Infinity }}
            />
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>
              Planting your tag in the city…
            </p>
          </motion.div>
        )}

        {step === 'error' && (
          <motion.div
            key="error"
            className="relative z-10 flex flex-col items-center gap-5 px-8 text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <AlertCircle size={40} style={{ color: 'var(--color-danger)' }} />
            <div>
              <p style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '18px', color: 'var(--text-primary)', marginBottom: '6px' }}>
                Connection failed
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{apiError}</p>
            </div>
            <button
              onClick={() => { setStep('handle'); setApiError(''); }}
              className="px-6 py-3 rounded-xl"
              style={{
                background: 'var(--surface-subtle)',
                border: '1px solid var(--border-mid)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
              }}
            >
              TRY AGAIN
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
