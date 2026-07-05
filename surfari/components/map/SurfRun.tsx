'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { useGameStore } from '@/store/game';
import { sfx } from '@/lib/game/sfx';
import { createRunnerLayer } from './RunnerLayer';

const SPEED_MPS = 65;          // fun > realism — boda at full throttle
const COIN_VALUE = 25;
const COIN_COUNT = 26;
const COIN_COLLECT_M = 34;
const COIN_FIELD_M = 900;      // coins scatter within this radius of the runner
const CHASE_ZOOM = 16.6;
const CHASE_PITCH = 66;

const M_PER_DEG_LAT = 110574;

interface Coin { id: number; lng: number; lat: number }

function metersPerDegLng(lat: number) {
  return 111320 * Math.cos((lat * Math.PI) / 180);
}

function distM(aLng: number, aLat: number, bLng: number, bLat: number) {
  const dx = (aLng - bLng) * metersPerDegLng(aLat);
  const dy = (aLat - bLat) * M_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}

// Shortest-arc lerp for compass bearings (degrees)
function lerpBearing(from: number, to: number, k: number) {
  let d = to - from;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return from + d * k;
}

/**
 * SurfRun — Subway-Surfers-style avatar mode with a real 3D character.
 * A Three.js custom layer renders an animated low-poly runner inside the
 * map's WebGL scene. Hold up to ride, steer left/right — the chase cam
 * banks behind you. Hoover Tide coins; ride into a beacon to engage it.
 */
export function SurfRun({ map, onExit }: { map: mapboxgl.Map; onExit: () => void }) {
  const player = useGameStore((s) => s.player);
  const updateTokens = useGameStore((s) => s.updateTokens);
  const [runTide, setRunTide] = useState(0);

  const posRef = useRef<{ lng: number; lat: number }>({ lng: 0, lat: 0 });
  const keysRef = useRef({ up: false, down: false, left: false, right: false });
  const joyRef = useRef({ active: false, x: 0, y: 0 });
  const coinsRef = useRef<Coin[]>([]);
  const coinIdRef = useRef(0);
  const lastZoneRef = useRef<{ id: string | null; at: number }>({ id: null, at: 0 });
  const knobRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!player) return;
    const center = map.getCenter();
    posRef.current = { lng: center.lng, lat: center.lat };

    /* ── 3D character layer ── */
    const runner = createRunnerLayer('player-runner', player.avatar_color);
    if (!map.getLayer('player-runner')) map.addLayer(runner);
    runner.setState({ lng: center.lng, lat: center.lat, heading: (map.getBearing() * Math.PI) / 180, speed: 0, lean: 0 });

    // Drop into chase framing
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

    /* ── Keyboard ── */
    const setKey = (e: KeyboardEvent, down: boolean) => {
      const k = keysRef.current;
      switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': k.up = down; break;
        case 'ArrowDown': case 's': case 'S': k.down = down; break;
        case 'ArrowLeft': case 'a': case 'A': k.left = down; break;
        case 'ArrowRight': case 'd': case 'D': k.right = down; break;
        case 'Escape': if (down) onExit(); return;
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
    let frame = 0;
    let heading = (map.getBearing() * Math.PI) / 180;

    const tick = (ts: number) => {
      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;
      frame++;

      const k = keysRef.current;
      let vx = (k.right ? 1 : 0) - (k.left ? 1 : 0);
      let vy = (k.up ? 1 : 0) - (k.down ? 1 : 0);
      if (joyRef.current.active) {
        vx = joyRef.current.x;
        vy = -joyRef.current.y;
      }
      const mag = Math.min(Math.hypot(vx, vy), 1);
      const p = posRef.current;

      if (mag > 0.05) {
        // Screen-relative input: "up" rides toward the top of the screen.
        // The chase cam then banks toward the heading, so held-left/right
        // becomes a carving turn — Subway Surfers steering for free.
        const bearingRad = (map.getBearing() * Math.PI) / 180;
        heading = Math.atan2(vx, vy) + bearingRad;
        const step = SPEED_MPS * dt * mag;
        p.lat += (Math.cos(heading) * step) / M_PER_DEG_LAT;
        p.lng += (Math.sin(heading) * step) / metersPerDegLng(p.lat);

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
          setRunTide((t) => t + grabbed * COIN_VALUE);
          syncCoins();
          if (coinsRef.current.length === 0) spawnCoins();
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

      runner.setState({ lng: p.lng, lat: p.lat, heading, speed: mag, lean: vx * mag });
      map.triggerRepaint(); // keep the character animating even when idle

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      marker.remove();
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
      `}</style>

      {/* Run HUD chip */}
      <div className="absolute top-4 left-4 z-30 flex items-center gap-2.5 px-3 py-2"
        style={{
          background: 'rgba(9,13,24,0.85)',
          border: '1px solid rgba(255,184,0,0.4)',
          backdropFilter: 'blur(10px)',
        }}>
        <span style={{ fontSize: '16px', lineHeight: 1 }}>🏄</span>
        <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '17px', letterSpacing: '0.1em', color: '#FFD84D', lineHeight: 1 }}>
          SURF RUN · +{runTide} T
        </span>
        <button onClick={onExit} aria-label="Exit surf run"
          style={{
            fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.15em',
            color: '#8BA3BE', border: '1px solid rgba(240,246,255,0.18)',
            padding: '3px 7px', marginLeft: 4, background: 'none',
          }}>
          EXIT
        </button>
      </div>

      {/* Desktop key hint */}
      <p className="hidden lg:block absolute bottom-5 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.25em', color: 'rgba(240,246,255,0.55)', textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>
        HOLD ↑ TO RIDE · ← → TO CARVE · RUN INTO A BEACON TO BATTLE · ESC TO EXIT
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
    </>
  );
}
