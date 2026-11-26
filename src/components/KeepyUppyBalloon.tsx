import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { BallCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { useGameStore } from '../store/gameStore';
import { ZONE_BOUNDS } from '../constants/zones';
import { playBalloonBoop, playStreakReset } from '../utils/soundEffects';

interface BurstParticle {
  id: number;
  origin: THREE.Vector3;
  createdAt: number;
  velocities: THREE.Vector3[];
  colors: string[];
}

const STAR_COLORS = ['#ffd166', '#ff6b6b', '#4ecdc4', '#a8e6cf', '#ff9f1c', '#70d6ff'];
let burstIdCounter = 1;

/**
 * Keepy Uppy Balloon Mini-Game (public/models/props/balloon.glb):
 * - Low gravity (~0.18), high air damping, high restitution so it floats & bounces dreamily
 *   both outdoors in the yard and indoors off walls/furniture.
 * - Responds to direct body bumps AND generous E/Click Swat proximity reach!
 * - Spawns colorful 3D star bursts, increments live Keepy Uppy Streak + Best Score,
 *   and cheerfully resets + respawns near the player if it touches the ground.
 */
export const KeepyUppyBalloon: React.FC = () => {
  const { scene } = useGLTF('/models/props/balloon.glb');
  const mode = useGameStore((s) => s.mode);
  const selectedCharacterId = useGameStore((s) => s.selectedCharacterId);
  const characters = useGameStore((s) => s.characters);
  const swatTriggerNonce = useGameStore((s) => s.swatTriggerNonce);
  const balloonRespawnNonce = useGameStore((s) => s.balloonRespawnNonce);
  const registerBalloonHit = useGameStore((s) => s.registerBalloonHit);
  const resetBalloonStreak = useGameStore((s) => s.resetBalloonStreak);
  const setBalloonPose = useGameStore((s) => s.setBalloonPose);
  const clearNpcSwat = useGameStore((s) => s.clearNpcSwat);

  const balloonClone = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return c;
  }, [scene]);

  const bodyRef = useRef<RapierRigidBody>(null);
  const visualRef = useRef<THREE.Group>(null);
  const lastHitAtRef = useRef(0);
  const spawnGraceUntilRef = useRef(0);
  const lastHandledNpcSwatRef = useRef(0);
  const [bursts, setBursts] = useState<BurstParticle[]>([]);

  const spawnBurst = (pos: THREE.Vector3) => {
    const count = 12;
    const velocities: THREE.Vector3[] = [];
    const colors: string[] = [];
    for (let i = 0; i < count; i++) {
      const theta = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 1.8 + Math.random() * 2.2;
      velocities.push(
        new THREE.Vector3(
          Math.cos(theta) * speed,
          1.2 + Math.random() * 2.4,
          Math.sin(theta) * speed
        )
      );
      colors.push(STAR_COLORS[i % STAR_COLORS.length]);
    }
    burstIdCounter += 1;
    const next: BurstParticle = {
      id: burstIdCounter,
      origin: pos.clone(),
      createdAt: performance.now(),
      velocities,
      colors,
    };
    setBursts((prev) => [...prev.slice(-3), next]);
  };

  const respawnNearPlayer = () => {
    if (!bodyRef.current) return;
    const state = useGameStore.getState();
    const [px, py, pz] = state.playerPosition;
    const bounds = ZONE_BOUNDS[state.currentZone];
    const spawnX = THREE.MathUtils.clamp(px + 0.4, bounds.minX, bounds.maxX);
    const spawnZ = THREE.MathUtils.clamp(pz - 1.35, bounds.minZ, bounds.maxZ);
    const spawnY = Math.max(py + 2.35, bounds.groundY + 2.5);

    bodyRef.current.setTranslation({ x: spawnX, y: spawnY, z: spawnZ }, true);
    bodyRef.current.setLinvel({ x: 0, y: 0.4, z: 0 }, true);
    bodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
    spawnGraceUntilRef.current = performance.now() + 1400;
  };

  // Respawn near player when requested from HUD or entering gameplay
  useEffect(() => {
    if (mode === 'PLAYING') {
      respawnNearPlayer();
    }
  }, [mode, balloonRespawnNonce]);

  const boopBalloonFrom = (
    sourceX: number,
    sourceZ: number,
    charId: string,
    charName: string,
    extraLift = 1.0,
    passTarget?: [number, number],
    phrase?: string
  ) => {
    if (!bodyRef.current) return;
    const now = performance.now();
    if (now - lastHitAtRef.current < 260) return;
    lastHitAtRef.current = now;
    spawnGraceUntilRef.current = now + 600;

    const bPos = bodyRef.current.translation();
    const isIndoors = useGameStore.getState().currentZone === 'INDOOR_HOUSE';

    let dx: number;
    let dz: number;
    if (passTarget) {
      // Launch toward the human player / play-area center for the pass-back.
      dx = passTarget[0] - bPos.x;
      dz = passTarget[1] - bPos.z;
    } else {
      dx = bPos.x - sourceX;
      dz = bPos.z - sourceZ;
    }
    const horizLen = Math.hypot(dx, dz);
    if (horizLen > 0.02) {
      dx /= horizLen;
      dz /= horizLen;
    } else {
      dx = (Math.random() - 0.5) * 0.6;
      dz = -0.8;
    }

    // Softer upward velocity indoors so it bounces playfully off the ceiling
    const upwardVel = (isIndoors ? 2.75 : 4.15) * extraLift;
    const lateralSpeed = isIndoors ? 1.35 : 2.1;
    const jitter = passTarget ? 0 : (Math.random() - 0.5) * 0.5;

    bodyRef.current.setLinvel(
      {
        x: dx * lateralSpeed + jitter,
        y: upwardVel,
        z: dz * lateralSpeed + jitter,
      },
      true
    );

    const streak = registerBalloonHit(charId, charName, phrase);
    playBalloonBoop(streak);
    spawnBurst(new THREE.Vector3(bPos.x, bPos.y, bPos.z));
  };

  // Forgiving kid-friendly proximity Swat check when player presses E or Left-Click!
  useEffect(() => {
    if (swatTriggerNonce === 0 || mode !== 'PLAYING' || !bodyRef.current) return;
    const [px, py, pz] = useGameStore.getState().playerPosition;
    const active =
      characters.find((c) => c.id === selectedCharacterId) ?? characters[0];
    const bPos = bodyRef.current.translation();

    const horizDist = Math.hypot(bPos.x - px, bPos.z - pz);
    const vertDist = Math.abs(bPos.y - (py + active.targetHeight * 0.85));
    if (horizDist < 2.15 && vertDist < 2.25) {
      boopBalloonFrom(px, pz, active.id, active.name, 1.08);
    }
  }, [swatTriggerNonce]);

  useFrame((frameState) => {
    if (!bodyRef.current) return;
    const now = performance.now();
    const t = frameState.clock.elapsedTime;
    const bPos = bodyRef.current.translation();
    const vel = bodyRef.current.linvel();

    // Sync lightweight balloon pose to the store so NPC teammates can read it.
    setBalloonPose([bPos.x, bPos.y, bPos.z], [vel.x, vel.y, vel.z]);

    // Gentle floating balloon wobble & keep upright so string dangles downward!
    bodyRef.current.applyImpulse(
      {
        x: Math.sin(t * 1.7) * 0.0008,
        y: 0,
        z: Math.cos(t * 1.4) * 0.0008,
      },
      true
    );
    if (visualRef.current) {
      visualRef.current.rotation.z = Math.sin(t * 2.4) * 0.09 - vel.x * 0.06;
      visualRef.current.rotation.x = Math.cos(t * 2.1) * 0.09 + vel.z * 0.06;
    }

    // Handle a requested Keepy Uppy NPC pass-back swat.
    const npcSwat = useGameStore.getState().npcSwatRequest;
    if (npcSwat && npcSwat.nonce !== lastHandledNpcSwatRef.current) {
      lastHandledNpcSwatRef.current = npcSwat.nonce;
      boopBalloonFrom(
        npcSwat.sourceX,
        npcSwat.sourceZ,
        npcSwat.characterId,
        npcSwat.characterName,
        1.05,
        [npcSwat.targetX, npcSwat.targetZ],
        npcSwat.phrase
      );
      clearNpcSwat();
    }

    // Out-of-bounds rescue
    const activeZone = useGameStore.getState().currentZone;
    const bounds = ZONE_BOUNDS[activeZone];
    const outsideCurrentZone =
      activeZone === 'BACKYARD'
        ? bPos.x < bounds.minX - 2 ||
          bPos.x > bounds.maxX + 2 ||
          bPos.z < bounds.minZ - 2 ||
          bPos.z > bounds.maxZ + 2
        : Math.abs(bPos.x) > 16 || bPos.z > 18 || bPos.z < -13;
    if (
      outsideCurrentZone ||
      bPos.y > 14 ||
      bPos.y < -1
    ) {
      respawnNearPlayer();
      return;
    }

    // Check if balloon settled/touched the active zone floor after an active rally!
    if (mode === 'PLAYING' && now > spawnGraceUntilRef.current) {
      const floorY = bounds.groundY;
      if (bPos.y <= floorY + 0.28 && vel.y <= 0.25) {
        const currentStreak = useGameStore.getState().keepyStreak;
        if (currentStreak > 0) {
          playStreakReset();
          resetBalloonStreak(selectedCharacterId);
          respawnNearPlayer();
        } else {
          // Gentle bounce so an idle balloon stays floaty and easy for kids to hit!
          bodyRef.current.setLinvel({ x: vel.x * 0.7, y: 2.1, z: vel.z * 0.7 }, true);
          spawnGraceUntilRef.current = now + 700;
        }
      }
    }

    // Prune finished star bursts
    if (bursts.length > 0 && now - bursts[0].createdAt > 750) {
      setBursts((prev) => prev.filter((b) => now - b.createdAt <= 750));
    }
  });

  if (mode !== 'PLAYING') return null;

  return (
    <>
      <RigidBody
        ref={bodyRef}
        name="keepy-uppy-balloon"
        type="dynamic"
        colliders={false}
        position={[0.6, 2.6, 6.6]}
        gravityScale={0.18}
        linearDamping={1.3}
        angularDamping={3.5}
        restitution={0.86}
        enabledRotations={[false, false, false]}
        onCollisionEnter={(payload) => {
          if (mode !== 'PLAYING') return;
          const data = payload.other.rigidBodyObject?.userData as
            | { isPlayer?: boolean; isNpc?: boolean; characterId?: string; characterName?: string; isTrampoline?: boolean }
            | undefined;

          if (data?.isPlayer && data.characterId && data.characterName) {
            const [px, , pz] = useGameStore.getState().playerPosition;
            boopBalloonFrom(px, pz, data.characterId, data.characterName, 1.0);
          } else if (data?.isTrampoline && bodyRef.current) {
            bodyRef.current.setLinvel({ x: (Math.random() - 0.5) * 1.5, y: 5.2, z: (Math.random() - 0.5) * 1.5 }, true);
          }
        }}
      >
        <BallCollider args={[0.23]} restitution={0.88} friction={0.12} mass={0.15} />
        <group ref={visualRef}>
          <primitive object={balloonClone} />
        </group>
      </RigidBody>

      {/* Celebratory 3D Star Particle Bursts on every Keepy Uppy hit */}
      {bursts.map((burst) => (
        <StarBurst key={burst.id} burst={burst} />
      ))}
    </>
  );
};

const StarBurst: React.FC<{ burst: BurstParticle }> = ({ burst }) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!groupRef.current) return;
    const age = (performance.now() - burst.createdAt) / 1000;
    const progress = Math.min(1, age / 0.72);
    const scale = Math.max(0.001, (1 - progress) * 0.14);

    groupRef.current.children.forEach((child, idx) => {
      const v = burst.velocities[idx];
      if (!v) return;
      child.position.set(
        burst.origin.x + v.x * age,
        burst.origin.y + v.y * age - 2.2 * age * age,
        burst.origin.z + v.z * age
      );
      child.scale.setScalar(scale);
      child.rotation.y += 0.15;
      child.rotation.z += 0.12;
    });
  });

  return (
    <group ref={groupRef}>
      {burst.velocities.map((_, idx) => (
        <mesh key={idx} position={burst.origin}>
          <octahedronGeometry args={[1, 0]} />
          <meshStandardMaterial
            color={burst.colors[idx]}
            emissive={burst.colors[idx]}
            emissiveIntensity={0.55}
            roughness={0.25}
          />
        </mesh>
      ))}
    </group>
  );
};

useGLTF.preload('/models/props/balloon.glb');
