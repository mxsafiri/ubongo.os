'use client';

import { useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import { useGameStore } from '@/store/game';
import { createRunnerLayer } from './RunnerLayer';
import { createCrewLayer } from './CrewLayer';
import { PLACES, TRAVEL, distanceM, doorOf, placeAt, placeById, travelSeconds } from '@/lib/game/places';
import { fetchRoute, pathLength, pointAlong, type LngLat } from '@/lib/map/route';
import { hasMapboxToken } from '@/lib/map/fallbackStyle';
import { sfx } from '@/lib/game/sfx';

// Life on the real map: your character stands in the city, walks where you
// tap, and travels to places — on foot or by boda — along real streets.
// Arriving at a place opens its card (jobs, things to do). Others are shown
// live from the same heartbeat Surf Run uses.

const SAVE_KEY = 'surfari-life-pos';
const DAR_BOUNDS = { minLat: -7.0, maxLat: -6.6, minLng: 39.05, maxLng: 39.45 };
const TAP_WALK_MAX_M = 900;    // farther taps ask you to pick a place instead
const HEARTBEAT_MOVING_MS = 2500;
const HEARTBEAT_IDLE_MS = 12_000;
const LIFE_ZOOM = 19.2;          // close enough to see your character among the buildings
const LIFE_PITCH = 60;
const LIFE_MAX_ZOOM = 21;
const LIFE_UNIT_M = 4.4;         // character scale in life mode (~8 m tall: readable from the street camera)

let lifeActive = false;
/** CityMap asks this before treating a map tap as "plant turf here". */
export const isLifeActive = () => lifeActive;

const inDar = (p: { lat: number; lng: number }) =>
  p.lat > DAR_BOUNDS.minLat && p.lat < DAR_BOUNDS.maxLat && p.lng > DAR_BOUNDS.minLng && p.lng < DAR_BOUNDS.maxLng;

function readSaved(): { lng: number; lat: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
    return v && typeof v.lat === 'number' && typeof v.lng === 'number' && inDar(v) ? v : null;
  } catch {
    return null;
  }
}

function pinElement(place: (typeof PLACES)[number]) {
  const el = document.createElement('button');
  el.className = 'life-pin';
  el.setAttribute('aria-label', `${place.name} — open place`);
  el.innerHTML = `<span class="life-pin-ic">${place.icon}</span><span class="life-pin-name">${place.name}</span>`;
  return el;
}

