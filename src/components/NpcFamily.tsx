import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { NPC_CHEER_LINES, NPC_SWAT_LINES, useGameStore } from '../store/gameStore';
import { ZONE_BOUNDS } from '../constants/zones';
import { CharacterAvatar } from './CharacterAvatar';
import type { CharacterManifestItem, StandardActionKey } from '../types/game';

interface NpcZone {
  home: [number, number, number];
  waypoints: [number, number, number][];
}

interface ZoneBoundsLike {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  groundY: number;
  center: [number, number];
}

// Cozy yard, porch, garden, and patio spots around Heeler House
const OUTDOOR_ZONES: NpcZone[] = [
  { home: [-3.4, 0, 6.8], waypoints: [[-3.4, 0, 6.8], [-5.0, 0, 9.2], [-2.2, 0, 8.6]] },
  { home: [3.6, 0, 6.9], waypoints: [[3.6, 0, 6.9], [5.4, 0, 9.4], [2.5, 0, 8.8]] },
  { home: [1.65, 0.72, 2.0], waypoints: [[1.65, 0.72, 2.0], [2.6, 0.72, 2.1]] },
  { home: [-1.8, 0.72, -2.2], waypoints: [[-1.8, 0.72, -2.2], [1.4, 0.72, -2.4]] },
  { home: [-4.6, 0, 10.6], waypoints: [[-4.6, 0, 10.6], [-6.2, 0, 10.9]] },
  { home: [5.8, 0, 5.8], waypoints: [[5.8, 0, 5.8], [4.4, 0, 4.8]] },
  { home: [2.6, 0, 11.4], waypoints: [[2.6, 0, 11.4], [4.2, 0, 11.0]] },
];

// Spread-out living-room spots for the indoor zone
const INDOOR_ZONES: NpcZone[] = [
  { home: [-1.8, 0.72, -2.2], waypoints: [[-1.8, 0.72, -2.2], [1.4, 0.72, -2.4]] },
  { home: [1.6, 0.72, -3.0], waypoints: [[1.6, 0.72, -3.0], [0.4, 0.72, -3.4]] },
  { home: [-3.2, 0.72, -3.6], waypoints: [[-3.2, 0.72, -3.6], [-2.4, 0.72, -4.4]] },
  { home: [3.0, 0.72, -1.6], waypoints: [[3.0, 0.72, -1.6], [2.2, 0.72, -1.2]] },
  { home: [-4.0, 0.72, -1.8], waypoints: [[-4.0, 0.72, -1.8], [-3.6, 0.72, -1.0]] },
  { home: [0.4, 0.72, -4.6], waypoints: [[0.4, 0.72, -4.6], [-0.4, 0.72, -4.8]] },
  { home: [4.0, 0.72, -2.8], waypoints: [[4.0, 0.72, -2.8], [3.4, 0.72, -3.6]] },
];

