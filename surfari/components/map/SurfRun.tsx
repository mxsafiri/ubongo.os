'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import mapboxgl from 'mapbox-gl';
import { useGameStore } from '@/store/game';
import { sfx } from '@/lib/game/sfx';
import { createRunnerLayer } from './RunnerLayer';

const SPEED_MPS = 65;
const COIN_VALUE = 25;
const COIN_COUNT = 26;
const COIN_COLLECT_M = 34;
const COIN_FIELD_M = 900;
const CHASE_ZOOM = 16.6;
const CHASE_PITCH = 66;

// Jump physics
const JUMP_DUR_S = 0.78;
const JUMP_H_M = 11;          // peak height — clears any obstacle with style
const OB_CLEAR_JUMP_M = 3.5;  // above this height you sail over traffic

// Obstacles
const OB_EMOJIS = ['🛵', '🛺', '🚧', '🐐'];
const OB_MAX = 12;
const OB_SPAWN_MS = 1000;
const OB_COLLIDE_M = 28;
const OB_DESPAWN_M = 650;
const CRASH_STUN_MS = 900;
const CRASH_LOSS_PCT = 0.3;

const M_PER_DEG_LAT = 110574;

interface Coin { id: number; lng: number; lat: number }
interface Obstacle { id: number; lng: number; lat: number; marker: mapboxgl.Marker }

function metersPerDegLng(lat: number) {
  return 111320 * Math.cos((lat * Math.PI) / 180);
}

function distM(aLng: number, aLat: number, bLng: number, bLat: number) {
  const dx = (aLng - bLng) * metersPerDegLng(aLat);
  const dy = (aLat - bLat) * M_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}

function lerpBearing(from: number, to: number, k: number) {
  let d = to - from;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return from + d * k;
}

/**
 * SurfRun — the on-map endless-runner mode. 3D character, chase cam,
 * coins to hoover, boda traffic to jump over (SPACE / JUMP button),
 * crashes cost coins, distance is your score. Ride into a beacon to
 * engage its zone.
 */
