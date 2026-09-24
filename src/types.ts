import * as THREE from 'three';

export type Lane = 0 | 1 | 2; // 0 = Left (-3), 1 = Center (0), 2 = Right (+3)

export const LANE_X_POSITIONS = [-3, 0, 3] as const;

export type ObstacleType = 'barrier' | 'girder' | 'train';

export type PowerupType = 'magnet' | 'sneakers' | 'multiplier';

export interface ObstacleData {
  id: number;
  type: ObstacleType;
  lane: Lane;
  z: number;
  mesh: THREE.Group | THREE.Mesh;
  box: THREE.Box3;
  passed: boolean;
}

export interface CoinData {
  id: number;
  lane: Lane;
  x: number;
  y: number;
  z: number;
  mesh: THREE.Mesh;
  collected: boolean;
}

export interface PowerupData {
  id: number;
  type: PowerupType;
  lane: Lane;
  x: number;
  y: number;
  z: number;
  mesh: THREE.Group;
  collected: boolean;
}

export interface Particle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  color: THREE.Color;
}

export interface GameStats {
  score: number;
  distance: number;
  coins: number;
  speed: number;
  multiplier: number;
  activePowerup: PowerupType | null;
  powerupTimer: number;
  highScore: number;
}
