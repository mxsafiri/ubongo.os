export type PlayerTier = 'surfari' | 'district' | 'baron' | 'architect' | 'apex';

export type ZoneTier = 'shoreline' | 'savanna' | 'coral_ridge' | 'jungle_deep' | 'crown';

export type ZoneType =
  | 'street_market'
  | 'waterfront'
  | 'business_district'
  | 'rooftop'
  | 'transit_hub'
  | 'night_market'
  | 'residential'
  | 'landmark';

export type ZoneState = 'unclaimed' | 'claimed' | 'contested' | 'demand';

export type ChallengeType =
  | 'boda_run'
  | 'market_dash'
  | 'ferry_timing'
  | 'rooftop_signal'
  | 'cargo_sort'
  | 'traffic_weave';

export type GamePhase = 'loading' | 'onboarding' | 'tagging' | 'exploring' | 'surfing' | 'challenge' | 'result';

export type GameTab = 'map' | 'surf' | 'explore' | 'tasks' | 'profile';

export type StakeTier = 'ripple' | 'current' | 'wave' | 'apex_tide';

export type InfrastructureType =
  | 'bridge'
  | 'market_stall'
  | 'signal_tower'
  | 'ferry_dock'
  | 'boda_stage'
  | 'night_canopy'
  | 'trade_route';

export interface OwnershipSlice {
  player_id: string;
  player_handle: string;
  percentage: number;
}

export interface Infrastructure {
  id: string;
  zone_id: string;
  type: InfrastructureType;
  name: string;
  owner_id: string;
  co_owners: OwnershipSlice[];
  build_cost: number;
  daily_yield: number;
  tax_rate: number;
  health: number;
  total_uses: number;
  total_earned: number;
  created_at: string;
}

export interface Trace {
  id: string;
  zone_id: string;
  player_id: string;
  player_handle: string;
  player_color: string;
  challenge_type: ChallengeType;
  score: number;
  timestamp: string;
}

export interface TaskDemand {
  id: string;
  zone_id: string;
  type: string;
  title: string;
  description: string;
  reward_tokens: number;
  current_leader_id: string | null;
  current_leader_handle: string | null;
  current_leader_score: number | null;
  claim_threshold: number;
  expires_at: string;
  completed_by: string | null;
}

export interface Zone {
  id: string;
  name: string;
  district: string;
  tier: ZoneTier;
  type: ZoneType;
  state: ZoneState;
  owner_id: string | null;
  owner_handle: string | null;
  owner_color: string | null;
  lat: number;
  lng: number;
  radius_meters: number;
  claim_strength: number;
  traces: Trace[];
  trace_count: number;
  contested_threshold: number;
  daily_yield: number;
  upkeep_cost: number;
  task_demand: TaskDemand | null;
  infrastructure: Infrastructure[];
  created_at: string;
}

export interface PlayerCard {
  id: string;
  handle: string;
  avatar_color: string;
  avatar_pattern: string;
  origin_zone_id: string | null;
  tide_tokens: number;
  tier: PlayerTier;
  reputation: number;
  zones_owned: number;
  assets_owned: number;
  traces_left: number;
  traces_received: number;
  created_at: string;
  last_active: string;
  geo_lat: number | null;
  geo_lng: number | null;
}

export interface Challenge {
  id: string;
  type: ChallengeType;
  zone_id: string;
  challenger_id: string;
  defender_id: string | null;
  stake_amount: number;
  outcome: 'challenger_wins' | 'defender_wins' | 'draw' | null;
  challenger_score: number | null;
  defender_score: number | null;
  started_at: string;
  completed_at: string | null;
}

export interface GameNotification {
  id: string;
  type: 'zone_claimed' | 'challenge_received' | 'token_earned' | 'zone_contested' | 'system';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

export interface MapViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

export interface Transaction {
  id: string;
  player_id: string;
  type: 'earn' | 'spend' | 'stake' | 'reward';
  amount: number;
  description: string;
  timestamp: string;
}

export interface Stake {
  id: string;
  challenge_id: string;
  player_id: string;
  amount: number;
  tier: StakeTier;
  outcome: 'won' | 'lost' | 'pending';
  created_at: string;
}

export interface ChatMessage {
  id: string;
  zone_id: string | null;
  player_id: string | null;
  player_handle: string | null;
  player_color: string | null;
  content: string;
  msg_type: 'user' | 'event';
  created_at: string;
}

export interface GameState {
  phase: GamePhase;
  player: PlayerCard | null;
  nearby_players: PlayerCard[];
  nearby_zones: Zone[];
  active_challenge: Challenge | null;
  selected_zone: Zone | null;
  notifications: GameNotification[];
}
