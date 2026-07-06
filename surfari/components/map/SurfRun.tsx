'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import mapboxgl from 'mapbox-gl';
import { useGameStore } from '@/store/game';
import { sfx } from '@/lib/game/sfx';
import { createRunnerLayer } from './RunnerLayer';
import { createCrewLayer } from './CrewLayer';

/* ── Movement physics (all rates are per-second; frame-rate independent) ── */
const MAX_SPEED = 74;         // m/s on the board
const BODA_MULT = 1.6;        // boda boost multiplier
const ACCEL_RATE = 2.1;       // throttle response
const DECEL_RATE = 2.8;       // coast friction
const BRAKE_RATE = 6.5;       // hard brake
const TURN_RATE = 2.5;        // rad/s at full steer

/* ── Chase camera (Subway Surfers framing: behind, above, looking ahead).
       Steep ~45° down-angle so buildings rarely occlude the character and
       the runner always sits in the lower third of the frame. ── */
const CAM_BACK_M = 50;
const CAM_ALT_M = 46;
const LOOK_AHEAD_M = 12;
const CAM_POS_RATE = 3.2;     // camera position smoothing
const CAM_TGT_RATE = 6.0;     // look-target smoothing

/* ── Run economy ── */
const COIN_VALUE = 25;
const COIN_COUNT = 26;
const COIN_COLLECT_M = 34;
const COIN_FIELD_M = 900;

/* ── Jump ── */
const JUMP_DUR_S = 0.78;
const JUMP_H_M = 11;
const OB_CLEAR_JUMP_M = 3.5;

/* ── Traffic ── */
const OB_EMOJIS = ['🛵', '🛺', '🚧', '🐐'];
const OB_MAX = 12;
const OB_SPAWN_MS = 1000;
const OB_COLLIDE_M = 28;
const OB_DESPAWN_M = 650;
const CRASH_STUN_MS = 900;
const CRASH_LOSS_PCT = 0.3;
const BODA_RIDE_MS = 8000;    // boost duration after mounting a boda

const M_PER_DEG_LAT = 110574;

interface Coin { id: number; lng: number; lat: number }
interface Obstacle { id: number; lng: number; lat: number; emoji: string; marker: mapboxgl.Marker }

function metersPerDegLng(lat: number) {
  return 111320 * Math.cos((lat * Math.PI) / 180);
}

function distM(aLng: number, aLat: number, bLng: number, bLat: number) {
  const dx = (aLng - bLng) * metersPerDegLng(aLat);
  const dy = (aLat - bLat) * M_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}

function normAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * SurfRun — the on-map endless runner. Momentum-based movement, a true
 * third-person chase camera (Mapbox free camera: behind + above the
 * character, looking down the street), coins, jumpable traffic — and
 * bodas you can MOUNT for an 8s speed boost instead of dodging.
 */