export function SurfRun({ map, onExit }: { map: mapboxgl.Map; onExit: () => void }) {
  const player = useGameStore((s) => s.player);
  const updateTokens = useGameStore((s) => s.updateTokens);
  const addNotification = useGameStore((s) => s.addNotification);
  const [runTide, setRunTide] = useState(0);
  const [distKm, setDistKm] = useState(0);
  const [crashCount, setCrashCount] = useState(0);

  const posRef = useRef<{ lng: number; lat: number }>({ lng: 0, lat: 0 });
  const keysRef = useRef({ up: false, down: false, left: false, right: false });
  const joyRef = useRef({ active: false, x: 0, y: 0 });
  const coinsRef = useRef<Coin[]>([]);
  const coinIdRef = useRef(0);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const obIdRef = useRef(0);
  const jumpStartRef = useRef(0);        // timestamp; 0 = grounded
  const stunUntilRef = useRef(0);
  const distRef = useRef(0);
  const runTideRef = useRef(0);
  const lastZoneRef = useRef<{ id: string | null; at: number }>({ id: null, at: 0 });
  const knobRef = useRef<HTMLDivElement>(null);
  const endedRef = useRef(false);

  const doJump = useCallback(() => {
    if (jumpStartRef.current === 0 && performance.now() >= stunUntilRef.current) {
      jumpStartRef.current = performance.now();
      sfx.whoosh();
    }
  }, []);

  // Wrap exit so every path (button, ESC) posts the run summary first
  const endRun = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    const km = distRef.current / 1000;
    const earned = runTideRef.current;
    if (distRef.current > 400) {
      addNotification({
        type: 'token_earned',
        title: `🏄 Run complete — ${km.toFixed(1)} km`,
        message: earned > 0 ? `Bagged +${earned} Tide on the streets.` : 'No coins this run — ride the gold lines.',
      });
    }
    if (distRef.current > 1000 && earned > 0 && player) {
      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zone_id: null,
          player_id: player.id,
          player_handle: player.handle,
          player_color: player.avatar_color,
          content: `🏄 @${player.handle} rode ${km.toFixed(1)}km through Dar and bagged +${earned} T`,
          msg_type: 'event',
        }),
      });
    }
    onExit();
  }, [addNotification, onExit, player]);
  const endRunRef = useRef(endRun);
  endRunRef.current = endRun;

  useEffect(() => {
    if (!player) return;
    const center = map.getCenter();
    posRef.current = { lng: center.lng, lat: center.lat };

    /* ── 3D character layer ── */
    const runner = createRunnerLayer('player-runner', player.avatar_color);
    if (!map.getLayer('player-runner')) map.addLayer(runner);
    runner.setState({ lng: center.lng, lat: center.lat, heading: (map.getBearing() * Math.PI) / 180, speed: 0, lean: 0, jump: 0 });

    map.easeTo({
      zoom: Math.max(map.getZoom(), CHASE_ZOOM),
      pitch: CHASE_PITCH,
      duration: 900,
      essential: true,
    });

    /* ── Handle tag above the character ── */
    const el = document.createElement('div');
    el.innerHTML = `<div class="surf-runner-tag">@${player.handle}</div>`;
    const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom', offset: [0, -96] })
      .setLngLat([center.lng, center.lat])
      .addTo(map);

    /* ── Coin field ── */
    const spawnCoins = () => {
      const { lng, lat } = posRef.current;
      const coins: Coin[] = [];
      for (let i = 0; i < COIN_COUNT; i++) {
        const ang = Math.random() * Math.PI * 2;
        const d = 80 + Math.random() * COIN_FIELD_M;
        coins.push({
          id: coinIdRef.current++,
          lng: lng + (Math.cos(ang) * d) / metersPerDegLng(lat),
          lat: lat + (Math.sin(ang) * d) / M_PER_DEG_LAT,
        });
      }
      coinsRef.current = coins;
      syncCoins();
    };
    const syncCoins = () => {
      const src = map.getSource('run-coins') as mapboxgl.GeoJSONSource | undefined;
      src?.setData({
        type: 'FeatureCollection',
        features: coinsRef.current.map((c) => ({
          type: 'Feature',
          id: c.id,
          geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
          properties: {},
        })),
      });
    };

    if (!map.getSource('run-coins')) {
      map.addSource('run-coins', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'run-coins-glow',
        type: 'circle',
        source: 'run-coins',
        slot: 'top',
        paint: {
          'circle-radius': 12,
          'circle-color': '#FFB800',
          'circle-opacity': 0.25,
          'circle-blur': 1,
          'circle-emissive-strength': 1,
        },
      });
      map.addLayer({
        id: 'run-coins-core',
        type: 'circle',
        source: 'run-coins',
        slot: 'top',
        paint: {
          'circle-radius': 5.5,
          'circle-color': '#FFD84D',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#B8860B',
          'circle-emissive-strength': 1,
        },
      });
    }
    spawnCoins();

    /* ── Obstacles ── */
    const spawnObstacle = (heading: number) => {
      if (obstaclesRef.current.length >= OB_MAX) return;
      const p = posRef.current;
      // Ahead of the runner, with lateral jitter — dodge or jump
      const ahead = 170 + Math.random() * 220;
      const side = (Math.random() - 0.5) * 120;
      const perp = heading + Math.PI / 2;
      const lng = p.lng
        + (Math.sin(heading) * ahead + Math.sin(perp) * side) / metersPerDegLng(p.lat);
      const lat = p.lat
        + (Math.cos(heading) * ahead + Math.cos(perp) * side) / M_PER_DEG_LAT;

      const obEl = document.createElement('div');
      obEl.innerHTML = `<div class="surf-ob">${OB_EMOJIS[Math.floor(Math.random() * OB_EMOJIS.length)]}</div>`;
      const obMarker = new mapboxgl.Marker({ element: obEl, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(map);
      obstaclesRef.current.push({ id: obIdRef.current++, lng, lat, marker: obMarker });
    };
    const removeObstacle = (ob: Obstacle) => {
      ob.marker.remove();
      obstaclesRef.current = obstaclesRef.current.filter((o) => o.id !== ob.id);
    };

    /* ── Keyboard ── */
    const setKey = (e: KeyboardEvent, down: boolean) => {
      const k = keysRef.current;
      switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': k.up = down; break;
        case 'ArrowDown': case 's': case 'S': k.down = down; break;
        case 'ArrowLeft': case 'a': case 'A': k.left = down; break;
        case 'ArrowRight': case 'd': case 'D': k.right = down; break;
        case ' ': if (down) doJump(); e.preventDefault(); return;
        case 'Escape': if (down) endRunRef.current(); return;
        default: return;
      }
      e.preventDefault();
    };
    const onDown = (e: KeyboardEvent) => setKey(e, true);
    const onUp = (e: KeyboardEvent) => setKey(e, false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);

    /* ── Game loop ── */
    let raf: number;
    let lastTs = performance.now();
    let lastObSpawn = 0;
    let frame = 0;
    let heading = (map.getBearing() * Math.PI) / 180;

    const tick = (ts: number) => {
      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;
      frame++;

      // Jump arc — parabolic, ~0.78s airtime
      let jumpH = 0;
      if (jumpStartRef.current > 0) {
        const jt = (ts - jumpStartRef.current) / (JUMP_DUR_S * 1000);
        if (jt >= 1) jumpStartRef.current = 0;
        else jumpH = 4 * JUMP_H_M * jt * (1 - jt);
      }

      const k = keysRef.current;
      let vx = (k.right ? 1 : 0) - (k.left ? 1 : 0);
      let vy = (k.up ? 1 : 0) - (k.down ? 1 : 0);
      if (joyRef.current.active) {
        vx = joyRef.current.x;
        vy = -joyRef.current.y;
      }
      let mag = Math.min(Math.hypot(vx, vy), 1);
      if (ts < stunUntilRef.current) mag = 0; // crashed — pick yourself up
      const p = posRef.current;

      if (mag > 0.05) {
        const bearingRad = (map.getBearing() * Math.PI) / 180;
        heading = Math.atan2(vx, vy) + bearingRad;
        const step = SPEED_MPS * dt * mag;
        p.lat += (Math.cos(heading) * step) / M_PER_DEG_LAT;
        p.lng += (Math.sin(heading) * step) / metersPerDegLng(p.lat);
        distRef.current += step;
        if (frame % 30 === 0) setDistKm(distRef.current / 1000);

        marker.setLngLat([p.lng, p.lat]);
        const newBearing = lerpBearing(map.getBearing(), (heading * 180) / Math.PI, 0.06);
        map.jumpTo({ center: [p.lng, p.lat], bearing: newBearing });

        // Coin pickup
        const before = coinsRef.current.length;
        coinsRef.current = coinsRef.current.filter(
          (c) => distM(c.lng, c.lat, p.lng, p.lat) > COIN_COLLECT_M
        );
        const grabbed = before - coinsRef.current.length;
        if (grabbed > 0) {
          sfx.hit(grabbed);
          updateTokens(grabbed * COIN_VALUE);
          runTideRef.current += grabbed * COIN_VALUE;
          setRunTide(runTideRef.current);
          syncCoins();
          if (coinsRef.current.length === 0) spawnCoins();
        }

        // Traffic spawns ahead while you ride
        if (ts - lastObSpawn > OB_SPAWN_MS && mag > 0.4) {
          lastObSpawn = ts;
          spawnObstacle(heading);
          if (Math.random() < 0.35) spawnObstacle(heading);
        }

        // Collision — unless you're airborne over it
        if (jumpH < OB_CLEAR_JUMP_M) {
          const hit = obstaclesRef.current.find(
            (o) => distM(o.lng, o.lat, p.lng, p.lat) <= OB_COLLIDE_M
          );
          if (hit) {
            removeObstacle(hit);
            sfx.crash();
            stunUntilRef.current = ts + CRASH_STUN_MS;
            const loss = Math.floor((runTideRef.current * CRASH_LOSS_PCT) / COIN_VALUE) * COIN_VALUE;
            if (loss > 0) {
              updateTokens(-loss);
              runTideRef.current -= loss;
              setRunTide(runTideRef.current);
            }
            setCrashCount((c) => c + 1);
          }
        }

        // Cull obstacles left far behind
        if (frame % 40 === 0) {
          obstaclesRef.current
            .filter((o) => distM(o.lng, o.lat, p.lng, p.lat) > OB_DESPAWN_M)
            .forEach(removeObstacle);
        }

        // Zone proximity — riding into a beacon engages the zone
        if (frame % 12 === 0) {
          const state = useGameStore.getState();
          for (const z of state.nearby_zones) {
            if (distM(z.lng, z.lat, p.lng, p.lat) <= (z.radius_meters ?? 200)) {
              const now = Date.now();
              if (lastZoneRef.current.id !== z.id || now - lastZoneRef.current.at > 6000) {
                lastZoneRef.current = { id: z.id, at: now };
                state.selectZone(z);
                sfx.whoosh();
              }
              break;
            }
          }
        }
      }

      runner.setState({ lng: p.lng, lat: p.lat, heading, speed: mag, lean: vx * mag, jump: jumpH });
      map.triggerRepaint();

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      marker.remove();
      obstaclesRef.current.forEach((o) => o.marker.remove());
      obstaclesRef.current = [];
      if (map.getLayer('player-runner')) map.removeLayer('player-runner');
      if (map.getLayer('run-coins-core')) map.removeLayer('run-coins-core');
      if (map.getLayer('run-coins-glow')) map.removeLayer('run-coins-glow');
      if (map.getSource('run-coins')) map.removeSource('run-coins');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, player]);

  /* ── Joystick pointer handling ── */
  const joyStart = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    joyRef.current.active = true;
    joyMove(e);
  };
  const joyMove = (e: React.PointerEvent) => {
    if (!joyRef.current.active) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let x = (e.clientX - cx) / (rect.width / 2);
    let y = (e.clientY - cy) / (rect.height / 2);
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    joyRef.current.x = x;
    joyRef.current.y = y;
    if (knobRef.current) knobRef.current.style.transform = `translate(${x * 34}px, ${y * 34}px)`;
  };
  const joyEnd = () => {
    joyRef.current = { active: false, x: 0, y: 0 };
    if (knobRef.current) knobRef.current.style.transform = '';
  };

  if (!player) return null;

  return (
    <>
      <style>{`
        .surf-runner-tag {
          font-family: var(--font-mono); font-size:10px; font-weight:700; color:#fff;
          background:rgba(9,13,24,0.85); padding:2px 7px;
          border:1px solid rgba(255,255,255,0.25); letter-spacing:0.04em; white-space:nowrap;
          pointer-events:none;
        }
        .surf-ob {
          font-size:30px; line-height:1;
          filter: drop-shadow(0 3px 4px rgba(0,0,0,0.55));
          animation: surf-ob-wobble 0.7s ease-in-out infinite alternate;
          pointer-events:none;
        }
        @keyframes surf-ob-wobble { from { transform:rotate(-4deg); } to { transform:rotate(4deg); } }
      `}</style>

      {/* Crash vignette */}
      <AnimatePresence>
        {crashCount > 0 && (
          <motion.div
            key={crashCount}
            className="absolute inset-0 z-20 pointer-events-none"
            style={{ background: 'radial-gradient(circle, transparent 35%, rgba(239,68,68,0.5) 100%)' }}
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7 }}
          />
        )}
      </AnimatePresence>

      {/* Run HUD chip */}
      <div className="absolute top-4 left-4 z-30 flex items-center gap-2.5 px-3 py-2"
        style={{
          background: 'rgba(9,13,24,0.85)',
          border: '1px solid rgba(255,184,0,0.4)',
          backdropFilter: 'blur(10px)',
        }}>
        <span style={{ fontSize: '16px', lineHeight: 1 }}>🏄</span>
        <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '17px', letterSpacing: '0.1em', color: '#FFD84D', lineHeight: 1 }}>
          +{runTide} T
        </span>
        <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '17px', letterSpacing: '0.1em', color: '#00C2FF', lineHeight: 1 }}>
          {distKm.toFixed(1)} KM
        </span>
        <button onClick={endRun} aria-label="Exit surf run"
          style={{
            fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.15em',
            color: '#8BA3BE', border: '1px solid rgba(240,246,255,0.18)',
            padding: '3px 7px', marginLeft: 4, background: 'none',
          }}>
          END RUN
        </button>
      </div>

      {/* Desktop key hint */}
      <p className="hidden lg:block absolute bottom-5 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.25em', color: 'rgba(240,246,255,0.55)', textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>
        HOLD ↑ TO RIDE · ← → TO CARVE · SPACE TO JUMP TRAFFIC · ESC TO END
      </p>

      {/* Mobile joystick */}
      <div
        className="lg:hidden absolute z-30 touch-none select-none"
        style={{
          left: 20,
          bottom: 'calc(var(--screen-pad-bottom, 24px) + 16px)',
          width: 110, height: 110, borderRadius: '50%',
          background: 'rgba(9,13,24,0.5)',
          border: '1.5px solid rgba(0,194,255,0.35)',
          backdropFilter: 'blur(6px)',
        }}
        onPointerDown={joyStart}
        onPointerMove={joyMove}
        onPointerUp={joyEnd}
        onPointerCancel={joyEnd}
      >
        <div
          ref={knobRef}
          className="absolute"
          style={{
            left: '50%', top: '50%', marginLeft: -22, marginTop: -22,
            width: 44, height: 44, borderRadius: '50%',
            background: 'linear-gradient(140deg, #00C2FF, #7C5CFC)',
            boxShadow: '0 0 16px rgba(0,194,255,0.55)',
            transition: 'transform 0.05s linear',
          }}
        />
      </div>

      {/* Mobile jump button */}
      <button
        className="lg:hidden absolute z-30 flex items-center justify-center touch-none select-none"
        style={{
          right: 20,
          bottom: 'calc(var(--screen-pad-bottom, 24px) + 24px)',
          width: 74, height: 74, borderRadius: '50%',
          background: 'rgba(9,13,24,0.6)',
          border: '2px solid rgba(255,184,0,0.55)',
          backdropFilter: 'blur(6px)',
          boxShadow: '0 0 20px rgba(255,184,0,0.25)',
        }}
        onPointerDown={(e) => { e.preventDefault(); doJump(); }}
        aria-label="Jump"
      >
        <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '17px', letterSpacing: '0.08em', color: '#FFD84D', lineHeight: 1 }}>
          JUMP
        </span>
      </button>
    </>
  );
}
