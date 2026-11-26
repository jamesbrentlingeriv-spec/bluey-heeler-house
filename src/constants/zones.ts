import type { ZoneName } from '../types/game';

export interface ZoneBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  groundY: number;
  /** Typical play-area center on the ground (x, z). */
  center: [number, number];
}

/**
 * Walkable play bounds for the two gameplay zones. Used to clamp balloon landing
 * predictions, NPC wander/chase targets, and balloon respawns so everything stays
 * inside the active zone (outdoor front lawn or indoor living room).
 */
export const ZONE_BOUNDS: Record<ZoneName, ZoneBounds> = {
  OUTDOOR_YARD: {
    minX: -11.5,
    maxX: 11.5,
    minZ: 1.0,
    maxZ: 14.0,
    groundY: 0,
    center: [0, 8.2],
  },
  INDOOR_HOUSE: {
    minX: -2.5,
    maxX: 2.5,
    minZ: -2.5,
    maxZ: 2.6,
    groundY: 0,
    center: [0, 0.2],
  },
};

/** Player spawn on the front lawn (feet Y). */
export const OUTDOOR_PLAYER_SPAWN: [number, number, number] = [0, 0.15, 8.2];
/** Player spawn near the center of the living room for a clear view of the room. */
export const INDOOR_PLAYER_SPAWN: [number, number, number] = [0, 0.15, -0.4];

/** Glowing welcome mat (outdoor) — front walkway at the base of the steps. */
export const OUTDOOR_MAT_POSITION: [number, number, number] = [0, 0.02, 3.4];
/** Exit mat (indoor) — just inside the front door. */
export const INDOOR_MAT_POSITION: [number, number, number] = [0, 0.02, 2.4];