export function LifeMode({ map }: { map: mapboxgl.Map }) {
  const player = useGameStore((s) => s.player);

  useEffect(() => {
    if (!player) return;
    lifeActive = true;
    const store = useGameStore.getState;
    const fromServer = player.geo_lat !== null && player.geo_lng !== null
      ? { lat: Number(player.geo_lat), lng: Number(player.geo_lng) } : null;
    const start = readSaved() ?? (fromServer && inDar(fromServer) ? fromServer : null) ?? doorOf(placeById.kariakoo);
    const pos = { ...start };
    let heading = 0;
    let speed = 0;                 // m/s right now
    let anim01 = 0;                // what the character's legs show (0…1)
    let mode: 'foot' | 'boda' = 'foot';
    let trip: { path: LngLat[]; len: number; dist: number; mps: number; placeId: string | null } | null = null;
    let lastBeat = 0;
    let beatInFlight = false;
    let follow = false;

    const here = () => placeAt(pos)?.id ?? null;
    store().setLife({ pos: { ...pos }, hereId: here() });

    /* ── Your character and everyone else ── */
    const browseMaxZoom = map.getMaxZoom();
    map.setMaxZoom(LIFE_MAX_ZOOM);
    const runner = createRunnerLayer('life-avatar', player.avatar_color, LIFE_UNIT_M);
    if (!map.getLayer('life-avatar')) map.addLayer(runner);
    const crew = createCrewLayer('life-crew');
    if (!map.getLayer('life-crew')) map.addLayer(crew);

    const tagEl = document.createElement('div');
    tagEl.className = 'life-tag';
    tagEl.textContent = `@${player.handle}`;
    tagEl.style.borderColor = player.avatar_color;
    const tag = new mapboxgl.Marker({ element: tagEl, anchor: 'bottom', offset: [0, -58] }).setLngLat([pos.lng, pos.lat]).addTo(map);

    /* ── Route line while travelling ── */
    const empty = { type: 'FeatureCollection' as const, features: [] };
    if (!map.getSource('life-route')) {
      map.addSource('life-route', { type: 'geojson', data: empty });
      map.addLayer({
        id: 'life-route', type: 'line', source: 'life-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#00C2FF', 'line-width': 5, 'line-opacity': 0.85, 'line-dasharray': [1.2, 1.6], 'line-emissive-strength': 1 },
      } as mapboxgl.LayerSpecification, 'life-avatar');
    }
    const showRoute = (path: LngLat[] | null) => {
      (map.getSource('life-route') as mapboxgl.GeoJSONSource | undefined)?.setData(
        path ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: path } } : empty,
      );
    };

    /* ── Places as pins ── */
    const markers = PLACES.map((place) => {
      const el = pinElement(place);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        sfx.pop();
        store().selectPlace(place.id);
      });
      return new mapboxgl.Marker({ element: el, anchor: 'bottom', offset: [0, -6] }).setLngLat([place.lng, place.lat]).addTo(map);
    });
    const labelsByZoom = () => {
      const show = map.getZoom() > 15.5;
      for (const m of markers) m.getElement().classList.toggle('life-pin-compact', !show);
    };
    labelsByZoom();
    map.on('zoom', labelsByZoom);

    /* ── Camera: settle near your character ── */
    map.easeTo({ center: [pos.lng, pos.lat], zoom: LIFE_ZOOM, pitch: LIFE_PITCH, duration: 1600, essential: true });

    /* ── Moving ── */
    const beginTrip = (path: LngLat[], tripMode: 'walk' | 'boda', placeId: string | null) => {
      const len = pathLength(path);
      if (len < 2) {
        arrive(placeId);
        return;
      }
      const secs = travelSeconds(tripMode, len);
      trip = { path, len, dist: 0, mps: len / secs, placeId };
      mode = tripMode === 'boda' ? 'boda' : 'foot';
      follow = true;
      showRoute(path);
      store().setLife({ travel: placeId ? { placeId, mode: tripMode, status: 'moving', etaS: Math.round(secs) } : null, hereId: null });
    };

    const arrive = (placeId: string | null) => {
      trip = null;
      speed = 0;
      mode = 'foot';
      showRoute(null);
      if (placeId) Object.assign(pos, doorOf(placeById[placeId]));
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(pos)); } catch { /* private mode */ }
      const hereId = here();
      store().setLife({ pos: { ...pos }, hereId, travel: null, ...(placeId ? { selectedPlaceId: placeId } : {}) });
      if (placeId) sfx.roundWin();
      void heartbeat(true);
    };

    const travelTo = async (placeId: string, tripMode: 'walk' | 'boda') => {
      const place = placeById[placeId];
      if (!place) return;
      const st = store();
      const me = st.player;
      if (!me) return;
      // Bodas cost a fare; the server knows where you are and takes it first
      if (TRAVEL[tripMode].perKm > 0) {
        await heartbeat(true); // make sure the server has your latest position
        try {
          const res = await fetch('/api/game/travel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_id: me.id, place_id: placeId, mode: tripMode }),
          });
          const body = await res.json();
          if (!res.ok) {
            st.addNotification({ type: 'system', title: 'No ride', message: body.error ?? 'Could not pay the fare' });
            st.setLife({ travel: null });
            return;
          }
          if (body.player) useGameStore.setState((s) => ({ player: s.player ? { ...s.player, tide_tokens: body.player.tide_tokens } : s.player }));
        } catch {
          st.addNotification({ type: 'system', title: 'No ride', message: 'Lost connection — try again' });
          st.setLife({ travel: null });
          return;
        }
      }
      const token = hasMapboxToken() ? (mapboxgl.accessToken ?? undefined) : undefined;
      const door = doorOf(place);
      const path = await fetchRoute(tripMode === 'boda' ? 'driving' : 'walking', [pos.lng, pos.lat], [door.lng, door.lat], token);
      sfx.whoosh();
      beginTrip(path, tripMode, placeId);
    };

    // Requests from the place card / Places tab
    const unsub = useGameStore.subscribe((s) => s.life.travel, (travel) => {
      if (!travel) return;
      if (travel.status === 'requested' && store().life.shift) {
        store().setLife({ travel: null }); // no leaving mid-shift
        return;
      }
      if (travel.status === 'requested') {
        store().setLife({ travel: { ...travel, status: 'moving' } });
        void travelTo(travel.placeId, travel.mode);
      } else if (travel.skip && trip) {
        trip.dist = trip.len; // a quick cut to the door
      }
    });

    // Tap the street to walk there
    const onClick = (e: mapboxgl.MapMouseEvent) => {
      if (trip || store().riding) return;
      const target = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      const shift = store().life.shift;
      if (shift && placeById[shift.placeId] && distanceM(placeById[shift.placeId], target) > 120) {
        store().addNotification({ type: 'system', title: 'On a shift', message: 'Clock out before you wander off.' });
        return;
      }
      const d = distanceM(pos, target);
      if (d > TAP_WALK_MAX_M) {
        store().addNotification({ type: 'system', title: 'Too far to walk', message: 'Pick a place to travel there.' });
        return;
      }
      store().selectPlace(null);
      beginTrip([[pos.lng, pos.lat], [target.lng, target.lat]], 'walk', null);
    };
    map.on('click', onClick);

    // You took the camera: stop following until the next trip or recenter
    const onDrag = () => { follow = false; };
    map.on('dragstart', onDrag);
    const recenter = () => {
      follow = true;
      map.easeTo({ center: [pos.lng, pos.lat], zoom: LIFE_ZOOM, pitch: LIFE_PITCH, duration: 700 });
    };
    window.addEventListener('surfari:recenter', recenter);

    /* ── Heartbeat: tell the server where you are, see who's around ── */
    async function heartbeat(force = false) {
      const now = performance.now();
      const me = store().player;
      if (!me || beatInFlight) return;
      if (!force && now - lastBeat < (trip ? HEARTBEAT_MOVING_MS : HEARTBEAT_IDLE_MS)) return;
      lastBeat = now;
      beatInFlight = true;
      try {
        const res = await fetch('/api/game/players/position', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ player_id: me.id, lat: pos.lat, lng: pos.lng, heading, speed, turn: 0, mode }),
        });
        if (!res.ok) return;
        const { players: others } = await res.json();
        type Rider = { id: string; handle: string; avatar_color: string; lat: number; lng: number; heading: number | null; speed: number | null; turn: number | null; mode: string | null; age_s: number | null };
        crew.setPlayers((others as Rider[]).filter((r) => typeof r.lat === 'number').map((r) => ({
          id: r.id, handle: r.handle, color: r.avatar_color, lng: r.lng, lat: r.lat,
          heading: r.heading ?? undefined, speed: r.speed ?? undefined, turn: r.turn ?? undefined,
          mode: r.mode === 'boda' ? 'boda' as const : r.mode === 'foot' ? 'foot' as const : 'board' as const,
          ageS: r.age_s ?? 0,
        })));
      } catch { /* best-effort */ } finally {
        beatInFlight = false;
      }
    }
    void heartbeat(true);

    /* ── Frame loop ── */
    let raf = 0;
    let last = performance.now();
    let lastStoreSync = 0;
    const tick = (ts: number) => {
      const dt = Math.min((ts - last) / 1000, 0.1);
      last = ts;
      if (trip) {
        trip.dist = Math.min(trip.len, trip.dist + trip.mps * dt);
        const p = pointAlong(trip.path, trip.dist);
        pos.lng = p.at[0];
        pos.lat = p.at[1];
        heading = p.heading;
        speed = trip.mps;
        if (trip.dist >= trip.len) arrive(trip.placeId);
        else if (ts - lastStoreSync > 400) {
          lastStoreSync = ts;
          store().setLife({ pos: { ...pos } });
        }
      }
      // Legs: a brisk walk on foot (time is compressed, so ground speed isn't a guide), wheels on a boda
      const target = trip ? (mode === 'boda' ? 0.8 : 0.3) : 0;
      anim01 += (target - anim01) * (1 - Math.exp(-8 * dt));
      runner.setState({ lng: pos.lng, lat: pos.lat, heading, speed: anim01, lean: 0, jump: 0, mode, crashed: false });
      tag.setLngLat([pos.lng, pos.lat]);

      if (follow && trip) {
        const c = map.getCenter();
        const k = 1 - Math.exp(-9 * dt);
        map.jumpTo({ center: [c.lng + (pos.lng - c.lng) * k, c.lat + (pos.lat - c.lat) * k] });
      }
      void heartbeat();
      map.triggerRepaint();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      lifeActive = false;
      cancelAnimationFrame(raf);
      unsub();
      map.off('click', onClick);
      map.off('dragstart', onDrag);
      map.off('zoom', labelsByZoom);
      window.removeEventListener('surfari:recenter', recenter);
      markers.forEach((m) => m.remove());
      tag.remove();
      map.setMaxZoom(browseMaxZoom);
      if (map.getLayer('life-route')) map.removeLayer('life-route');
      if (map.getSource('life-route')) map.removeSource('life-route');
      if (map.getLayer('life-avatar')) map.removeLayer('life-avatar');
      if (map.getLayer('life-crew')) map.removeLayer('life-crew');
    };
  // Keyed on the player id: balance updates must not rebuild the scene
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, player?.id]);

  return (
    <style>{`
      .life-pin { display:flex; flex-direction:column; align-items:center; gap:3px; cursor:pointer; background:none; border:0; padding:0; }
      .life-pin-ic {
        width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center;
        font-size:20px; background:rgba(9,13,24,0.88); border:2px solid #00C2FF;
        box-shadow:0 4px 14px rgba(0,0,0,0.45), 0 0 14px rgba(0,194,255,0.35);
        transition: transform .15s;
      }
      .life-pin:hover .life-pin-ic { transform: scale(1.08); }
      .life-pin-name {
        font-family: var(--font-arcade); font-size:13px; letter-spacing:.08em; color:#F0F6FF; white-space:nowrap;
        background:rgba(9,13,24,0.82); padding:2px 8px; border:1px solid rgba(0,194,255,0.35);
      }
      .life-pin-compact .life-pin-name { display:none; }
      .life-tag {
        font-family: var(--font-mono); font-size:11px; font-weight:700; color:#fff; pointer-events:none;
        background:rgba(9,13,24,0.85); padding:2px 8px; border:1.5px solid #00C2FF; border-radius:999px; white-space:nowrap;
      }
      .life-pin-compact .life-pin-ic { width:28px; height:28px; font-size:15px; }
    `}</style>
  );
}
