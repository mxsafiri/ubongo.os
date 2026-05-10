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

interface GameStore {
  // State
  phase: GamePhase;
  activeTab: GameTab;
  player: PlayerCard | null;
  nearby_players: PlayerCard[];
  nearby_zones: Zone[];
  active_challenge: Challenge | null;
  selected_zone: Zone | null;
  notifications: GameNotification[];
  mapView: MapViewState;
  mapLoaded: boolean;

  // Actions
  setPhase: (phase: GamePhase) => void;
  setActiveTab: (tab: GameTab) => void;
  setPlayer: (player: PlayerCard) => void;
  updateTokens: (amount: number) => void;
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
}

export const useGameStore = create<GameStore>()(
  subscribeWithSelector((set, get) => ({
    phase: 'loading',
    activeTab: 'map',
    player: null,
    nearby_players: [],
    nearby_zones: [],
    active_challenge: null,
    selected_zone: null,
    notifications: [],
    mapView: DEFAULT_VIEW,
    mapLoaded: false,

    setPhase: (phase) => set({ phase }),

    setActiveTab: (activeTab) => set({ activeTab }),

    setPlayer: (player) => set({ player }),

    updateTokens: (amount) => {
      const { player } = get();
      if (!player) return;
      set({ player: { ...player, tide_tokens: player.tide_tokens + amount } });
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