export function SurfRun({ map, onExit }: { map: mapboxgl.Map; onExit: () => void }) {
  const player = useGameStore((s) => s.player);
  const updateTokens = useGameStore((s) => s.updateTokens);
  const addNotification = useGameStore((s) => s.addNotification);
  const [runTide, setRunTide] = useState(0);
  const [distKm, setDistKm] = useState(0);
  const [crashCount, setCrashCount] = useState(0);
  const [speedKmh, setSpeedKmh] = useState(0);
  const [bodaLeft, setBodaLeft] = useState(0);

  const posRef = useRef<{ lng: number; lat: number }>({ lng: 0, lat: 0 });
  const keysRef = useRef({ up: false, down: false, left: false, right: false });
  const joyRef = useRef({ active: false, x: 0, y: 0 });
  const speedRef = useRef(0);          // m/s
  const headingRef = useRef(0);        // rad, clockwise from north
  const camPosRef = useRef<{ lng: number; lat: number }>({ lng: 0, lat: 0 });
  const camTgtRef = useRef<{ lng: number; lat: number }>({ lng: 0, lat: 0 });
  const camYawRef = useRef(0);
  const bodaUntilRef = useRef(0);
  const coinsRef = useRef<Coin[]>([]);
  const coinIdRef = useRef(0);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const obIdRef = useRef(0);
  const jumpStartRef = useRef(0);
  const stunUntilRef = useRef(0);
  const distRef = useRef(0);
  const runTideRef = useRef(0);
  const lastZoneRef = useRef<{ id: string | null; at: number }>({ id: null, at: 0 });
  const knobRef = useRef<HTMLDivElement>(null);
  const endedRef = useRef(false);

  // Snap the chase camera directly behind the runner — no smoothing.
  // The one-tap answer to "where am I?"
  const recenter = useCallback(() => {
    const p = posRef.current;
    const mLng = metersPerDegLng(p.lat);
    const fx = Math.sin(headingRef.current);
    const fy = Math.cos(headingRef.current);
    camPosRef.current = {
      lng: p.lng - (fx * CAM_BACK_M) / mLng,
      lat: p.lat - (fy * CAM_BACK_M) / M_PER_DEG_LAT,
    };
    camTgtRef.current = {
      lng: p.lng + (fx * LOOK_AHEAD_M) / mLng,
      lat: p.lat + (fy * LOOK_AHEAD_M) / M_PER_DEG_LAT,
    };
    sfx.whoosh();
  }, []);

  const doJump = useCallback(() => {
    if (jumpStartRef.current === 0 && performance.now() >= stunUntilRef.current) {
      jumpStartRef.current = performance.now();
      sfx.whoosh();
    }
  }, []);

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
    headingRef.current = (map.getBearing() * Math.PI) / 180;
    speedRef.current = 0;

    // Seed the chase camera behind the runner so the first frame is framed right
    {
      const mLng = metersPerDegLng(center.lat);
      const fx = Math.sin(headingRef.current);
      const fy = Math.cos(headingRef.current);
      camPosRef.current = {
        lng: center.lng - (fx * CAM_BACK_M) / mLng,
        lat: center.lat - (fy * CAM_BACK_M) / M_PER_DEG_LAT,
      };
      camTgtRef.current = {
        lng: center.lng + (fx * LOOK_AHEAD_M) / mLng,
        lat: center.lat + (fy * LOOK_AHEAD_M) / M_PER_DEG_LAT,
      };
      camYawRef.current = headingRef.current;
    }

    // The game owns the camera during a run — stop map gestures from
    // fighting it (drag/zoom jitter was disorienting riders)
    map.dragPan.disable();
    map.dragRotate.disable();
    map.scrollZoom.disable();
    map.touchZoomRotate.disable();
    map.doubleClickZoom.disable();

    /* ── 3D character layer ── */
    const runner = createRunnerLayer('player-runner', player.avatar_color);
    if (!map.getLayer('player-runner')) map.addLayer(runner);
    runner.setState({
      lng: center.lng, lat: center.lat,
      heading: headingRef.current, speed: 0, lean: 0, jump: 0, mode: 'board',
    });

    /* ── Handle tag above the character ── */
    const el = document.createElement('div');
    el.innerHTML = `<div class="surf-runner-tag">@${player.handle}</div>`;
    const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom', offset: [0, -96] })
      .setLngLat([center.lng, center.lat])
      .addTo(map);

    /* ── Live crew: other riders as 3D characters ── */
    const crew = createCrewLayer('crew-runners');
    if (!map.getLayer('crew-runners')) map.addLayer(crew);
    if (map.getLayer('real-players')) map.setLayoutProperty('real-players', 'visibility', 'none');

    const remoteTags = new Map<string, mapboxgl.Marker>();
    const heartbeat = async () => {
      try {
        const p = posRef.current;
        const res = await fetch('/api/game/players/position', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ player_id: player.id, lat: p.lat, lng: p.lng }),
        });
        if (!res.ok) return;
        const { players: riders } = await res.json();
        crew.setPlayers(
          (riders as { id: string; handle: string; avatar_color: string; lat: number; lng: number }[])
            .filter((r) => typeof r.lat === 'number' && typeof r.lng === 'number')
            .map((r) => ({ id: r.id, handle: r.handle, color: r.avatar_color, lng: r.lng, lat: r.lat })),
        );
      } catch { /* heartbeat is best-effort */ }
    };
    heartbeat();
    const hbInterval = setInterval(heartbeat, 2500);

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
      const ahead = 170 + Math.random() * 220;
      const side = (Math.random() - 0.5) * 120;
      const perp = heading + Math.PI / 2;
      const lng = p.lng
        + (Math.sin(heading) * ahead + Math.sin(perp) * side) / metersPerDegLng(p.lat);
      const lat = p.lat
        + (Math.cos(heading) * ahead + Math.cos(perp) * side) / M_PER_DEG_LAT;

      const emoji = OB_EMOJIS[Math.floor(Math.random() * OB_EMOJIS.length)];
      const obEl = document.createElement('div');
      obEl.innerHTML = `<div class="surf-ob${emoji === '🛵' ? ' surf-ob-ride' : ''}">${emoji}</div>`;
      const obMarker = new mapboxgl.Marker({ element: obEl, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(map);
      obstaclesRef.current.push({ id: obIdRef.current++, lng, lat, emoji, marker: obMarker });
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
        case 'r': case 'R': if (down) recenter(); return;
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

    const tick = (ts: number) => {
      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;
      frame++;

      // Jump arc
      let jumpH = 0;
      if (jumpStartRef.current > 0) {
        const jt = (ts - jumpStartRef.current) / (JUMP_DUR_S * 1000);
        if (jt >= 1) jumpStartRef.current = 0;
        else jumpH = 4 * JUMP_H_M * jt * (1 - jt);
      }

      /* ── Input → steering + throttle (driving model, not strafing) ── */
      const k = keysRef.current;
      let steer = (k.right ? 1 : 0) - (k.left ? 1 : 0);
      let throttle = k.up ? 1 : 0;
      let brake = k.down;

      const onBoda = ts < bodaUntilRef.current;
      const maxSpd = MAX_SPEED * (onBoda ? BODA_MULT : 1);
      const speed01 = Math.min(speedRef.current / MAX_SPEED, 1.2);

      if (joyRef.current.active) {
        const jx = joyRef.current.x;
        const jy = joyRef.current.y;
        const m = Math.min(Math.hypot(jx, jy), 1);
        if (m > 0.12) {
          const desired = Math.atan2(jx, -jy) + camYawRef.current;
          const dh = normAngle(desired - headingRef.current);
          const maxTurn = TURN_RATE * dt;
          headingRef.current += Math.max(-maxTurn, Math.min(maxTurn, dh));
          steer = Math.max(-1, Math.min(1, dh * 1.4));
          throttle = m;
          brake = false;
        }
      } else if (steer !== 0) {
        // Steering authority grows with speed, but you can always pivot a bit
        headingRef.current += steer * TURN_RATE * dt * (0.45 + 0.55 * Math.min(speed01, 1));
      }

      if (ts < stunUntilRef.current) { throttle = 0; brake = false; }

      /* ── Momentum ── */
      const target = brake ? 0 : throttle * maxSpd;
      const rate = target > speedRef.current ? ACCEL_RATE : brake ? BRAKE_RATE : DECEL_RATE;
      speedRef.current += (target - speedRef.current) * (1 - Math.exp(-rate * dt));
      if (speedRef.current < 0.4 && target === 0) speedRef.current = 0;

      const step = speedRef.current * dt;
      const p = posRef.current;
      const moving = step > 0.002;

      if (moving) {
        p.lat += (Math.cos(headingRef.current) * step) / M_PER_DEG_LAT;
        p.lng += (Math.sin(headingRef.current) * step) / metersPerDegLng(p.lat);
        distRef.current += step;
        marker.setLngLat([p.lng, p.lat]);

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
        if (ts - lastObSpawn > OB_SPAWN_MS && speed01 > 0.25) {
          lastObSpawn = ts;
          spawnObstacle(headingRef.current);
          if (Math.random() < 0.35) spawnObstacle(headingRef.current);
        }

        // Contact: mount bodas, crash into everything else — unless airborne
        if (jumpH < OB_CLEAR_JUMP_M && speedRef.current > 6) {
          const hit = obstaclesRef.current.find(
            (o) => distM(o.lng, o.lat, p.lng, p.lat) <= OB_COLLIDE_M
          );
          if (hit) {
            removeObstacle(hit);
            if (hit.emoji === '🛵') {
              // Swing onto the boda — 8s of boost
              bodaUntilRef.current = ts + BODA_RIDE_MS;
              sfx.roundWin();
            } else {
              sfx.crash();
              stunUntilRef.current = ts + CRASH_STUN_MS;
              speedRef.current *= 0.15; // the crash eats your momentum
              if (onBoda) bodaUntilRef.current = 0; // knocked off the bike
              const loss = Math.floor((runTideRef.current * CRASH_LOSS_PCT) / COIN_VALUE) * COIN_VALUE;
              if (loss > 0) {
                updateTokens(-loss);
                runTideRef.current -= loss;
                setRunTide(runTideRef.current);
              }
              setCrashCount((c) => c + 1);
            }
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

      /* ── Chase camera: behind + above, looking down the street.
             Runs every frame so it keeps settling smoothly at rest. ── */
      {
        const mLng = metersPerDegLng(p.lat);
        const fx = Math.sin(headingRef.current);
        const fy = Math.cos(headingRef.current);
        const desiredCam = {
          lng: p.lng - (fx * CAM_BACK_M) / mLng,
          lat: p.lat - (fy * CAM_BACK_M) / M_PER_DEG_LAT,
        };
        const desiredTgt = {
          lng: p.lng + (fx * LOOK_AHEAD_M) / mLng,
          lat: p.lat + (fy * LOOK_AHEAD_M) / M_PER_DEG_LAT,
        };
        const kc = 1 - Math.exp(-CAM_POS_RATE * dt);
        const kt = 1 - Math.exp(-CAM_TGT_RATE * dt);
        const cp = camPosRef.current;
        const ct = camTgtRef.current;
        cp.lng += (desiredCam.lng - cp.lng) * kc;
        cp.lat += (desiredCam.lat - cp.lat) * kc;
        ct.lng += (desiredTgt.lng - ct.lng) * kt;
        ct.lat += (desiredTgt.lat - ct.lat) * kt;

        const cam = map.getFreeCameraOptions();
        cam.position = mapboxgl.MercatorCoordinate.fromLngLat([cp.lng, cp.lat], CAM_ALT_M);
        cam.lookAtPoint([ct.lng, ct.lat]);
        map.setFreeCameraOptions(cam);

        camYawRef.current = Math.atan2(
          (ct.lng - cp.lng) * mLng,
          (ct.lat - cp.lat) * M_PER_DEG_LAT,
        );
      }

      // Remote riders' name tags glued to interpolated positions
      if (frame % 6 === 0) {
        const positions = crew.getPositions();
        const alive = new Set(positions.map((r) => r.id));
        for (const r of positions) {
          let tag = remoteTags.get(r.id);
          if (!tag) {
            const tagEl = document.createElement('div');
            tagEl.innerHTML = `<div class="surf-runner-tag" style="border-color:${r.color}">@${r.handle}</div>`;
            tag = new mapboxgl.Marker({ element: tagEl, anchor: 'bottom', offset: [0, -96] })
              .setLngLat([r.lng, r.lat])
              .addTo(map);
            remoteTags.set(r.id, tag);
          } else {
            tag.setLngLat([r.lng, r.lat]);
          }
        }
        for (const [rid, tag] of remoteTags) {
          if (!alive.has(rid)) { tag.remove(); remoteTags.delete(rid); }
        }
      }

      // HUD readouts (throttled to avoid re-render churn)
      if (frame % 8 === 0) {
        setSpeedKmh(Math.round(speedRef.current * 3.6));
        setBodaLeft(onBoda ? Math.max(0, (bodaUntilRef.current - ts) / 1000) : 0);
        if (frame % 32 === 0) setDistKm(distRef.current / 1000);
      }

      runner.setState({
        lng: p.lng, lat: p.lat,
        heading: headingRef.current,
        speed: Math.min(speed01, 1),
        lean: steer * Math.min(speed01, 1),
        jump: jumpH,
        mode: onBoda ? 'boda' : 'board',
      });
      map.triggerRepaint();

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(hbInterval);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      marker.remove();
      remoteTags.forEach((t) => t.remove());
      remoteTags.clear();
      obstaclesRef.current.forEach((o) => o.marker.remove());
      obstaclesRef.current = [];
      if (map.getLayer('player-runner')) map.removeLayer('player-runner');
      if (map.getLayer('crew-runners')) map.removeLayer('crew-runners');
      if (map.getLayer('run-coins-core')) map.removeLayer('run-coins-core');
      if (map.getLayer('run-coins-glow')) map.removeLayer('run-coins-glow');
      if (map.getSource('run-coins')) map.removeSource('run-coins');
      if (map.getLayer('real-players')) map.setLayoutProperty('real-players', 'visibility', 'visible');
      // Give the player their map gestures back
      map.dragPan.enable();
      map.dragRotate.enable();
      map.scrollZoom.enable();
      map.touchZoomRotate.enable();
      map.doubleClickZoom.enable();
      // Hand the camera back to the normal map view
      map.easeTo({
        center: [posRef.current.lng, posRef.current.lat],
        zoom: 15.4,
        pitch: 62,
        bearing: (headingRef.current * 180) / Math.PI,
        duration: 800,
        essential: true,
      });
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
        .surf-ob-ride {
          filter: drop-shadow(0 3px 4px rgba(0,0,0,0.55)) drop-shadow(0 0 10px rgba(0,224,150,0.85));
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

      {/* Boda boost vignette — subtle green speed edges while mounted */}
      {bodaLeft > 0 && (
        <div className="absolute inset-0 z-10 pointer-events-none"
          style={{ background: 'radial-gradient(circle, transparent 55%, rgba(0,224,150,0.16) 100%)' }} />
      )}

      {/* Run HUD chip */}
      <div className="absolute top-4 left-4 z-30 flex items-center gap-2.5 px-3 py-2"
        style={{
          background: 'rgba(9,13,24,0.85)',
          border: '1px solid rgba(255,184,0,0.4)',
          backdropFilter: 'blur(10px)',
        }}>
        <span style={{ fontSize: '16px', lineHeight: 1 }}>{bodaLeft > 0 ? '🛵' : '🏄'}</span>
        <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '17px', letterSpacing: '0.1em', color: '#FFD84D', lineHeight: 1 }}>
          +{runTide} T
        </span>
        <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '17px', letterSpacing: '0.1em', color: '#00C2FF', lineHeight: 1 }}>
          {distKm.toFixed(1)} KM
        </span>
        <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '17px', letterSpacing: '0.08em', color: bodaLeft > 0 ? '#00E096' : '#8BA3BE', lineHeight: 1, minWidth: 74 }}>
          {speedKmh} KM/H
        </span>
        {bodaLeft > 0 && (
          <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '15px', letterSpacing: '0.08em', color: '#00E096', lineHeight: 1 }}>
            BOOST {bodaLeft.toFixed(0)}s
          </span>
        )}
        <button onClick={recenter} aria-label="Recenter camera on your runner"
          style={{
            fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.15em',
            color: '#00C2FF', border: '1px solid rgba(0,194,255,0.35)',
            padding: '3px 7px', marginLeft: 4, background: 'none',
          }}>
          ⌖ FIND ME
        </button>
        <button onClick={endRun} aria-label="Exit surf run"
          style={{
            fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.15em',
            color: '#8BA3BE', border: '1px solid rgba(240,246,255,0.18)',
            padding: '3px 7px', background: 'none',
          }}>
          END RUN
        </button>
      </div>

      {/* Desktop key hint */}
      <p className="hidden lg:block absolute bottom-5 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.25em', color: 'rgba(240,246,255,0.55)', textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>
        ↑ THROTTLE · ← → STEER · ↓ BRAKE · SPACE JUMP · R FIND ME · GRAB A 🛵 FOR BOOST · ESC TO END
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
