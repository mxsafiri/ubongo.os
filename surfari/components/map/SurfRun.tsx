'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import mapboxgl from 'mapbox-gl';
import { useGameStore } from '@/store/game';
import { getAudioPrefs, setAudioPrefs, sfx } from '@/lib/game/sfx';
import { RideAudio } from '@/lib/game/rideAudio';
import { Combo, TIER_CALLS, type StyleMove } from '@/lib/game/combo';
import { createRunnerLayer } from './RunnerLayer';
import { createCrewLayer } from './CrewLayer';
import { ChaseCamera, createShockwave, createWake } from './runFx';
import { createChaserLayer } from './ChaserLayer';
import { TRAFFIC, createTrafficLayer, preloadTraffic, type TrafficKind } from './TrafficLayer';
import { createFxLayer } from './FxLayer';
import { CHASER, createChaseWorld, stepChase, whip, whipCooldown, type ChaseWorld } from './chaserAI';
import { clearDistance, findOpenSpot, isBlocked, openHeading, resolveRider } from './collision';
import { createBuildingSource } from './buildingSource';
import { QualityGovernor, deviceQualityHints, initialQuality, type QualitySettings } from '@/lib/game/quality';
import { setMapPixelRatioCap } from '@/lib/map/pixelRatio';
import { THUMB, ThumbControls } from '@/lib/game/thumbControls';

/* ── Movement physics (all rates are per-second; frame-rate independent) ── */
const MAX_SPEED = 74;         // m/s on the board
const BODA_MULT = 1.6;        // boda boost multiplier
const ACCEL_RATE = 2.1;       // throttle response
const DECEL_RATE = 2.8;       // coast friction
const BRAKE_RATE = 6.5;       // hard brake
const TURN_RATE = 2.5;        // rad/s at full steer
const START_DELAY_MS = 900;   // a beat to see where you are before the board rolls


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
// What turns up on the street: parked bodas to grab, taxis and cars that
// drive (with you or against you), dumpsters that just sit there
const OB_MIX: [TrafficKind, number][] = [['boda', 0.3], ['taxi', 0.25], ['car', 0.25], ['dumpster', 0.2]];
const OB_MAX = 12;
const OB_SPAWN_MS = 1000;
const OB_DESPAWN_M = 650;
const CAR_SPEED_MS: [number, number] = [8, 16];

/* ── Style ── */
const NEAR_MISS_M = 8;        // passing this close outside a vehicle's contact radius
const NEAR_MISS_MIN_MS = 20;  // only counts at speed
const NEAR_MISS_BONUS = 10;
const SLOWMO_MS = 140;        // a beat of slow motion on a near-miss
const SLOWMO_K = 0.35;
const TIER_COLORS = ['#F0F6FF', '#00E096', '#00C2FF', '#FFB800', '#FF3D9A'];
const CRASH_STUN_MS = 900;
const CRASH_LOSS_PCT = 0.3;
const BODA_RIDE_MS = 8000;    // boost duration after mounting a boda

/* ── Multiplayer ── */
const HEARTBEAT_MS = 1250;    // position + motion broadcast while riding

/* ── Radar ── */
const RADAR_PX = 84;
const RADAR_RANGE_M = 450;

const HINT_KEY = 'surfari-ride-hints-seen';

const M_PER_DEG_LAT = 110574;

/** Haptic tap on phones that support it (Android); silently nothing elsewhere. */
function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch { /* not allowed here */ }
}

interface Coin { id: number; lng: number; lat: number }
interface Obstacle {
  id: number; lng: number; lat: number; kind: TrafficKind; heading: number; speed: number;
  styled?: boolean; // already scored as a near-miss or a jump-over
}

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
 * SurfRun — Cruise Mode. The ride owns the whole screen: the board rolls
 * on its own, one thumb steers and does tricks (see thumbControls), and a
 * street-level chase camera follows you through the city. Coins, jumpable
 * traffic, bodas you can MOUNT for an 8s boost, and a rival crew on your
 * tail. Pause brings the map and menus back.
 */
