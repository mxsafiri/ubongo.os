// Economy tuning that both the client (UI copy, pre-checks) and the server
// (enforcement) need. Keep this file free of server imports.

/** Tide a brand-new player starts with. */
export const STARTING_TIDE = 2_000;

/** Tide it costs to plant your own turf on the map. */
export const PLANT_COST = 1_000;

/** Most player-planted turfs one player may hold. */
export const MAX_TURFS_PER_PLAYER = 5;
