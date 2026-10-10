'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useGameStore } from '@/store/game';
import { TRAVEL, placeById, travelFare, travelSeconds, type TravelModeId } from '@/lib/game/places';
import { fullPay, rankTitle } from '@/lib/game/work';
import { sfx } from '@/lib/game/sfx';
import { fmtDistance, useDistanceTo } from './useLife';

/**
 * A place: what it is, how far, how to get there — and once you're there,
 * the work it offers. Floats over the map on desktop and phones alike.
 */
export function PlaceCard() {
  const placeId = useGameStore((s) => s.life.selectedPlaceId);
  const hereId = useGameStore((s) => s.life.hereId);
  const shift = useGameStore((s) => s.life.shift);
  const xp = useGameStore((s) => s.life.xp);
  const traveling = useGameStore((s) => !!s.life.travel);
  const tide = useGameStore((s) => s.player?.tide_tokens ?? 0);
  const selectPlace = useGameStore((s) => s.selectPlace);
  const requestTravel = useGameStore((s) => s.requestTravel);
  const startShift = useGameStore((s) => s.startShift);
  const setActiveTab = useGameStore((s) => s.setActiveTab);
  const addNotification = useGameStore((s) => s.addNotification);
  const dist = useDistanceTo(placeId);
  const [starting, setStarting] = useState<string | null>(null);

  const place = placeId ? placeById[placeId] : null;
  if (!place) return null;
  const here = hereId === place.id;

  const go = (mode: TravelModeId) => {
    sfx.whoosh();
    requestTravel(place.id, mode);
  };

  const start = async (jobId: string) => {
    setStarting(jobId);
    const err = await startShift(jobId);
    setStarting(null);
    if (err) {
      addNotification({ type: 'system', title: 'Can’t start', message: err });
      sfx.miss();
      return;
    }
    sfx.roundWin();
    selectPlace(null);
    if (window.innerWidth >= 1024) setActiveTab('work');
  };

  return (
    <motion.div
      key={place.id}
      className="absolute z-[26] left-3 right-3 lg:right-auto lg:w-[380px]"
      style={{ bottom: 'calc(var(--screen-pad-bottom, 24px) + 72px)' }}
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
    >
      <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-mid)', borderRadius: 18, boxShadow: 'var(--shadow-popup)', padding: 16, backdropFilter: 'blur(12px)' }}>
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center flex-shrink-0" style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(0,194,255,0.12)', fontSize: 26 }}>{place.icon}</div>
          <div className="flex-1 min-w-0">
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: 22, letterSpacing: '0.04em', color: 'var(--text-primary)', lineHeight: 1.05 }}>{place.name.toUpperCase()}</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', color: 'var(--text-muted)', marginTop: 3 }}>
              {place.district.toUpperCase()}{here ? ' · YOU ARE HERE' : dist !== null ? ` · ${fmtDistance(dist)} AWAY` : ''}
            </p>
          </div>
          <button onClick={() => selectPlace(null)} aria-label="Close" style={{ padding: 4, color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 10, lineHeight: 1.45 }}>{place.blurb}</p>

        {!here && shift && (
          <p className="mt-3" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-gold)', lineHeight: 1.5 }}>
            You&apos;re on a shift — clock out before heading off.
          </p>
        )}
        {!here && !shift && (
          <div className="flex gap-2 mt-3">
            {(Object.keys(TRAVEL) as TravelModeId[]).map((m) => {
              const t = TRAVEL[m];
              const d = dist ?? 3000;
              const fare = travelFare(m, d);
              const short = fare > tide;
              return (
                <button key={m} onClick={() => go(m)} disabled={traveling || short}
                  className="flex-1 flex flex-col items-center gap-0.5"
                  style={{
                    padding: '10px 8px', borderRadius: 12,
                    background: m === 'walk' ? 'transparent' : 'linear-gradient(135deg, rgba(0,194,255,0.18), rgba(124,92,252,0.18))',
                    border: `1px solid ${m === 'walk' ? 'var(--border-mid)' : 'rgba(0,194,255,0.45)'}`,
                    opacity: traveling || short ? 0.45 : 1,
                  }}>
                  <span style={{ fontSize: 18 }}>{t.emoji}</span>
                  <span style={{ fontFamily: 'var(--font-arcade)', fontSize: 15, letterSpacing: '0.1em', color: 'var(--text-primary)' }}>{t.label.toUpperCase()}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                    {fare === 0 ? 'FREE' : `${fare} TIDE`} · ~{Math.round(travelSeconds(m, d))}s
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Work here */}
        <div className="flex flex-col gap-2 mt-3">
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', color: 'var(--text-muted)' }}>KAZI HAPA · WORK HERE</p>
          {place.jobs.map((job) => {
            const done = xp[job.id] ?? 0;
            const pay = fullPay(job, { perf: 50, goodDone: 0 }, done);
            const onThis = shift?.jobId === job.id;
            return (
              <div key={job.id} className="flex items-center gap-3" style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: 20 }}>{job.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{rankTitle(job, done)}</p>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                    ~{pay} TIDE · {Math.round(job.shiftS / 60 * 10) / 10} MIN · {done} SHIFTS
                  </p>
                </div>
                {onThis ? (
                  <button onClick={() => { selectPlace(null); setActiveTab('work'); }} style={{ fontFamily: 'var(--font-arcade)', fontSize: 14, letterSpacing: '0.1em', color: 'var(--color-primary)' }}>ON SHIFT →</button>
                ) : (
                  <button onClick={() => start(job.id)} disabled={!here || !!shift || starting !== null}
                    title={!here ? 'Go there first' : shift ? 'Finish your current shift first' : ''}
                    style={{
                      padding: '8px 12px', borderRadius: 10, fontFamily: 'var(--font-arcade)', fontSize: 14, letterSpacing: '0.1em',
                      background: here && !shift ? 'linear-gradient(135deg, #00E096, #00C2FF)' : 'var(--surface-subtle)',
                      color: here && !shift ? '#04121C' : 'var(--text-muted)',
                      border: here && !shift ? 'none' : '1px solid var(--border-mid)',
                    }}>
                    {starting === job.id ? '…' : here ? 'ANZA KAZI' : 'GO THERE'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
