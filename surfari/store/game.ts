import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  GamePhase,
  GameTab,
  PlayerCard,
  Zone,
  Challenge,
  GameNotification,
  MapViewState,
} from '@/types';
import { DEFAULT_VIEW } from '@/lib/map/style';
import type { TaskId } from '@/lib/game/work';

export type TravelMode = 'walk' | 'boda';

/** A shift as the server reports it (times in ms, server clock). */
export interface ShiftView {
  id: string;
  placeId: string;
  jobId: string;
  startedAt: number;
  endsAt: number;
  perf: number;
  goodDone: number;
  lastUsed: Partial<Record<TaskId, number>>;
}

export interface LifeState {
  pos: { lng: number; lat: number } | null;  // where your character stands
  hereId: string | null;                      // the place you're at, if any
  selectedPlaceId: string | null;              // place card open
  travel: { placeId: string; mode: TravelMode; status: 'requested' | 'moving'; etaS?: number; skip?: boolean } | null;
  shift: ShiftView | null;
  xp: Record<string, number>;                  // finished shifts per job
  clockSkewMs: number;                         // server − client
}

interface GameStore {
  // State
  phase: GamePhase;
  activeTab: GameTab;
  theme: 'light' | 'dark';
  player: PlayerCard | null;
  nearby_players: PlayerCard[];
  nearby_zones: Zone[];
  active_challenge: Challenge | null;
  selected_zone: Zone | null;
  notifications: GameNotification[];
  mapView: MapViewState;
  mapLoaded: boolean;
  plant_site: { lng: number; lat: number } | null;
  sidebarCollapsed: boolean;
  riding: boolean;              // Cruise Mode: the ride owns the whole screen
  life: LifeState;

  // Actions
  setPhase: (phase: GamePhase) => void;
  setActiveTab: (tab: GameTab) => void;
  toggleTheme: () => void;
  setPlayer: (player: PlayerCard) => void;
  syncPlayer: () => Promise<number>;
  startRun: () => Promise<string | null>;
  bankRun: (runId: string, distanceM: number, tide: number) => Promise<number | null>;
  setMapView: (view: Partial<MapViewState>) => void;
  setMapLoaded: (loaded: boolean) => void;
  setNearbyZones: (zones: Zone[]) => void;
  updateZone: (zone: Zone) => void;
  selectZone: (zone: Zone | null) => void;
  setNearbyPlayers: (players: PlayerCard[]) => void;
  upsertPlayerPosition: (player: PlayerCard) => void;
  startChallenge: (challenge: Challenge) => void;
  resolveChallenge: (outcome: Challenge['outcome'], challengerScore: number, defenderScore: number) => void;
  clearChallenge: () => void;
  addNotification: (notification: Omit<GameNotification, 'id' | 'timestamp' | 'read'>) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
  fetchZones: () => Promise<void>;
  surfZone: (zoneId: string) => Promise<void>;
  setPlantSite: (site: { lng: number; lat: number } | null) => void;
  plantTurf: () => Promise<{ zone: Zone } | { error: string }>;
  buildZone: (zoneId: string) => Promise<boolean>;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setRiding: (riding: boolean) => void;
  setLife: (patch: Partial<LifeState>) => void;
  selectPlace: (placeId: string | null) => void;
  requestTravel: (placeId: string, mode: TravelMode) => void;
  loadWork: () => Promise<void>;
  startShift: (jobId: string) => Promise<string | null>;
  doWorkTask: (task: TaskId) => Promise<string | null>;
  finishShift: () => Promise<{ payout: number } | { error: string }>;
}

