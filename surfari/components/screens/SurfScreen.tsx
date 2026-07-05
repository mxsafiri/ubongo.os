'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Waves, MapPin, TrendingUp, Shield, Zap } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useGameStore, selectSelectedZone } from '@/store/game';
import { ZONE_TIER_COLORS } from '@/lib/game/zones';
import { formatTokens } from '@/lib/utils';
import { GameArena } from '@/components/game/GameArena';

const TIER_LABELS: Record<string, string> = {
  crown: 'Crown', jungle_deep: 'Jungle Deep', coral_ridge: 'Coral Ridge',
  savanna: 'Savanna', shoreline: 'Shoreline',
};

const slideUp = {
  initial: { opacity: 0, y: 32 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 24 },
  transition: { type: 'spring' as const, stiffness: 340, damping: 34 },
};

function getDifficulty(claimStrength: number, isClaimed: boolean): number {
  if (!isClaimed) return 0.15;
  if (claimStrength >= 70) return 0.9;
  if (claimStrength >= 40) return 0.65;
  return 0.45;
}

// Building your own turf gets harder as it levels — expanding an empire costs sweat
function getBuildDifficulty(level: number): number {
  return Math.min(0.2 + (level - 1) * 0.15, 0.8);
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
const MAX_LEVEL = 5;

type Action = 'claim' | 'challenge' | 'build';

export function SurfScreen() {
  const zone = useGameStore(selectSelectedZone);
  const setActiveTab = useGameStore((s) => s.setActiveTab);
  const selectZone = useGameStore((s) => s.selectZone);
  const surfZone = useGameStore((s) => s.surfZone);
  const buildZone = useGameStore((s) => s.buildZone);
  const addNotification = useGameStore((s) => s.addNotification);
  const player = useGameStore((s) => s.player);

  const [arenaOpen, setArenaOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<Action | null>(null);
  const [result, setResult] = useState<'win' | 'lose' | 'claimed' | 'built' | 'reinforced' | null>(null);

  const openGame = (action: Action) => {
    setPendingAction(action);
    setResult(null);
    setArenaOpen(true);
  };

  const closeArena = () => {
    setArenaOpen(false);
    setPendingAction(null);
  };

  const handleWin = useCallback(async () => {
    if (!player || !zone) return;
    const action = pendingAction;
    closeArena();

    // ── Build & Defend: owner won the build game ──
    if (action === 'build') {
      const level = zone.level ?? 1;
      if (level < MAX_LEVEL) {
        const ok = await buildZone(zone.id);
        const updated = useGameStore.getState().selected_zone;
        if (ok && updated) {
          setResult('built');
          addNotification({
            type: 'zone_claimed',
            title: `🏗️ ${zone.name} → LVL ${ROMAN[(updated.level ?? 2) - 1]}`,
            message: `Yield up to ${formatTokens(updated.daily_yield)}/day. Strength ${updated.claim_strength}%.`,
          });
          postEvent(null, player, `🏗️ @${player.handle} built ${zone.name} up to LVL ${ROMAN[(updated.level ?? 2) - 1]} — now worth ${formatTokens(updated.daily_yield)}/day`, null);
        } else {
          setResult('lose');
          addNotification({
            type: 'system',
            title: 'Build failed',
            message: 'Not enough Tide, or the zone is maxed out.',
          });
        }
      } else {
        // Maxed — the win still hardens the walls
        await surfZone(zone.id);
        const updated = useGameStore.getState().selected_zone;
        setResult('reinforced');
        addNotification({
          type: 'zone_claimed',
          title: '🛡️ Turf defended',
          message: `${zone.name} strength is now ${updated?.claim_strength ?? 0}%.`,
        });
      }
      setTimeout(() => setResult(null), 3000);
      return;
    }

    const prevOwnerId = zone.owner_id;
    await surfZone(zone.id);
    const updatedZone = useGameStore.getState().selected_zone;
    const nowOwned = updatedZone?.owner_id === player.id;

    if (!prevOwnerId) {
      setResult('claimed');
      addNotification({
        type: 'zone_claimed',
        title: `🏴 ${zone.name} is yours!`,
        message: `+${formatTokens(zone.daily_yield)} Tide per day starting now.`,
      });
      postEvent(zone.id, player, `🏴 @${player.handle} claimed this zone`, null);
      postEvent(null, player, `🏴 @${player.handle} just claimed ${zone.name}!`, null);
    } else if (nowOwned) {
      setResult('win');
      addNotification({
        type: 'zone_claimed',
        title: `⚔️ Victory! ${zone.name} is yours`,
        message: `You defeated @${zone.owner_handle} and claimed the zone.`,
      });
      postEvent(zone.id, player, `⚔️ @${player.handle} defeated @${zone.owner_handle} and seized this zone`, null);
      postEvent(null, player, `⚔️ @${player.handle} just took ${zone.name} from @${zone.owner_handle}!`, null);
    } else {
      setResult('lose');
      addNotification({
        type: 'zone_contested',
        title: '⚔️ So close!',
        message: `${zone.owner_handle} held their ground. Zone was too fortified.`,
      });
      postEvent(zone.id, player, `⚔️ @${player.handle} attacked but ${zone.name} held firm`, null);
    }

    setTimeout(() => setResult(null), 3000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, zone, pendingAction]);

  const handleLose = useCallback(() => {
    if (!zone || !player) return;
    const action = pendingAction;
    closeArena();
    setResult('lose');
    addNotification({
      type: 'zone_contested',
      title: action === 'build' ? '🚧 Build crew got jumped' : zone.owner_id ? '💨 Challenge failed' : '💨 Missed your shot',
      message: action === 'build'
        ? 'No progress this time. Run it back — the turf holds.'
        : zone.owner_id
        ? `${zone.owner_handle} held their ground. Try again.`
        : `The zone slipped away. Still up for grabs — try again!`,
    });
    setTimeout(() => setResult(null), 3000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone, player, pendingAction]);

  const handleAbort = useCallback(() => {
    closeArena();
  }, []);

  if (!zone) {
    return (
      <motion.div
        className="absolute inset-0 z-[15] flex flex-col items-center justify-center"
        style={{ paddingTop: 'var(--screen-pad-top)', paddingBottom: 'var(--screen-pad-bottom)' }}
        {...slideUp}
      >
        <div className="flex flex-col items-center gap-5 px-8 text-center">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
            style={{ background: 'rgba(0,153,194,0.08)', border: '1px solid rgba(0,153,194,0.18)' }}>
            <MapPin size={32} style={{ color: 'var(--color-primary)', opacity: 0.7 }} />
          </div>
          <div>
            <p style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '20px', color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: '8px' }}>
              No zone selected
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Open the map, tap any glowing zone dot, then come back here to surf it.
            </p>
          </div>
          <button
            onClick={() => setActiveTab('map')}
            className="px-6 py-3 rounded-xl"
            style={{ background: 'rgba(0,153,194,0.08)', border: '1px solid rgba(0,153,194,0.22)', color: 'var(--color-primary)', fontFamily: 'var(--font-mono)', fontSize: '12px', letterSpacing: '0.08em' }}
          >
            OPEN MAP
          </button>
        </div>
      </motion.div>
    );
  }

  const tierColor = ZONE_TIER_COLORS[zone.tier] ?? '#3D5470';
  const isClaimed = !!zone.owner_id;
  const isOwn = !!(player && zone.owner_id === player.id);
  const level = zone.level ?? 1;
  const isMaxed = level >= MAX_LEVEL;
  const buildCost = level * 200;
  const difficulty = getDifficulty(zone.claim_strength ?? 0, isClaimed);
  const arenaDifficulty = pendingAction === 'build' ? getBuildDifficulty(level) : difficulty;

  return (
    <>
      <motion.div
        className="absolute inset-0 z-[15] flex flex-col justify-end"
        style={{ paddingBottom: 'var(--screen-pad-bottom)' }}
        {...slideUp}
      >
        <div className="mx-4 rounded-3xl overflow-hidden"
          style={{ background: 'var(--surface-card)', border: `1px solid ${tierColor}22`, backdropFilter: 'blur(24px)', boxShadow: `var(--shadow-popup), 0 0 0 1px ${tierColor}10` }}>
          <div style={{ height: 3, background: `linear-gradient(90deg, ${tierColor}, transparent)` }} />
          <div className="px-5 pt-4 pb-5">
            <div className="flex items-start justify-between mb-3">
              <span className="px-2 py-0.5 rounded-md"
                style={{ background: `${tierColor}14`, border: `1px solid ${tierColor}35`, color: tierColor, fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.08em' }}>
                {TIER_LABELS[zone.tier]?.toUpperCase()}
              </span>
              <button onClick={() => selectZone(null)} style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>CLEAR</button>
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '22px', color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: '2px' }}>
              {zone.name}
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              {zone.district} · {zone.type.replace(/_/g, ' ')}
            </p>

            <div className="grid grid-cols-2 gap-2.5 mb-4">
              <StatTile icon={<TrendingUp size={12} />} label="DAILY YIELD" value={formatTokens(zone.daily_yield)} color="var(--color-gold)" />
              <StatTile icon={<Shield size={12} />} label={isClaimed ? 'OWNER' : 'STATUS'} value={isClaimed ? `@${zone.owner_handle}` : 'Unclaimed'} color={isClaimed ? 'var(--color-accent)' : 'var(--text-secondary)'} />
            </div>

            {isClaimed && (
              <div className="mb-4 px-3 py-2.5 rounded-xl" style={{ background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center justify-between mb-2">
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>CLAIM STRENGTH</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{zone.claim_strength}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full" style={{ background: 'var(--border-mid)' }}>
                  <div className="h-full rounded-full" style={{
                    width: `${zone.claim_strength}%`,
                    background: (zone.claim_strength ?? 0) >= 70 ? 'var(--color-success)' : (zone.claim_strength ?? 0) >= 40 ? 'var(--color-warning)' : 'var(--color-danger)',
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              </div>
            )}

            {/* Result toast */}
            <AnimatePresence>
              {result && (
                <motion.div
                  className="mb-3 px-4 py-3 rounded-2xl flex items-center gap-3"
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4 }}
                  style={{
                    background: result === 'lose'
                      ? 'rgba(239,68,68,0.08)'
                      : 'rgba(0,224,150,0.08)',
                    border: `1px solid ${result === 'lose' ? 'rgba(239,68,68,0.25)' : 'rgba(0,224,150,0.25)'}`,
                  }}
                >
                  <span style={{ fontSize: '24px' }}>
                    {result === 'win' ? '🏆' : result === 'claimed' ? '🏴' : result === 'built' ? '🏗️' : result === 'reinforced' ? '🛡️' : '💨'}
                  </span>
                  <div>
                    <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)', marginBottom: 2 }}>
                      {result === 'win' ? 'Zone Captured!' : result === 'claimed' ? 'Zone Claimed!'
                        : result === 'built' ? `Built to LVL ${ROMAN[level - 1]}!`
                        : result === 'reinforced' ? 'Turf Defended!' : 'Repelled!'}
                    </p>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {result === 'win' ? `+${formatTokens(zone.daily_yield)} Tide/day`
                        : result === 'claimed' ? `Earning ${formatTokens(zone.daily_yield)} Tide/day`
                        : result === 'built' ? `Now ${formatTokens(zone.daily_yield)}/day · strength ${zone.claim_strength}%`
                        : result === 'reinforced' ? `Strength at ${zone.claim_strength}%`
                        : 'Come back stronger next time'}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {!player ? (
              <p style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)', padding: '14px 0' }}>Sign in to surf zones</p>
            ) : isOwn ? (
              <div className="flex flex-col gap-2.5">
                {/* Level plate + next-level preview */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center px-3 py-1.5"
                    style={{ border: '1.5px solid var(--color-gold)', background: 'rgba(245,158,11,0.07)' }}>
                    <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '18px', lineHeight: 1, color: 'var(--color-gold)', letterSpacing: '0.1em' }}>
                      LVL {ROMAN[level - 1]}
                    </span>
                  </div>
                  <div className="flex-1 flex gap-1">
                    {Array.from({ length: MAX_LEVEL }, (_, i) => (
                      <div key={i} className="flex-1 h-1.5" style={{
                        background: i < level ? 'linear-gradient(90deg, var(--color-gold), var(--color-warning))' : 'var(--border-mid)',
                      }} />
                    ))}
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>
                    {isMaxed ? 'MAXED' : `NEXT: +150/d · ${buildCost}T`}
                  </span>
                </div>

                <motion.button
                  className="w-full flex items-center justify-center gap-2.5 rounded-2xl relative overflow-hidden"
                  style={{
                    padding: '14px 20px',
                    background: isMaxed
                      ? 'linear-gradient(135deg, var(--color-accent), var(--color-primary))'
                      : 'linear-gradient(135deg, var(--color-gold) 0%, var(--color-secondary) 100%)',
                    boxShadow: isMaxed ? '0 4px 20px rgba(109,40,217,0.3)' : '0 4px 20px rgba(217,119,6,0.3)',
                  }}
                  whileTap={{ scale: 0.975 }}
                  transition={{ duration: 0.12 }}
                  onClick={() => openGame('build')}
                >
                  <div className="absolute inset-0 pointer-events-none"
                    style={{ background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.12) 50%, transparent 70%)' }} />
                  <Waves size={15} style={{ color: '#fff' }} />
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '14px', color: '#fff', letterSpacing: '0.02em' }}>
                    {isMaxed ? 'Defend Turf' : `Build & Defend — LVL ${ROMAN[level]}`}
                  </span>
                </motion.button>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
                  {isMaxed
                    ? 'Win the game to harden your walls (+10% strength).'
                    : `Win the game to expand. Costs ${buildCost} Tide · yield +150/day · strength +15%.`}
                </p>
              </div>
            ) : (
              <motion.button
                className="w-full flex items-center justify-center gap-2.5 rounded-2xl relative overflow-hidden"
                style={{ padding: '14px 20px', background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)', boxShadow: '0 4px 20px rgba(0,153,194,0.28)' }}
                whileTap={{ scale: 0.975 }}
                transition={{ duration: 0.12 }}
                onClick={() => openGame(isClaimed ? 'challenge' : 'claim')}
              >
                <div className="absolute inset-0 pointer-events-none"
                  style={{ background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%)' }} />
                {isClaimed ? <Zap size={15} style={{ color: '#fff' }} /> : <Waves size={15} style={{ color: '#fff' }} />}
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '14px', color: '#fff', letterSpacing: '0.02em' }}>
                  {isClaimed ? `Challenge @${zone.owner_handle}` : 'Surf This Zone'}
                </span>
              </motion.button>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Full-screen game overlay ── */}
      {arenaOpen && zone && (
        <GameArena
          zoneName={pendingAction === 'build' ? `Build ${zone.name}` : zone.name}
          ownerHandle={pendingAction === 'build' ? null : zone.owner_handle}
          difficulty={arenaDifficulty}
          onWin={handleWin}
          onLose={handleLose}
          onAbort={handleAbort}
        />
      )}
    </>
  );
}

function postEvent(zoneId: string | null, player: { id: string; handle: string; avatar_color: string }, content: string, _: null) {
  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zone_id: zoneId, player_id: player.id, player_handle: player.handle, player_color: player.avatar_color, content, msg_type: 'event' }),
  });
}

function StatTile({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col gap-1.5 px-3 py-3 rounded-xl" style={{ background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center gap-1.5" style={{ color, opacity: 0.85 }}>
        {icon}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.08em' }}>{label}</span>
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}