export function SurfRun({ map, onExit }: { map: mapboxgl.Map; onExit: () => void }) {
  const player = useGameStore((s) => s.player);
  const startRun = useGameStore((s) => s.startRun);
  const bankRun = useGameStore((s) => s.bankRun);
  const addNotification = useGameStore((s) => s.addNotification);
  const [runTide, setRunTide] = useState(0);
  const [distKm, setDistKm] = useState(0);
  const [crashCount, setCrashCount] = useState(0);
  const [speedKmh, setSpeedKmh] = useState(0);
  const [bodaLeft, setBodaLeft] = useState(0);

  const posRef = useRef<{ lng: number; lat: number }>({ lng: 0, lat: 0 });
  const keysRef = useRef({ up: false, down: false, left: false, right: false });
  const thumbRef = useRef(new ThumbControls());
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [showHints, setShowHints] = useState(() => {
    try { return localStorage.getItem(HINT_KEY) !== '1'; } catch { return true; }
  });
  const stickRingRef = useRef<HTMLDivElement>(null);
  const stickKnobRef = useRef<HTMLDivElement>(null);
  const radarRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<RideAudio | null>(null);
  const comboChipRef = useRef<HTMLDivElement>(null);
  const comboTextRef = useRef<HTMLSpanElement>(null);
  const comboBarRef = useRef<HTMLDivElement>(null);
  const calloutRef = useRef<HTMLDivElement>(null);
  const [audioPrefs, setPrefsState] = useState(getAudioPrefs);
  const speedRef = useRef(0);          // m/s
  const headingRef = useRef(0);        // rad, clockwise from north
  const yawRateRef = useRef(0);        // rad/s, smoothed — sent so others can dead-reckon our arc
  // Chase camera (framing, speed pull-back, turn aim, impact shake) — see runFx
  const [chase] = useState(() => new ChaseCamera());
  const speedFxRef = useRef<HTMLDivElement>(null);
  // Rival crew: threat arrows, the whip button's cooldown ring, bonus pop-ups
  const threatRefs = useRef<(HTMLDivElement | null)[]>([]);
  const whipBtnRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const whipRef = useRef<() => void>(() => {});
  const bodaUntilRef = useRef(0);
  const coinsRef = useRef<Coin[]>([]);
  const coinIdRef = useRef(0);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const obIdRef = useRef(0);
  const jumpStartRef = useRef(0);
  const stunUntilRef = useRef(0);
  const distRef = useRef(0);
  const runTideRef = useRef(0);
  const runIdRef = useRef<Promise<string | null> | null>(null);
  const lastZoneRef = useRef<{ id: string | null; at: number }>({ id: null, at: 0 });
  const endedRef = useRef(false);

  const setPause = useCallback((on: boolean) => {
    pausedRef.current = on;
    setPaused(on);
    if (on) audioRef.current?.pause(); else audioRef.current?.resume();
    thumbRef.current.reset();
    keysRef.current = { up: false, down: false, left: false, right: false };
  }, []);

  const dismissHints = useCallback(() => {
    setShowHints(false);
    try { localStorage.setItem(HINT_KEY, '1'); } catch { /* private mode */ }
  }, []);

  // Snap the chase camera directly behind the runner — no smoothing.
  // The one-tap answer to "where am I?"
  const recenter = useCallback(() => {
    chase.snap(posRef.current, headingRef.current);
    sfx.whoosh();
  }, [chase]);

  const doJump = useCallback(() => {
    if (jumpStartRef.current === 0 && performance.now() >= stunUntilRef.current) {
      jumpStartRef.current = performance.now();
      sfx.whoosh();
    }
  }, []);

  const endRun = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    const distM = distRef.current;
    const km = distM / 1000;
    const claimed = runTideRef.current;
    const runId = runIdRef.current;
    onExit();

    // Bank the run server-side; the balance only moves once the server pays
    void (async () => {
      const id = runId ? await runId : null;
      const earned = id ? await bankRun(id, distM, claimed) : null;
      if (distM <= 400) return;
      addNotification({
        type: 'token_earned',
        title: `🏄 Run complete — ${km.toFixed(1)} km`,
        message: earned === null
          ? 'Could not bank this run — the city lost your signal.'
          : earned > 0
            ? `Banked +${earned} Tide${earned < claimed ? ` (of ${claimed} — daily run cap)` : ''}.`
            : 'No coins this run — ride the gold lines.',
      });
      if (distM > 1000 && earned && player) postRunEvent(earned);
    })();

    function postRunEvent(earned: number) {
      if (!player) return;
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
  }, [addNotification, bankRun, onExit, player]);

  useEffect(() => {
    if (!player) return;
    const center = map.getCenter();
    posRef.current = { lng: center.lng, lat: center.lat };
    headingRef.current = (map.getBearing() * Math.PI) / 180;
    speedRef.current = 0;
    runIdRef.current = startRun();

    // Seed the chase camera behind the runner so the first frame is framed right
    chase.snap(posRef.current, headingRef.current);

    // The game owns the camera during a run — stop map gestures from
    // fighting it (drag/zoom jitter was disorienting riders)
    map.dragPan.disable();
    map.dragRotate.disable();
    map.scrollZoom.disable();
    map.touchZoomRotate.disable();
    map.doubleClickZoom.disable();
    // The browse map's zoom cap would hold a free camera ~190 m up — a
    // street-level chase cam needs to get right down among the buildings
    const browseMaxZoom = map.getMaxZoom();
    map.setMaxZoom(24);

    /* ── 3D character layer ── */
    const runner = createRunnerLayer('player-runner', player.avatar_color);
    if (!map.getLayer('player-runner')) map.addLayer(runner);
    runner.setState({
      lng: center.lng, lat: center.lat,
      heading: headingRef.current, speed: 0, lean: 0, jump: 0, mode: 'board', crashed: false,
    });

    /* ── Live crew: other riders as 3D characters ── */
    const crew = createCrewLayer('crew-runners');
    if (!map.getLayer('crew-runners')) map.addLayer(crew);
    if (map.getLayer('real-players')) map.setLayoutProperty('real-players', 'visibility', 'none');

    const remoteTags = new Map<string, mapboxgl.Marker>();
    // 1.25 s keeps remote riders within ~20 m of truth (see crewMotion).
    // Skip a beat while one is in flight so slow responses can't pile up
    // or land out of order.
    let hbInFlight = false;
    const heartbeat = async () => {
      if (hbInFlight) return;
      hbInFlight = true;
      try {
        const p = posRef.current;
        const res = await fetch('/api/game/players/position', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            player_id: player.id,
            lat: p.lat,
            lng: p.lng,
            heading: headingRef.current,
            speed: speedRef.current,
            turn: yawRateRef.current,
            mode: performance.now() < bodaUntilRef.current ? 'boda' : 'board',
          }),
        });
        if (!res.ok) return;
        const { players: riders } = await res.json();
        type Rider = {
          id: string; handle: string; avatar_color: string; lat: number; lng: number;
          heading: number | null; speed: number | null; turn: number | null; mode: string | null; age_s: number | null;
        };
        crew.setPlayers(
          (riders as Rider[])
            .filter((r) => typeof r.lat === 'number' && typeof r.lng === 'number')
            .map((r) => ({
              id: r.id, handle: r.handle, color: r.avatar_color, lng: r.lng, lat: r.lat,
              heading: r.heading ?? undefined,
              speed: r.speed ?? undefined,
              turn: r.turn ?? undefined,
              mode: r.mode === 'boda' ? 'boda' as const : 'board' as const,
              ageS: r.age_s ?? 0,
            })),
        );
      } catch { /* heartbeat is best-effort */ } finally {
        hbInFlight = false;
      }
    };
    heartbeat();
    const hbInterval = setInterval(heartbeat, HEARTBEAT_MS);

    // Buildings are solid once the map has told us where they are (set below)
    let blockedAt: (lng: number, lat: number) => boolean = () => false;

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

    /* ── Board wake ── */
    const wake = createWake(map, player.avatar_color);
    const shock = createShockwave(map, CHASER.WHIP_RANGE_M, CHASER.WHIP_HALF_ANGLE);

    /* ── Style: combo meter, ride audio, slow-mo ── */
    const combo = new Combo();
    const audio = new RideAudio();
    audioRef.current = audio;
    let slowUntil = 0;

    /* ── Traffic ── */
    preloadTraffic();
    const traffic = createTrafficLayer('run-traffic');
    if (!map.getLayer('run-traffic')) map.addLayer(traffic);
    const syncTraffic = () => traffic.setTraffic(obstaclesRef.current.map((o) => ({ id: o.id, kind: o.kind, lng: o.lng, lat: o.lat, heading: o.heading })));
    const pickKind = () => {
      let r = Math.random();
      for (const [k, w] of OB_MIX) { if ((r -= w) <= 0) return k; }
      return OB_MIX[0][0];
    };
    const spawnObstacle = (heading: number) => {
      if (obstaclesRef.current.length >= OB_MAX) return;
      const p = posRef.current;
      const ahead = 170 + Math.random() * 220;
      const side = (Math.random() - 0.5) * 60;
      const perp = heading + Math.PI / 2;
      const lng = p.lng
        + (Math.sin(heading) * ahead + Math.sin(perp) * side) / metersPerDegLng(p.lat);
      const lat = p.lat
        + (Math.cos(heading) * ahead + Math.cos(perp) * side) / M_PER_DEG_LAT;
      if (blockedAt(lng, lat)) return; // nothing parks inside buildings
      const kind = pickKind();
      const drives = kind === 'taxi' || kind === 'car';
      // Cars run with the traffic or straight at you; bodas park at an angle
      const obHeading = drives ? heading + (Math.random() < 0.5 ? Math.PI : 0) : heading + (Math.random() - 0.5) * 1.6;
      const speed = drives ? CAR_SPEED_MS[0] + Math.random() * (CAR_SPEED_MS[1] - CAR_SPEED_MS[0]) : 0;
      obstaclesRef.current.push({ id: obIdRef.current++, lng, lat, kind, heading: obHeading, speed });
      syncTraffic();
    };
    const removeObstacle = (ob: Obstacle) => {
      obstaclesRef.current = obstaclesRef.current.filter((o) => o.id !== ob.id);
      syncTraffic();
    };
    const driveTraffic = (dt: number) => {
      for (const o of obstaclesRef.current) {
        if (o.speed <= 0) continue;
        const lat = o.lat + (Math.cos(o.heading) * o.speed * dt) / M_PER_DEG_LAT;
        const lng = o.lng + (Math.sin(o.heading) * o.speed * dt) / metersPerDegLng(o.lat);
        if (blockedAt(lng, lat)) { o.speed = 0; continue; } // pulled up at a wall
        o.lat = lat;
        o.lng = lng;
      }
      syncTraffic();
    };

    /* ── Taking a hit (traffic or a rival's grab): stun, lose momentum and Tide ── */
    const takeHit = (ts: number, trauma: number) => {
      sfx.crash();
      chase.addTrauma(trauma);
      stunUntilRef.current = ts + CRASH_STUN_MS;
      speedRef.current *= 0.15; // the hit eats your momentum
      bodaUntilRef.current = 0; // knocked off the bike
      const loss = Math.floor((runTideRef.current * CRASH_LOSS_PCT) / COIN_VALUE) * COIN_VALUE;
      if (loss > 0) {
        runTideRef.current -= loss;
        setRunTide(runTideRef.current);
      }
      setCrashCount((c) => c + 1);
      buzz(70);
      const here = toLocal(posRef.current);
      fx.dust(here.x, here.y, 1.4);
      if (combo.bust() >= 2) {
        sfx.comboBust();
        callout('COMBO LOST', '#FF4757');
      }
      audio.setTier(1);
    };

    /* ── Rival crew ── */
    const chasers = createChaserLayer('chaser-runners');
    if (!map.getLayer('chaser-runners')) map.addLayer(chasers);
    const world: ChaseWorld = createChaseWorld();
    const origin = { lng: center.lng, lat: center.lat };
    const mLng0 = metersPerDegLng(origin.lat);
    const toLocal = (q: { lng: number; lat: number }) => ({
      x: (q.lng - origin.lng) * mLng0,
      y: (q.lat - origin.lat) * M_PER_DEG_LAT,
    });
    let attackUntil = 0;
    let lastJumpH = 0;

    /* ── Particles: sparks, dust, bursts ── */
    const fx = createFxLayer('run-fx', origin);
    if (!map.getLayer('run-fx')) map.addLayer(fx);

    /* ── Buildings: solid walls from the live map ── */
    const buildings = createBuildingSource(map, toLocal);
    const toLngLat = (x: number, y: number) => ({ lng: origin.lng + x / mLng0, lat: origin.lat + y / M_PER_DEG_LAT });
    blockedAt = (lng, lat) => {
      const l = toLocal({ lng, lat });
      return isBlocked(buildings.index, l.x, l.y);
    };
    world.blocked = (x, y) => isBlocked(buildings.index, x, y);
    // Keep the street-level camera out of the buildings behind you
    chase.setClearance((q, heading, maxBack, alt) => {
      const l = toLocal(q);
      return clearDistance(buildings.index, l.x, l.y, -Math.sin(heading), -Math.cos(heading), maxBack, 2, alt - 1);
    });
    // The ride starts wherever the map was looking — often inside a block.
    // Once the buildings are known, drop the rider on open road facing down it.
    let placed = false;
    let prevHeading = headingRef.current;
    const place = () => {
      const here = toLocal(posRef.current);
      const spot = findOpenSpot(buildings.index, here.x, here.y);
      if (!spot) return;
      const ll = toLngLat(spot.x, spot.y);
      posRef.current = { lng: ll.lng, lat: ll.lat };
      headingRef.current = openHeading(buildings.index, spot.x, spot.y, headingRef.current);
      prevHeading = headingRef.current;
      chase.snap(posRef.current, headingRef.current);
      wake.clear();
    };
    const goAt = performance.now() + START_DELAY_MS;
    let lastScrapeMs = 0;

    /* ── Adaptive quality: phones start lower and the governor adjusts to real fps ── */
    const governor = new QualityGovernor(initialQuality(deviceQualityHints()));
    let wakeEvery = 2;
    let speedLinesOn = true;
    const applyQuality = (q: QualitySettings) => {
      setMapPixelRatioCap(q.maxPixelRatio, map);
      crew.setQuality({ max: q.crewMax, xray: q.crewXray });
      buildings.setRefreshMs(q.buildingQueryMs);
      wakeEvery = q.wakeEvery;
      speedLinesOn = q.speedLines;
    };
    applyQuality(governor.settings);

    const pop = (text: string, color: string) => {
      const el = popRef.current;
      if (!el) return;
      el.textContent = text;
      el.style.color = color;
      el.classList.remove('surf-pop-go');
      void el.offsetWidth; // restart the CSS animation
      el.classList.add('surf-pop-go');
    };
    const bank = (amount: number) => {
      runTideRef.current += amount;
      setRunTide(runTideRef.current);
    };
    /** Bank a reward at the current combo multiplier; returns what was paid. */
    const earn = (base: number) => {
      const amount = base * combo.mult;
      bank(amount);
      return amount;
    };
    const callout = (text: string, color: string) => {
      const el = calloutRef.current;
      if (!el) return;
      el.textContent = text;
      el.style.color = color;
      el.classList.remove('surf-pop-go');
      void el.offsetWidth;
      el.classList.add('surf-pop-go');
    };
    const styleMove = (move: StyleMove) => {
      const up = combo.add(move);
      if (up === null) return;
      sfx.comboUp(up);
      audio.setTier(up);
      buzz(15);
      callout(`×${up} ${TIER_CALLS[up - 1]}`, TIER_COLORS[up - 1]);
    };
    const view = () => {
      const l = toLocal(posRef.current);
      return { x: l.x, y: l.y, heading: headingRef.current, speed: speedRef.current, jump: lastJumpH };
    };

    whipRef.current = () => {
      const now = performance.now();
      if (now < stunUntilRef.current) return;
      const hits = whip(world, view());
      if (hits === null) return; // cooling down
      attackUntil = now + 450;
      shock.trigger(posRef.current, headingRef.current);
      sfx.whoosh();
      if (hits.length > 0) {
        buzz([18, 30, 18]);
        sfx.roundWin();
        chase.addTrauma(0.25);
        for (const c of world.chasers) if (hits.includes(c.id)) fx.burst(c.x, c.y, 3, '#FF4757', 22);
        styleMove('whipHit');
        const paid = earn(CHASER.BOUNTY * hits.length);
        pop(`+${paid} KNOCKED OFF${hits.length > 1 ? ` ×${hits.length}` : ''}`, '#FFD84D');
      }
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
        case 'f': case 'F': case 'e': case 'E': if (down) whipRef.current(); return;
        case 'Escape': case 'p': case 'P': if (down) setPause(!pausedRef.current); return;
        default: return;
      }
      e.preventDefault();
    };
    const onDown = (e: KeyboardEvent) => { sfx.unlock(); setKey(e, true); };
    const onUp = (e: KeyboardEvent) => setKey(e, false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    // Backgrounding the app pauses the ride
    const onVis = () => { if (document.hidden) setPause(true); };
    document.addEventListener('visibilitychange', onVis);

    /* ── Radar ── */
    const drawRadar = () => {
      const cv = radarRef.current;
      const g = cv?.getContext('2d');
      if (!cv || !g) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const size = RADAR_PX * dpr;
      if (cv.width !== size) { cv.width = size; cv.height = size; }
      const r = size / 2;
      const k = (r - 4 * dpr) / RADAR_RANGE_M;
      const me = toLocal(posRef.current);
      const cosY = Math.cos(chase.yaw), sinY = Math.sin(chase.yaw);
      // Local meters → radar pixels, rotated so the camera's view points up
      const at = (x: number, y: number): [number, number] | null => {
        const dx = x - me.x, dy = y - me.y;
        const rx = dx * cosY - dy * sinY;
        const ry = dx * sinY + dy * cosY;
        const px = r + rx * k, py = r - ry * k;
        return Math.hypot(px - r, py - r) <= r - 3 * dpr ? [px, py] : null;
      };
      g.clearRect(0, 0, size, size);
      g.beginPath(); g.arc(r, r, r - dpr, 0, Math.PI * 2);
      g.fillStyle = 'rgba(9,13,24,0.72)'; g.fill();
      g.strokeStyle = 'rgba(0,194,255,0.35)'; g.lineWidth = dpr; g.stroke();
      g.beginPath(); g.arc(r, r, r * 0.5, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(0,194,255,0.12)'; g.stroke();
      const dot = (x: number, y: number, rad: number, color: string) => {
        const q = at(x, y);
        if (!q) return;
        g.beginPath(); g.arc(q[0], q[1], rad * dpr, 0, Math.PI * 2);
        g.fillStyle = color; g.fill();
      };
      for (const z of useGameStore.getState().nearby_zones) {
        const l = toLocal(z);
        const q = at(l.x, l.y);
        if (!q) continue;
        g.beginPath(); g.arc(q[0], q[1], Math.max(3 * dpr, (z.radius_meters ?? 200) * k), 0, Math.PI * 2);
        g.strokeStyle = 'rgba(0,194,255,0.7)'; g.lineWidth = 1.5 * dpr; g.stroke();
      }
      for (const c of coinsRef.current) { const l = toLocal(c); dot(l.x, l.y, 1.6, '#FFD84D'); }
      for (const rd of crew.getPositions()) { const l = toLocal(rd); dot(l.x, l.y, 2.4, '#F0F6FF'); }
      for (const c of world.chasers) if (c.state !== 'ko') dot(c.x, c.y, 3, '#FF4757');
      // You: an arrow pointing the way you ride
      const rel = headingRef.current - chase.yaw;
      g.save(); g.translate(r, r); g.rotate(rel);
      g.beginPath(); g.moveTo(0, -6 * dpr); g.lineTo(4.5 * dpr, 5 * dpr); g.lineTo(0, 2.5 * dpr); g.lineTo(-4.5 * dpr, 5 * dpr); g.closePath();
      g.fillStyle = player.avatar_color; g.fill();
      g.restore();
    };

    /* ── Game loop ── */
    let raf: number;
    let lastTs = performance.now();
    let lastObSpawn = 0;
    let frame = 0;
    let prevJumpH = 0;

    const tick = (ts: number) => {
      const dt = Math.min((ts - lastTs) / 1000, 0.05) * (ts < slowUntil ? SLOWMO_K : 1);
      lastTs = ts;
      if (pausedRef.current) {
        raf = requestAnimationFrame(tick);
        return;
      }
      frame++;
      if (!placed && buildings.index) {
        placed = true;
        place();
      }

      // Jump arc
      let jumpH = 0;
      if (jumpStartRef.current > 0) {
        const jt = (ts - jumpStartRef.current) / (JUMP_DUR_S * 1000);
        if (jt >= 1) jumpStartRef.current = 0;
        else jumpH = 4 * JUMP_H_M * jt * (1 - jt);
      }

      /* ── Input: the board cruises by itself; thumb or keys steer, push and brake ── */
      const k = keysRef.current;
      const thumb = thumbRef.current.input();
      const keySteer = (k.right ? 1 : 0) - (k.left ? 1 : 0);
      const steer = thumb.steering ? thumb.steer : keySteer;
      let throttle = k.up ? 1 : thumb.throttle;
      let brake = k.down || thumb.brake;

      const onBoda = ts < bodaUntilRef.current;
      const maxSpd = MAX_SPEED * (onBoda ? BODA_MULT : 1);
      const speed01 = Math.min(speedRef.current / MAX_SPEED, 1.2);

      // Steering authority grows with speed, but you can always pivot a bit
      headingRef.current += steer * TURN_RATE * dt * (0.5 + 0.5 * Math.min(speed01, 1));

      if (ts < goAt) throttle = 0;
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

        // Walls: scrape along them, or crash into them square-on
        if (buildings.index) {
          const here = toLocal(p);
          const r = resolveRider(buildings.index, {
            x: here.x, y: here.y, heading: headingRef.current, speed: speedRef.current,
          }, jumpH);
          if (r.crash || r.scrape) {
            const ll = toLngLat(r.x, r.y);
            p.lng = ll.lng;
            p.lat = ll.lat;
            headingRef.current = r.heading;
            speedRef.current = r.speed;
            // Sparks fly off the wall the rider was pushed out of
            const nlen = Math.hypot(r.x - here.x, r.y - here.y) || 1;
            const nx = (r.x - here.x) / nlen, ny = (r.y - here.y) / nlen;
            if (r.crash || ts - lastScrapeMs > 90) fx.sparks(r.x - nx * 3, r.y - ny * 3, nx, ny, r.heading, r.crash ? r.impact : r.speed);
            if (r.crash && ts >= stunUntilRef.current) {
              // The board rides itself, so bounce off pointing down open road —
              // otherwise auto-cruise would grind you straight back into the wall
              headingRef.current = openHeading(buildings.index, r.x, r.y, headingRef.current, 160, 16);
              takeHit(ts, 0.8);
              pop('WALL!', '#FF4757');
            } else if (r.scrape && ts - lastScrapeMs > 250) {
              lastScrapeMs = ts;
              chase.addTrauma(0.12);
              sfx.scrape();
            }
          }
        }

        // Coin pickup
        const before = coinsRef.current.length;
        coinsRef.current = coinsRef.current.filter(
          (c) => distM(c.lng, c.lat, p.lng, p.lat) > COIN_COLLECT_M
        );
        const grabbed = before - coinsRef.current.length;
        if (grabbed > 0) {
          sfx.hit(combo.mult + grabbed);
          for (let i = 0; i < grabbed; i++) { styleMove('coin'); earn(COIN_VALUE); }
          const me = toLocal(p);
          fx.burst(me.x, me.y, 4, '#FFD84D', 10 + 6 * grabbed);
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
            (o) => distM(o.lng, o.lat, p.lng, p.lat) <= TRAFFIC[o.kind].radiusM
          );
          if (hit) {
            removeObstacle(hit);
            if (TRAFFIC[hit.kind].mountable) {
              // Swing onto the boda — 8s of boost
              bodaUntilRef.current = ts + BODA_RIDE_MS;
              sfx.roundWin();
              chase.addTrauma(0.2);
              styleMove('boda');
              const me = toLocal(p);
              fx.burst(me.x, me.y, 2, '#00E096', 20);
            } else {
              takeHit(ts, 0.7);
            }
          }
        }

        // Style: threading past traffic at speed, or sailing right over it
        if (speedRef.current > NEAR_MISS_MIN_MS) {
          for (const o of obstaclesRef.current) {
            if (o.styled) continue;
            const d = distM(o.lng, o.lat, p.lng, p.lat);
            const r = TRAFFIC[o.kind].radiusM;
            if (jumpH >= OB_CLEAR_JUMP_M && d <= r) {
              o.styled = true;
              styleMove('jumpOver');
              const paid = earn(NEAR_MISS_BONUS * 2);
              pop(`+${paid} OVER THE TOP`, '#00E096');
            } else if (jumpH < OB_CLEAR_JUMP_M && d > r && d <= r + NEAR_MISS_M) {
              o.styled = true;
              styleMove('nearMiss');
              const paid = earn(NEAR_MISS_BONUS);
              sfx.nearMiss();
              slowUntil = ts + SLOWMO_MS;
              pop(`+${paid} CLOSE ONE`, '#F0F6FF');
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
                pop(`📍 ${z.name.toUpperCase()}`, '#00C2FF');
                sfx.whoosh();
              }
              break;
            }
          }
        }
      }

      if (dt > 0) {
        const raw = normAngle(headingRef.current - prevHeading) / dt;
        yawRateRef.current += (raw - yawRateRef.current) * (1 - Math.exp(-8 * dt));
      }
      prevHeading = headingRef.current;

      buildings.update(p, ts);
      driveTraffic(dt);
      // Coins that landed inside buildings move out to open ground
      if (frame % 45 === 0 && buildings.index) {
        let moved = false;
        for (const c of coinsRef.current) {
          if (!blockedAt(c.lng, c.lat)) continue;
          for (let i = 0; i < 6; i++) {
            const ang = Math.random() * Math.PI * 2;
            const d = 80 + Math.random() * COIN_FIELD_M;
            const lng = p.lng + (Math.cos(ang) * d) / metersPerDegLng(p.lat);
            const lat = p.lat + (Math.sin(ang) * d) / M_PER_DEG_LAT;
            if (!blockedAt(lng, lat)) { c.lng = lng; c.lat = lat; moved = true; break; }
          }
        }
        if (moved) syncCoins();
      }

      /* ── Rival crew: simulate, react, render, point at threats ── */
      lastJumpH = jumpH;
      for (const ev of stepChase(world, view(), dt, distRef.current)) {
        if (ev.type === 'spawn') {
          sfx.aiMove();
          pop('RIVAL CREW ON YOUR TAIL', '#FF4757');
        } else if (ev.type === 'caught') {
          takeHit(ts, 0.85);
          pop('GRABBED — −30% RUN TIDE', '#FF4757');
        } else if (ev.type === 'dodged') {
          sfx.hit(2);
          styleMove('jumpOver');
          pop(`+${earn(CHASER.DODGE_BONUS)} SAILED OVER`, '#00E096');
        } else if (ev.type === 'wipeout') {
          buzz(25);
          sfx.roundWin();
          styleMove('wipeout');
          pop(`+${earn(CHASER.WIPEOUT_BONUS)} WIPEOUT`, '#FFD84D');
        } else if (ev.type === 'escaped') {
          styleMove('escape');
          pop(`+${earn(CHASER.ESCAPE_BONUS)} SHOOK THEM OFF`, '#00C2FF');
        }
      }
      chasers.setChasers(world.chasers.map((c) => ({
        id: c.id,
        lng: origin.lng + c.x / mLng0,
        lat: origin.lat + c.y / M_PER_DEG_LAT,
        heading: c.heading,
        speed01: c.speed / MAX_SPEED,
        ko: c.state === 'ko',
      })));
      if (frame % 3 === 0) {
        const me = toLocal(p);
        const hunting = world.chasers
          .filter((c) => c.state === 'chase')
          .map((c) => ({ c, d: Math.hypot(c.x - me.x, c.y - me.y) }))
          .sort((a, b) => a.d - b.d);
        threatRefs.current.forEach((el, i) => {
          if (!el) return;
          const h = hunting[i];
          if (!h || h.d > 420) { el.style.opacity = '0'; return; }
          // Bearing relative to where the camera looks: 0 = ahead, π = behind
          const rel = Math.atan2(h.c.x - me.x, h.c.y - me.y) - chase.yaw;
          const rx = Math.sin(rel) * 42; // % of half-width
          const ry = -Math.cos(rel) * 38;
          el.style.opacity = String(h.d < 60 ? 1 : 0.85);
          el.style.left = `${50 + rx}%`;
          el.style.top = `${54 + ry}%`;
          el.style.transform = `translate(-50%, -50%) rotate(${rel}rad)`;
          const label = el.querySelector('span');
          if (label) label.textContent = `${Math.round(h.d)}m`;
          el.classList.toggle('surf-threat-close', h.d < 60);
        });
        if (whipBtnRef.current) {
          const cd = whipCooldown(world) / CHASER.WHIP_COOLDOWN_S;
          whipBtnRef.current.style.background = `conic-gradient(rgba(255,71,87,0.85) ${(1 - cd) * 360}deg, rgba(9,13,24,0.6) 0deg)`;
        }
      }

      /* ── Chase camera + speed FX. Runs every frame so it keeps settling at rest. ── */
      // A hard landing kicks the camera
      if (prevJumpH > 2 && jumpH === 0) {
        chase.addTrauma(0.35);
        const me = toLocal(p);
        fx.dust(me.x, me.y);
        sfx.land();
      }
      prevJumpH = jumpH;
      if (onBoda && moving) chase.rumble(0.16 * Math.min(speed01, 1));
      chase.update(map, p, headingRef.current, speed01, jumpH, dt, ts / 1000);
      if (governor.frame(dt)) applyQuality(governor.settings);
      const dropped = combo.tick(dt);
      if (dropped !== null) audio.setTier(dropped);
      audio.update(speed01, onBoda, jumpH > 0.5);
      if (frame % 3 === 0 && comboChipRef.current && comboTextRef.current && comboBarRef.current) {
        const tier = combo.mult;
        comboTextRef.current.textContent = `×${tier}`;
        comboChipRef.current.style.borderColor = TIER_COLORS[tier - 1];
        comboTextRef.current.style.color = TIER_COLORS[tier - 1];
        comboBarRef.current.style.width = `${Math.round(combo.progress * 100)}%`;
        comboBarRef.current.style.background = TIER_COLORS[Math.min(tier, 4)];
        comboChipRef.current.style.opacity = combo.heat > 0 ? '1' : '0.55';
      }
      if (frame % wakeEvery === 0) wake.push(p, moving ? speed01 : 0);
      shock.update(ts);
      if (frame % 4 === 0 && speedFxRef.current) {
        const k = Math.min(Math.max((speed01 - 0.5) / 0.6, 0), 1);
        speedFxRef.current.style.opacity = speedLinesOn ? String(k * (onBoda ? 0.85 : 0.6)) : '0';
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

      // Radar: what's around you, rotated so up is where the camera looks
      if (frame % 4 === 0) drawRadar();

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
        crashed: ts < stunUntilRef.current,
        attacking: ts < attackUntil,
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
      document.removeEventListener('visibilitychange', onVis);
      audio.stop();
      audioRef.current = null;
      if (map.getLayer('run-fx')) map.removeLayer('run-fx');
      chase.setClearance(null);
      remoteTags.forEach((t) => t.remove());
      remoteTags.clear();
      obstaclesRef.current = [];
      if (map.getLayer('run-traffic')) map.removeLayer('run-traffic');
      if (map.getLayer('player-runner')) map.removeLayer('player-runner');
      if (map.getLayer('crew-runners')) map.removeLayer('crew-runners');
      wake.remove();
      setMapPixelRatioCap(2, map); // back to the browsing default
      shock.remove();
      if (map.getLayer('chaser-runners')) map.removeLayer('chaser-runners');
      whipRef.current = () => {};
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
      map.setMaxZoom(browseMaxZoom);
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
  // Keyed on the id, not the object: balance updates replace `player` and
  // must not tear down and restart a run in progress.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, player?.id]);

  /* ── Touch: one thumb steers anywhere on screen, tap = whip, flick up = jump ── */
  const drawStick = () => {
    const st = thumbRef.current.stick();
    const ring = stickRingRef.current;
    const knob = stickKnobRef.current;
    if (!ring || !knob) return;
    if (!st) { ring.style.opacity = '0'; return; }
    const dx = Math.max(-THUMB.STEER_PX, Math.min(THUMB.STEER_PX, st.dx));
    const dy = Math.max(-THUMB.PUSH_PX, Math.min(THUMB.PUSH_PX, st.dy)) * 0.5;
    ring.style.opacity = '1';
    ring.style.transform = `translate(${st.x0 - 48}px, ${st.y0 - 48}px)`;
    knob.style.transform = `translate(${dx * 0.55}px, ${dy * 0.55}px)`;
  };
  const touchDown = (e: React.PointerEvent) => {
    if (pausedRef.current) return;
    sfx.unlock(); // phones only start audio from a touch
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    thumbRef.current.down(e.pointerId, e.clientX, e.clientY, e.timeStamp);
    if (showHints) dismissHints();
    drawStick();
  };
  const touchMove = (e: React.PointerEvent) => {
    if (thumbRef.current.move(e.pointerId, e.clientX, e.clientY, e.timeStamp) === 'jump') {
      doJump();
      buzz(12);
    }
    drawStick();
  };
  const touchUp = (e: React.PointerEvent) => {
    if (thumbRef.current.up(e.pointerId, e.timeStamp) === 'whip') whipRef.current();
    drawStick();
  };
  const touchCancel = (e: React.PointerEvent) => {
    thumbRef.current.cancel(e.pointerId);
    drawStick();
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
        .surf-threat {
          position:absolute; z-index:25; pointer-events:none; opacity:0;
          width:0; height:0; transition: opacity 0.2s;
        }
        .surf-threat::before {
          content:''; position:absolute; left:-11px; top:-30px;
          border-left:11px solid transparent; border-right:11px solid transparent;
          border-bottom:20px solid #FF4757;
          filter: drop-shadow(0 0 6px rgba(255,71,87,0.9));
        }
        .surf-threat span {
          position:absolute; left:50%; top:-4px; transform:translateX(-50%);
          font-family: var(--font-mono); font-size:10px; font-weight:700; color:#fff;
          background:rgba(9,13,24,0.8); padding:1px 5px; white-space:nowrap;
        }
        .surf-threat-close::before { animation: surf-threat-pulse 0.35s ease-in-out infinite alternate; }
        @keyframes surf-threat-pulse { to { transform: scale(1.35); } }
        .surf-pop {
          position:absolute; left:50%; top:30%; transform:translate(-50%,-50%); z-index:35;
          font-family: var(--font-arcade); font-size:26px; letter-spacing:0.1em; white-space:nowrap;
          text-shadow: 0 2px 10px rgba(0,0,0,0.8); pointer-events:none; opacity:0;
        }
        .surf-pop-go { animation: surf-pop 1.3s ease-out forwards; }
        .surf-callout { top: 21%; font-size: 40px; letter-spacing: 0.12em; }
        @keyframes surf-pop {
          0% { opacity:0; transform:translate(-50%,-30%) scale(0.7); }
          12% { opacity:1; transform:translate(-50%,-50%) scale(1.12); }
          25% { transform:translate(-50%,-50%) scale(1); }
          75% { opacity:1; }
          100% { opacity:0; transform:translate(-50%,-90%) scale(1); }
        }
        .surf-speedlines {
          background: repeating-conic-gradient(from 0deg at 50% 62%,
            rgba(255,255,255,0.0) 0deg 2.2deg, rgba(255,255,255,0.55) 2.6deg, rgba(255,255,255,0.0) 3deg 7deg);
          -webkit-mask-image: radial-gradient(ellipse 75% 70% at 50% 62%, transparent 42%, #000 100%);
          mask-image: radial-gradient(ellipse 75% 70% at 50% 62%, transparent 42%, #000 100%);
          transition: opacity 0.25s linear;
          animation: surf-speedlines-flicker 0.12s steps(2) infinite;
        }
        @keyframes surf-speedlines-flicker { from { transform: rotate(0deg) scale(1.02); } to { transform: rotate(1.4deg) scale(1.04); } }
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

      {/* Speed lines — fade in near top speed (opacity driven from the game loop) */}
      <div ref={speedFxRef} className="surf-speedlines absolute inset-0 z-10 pointer-events-none" style={{ opacity: 0 }} />

      {/* Boda boost vignette — subtle green speed edges while mounted */}
      {bodaLeft > 0 && (
        <div className="absolute inset-0 z-10 pointer-events-none"
          style={{ background: 'radial-gradient(circle, transparent 55%, rgba(0,224,150,0.16) 100%)' }} />
      )}

      {/* Touch surface — the whole screen is the controller (under the HUD) */}
      <div
        className="absolute inset-0 z-20 touch-none select-none"
        style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
        onPointerDown={touchDown}
        onPointerMove={touchMove}
        onPointerUp={touchUp}
        onPointerCancel={touchCancel}
        aria-label="Ride controls: drag to steer, tap to whip, flick up to jump"
      />

      {/* Floating stick: appears under your thumb while you steer */}
      <div ref={stickRingRef} className="absolute left-0 top-0 z-[21] pointer-events-none"
        style={{
          width: 96, height: 96, borderRadius: '50%', opacity: 0, transition: 'opacity 0.12s',
          border: '1.5px solid rgba(0,194,255,0.45)', background: 'rgba(9,13,24,0.25)',
        }}>
        <div ref={stickKnobRef} className="absolute"
          style={{
            left: 28, top: 28, width: 40, height: 40, borderRadius: '50%',
            background: 'linear-gradient(140deg, rgba(0,194,255,0.9), rgba(124,92,252,0.9))',
            boxShadow: '0 0 14px rgba(0,194,255,0.55)',
          }} />
      </div>

      {/* Slim top bar: pause · run stats · whip charge — radar on the right */}
      <div className="absolute left-3 right-3 z-30 flex items-start gap-2 pointer-events-none"
        style={{ top: 'calc(var(--safe-top, 0px) + 8px)' }}>
        <button onClick={() => setPause(true)} aria-label="Pause ride"
          className="pointer-events-auto flex items-center justify-center shrink-0"
          style={{
            width: 42, height: 42, borderRadius: 12,
            background: 'rgba(9,13,24,0.72)', border: '1px solid rgba(240,246,255,0.18)',
            backdropFilter: 'blur(8px)',
          }}>
          <span style={{ display: 'flex', gap: 4 }}>
            <span style={{ width: 4, height: 15, borderRadius: 2, background: '#F0F6FF' }} />
            <span style={{ width: 4, height: 15, borderRadius: 2, background: '#F0F6FF' }} />
          </span>
        </button>

        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2.5 px-3"
            style={{
              height: 42, borderRadius: 12,
              background: 'rgba(9,13,24,0.72)', border: '1px solid rgba(255,184,0,0.3)',
              backdropFilter: 'blur(8px)',
            }}>
            <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '19px', letterSpacing: '0.06em', color: '#FFD84D', lineHeight: 1, whiteSpace: 'nowrap' }}>
              +{runTide} T
            </span>
            <span style={{ width: 1, height: 18, background: 'rgba(240,246,255,0.15)' }} />
            <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '15px', letterSpacing: '0.06em', color: bodaLeft > 0 ? '#00E096' : '#F0F6FF', lineHeight: 1, whiteSpace: 'nowrap', minWidth: 58 }}>
              {speedKmh}<span style={{ fontSize: '10px', color: '#8BA3BE', marginLeft: 3 }}>KM/H</span>
            </span>
            <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '15px', letterSpacing: '0.06em', color: '#00C2FF', lineHeight: 1, whiteSpace: 'nowrap' }}>
              {distKm.toFixed(1)}<span style={{ fontSize: '10px', color: '#8BA3BE', marginLeft: 3 }}>KM</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Combo: multiplier and progress to the next tier (driven from the game loop) */}
            <div ref={comboChipRef} className="relative overflow-hidden rounded-full flex items-center px-2 py-[2px]"
              style={{ background: 'rgba(9,13,24,0.88)', border: '1.5px solid #F0F6FF', opacity: 0.55, minWidth: 44 }}>
              <div ref={comboBarRef} className="absolute left-0 bottom-0 h-[3px]" style={{ width: '0%', background: '#00E096' }} />
              <span ref={comboTextRef} style={{ fontFamily: 'var(--font-arcade)', fontSize: '13px', letterSpacing: '0.08em', color: '#F0F6FF', lineHeight: 1.2 }}>×1</span>
            </div>
            {/* Whip charge: fills as the cooldown recovers */}
            <div ref={whipBtnRef} className="rounded-full p-[2px]" style={{ background: 'rgba(255,71,87,0.85)' }}>
              <div className="rounded-full px-2 py-[3px]" style={{ background: 'rgba(9,13,24,0.88)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', fontWeight: 700, letterSpacing: '0.14em', color: '#FF4757' }}>WHIP</span>
              </div>
            </div>
            {bodaLeft > 0 && (
              <span className="px-2 py-[3px] rounded-full"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', fontWeight: 700, letterSpacing: '0.14em', color: '#00E096', background: 'rgba(9,13,24,0.8)', border: '1px solid rgba(0,224,150,0.5)' }}>
                🛵 BOOST {bodaLeft.toFixed(0)}s
              </span>
            )}
          </div>
        </div>

        <canvas ref={radarRef} className="ml-auto shrink-0" aria-hidden
          style={{ width: RADAR_PX, height: RADAR_PX, borderRadius: '50%' }} />
      </div>

      {/* Rival threat arrows — positioned and rotated from the game loop */}
      {[0, 1, 2].map((i) => (
        <div key={i} ref={(el) => { threatRefs.current[i] = el; }} className="surf-threat"><span /></div>
      ))}
      <div ref={popRef} className="surf-pop" />
      <div ref={calloutRef} className="surf-pop surf-callout" />

      {/* First-ride hints */}
      <AnimatePresence>
        {showHints && !paused && (
          <motion.div
            className="absolute inset-x-0 mx-auto z-[25] pointer-events-none flex flex-col items-center gap-2"
            style={{ bottom: 'calc(var(--safe-bottom, 0px) + 40px)', width: 'min(340px, calc(100% - 32px))' }}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
          >
            <div className="lg:hidden grid grid-cols-2 gap-x-4 gap-y-1.5 px-4 py-3 w-full"
              style={{ background: 'rgba(9,13,24,0.78)', border: '1px solid rgba(0,194,255,0.3)', borderRadius: 14, backdropFilter: 'blur(8px)' }}>
              {[
                ['👆 DRAG', 'steer'],
                ['⬇ DRAG DOWN', 'brake'],
                ['👉 TAP', 'tail-whip'],
                ['⬆ FLICK UP', 'jump'],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline gap-2">
                  <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '13px', letterSpacing: '0.06em', color: '#F0F6FF', whiteSpace: 'nowrap' }}>{k}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#8BA3BE' }}>{v}</span>
                </div>
              ))}
            </div>
            <p className="hidden lg:block px-4 py-2"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.2em', color: '#F0F6FF', background: 'rgba(9,13,24,0.78)', borderRadius: 10 }}>
              ← → STEER · ↑ PUSH · ↓ BRAKE · SPACE JUMP · F WHIP · R FIND ME · ESC PAUSE
            </p>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.2em', color: 'rgba(240,246,255,0.7)', textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>
              BOARD RIDES ITSELF · SKIM TRAFFIC FOR COMBOS
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pause: the only way out of the ride, and back to the map and menus */}
      <AnimatePresence>
        {paused && (
          <motion.div
            className="absolute inset-0 z-40 flex items-center justify-center px-6"
            style={{ background: 'rgba(5,8,16,0.62)', backdropFilter: 'blur(6px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full flex flex-col gap-3 p-5"
              style={{ maxWidth: 340, background: 'rgba(9,13,24,0.94)', border: '1px solid rgba(0,194,255,0.3)', borderRadius: 18 }}
              initial={{ scale: 0.94, y: 10 }} animate={{ scale: 1, y: 0 }}
            >
              <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '26px', letterSpacing: '0.14em', color: '#F0F6FF', textAlign: 'center', lineHeight: 1 }}>PAUSED</p>
              <div className="flex justify-center gap-5 pb-1">
                <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '17px', color: '#FFD84D' }}>+{runTide} T</span>
                <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '17px', color: '#00C2FF' }}>{distKm.toFixed(1)} KM</span>
              </div>
              <button onClick={() => setPause(false)} aria-label="Resume ride"
                className="w-full py-3.5"
                style={{ borderRadius: 12, background: 'linear-gradient(135deg, #00C2FF, #7C5CFC)', fontFamily: 'var(--font-arcade)', fontSize: '19px', letterSpacing: '0.14em', color: '#fff' }}>
                RESUME
              </button>
              <button onClick={() => { recenter(); setPause(false); }} aria-label="Recenter camera and resume"
                className="w-full py-3"
                style={{ borderRadius: 12, border: '1px solid rgba(0,194,255,0.35)', fontFamily: 'var(--font-arcade)', fontSize: '15px', letterSpacing: '0.14em', color: '#00C2FF' }}>
                ⌖ FIND ME
              </button>
              <div className="flex gap-2">
                {([['sound', 'SOUND'], ['music', 'MUSIC']] as const).map(([key, label]) => (
                  <button key={key} aria-pressed={audioPrefs[key]} aria-label={`${label.toLowerCase()} ${audioPrefs[key] ? 'on' : 'off'}`}
                    onClick={() => { setAudioPrefs({ [key]: !audioPrefs[key] }); setPrefsState(getAudioPrefs()); }}
                    className="flex-1 py-2.5"
                    style={{
                      borderRadius: 12, fontFamily: 'var(--font-arcade)', fontSize: '14px', letterSpacing: '0.12em',
                      border: `1px solid ${audioPrefs[key] ? 'rgba(0,224,150,0.5)' : 'rgba(240,246,255,0.16)'}`,
                      color: audioPrefs[key] ? '#00E096' : '#5C6F86',
                    }}>
                    {label} {audioPrefs[key] ? 'ON' : 'OFF'}
                  </button>
                ))}
              </div>
              <button onClick={endRun} aria-label="End ride and open the map"
                className="w-full py-3"
                style={{ borderRadius: 12, border: '1px solid rgba(240,246,255,0.16)', fontFamily: 'var(--font-arcade)', fontSize: '15px', letterSpacing: '0.14em', color: '#8BA3BE' }}>
                END RIDE · MAP & MENUS
              </button>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#5C6F86', textAlign: 'center' }}>
                Ending the ride banks your Tide.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