export const useGameStore = create<GameStore>()(
  subscribeWithSelector((set, get) => ({
    phase: 'loading',
    activeTab: 'map',
    theme: (typeof window !== 'undefined' && localStorage.getItem('surfari-theme') === 'dark') ? 'dark' : 'light',
    player: null,
    nearby_players: [],
    nearby_zones: [],
    active_challenge: null,
    selected_zone: null,
    notifications: [],
    mapView: DEFAULT_VIEW,
    mapLoaded: false,
    plant_site: null,
    sidebarCollapsed: false,
    riding: false,
    life: { pos: null, hereId: null, selectedPlaceId: null, travel: null, shift: null, xp: {}, clockSkewMs: 0 },

    setPhase: (phase) => set({ phase }),

    setActiveTab: (activeTab) => set({ activeTab }),

    toggleTheme: () => set((state) => {
      const next = state.theme === 'light' ? 'dark' : 'light';
      if (typeof window !== 'undefined') localStorage.setItem('surfari-theme', next);
      return { theme: next };
    }),

    setPlayer: (player) => set({ player }),

    // Tide only ever changes on the server — these pull the authoritative
    // balance back after the server has settled yield or paid out a run.
    syncPlayer: async () => {
      const { player } = get();
      if (!player) return 0;
      try {
        const res = await fetch('/api/game/players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ player_id: player.id, sync: true }),
        });
        if (!res.ok) return 0;
        const { player: fresh, yield_collected } = await res.json();
        const current = get().player;
        if (fresh && current && current.id === fresh.id) {
          set({ player: { ...current, ...fresh, geo_lat: current.geo_lat, geo_lng: current.geo_lng } });
        }
        return yield_collected ?? 0;
      } catch (err) {
        console.error('syncPlayer', err);
        return 0;
      }
    },

    startRun: async () => {
      const { player } = get();
      if (!player) return null;
      try {
        const res = await fetch('/api/game/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ player_id: player.id }),
        });
        if (!res.ok) return null;
        const { run_id } = await res.json();
        return run_id ?? null;
      } catch (err) {
        console.error('startRun', err);
        return null;
      }
    },

    bankRun: async (runId, distanceM, tide) => {
      const { player } = get();
      if (!player) return null;
      try {
        const res = await fetch(`/api/game/runs/${runId}/finish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ player_id: player.id, distance_m: distanceM, tide }),
        });
        if (!res.ok) return null;
        const { payout, player: fresh } = await res.json();
        const current = get().player;
        if (fresh && current && current.id === fresh.id) {
          set({ player: { ...current, ...fresh, geo_lat: current.geo_lat, geo_lng: current.geo_lng } });
        }
        return payout ?? 0;
      } catch (err) {
        console.error('bankRun', err);
        return null;
      }
    },

    setMapView: (view) =>
      set((state) => ({ mapView: { ...state.mapView, ...view } })),

    setMapLoaded: (mapLoaded) => set({ mapLoaded }),

    setNearbyZones: (nearby_zones) => set({ nearby_zones }),

    updateZone: (zone) =>
      set((state) => ({
        nearby_zones: state.nearby_zones.map((z) => (z.id === zone.id ? zone : z)),
        selected_zone: state.selected_zone?.id === zone.id ? zone : state.selected_zone,
      })),

    selectZone: (selected_zone) => set({ selected_zone }),

    setNearbyPlayers: (nearby_players) => set({ nearby_players }),

    upsertPlayerPosition: (player) =>
      set((state) => {
        const exists = state.nearby_players.find((p) => p.id === player.id);
        return {
          nearby_players: exists
            ? state.nearby_players.map((p) => (p.id === player.id ? player : p))
            : [...state.nearby_players, player],
        };
      }),

    startChallenge: (active_challenge) => set({ active_challenge, phase: 'challenge' }),

    resolveChallenge: (outcome, challengerScore, defenderScore) => {
      const { active_challenge } = get();
      if (!active_challenge) return;
      set({
        active_challenge: {
          ...active_challenge,
          outcome,
          challenger_score: challengerScore,
          defender_score: defenderScore,
          completed_at: new Date().toISOString(),
        },
        phase: 'result',
      });
    },

    clearChallenge: () => set({ active_challenge: null, phase: 'exploring' }),

    addNotification: (notif) =>
      set((state) => ({
        notifications: [
          {
            ...notif,
            id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            timestamp: new Date().toISOString(),
            read: false,
          },
          ...state.notifications,
        ],
      })),

    markNotificationRead: (id) =>
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n
        ),
      })),

    clearNotifications: () => set({ notifications: [] }),

    fetchZones: async () => {
      try {
        const res = await fetch('/api/game/zones');
        if (!res.ok) return;
        const { zones } = await res.json();
        set({ nearby_zones: zones });
      } catch (err) {
        console.error('fetchZones', err);
      }
    },

    surfZone: async (zoneId: string) => {
      const { player } = get();
      if (!player) return;
      try {
        const res = await fetch(`/api/game/zones/${zoneId}/surf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ player_id: player.id }),
        });
        if (!res.ok) return;
        const { zone: zoneUpdate, player: updatedPlayer } = await res.json();
        set((state) => ({
          player: updatedPlayer,
          nearby_zones: state.nearby_zones.map((z) =>
            z.id === zoneId ? { ...z, ...zoneUpdate } : z
          ),
          selected_zone: state.selected_zone?.id === zoneId
            ? { ...state.selected_zone, ...zoneUpdate }
            : state.selected_zone,
        }));
      } catch (err) {
        console.error('surfZone', err);
      }
    },

    setPlantSite: (plant_site) => set({ plant_site }),

    setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),

    // Riding always happens on the map tab, with nothing else on screen
    setLife: (patch) => set((st) => ({ life: { ...st.life, ...patch } })),

    selectPlace: (placeId) => set((st) => ({ life: { ...st.life, selectedPlaceId: placeId } })),

    requestTravel: (placeId, mode) => set((st) => ({
      life: { ...st.life, travel: { placeId, mode, status: 'requested' }, selectedPlaceId: null },
    })),

    // Work: the server owns shifts; these keep the local copy in step
    loadWork: async () => {
      const { player } = get();
      if (!player) return;
      try {
        const res = await fetch(`/api/game/work?player_id=${player.id}`);
        if (!res.ok) return;
        const { shift, xp, now } = await res.json();
        set((st) => ({ life: { ...st.life, shift, xp: xp ?? {}, clockSkewMs: typeof now === 'number' ? now - Date.now() : st.life.clockSkewMs } }));
      } catch (err) {
        console.error('loadWork', err);
      }
    },

    startShift: async (jobId) => workCall(get, set, { action: 'start', job_id: jobId }),

    doWorkTask: async (task) => workCall(get, set, { action: 'task', task }),

    finishShift: async () => {
      const { player } = get();
      if (!player) return { error: 'Not signed in' };
      try {
        const res = await fetch('/api/game/work', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ player_id: player.id, action: 'finish' }),
        });
        const body = await res.json();
        if (!res.ok) {
          set((st) => ({ life: { ...st.life, shift: null } }));
          return { error: body.error ?? 'Could not clock out' };
        }
        set((st) => ({
          life: { ...st.life, shift: null, xp: body.xp ?? st.life.xp },
          player: body.player && st.player ? { ...st.player, ...body.player, geo_lat: st.player.geo_lat, geo_lng: st.player.geo_lng } : st.player,
        }));
        return { payout: body.payout as number };
      } catch {
        return { error: 'Lost connection — try again' };
      }
    },

    setRiding: (riding) => set(riding ? { riding, activeTab: 'map', plant_site: null, selected_zone: null } : { riding }),

    buildZone: async (zoneId: string) => {
      const { player } = get();
      if (!player) return false;
      try {
        const res = await fetch(`/api/game/zones/${zoneId}/build`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ player_id: player.id }),
        });
        if (!res.ok) return false;
        const { zone: zoneUpdate, player: updatedPlayer } = await res.json();
        set((state) => ({
          player: updatedPlayer ?? state.player,
          nearby_zones: state.nearby_zones.map((z) =>
            z.id === zoneId ? { ...z, ...zoneUpdate } : z
          ),
          selected_zone: state.selected_zone?.id === zoneId
            ? { ...state.selected_zone, ...zoneUpdate }
            : state.selected_zone,
        }));
        return true;
      } catch (err) {
        console.error('buildZone', err);
        return false;
      }
    },

    plantTurf: async () => {
      const { player, plant_site } = get();
      if (!player || !plant_site) return { error: 'Pick a spot on the map first' };
      try {
        const res = await fetch('/api/game/zones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ player_id: player.id, lat: plant_site.lat, lng: plant_site.lng }),
        });
        if (!res.ok) {
          const { error } = await res.json().catch(() => ({ error: null }));
          return { error: error ?? 'Could not plant here' };
        }
        const { zone, player: updatedPlayer } = await res.json();
        set((state) => ({
          player: updatedPlayer ?? state.player,
          nearby_zones: [...state.nearby_zones, zone],
          selected_zone: zone,
          plant_site: null,
    sidebarCollapsed: false,
        }));
        return { zone: zone as Zone };
      } catch (err) {
        console.error('plantTurf', err);
        return { error: 'Lost connection — try again' };
      }
    },
  }))
);

