'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Waves, AlertCircle, Lock } from 'lucide-react';
import { useGameStore } from '@/store/game';
import { randomPlayerColor, randomPattern, formatTokens } from '@/lib/utils';
import { savePlayer } from '@/lib/storage';
import type { PlayerTier } from '@/types';

type Step = 'welcome' | 'handle' | 'pin-set' | 'pin-verify' | 'tagging' | 'error';

export default function Onboarding() {
  const [step, setStep] = useState<Step>('welcome');
  const [handle, setHandle] = useState('');
  const [pin, setPin] = useState('');
  const [handleError, setHandleError] = useState('');
  const [pinError, setPinError] = useState('');
  const [apiError, setApiError] = useState('');
  const [checking, setChecking] = useState(false);
  const { setPlayer, setPhase } = useGameStore();
  const handleRef = useRef<HTMLInputElement>(null);
  const pinRef = useRef<HTMLInputElement>(null);

  function handleEnter() {
    setStep('handle');
    setTimeout(() => handleRef.current?.focus(), 100);
  }

  async function handleContinue() {
    const trimmed = handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (trimmed.length < 2) {
      setHandleError('Handle must be at least 2 characters');
      return;
    }
    setHandleError('');
    setChecking(true);
    try {
      const res = await fetch(`/api/game/players?handle=${encodeURIComponent(trimmed)}`);
      const { exists } = await res.json();
      setChecking(false);
      if (exists) {
        // Handle taken — ask for their PIN to log in
        setStep('pin-verify');
      } else {
        // Handle available — ask them to set a PIN
        setStep('pin-set');
      }
      setTimeout(() => pinRef.current?.focus(), 100);
    } catch {
      setChecking(false);
      setHandleError('Could not check handle — try again');
    }
  }

  async function handleSubmitPin() {
    if (pin.length < 4) {
      setPinError('PIN must be 4 digits');
      return;
    }
    setPinError('');
    setStep('tagging');

    const h = handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');

    if (step === 'pin-verify') {
      // Returning player on new device
      try {
        const res = await fetch('/api/game/players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ handle: h, pin }),
        });
        const data = await res.json();
        if (!res.ok) {
          setApiError(data.error ?? 'Incorrect PIN');
          setStep('pin-verify');
          setPinError(data.error ?? 'Incorrect PIN');
          return;
        }
        finishLogin(data.player, true);
      } catch {
        setApiError('Could not connect. Try again.');
        setStep('error');
      }
    } else {
      // New player
      locateAndCreate(h);
    }
  }

  async function createPlayer(h: string, lat: number, lng: number) {
    const res = await fetch('/api/game/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handle: h,
        avatar_color: randomPlayerColor(),
        avatar_pattern: randomPattern(),
        pin,
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

    const { player } = await res.json();
    finishLogin(player, false);
  }

  function finishLogin(player: Record<string, unknown>, returning: boolean) {
    const playerCard = {
      id: player.id as string,
      handle: player.handle as string,
      avatar_color: player.avatar_color as string,
      avatar_pattern: player.avatar_pattern as string,
      origin_zone_id: (player.origin_zone_id as string) ?? null,
      tide_tokens: player.tide_tokens as number,
      tier: player.tier as PlayerTier,
      reputation: player.reputation as number,
      zones_owned: player.zones_owned as number,
      assets_owned: player.assets_owned as number,
      traces_left: player.traces_left as number,
      traces_received: player.traces_received as number,
      created_at: player.created_at as string,
      last_active: player.last_active as string,
      geo_lat: null,
      geo_lng: null,
    };
    setPlayer(playerCard);
    savePlayer(playerCard);
    setTimeout(() => setPhase('exploring'), returning ? 600 : 1400);
  }

  function locateAndCreate(h: string) {
    const fallback = { lat: -6.8160, lng: 39.2803 };
    if (!navigator.geolocation) { createPlayer(h, fallback.lat, fallback.lng); return; }
    const timer = setTimeout(() => createPlayer(h, fallback.lat, fallback.lng), 5000);
    navigator.geolocation.getCurrentPosition(
      (pos) => { clearTimeout(timer); createPlayer(h, pos.coords.latitude, pos.coords.longitude); },
      () => { clearTimeout(timer); createPlayer(h, fallback.lat, fallback.lng); },
      { timeout: 4500, maximumAge: 60000 }
    );
  }

  const slideIn = { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -16 }, transition: { duration: 0.35 } };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center">
      <motion.div
        className="absolute inset-0"
        style={{ background: 'rgba(244,247,255,0.88)', backdropFilter: 'blur(6px)' }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      />

      <AnimatePresence mode="wait">
        {/* ── Welcome ── */}
        {step === 'welcome' && (
          <motion.div key="welcome" {...slideIn} className="relative z-10 flex flex-col items-center gap-6 px-8 text-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl"
              style={{ background: 'rgba(0,153,194,0.1)', border: '1px solid rgba(0,153,194,0.25)' }}>
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
            <motion.button onClick={handleEnter} className="mt-2 px-8 py-3 rounded-xl text-sm font-semibold"
              style={{ background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)', color: '#fff', fontFamily: 'var(--font-display)', letterSpacing: '0.01em', boxShadow: '0 4px 16px rgba(0,153,194,0.25)' }}
              whileTap={{ scale: 0.97 }}>
              Enter the City
            </motion.button>
          </motion.div>
        )}

        {/* ── Handle ── */}
        {step === 'handle' && (
          <motion.div key="handle" {...slideIn} className="relative z-10 flex flex-col gap-5 px-8 w-full max-w-sm">
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '24px', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                Claim your handle
              </h2>
              <p style={{ marginTop: '4px', fontSize: '13px', color: 'var(--text-muted)' }}>
                It's yours forever — no one else can take it.
              </p>
            </div>

            <div className="flex items-center gap-2 px-4 py-3 rounded-xl"
              style={{ background: 'var(--surface-panel)', border: '1px solid rgba(0,153,194,0.3)', boxShadow: 'var(--shadow-card)' }}>
              <span style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-mono)' }}>@</span>
              <input
                ref={handleRef}
                value={handle}
                onChange={(e) => { setHandle(e.target.value); setHandleError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
                placeholder="your_handle"
                maxLength={20}
                className="flex-1 bg-transparent outline-none text-base"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', caretColor: 'var(--color-primary)' }}
              />
            </div>

            {handleError && <p style={{ fontSize: '13px', color: 'var(--color-danger)' }}>{handleError}</p>}

            <div className="flex items-center justify-between px-4 py-3 rounded-xl"
              style={{ background: 'rgba(217,119,6,0.07)', border: '1px solid rgba(217,119,6,0.18)' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Starting capital</span>
              <span style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '14px' }}>
                {formatTokens(100_000)} Tide
              </span>
            </div>

            <motion.button onClick={handleContinue} disabled={checking} className="py-3 rounded-xl text-sm font-semibold"
              style={{
                background: handle.trim().length >= 2 && !checking
                  ? 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)'
                  : 'var(--surface-subtle)',
                color: handle.trim().length >= 2 && !checking ? '#fff' : 'var(--text-muted)',
                fontFamily: 'var(--font-display)',
                transition: 'all 0.2s',
                boxShadow: handle.trim().length >= 2 && !checking ? '0 4px 16px rgba(0,153,194,0.25)' : 'none',
              }}
              whileTap={{ scale: 0.97 }}>
              {checking ? 'Checking…' : 'Continue'}
            </motion.button>
          </motion.div>
        )}

        {/* ── Set PIN (new player) ── */}
        {step === 'pin-set' && (
          <motion.div key="pin-set" {...slideIn} className="relative z-10 flex flex-col gap-5 px-8 w-full max-w-sm">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl"
                style={{ background: 'rgba(0,153,194,0.1)', border: '1px solid rgba(0,153,194,0.25)', flexShrink: 0 }}>
                <Lock size={18} style={{ color: 'var(--color-primary)' }} />
              </div>
              <div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '22px', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  Secure @{handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')}
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Set a 4-digit PIN — you'll need it on new devices
                </p>
              </div>
            </div>

            <PinInput value={pin} onChange={(v) => { setPin(v); setPinError(''); }} inputRef={pinRef} onSubmit={handleSubmitPin} />

            {pinError && <p style={{ fontSize: '13px', color: 'var(--color-danger)' }}>{pinError}</p>}

            <motion.button onClick={handleSubmitPin} disabled={pin.length < 4} className="py-3 rounded-xl text-sm font-semibold"
              style={{
                background: pin.length >= 4 ? 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)' : 'var(--surface-subtle)',
                color: pin.length >= 4 ? '#fff' : 'var(--text-muted)',
                fontFamily: 'var(--font-display)',
                transition: 'all 0.2s',
                boxShadow: pin.length >= 4 ? '0 4px 16px rgba(0,153,194,0.25)' : 'none',
              }}
              whileTap={{ scale: 0.97 }}>
              Plant My Tag
            </motion.button>
            <button onClick={() => { setStep('handle'); setPin(''); }} style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
              ← Change handle
            </button>
          </motion.div>
        )}

        {/* ── Verify PIN (returning player, new device) ── */}
        {step === 'pin-verify' && (
          <motion.div key="pin-verify" {...slideIn} className="relative z-10 flex flex-col gap-5 px-8 w-full max-w-sm">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl"
                style={{ background: 'rgba(109,40,217,0.1)', border: '1px solid rgba(109,40,217,0.25)', flexShrink: 0 }}>
                <Lock size={18} style={{ color: 'var(--color-accent)' }} />
              </div>
              <div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '22px', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  Welcome back
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  @{handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')} is taken — enter your PIN to log in
                </p>
              </div>
            </div>

            <PinInput value={pin} onChange={(v) => { setPin(v); setPinError(''); }} inputRef={pinRef} onSubmit={handleSubmitPin} />

            {pinError && <p style={{ fontSize: '13px', color: 'var(--color-danger)' }}>{pinError}</p>}

            <motion.button onClick={handleSubmitPin} disabled={pin.length < 4} className="py-3 rounded-xl text-sm font-semibold"
              style={{
                background: pin.length >= 4 ? 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-primary) 100%)' : 'var(--surface-subtle)',
                color: pin.length >= 4 ? '#fff' : 'var(--text-muted)',
                fontFamily: 'var(--font-display)',
                transition: 'all 0.2s',
                boxShadow: pin.length >= 4 ? '0 4px 16px rgba(109,40,217,0.25)' : 'none',
              }}
              whileTap={{ scale: 0.97 }}>
              Enter the City
            </motion.button>
            <button onClick={() => { setStep('handle'); setPin(''); setPinError(''); }} style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
              ← Not you?
            </button>
          </motion.div>
        )}

        {/* ── Tagging ── */}
        {step === 'tagging' && (
          <motion.div key="tagging" className="relative z-10 flex flex-col items-center gap-5 px-8 text-center"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
            <motion.div className="w-16 h-16 rounded-full border-2"
              style={{ borderColor: 'var(--color-primary)', background: 'rgba(0,153,194,0.1)' }}
              animate={{ scale: [1, 1.15, 1], opacity: [0.8, 1, 0.8] }}
              transition={{ duration: 1.4, repeat: Infinity }} />
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>
              Planting your tag in the city…
            </p>
          </motion.div>
        )}

        {/* ── Error ── */}
        {step === 'error' && (
          <motion.div key="error" className="relative z-10 flex flex-col items-center gap-5 px-8 text-center"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
            <AlertCircle size={40} style={{ color: 'var(--color-danger)' }} />
            <div>
              <p style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '18px', color: 'var(--text-primary)', marginBottom: '6px' }}>
                Connection failed
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{apiError}</p>
            </div>
            <button onClick={() => { setStep('handle'); setApiError(''); }}
              className="px-6 py-3 rounded-xl"
              style={{ background: 'var(--surface-subtle)', border: '1px solid var(--border-mid)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
              TRY AGAIN
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── PIN dot-input component ─────────────────────────────────────────────────
function PinInput({ value, onChange, inputRef, onSubmit }: {
  value: string;
  onChange: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSubmit: () => void;
}) {
  return (
    <div className="relative flex flex-col items-center gap-4">
      {/* Visual dots */}
      <div className="flex gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{
              background: 'var(--surface-panel)',
              border: `1.5px solid ${i < value.length ? 'var(--color-primary)' : 'var(--border-mid)'}`,
              transition: 'border-color 0.15s',
            }}>
            {value[i] ? (
              <div className="w-3 h-3 rounded-full" style={{ background: 'var(--color-primary)' }} />
            ) : null}
          </div>
        ))}
      </div>
      {/* Hidden native input captures keyboard input */}
      <input
        ref={inputRef}
        type="tel"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        value={value}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 4);
          onChange(v);
          if (v.length === 4) setTimeout(onSubmit, 160);
        }}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
        className="absolute opacity-0 w-full h-full cursor-default"
        style={{ top: 0, left: 0 }}
        autoComplete="off"
      />
    </div>
  );
}