const BACKYARD_ZONES: NpcZone[] = [
  { home: [-5.0, 0, -19.0], waypoints: [[-5.0, 0, -19.0], [-3.0, 0, -21.0]] },
  { home: [5.0, 0, -19.5], waypoints: [[5.0, 0, -19.5], [3.0, 0, -21.5]] },
  { home: [-5.5, 0, -23.5], waypoints: [[-5.5, 0, -23.5], [-3.5, 0, -25.5]] },
  { home: [4.5, 0, -24.0], waypoints: [[4.5, 0, -24.0], [2.5, 0, -26.0]] },
  { home: [-4.0, 0, -28.0], waypoints: [[-4.0, 0, -28.0], [-1.5, 0, -29.0]] },
  { home: [4.0, 0, -28.0], waypoints: [[4.0, 0, -28.0], [1.5, 0, -29.0]] },
  { home: [0, 0, -24.0], waypoints: [[0, 0, -24.0], [0, 0, -27.0]] },
];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function inZone(x: number, z: number, bounds: ZoneBoundsLike): boolean {
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

/**
 * Approximate ballistic landing spot (meters) using the balloon's reduced gravity
 * (gravityScale 0.18 * world 16.5 = ~2.97 m/s^2), clamped into the active zone.
 */
function predictLanding(
  pos: [number, number, number],
  vel: [number, number, number],
  bounds: ZoneBoundsLike
): [number, number] {
  const g = 2.97;
  const fallDist = Math.max(pos[1] - bounds.groundY, 0.15);
  const t = Math.sqrt((2 * fallDist) / g);
  const x = clamp(pos[0] + vel[0] * t, bounds.minX, bounds.maxX);
  const z = clamp(pos[2] + vel[2] * t, bounds.minZ, bounds.maxZ);
  return [x, z];
}

function pickSwatPhrase(playerId: string): string {
  if (playerId === 'marleigh') return 'Your turn, Marleigh!';
  if (playerId === 'callie') return 'Your turn, Callie!';
  return NPC_SWAT_LINES[Math.floor(Math.random() * NPC_SWAT_LINES.length)];
}

/**
 * Renders the 7 non-selected characters with active Keepy Uppy teammate AI:
 * a turn-taking chaser (predictive intercept + pass-back) plus cheering spectators.
 */
export const NpcFamily: React.FC = () => {
  const mode = useGameStore((s) => s.mode);
  const characters = useGameStore((s) => s.characters);
  const selectedCharacterId = useGameStore((s) => s.selectedCharacterId);
  const currentZone = useGameStore((s) => s.currentZone);

  const npcs = useMemo(
    () => characters.filter((c) => c.id !== selectedCharacterId),
    [characters, selectedCharacterId]
  );

  const playerName = useMemo(
    () => characters.find((c) => c.id === selectedCharacterId)?.name ?? '',
    [characters, selectedCharacterId]
  );

  const zones =
    currentZone === 'INDOOR_HOUSE'
      ? INDOOR_ZONES
      : currentZone === 'BACKYARD'
        ? BACKYARD_ZONES
        : OUTDOOR_ZONES;

  // AI director: assign exactly one (closest) NPC to chase a low balloon.
  useFrame(() => {
    const state = useGameStore.getState();
    if (state.mode !== 'PLAYING') return;
    if (!state.keepyUppyEnabled) {
      if (state.currentChaserId !== null) state.setCurrentChaser(null);
      return;
    }
    const [bx, by, bz] = state.balloonPosition;
    const [px, , pz] = state.playerPosition;
    const bounds = ZONE_BOUNDS[state.currentZone];

    const needsChase = by < 2.8 && Math.hypot(bx - px, bz - pz) > 1.5;
    if (!needsChase) {
      if (state.currentChaserId !== null) state.setCurrentChaser(null);
      return;
    }

    let closestId: string | null = null;
    let closestDist = Infinity;
    for (const npc of npcs) {
      const np = state.npcPositions[npc.id];
      if (!np) continue;
      if (!inZone(np[0], np[2], bounds)) continue;
      const d = Math.hypot(bx - np[0], bz - np[2]);
      if (d < closestDist) {
        closestDist = d;
        closestId = npc.id;
      }
    }
    state.setCurrentChaser(closestId);
  });

  if (mode !== 'PLAYING') return null;

  return (
    <group>
      {npcs.map((npc, idx) => (
        <WanderingNpc
          key={npc.id}
          character={npc}
          zone={zones[idx % zones.length]}
          playerName={playerName}
          seed={idx * 1.73}
        />
      ))}
    </group>
  );
};

interface WanderingNpcProps {
  character: CharacterManifestItem;
  zone: NpcZone;
  playerName: string;
  seed: number;
}

const WanderingNpc: React.FC<WanderingNpcProps> = ({ character, zone, playerName, seed }) => {
  const triggerSpeech = useGameStore((s) => s.triggerSpeech);
  const setNpcPosition = useGameStore((s) => s.setNpcPosition);
  const requestNpcSwat = useGameStore((s) => s.requestNpcSwat);
  const groupRef = useRef<THREE.Group>(null);

  const posRef = useRef(new THREE.Vector3(...zone.home));
  const targetIdxRef = useRef(1 % zone.waypoints.length);
  const pauseUntilRef = useRef(performance.now() + seed * 900);
  const waveUntilRef = useRef(0);
  const nextGreetAllowedAtRef = useRef(0);
  const nextCheerAllowedAtRef = useRef(performance.now() + 3000 + seed * 600);
  const swatUntilRef = useRef(0);
  const lastSwatAtRef = useRef(0);
  const yawRef = useRef(0);

  const [action, setAction] = useState<StandardActionKey>('Idle');
  const prevActionRef = useRef<StandardActionKey>('Idle');

  const updateAction = (next: StandardActionKey) => {
    if (prevActionRef.current !== next) {
      prevActionRef.current = next;
      setAction(next);
    }
  };

  // Teleport the NPC into the active zone whenever the zone changes.
  useEffect(() => {
    posRef.current.set(zone.home[0], zone.home[1], zone.home[2]);
    targetIdxRef.current = 1 % zone.waypoints.length;
    yawRef.current = 0;
  }, [zone]);

  useFrame((_, rawDelta) => {
    if (!groupRef.current) return;
    const dt = Math.min(rawDelta, 0.05);
    const now = performance.now();
    const state = useGameStore.getState();
    if (state.mode !== 'PLAYING') return;

    const bounds = ZONE_BOUNDS[state.currentZone];
    const isSuper = state.aiHelpers === 'SUPER';
    const [bx, by, bz] = state.balloonPosition;
    const [px, py, pz] = state.playerPosition;
    const isChaser = state.currentChaserId === character.id;
    const pos = posRef.current;

    setNpcPosition(character.id, [pos.x, pos.y, pos.z]);

    // Friendly contextual greeting when the player walks near.
    const distToPlayer = Math.hypot(px - pos.x, pz - pos.z);
    const sameElevation = Math.abs(py - pos.y) < 1.1;
    if (!isChaser && distToPlayer < 3.1 && sameElevation && now > nextGreetAllowedAtRef.current) {
      nextGreetAllowedAtRef.current = now + 11500 + Math.random() * 4000;
      waveUntilRef.current = now + 2600;
      triggerSpeech(character.id, character.npcGreetingTemplate.replace('{player}', playerName), 2800);
    }

    const steerYaw = (dx: number, dz: number) => {
      if (Math.abs(dx) < 0.01 && Math.abs(dz) < 0.01) return;
      const targetYaw = Math.atan2(dx, dz);
      let diff = targetYaw - yawRef.current;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      yawRef.current += diff * Math.min(1, dt * 8);
    };

    const horizToBalloon = Math.hypot(bx - pos.x, bz - pos.z);

    if (isChaser) {
      // Predictive intercept & pass-back chaser.
      const target = predictLanding(state.balloonPosition, state.balloonVelocity, bounds);
      const dx = target[0] - pos.x;
      const dz = target[1] - pos.z;
      const dist = Math.hypot(dx, dz);
      const speed = isSuper ? 4.6 : 3.2;
      if (dist > 0.2) {
        pos.x += (dx / dist) * speed * dt;
        pos.z += (dz / dist) * speed * dt;
        pos.y = bounds.groundY;
      }
      steerYaw(dist > 0.2 ? dx : bx - pos.x, dist > 0.2 ? dz : bz - pos.z);

      const reach = isSuper ? 1.9 : 1.25;
      const withinHeight =
        by < bounds.groundY + character.targetHeight + (isSuper ? 0.9 : 0.55);
      if (
        horizToBalloon < reach &&
        by < 2.6 &&
        by > bounds.groundY &&
        withinHeight &&
        now > lastSwatAtRef.current + 700
      ) {
        lastSwatAtRef.current = now;
        const phrase = pickSwatPhrase(state.selectedCharacterId);
        const playerInZone = inZone(px, pz, bounds);
        requestNpcSwat({
          characterId: character.id,
          characterName: character.name,
          phrase,
          sourceX: pos.x,
          sourceZ: pos.z,
          targetX: playerInZone ? px : bounds.center[0],
          targetZ: playerInZone ? pz : bounds.center[1],
        });
        swatUntilRef.current = now + 520;
        updateAction('Swat');
      } else {
        updateAction(now < swatUntilRef.current ? 'Swat' : 'Run');
      }
    } else {
      // Spectator: wander, face the balloon, occasionally wave + cheer.
      if (now < waveUntilRef.current || distToPlayer < 2.6) {
        steerYaw(px - pos.x, pz - pos.z);
        updateAction(now < waveUntilRef.current ? 'Wave' : 'Idle');
      } else if (now < pauseUntilRef.current) {
        steerYaw(bx - pos.x, bz - pos.z);
        updateAction('Idle');
      } else {
        const wp = zone.waypoints[targetIdxRef.current];
        const dx = wp[0] - pos.x;
        const dz = wp[2] - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.2) {
          targetIdxRef.current = (targetIdxRef.current + 1) % zone.waypoints.length;
          pauseUntilRef.current = now + 2400 + Math.random() * 2600;
          updateAction('Idle');
        } else {
          const speed = 1.25;
          pos.x += (dx / dist) * speed * dt;
          pos.z += (dz / dist) * speed * dt;
          pos.y = wp[1];
          steerYaw(dx, dz);
          updateAction('Walk');
        }
      }

      // Cheer when the balloon is up in the air.
      if (
        state.keepyUppyEnabled &&
        by > bounds.groundY + 0.5 &&
        by < 5.0 &&
        now > nextCheerAllowedAtRef.current
      ) {
        nextCheerAllowedAtRef.current = now + 6500 + Math.random() * 4500;
        waveUntilRef.current = now + 1800;
        triggerSpeech(
          character.id,
          NPC_CHEER_LINES[Math.floor(Math.random() * NPC_CHEER_LINES.length)],
          2200,
          true
        );
        updateAction('Wave');
      }
    }

    groupRef.current.position.copy(pos);
    groupRef.current.rotation.y = yawRef.current;
  });

  return (
    <group ref={groupRef} position={zone.home}>
      <CharacterAvatar character={character} action={action} />
    </group>
  );
};
