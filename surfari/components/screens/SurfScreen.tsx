'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Waves, MapPin, TrendingUp, Shield, X, Zap, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { useGameStore, selectSelectedZone } from '@/store/game';
import { ZONE_TIER_COLORS } from '@/lib/game/zones';
import { formatTokens } from '@/lib/utils';

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

type Sheet = 'claim' | 'reinforce' | 'challenge' | null;

export function SurfScreen() {
  const zone = useGameStore(selectSelectedZone);
  const setActiveTab = useGameStore((s) => s.setActiveTab);
  const selectZone = useGameStore((s) => s.selectZone);
  const surfZone = useGameStore((s) => s.surfZone);
  const addNotification = useGameStore((s) => s.addNotification);
  const player = useGameStore((s) => s.player);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<'win' | 'lose' | 'claimed' | 'reinforced' | null>(null);

  if (!zone) {
    return (
      <motion.div
        className="absolute inset-0 z-[15] flex flex-col items-center justify-center"
        style={{ paddingTop: 'calc(var(--safe-top) + 72px)', paddingBottom: 'calc(var(--safe-bottom) + 88px)' }}
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
              Open the map, tap any glowing zone dot, then come back here to start a challenge.
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
  const claimCost = 1_000;
  const challengeCost = Math.max(500, Math.round(zone.daily_yield * 0.5));

  const handleAction = async () => {
    if (!player) return;
    setLoading(true);
    setResult(null);

    const prevOwnerId = zone.owner_id;
    await surfZone(zone.id);

    const updatedZone = useGameStore.getState().selected_zone;
    const nowOwned = updatedZone?.owner_id === player.id;

    if (isOwn) {
      setResult('reinforced');
      addNotification({
        type: 'zone_claimed',
        title: 'Zone reinforced',
        message: `${zone.name} strength is now ${updatedZone?.claim_strength ?? 0}%`,
      });
    } else if (!prevOwnerId) {
      setResult('claimed');
      addNotification({
        type: 'zone_claimed',
        title: `🏴 ${zone.name} is yours!`,
        message: `+${formatTokens(zone.daily_yield)} Tide per day starting now.`,
      });
      postEvent(zone.id, player, `🏴 @${player.handle} claimed this zone`, null);
      postEvent(null, player, `🏴 @${player.handle} just claimed ${zone.name}!`, null);
    } else {
      const won = nowOwned;
      setResult(won ? 'win' : 'lose');
      addNotification({
        type: won ? 'zone_claimed' : 'zone_contested',
        title: won ? `⚔️ Victory! ${zone.name} is yours` : '⚔️ Challenge failed',
        message: won
          ? `You defeated @${zone.owner_handle} and claimed the zone.`
          : `@${zone.owner_handle} held their ground. Try again later.`,
      });
      const zoneMsg = won
        ? `⚔️ @${player.handle} defeated @${zone.owner_handle} and seized this zone`
        : `⚔️ @${player.handle} challenged @${zone.owner_handle} but was repelled`;
      const cityMsg = won
        ? `⚔️ @${player.handle} just took ${zone.name} from @${zone.owner_handle}!`
        : `💨 @${player.handle} tried to take ${zone.name} from @${zone.owner_handle} — failed`;
      postEvent(zone.id, player, zoneMsg, null);
      postEvent(null, player, cityMsg, null);
    }

    setLoading(false);
    setTimeout(() => { setSheet(null); setResult(null); }, 2200);
  };

  return (
    <>
      <motion.div
        className="absolute inset-0 z-[15] flex flex-col justify-end"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 88px)' }}
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
                    background: zone.claim_strength >= 70 ? 'var(--color-success)' : zone.claim_strength >= 40 ? 'var(--color-warning)' : 'var(--color-danger)',
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              </div>
            )}
            {!player ? (
              <p style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)', padding: '14px 0' }}>Sign in to surf zones</p>
            ) : (
              <motion.button
                className="w-full flex items-center justify-center gap-2.5 rounded-2xl relative overflow-hidden"
                style={{ padding: '14px 20px', background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)', boxShadow: '0 4px 20px rgba(0,153,194,0.28)' }}
                whileTap={{ scale: 0.975 }}
                transition={{ duration: 0.12 }}
                onClick={() => setSheet(isOwn ? 'reinforce' : isClaimed ? 'challenge' : 'claim')}
              >
                <div className="absolute inset-0 pointer-events-none"
                  style={{ background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%)' }} />
                {isClaimed && !isOwn ? <Zap size={15} style={{ color: '#fff' }} /> : <Waves size={15} style={{ color: '#fff' }} />}
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '14px', color: '#fff', letterSpacing: '0.02em' }}>
                  {isOwn ? 'Reinforce Zone' : isClaimed ? `Challenge @${zone.owner_handle}` : 'Claim This Zone'}
                </span>
              </motion.button>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Action sheets ── */}
      <AnimatePresence>
        {sheet && (
          <>
            <motion.div className="absolute inset-0 z-[16]"
              style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => !loading && setSheet(null)} />

            <motion.div
              className="absolute left-4 right-4 z-[17] rounded-3xl overflow-hidden"
              style={{ bottom: 'calc(var(--safe-bottom) + 100px)', background: 'var(--surface-card)', border: `1px solid ${tierColor}30`, boxShadow: 'var(--shadow-popup)' }}
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            >
              <div style={{ height: 3, background: `linear-gradient(90deg, ${tierColor}, transparent)` }} />
              <div className="px-5 pt-5 pb-6 relative">
                {!loading && !result && (
                  <button onClick={() => setSheet(null)}
                    className="absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ background: 'var(--surface-subtle)', border: '1px solid var(--border-mid)' }}>
                    <X size={12} style={{ color: 'var(--text-muted)' }} />
                  </button>
                )}

                {result ? (
                  <div className="flex flex-col items-center gap-3 py-3">
                    <motion.span
                      style={{ fontSize: '52px' }}
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                    >
                      {result === 'win' ? '🏆' : result === 'claimed' ? '🏴' : result === 'reinforced' ? '🛡️' : '💨'}
                    </motion.span>
                    <div className="text-center">
                      <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '20px', color: 'var(--text-primary)', marginBottom: 6 }}>
                        {result === 'win' ? 'Zone Captured!' : result === 'claimed' ? 'Zone Claimed!' : result === 'reinforced' ? 'Reinforced!' : 'Repelled!'}
                      </p>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {result === 'win' ? `${zone.name} is yours. +${formatTokens(zone.daily_yield)}/day`
                          : result === 'claimed' ? `You now earn ${formatTokens(zone.daily_yield)} Tide/day from ${zone.name}.`
                          : result === 'reinforced' ? `Claim strength increased to ${Math.min((zone.claim_strength ?? 0) + 10, 100)}%.`
                          : `${zone.owner_handle} held their ground. Come back stronger.`}
                      </p>
                    </div>
                  </div>
                ) : sheet === 'claim' ? (
                  <>
                    <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '20px', color: 'var(--text-primary)', marginBottom: 4, paddingRight: 32 }}>
                      Claim {zone.name}
                    </p>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
                      Plant your tag and earn {formatTokens(zone.daily_yield)} Tide per day from this zone.
                    </p>
                    <div className="flex gap-2 mb-5">
                      <InfoChip label="COST" value={`-${formatTokens(claimCost)} T`} color="var(--color-danger)" />
                      <InfoChip label="YIELD/DAY" value={`+${formatTokens(zone.daily_yield)} T`} color="var(--color-success)" />
                      <InfoChip label="TIER" value={TIER_LABELS[zone.tier]} color={tierColor} />
                    </div>
                    <ActionButton icon={<Waves size={15} style={{ color: '#fff' }} />} label="Plant My Flag"
                      color="linear-gradient(135deg, var(--color-primary), var(--color-accent))"
                      loading={loading} onClick={handleAction} />
                  </>
                ) : sheet === 'reinforce' ? (
                  <>
                    <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '20px', color: 'var(--text-primary)', marginBottom: 4, paddingRight: 32 }}>
                      Reinforce {zone.name}
                    </p>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
                      Surf your zone to push claim strength higher and make it harder to challenge.
                    </p>
                    <div className="flex gap-2 mb-5">
                      <InfoChip label="CURRENT" value={`${zone.claim_strength}%`} color="var(--color-primary)" />
                      <InfoChip label="AFTER" value={`${Math.min(zone.claim_strength + 10, 100)}%`} color="var(--color-success)" />
                    </div>
                    <ActionButton icon={<Waves size={15} style={{ color: '#fff' }} />} label="Surf Your Zone"
                      color="linear-gradient(135deg, var(--color-primary), var(--color-accent))"
                      loading={loading} onClick={handleAction} />
                  </>
                ) : (
                  <>
                    <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '20px', color: 'var(--text-primary)', marginBottom: 4, paddingRight: 32 }}>
                      Challenge @{zone.owner_handle}
                    </p>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
                      Outcome is decided by tier and claim strength. A fortified zone is much harder to take.
                    </p>
                    {/* VS card */}
                    <div className="flex items-center gap-3 mb-4 px-3 py-3 rounded-2xl"
                      style={{ background: 'var(--surface-subtle)', border: '1px solid var(--border-mid)' }}>
                      <PlayerBadge handle={player?.handle ?? ''} color={player?.avatar_color} sub={player?.tier} />
                      <div className="flex flex-col items-center gap-1">
                        <Zap size={16} style={{ color: 'var(--color-secondary)' }} />
                        <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>VS</span>
                      </div>
                      <PlayerBadge handle={zone.owner_handle ?? ''} color={zone.owner_color ?? tierColor} sub={`str: ${zone.claim_strength}%`} />
                    </div>
                    {zone.claim_strength >= 70 && (
                      <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-xl"
                        style={{ background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.18)' }}>
                        <AlertTriangle size={13} style={{ color: 'var(--color-danger)', flexShrink: 0 }} />
                        <p style={{ fontSize: '12px', color: 'var(--color-danger)' }}>Fortified — reduced win chance.</p>
                      </div>
                    )}
                    <div className="flex gap-2 mb-5">
                      <InfoChip label="YOUR STAKE" value={`${formatTokens(challengeCost)} T`} color="var(--color-secondary)" />
                      <InfoChip label="PRIZE" value={`${formatTokens(zone.daily_yield * 3)} T`} color="var(--color-gold)" />
                    </div>
                    <ActionButton icon={<Zap size={15} style={{ color: '#fff' }} />} label="Launch Challenge"
                      color="linear-gradient(135deg, #E85A20, #DC2626)"
                      loading={loading} onClick={handleAction} />
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function postEvent(zoneId: string | null, player: { id: string; handle: string; avatar_color: string }, content: string, _unused: null) {
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

function InfoChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl" style={{ background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)' }}>
      <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontSize: '13px', fontWeight: 600, color, fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  );
}

function ActionButton({ icon, label, color, loading, onClick }: { icon: React.ReactNode; label: string; color: string; loading: boolean; onClick: () => void }) {
  return (
    <motion.button
      className="w-full flex items-center justify-center gap-2.5 rounded-2xl"
      style={{ padding: '14px', background: color, boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}
      whileTap={{ scale: 0.975 }}
      disabled={loading}
      onClick={onClick}
    >
      {loading
        ? <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '14px', color: '#fff' }}>Please wait…</span>
        : <>{icon}<span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '14px', color: '#fff', letterSpacing: '0.02em' }}>{label}</span></>
      }
    </motion.button>
  );
}

function PlayerBadge({ handle, color, sub }: { handle: string; color?: string | null; sub?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-1">
      <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: color ?? 'var(--color-primary)' }}>
        <span style={{ fontSize: '11px', color: '#fff', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
          {(handle || '?')[0].toUpperCase()}
        </span>
      </div>
      <p style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>@{handle}</p>
      {sub && <p style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  );
}