// Selectors
export const selectPhase = (s: GameStore) => s.phase;
export const selectActiveTab = (s: GameStore) => s.activeTab;
export const selectPlayer = (s: GameStore) => s.player;
export const selectNearbyZones = (s: GameStore) => s.nearby_zones;
export const selectSelectedZone = (s: GameStore) => s.selected_zone;
export const selectNearbyPlayers = (s: GameStore) => s.nearby_players;
export const selectActiveChallenge = (s: GameStore) => s.active_challenge;
export const selectNotifications = (s: GameStore) => s.notifications;
export const selectUnreadCount = (s: GameStore) =>
  s.notifications.filter((n) => !n.read).length;
export const selectMapView = (s: GameStore) => s.mapView;
export const selectMapLoaded = (s: GameStore) => s.mapLoaded;
export const selectTheme = (s: GameStore) => s.theme;
export const selectPlantSite = (s: GameStore) => s.plant_site;
export const selectSidebarCollapsed = (s: GameStore) => s.sidebarCollapsed;
export const selectRiding = (s: GameStore) => s.riding;

type StoreSet = (fn: (st: GameStore) => Partial<GameStore>) => void;

/** POST to the work route; on success store the returned shift. Returns an error message or null. */
async function workCall(get: () => GameStore, set: StoreSet, body: Record<string, unknown>): Promise<string | null> {
  const { player } = get();
  if (!player) return 'Not signed in';
  try {
    const res = await fetch('/api/game/work', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: player.id, ...body }),
    });
    const data = await res.json();
    if (data.shift !== undefined || typeof data.now === 'number') {
      set((st) => ({ life: { ...st.life, shift: data.shift ?? st.life.shift, clockSkewMs: typeof data.now === 'number' ? data.now - Date.now() : st.life.clockSkewMs } }));
    }
    return res.ok ? null : (data.error ?? 'Request failed');
  } catch {
    return 'Lost connection — try again';
  }
}

export const selectLife = (s: GameStore) => s.life;
