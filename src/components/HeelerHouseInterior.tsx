import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { useGameStore } from '../store/gameStore';
import {
  INDOOR_MAT_POSITION,
} from '../constants/zones';

/** Comfortable interior ceiling height (m) the raw model is normalized up to. */
const INTERIOR_TARGET_HEIGHT = 2.8;

/**
 * Fully explorable, separate Bluey's-house interior map.
 * Loads `heeler_house_interior.glb` only when the player is indoors (deferred),
 * auto-scales it up to a cozy ~2.8m room (the raw model is only ~0.45m tall),
 * floor-aligns it to Y=0, centers it at the origin, and wraps it in a trimesh
 * collider so walls, floors, and doorways are walkable. Warm ceiling PointLights.
 */
export const HeelerHouseInterior: React.FC = () => {
  const currentZone = useGameStore((s) => s.currentZone);
  if (currentZone !== 'INDOOR_HOUSE') return null;
  return <InteriorMap />;
};

const InteriorMap: React.FC = () => {
  const { scene } = useGLTF('/models/environment/heeler_house_interior.glb');

  const { clone, scale, offset, roomHalfWidth, roomHalfDepth } = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(c);
    const height = Math.max(box.max.y - box.min.y, 0.01);
    const s = INTERIOR_TARGET_HEIGHT / height;
    // Center X/Z at origin and put the floor at Y=0 after scaling.
    const centerX = ((box.min.x + box.max.x) / 2) * s;
    const centerZ = ((box.min.z + box.max.z) / 2) * s;
    const floorOffset = -box.min.y * s;
    return {
      clone: c,
      scale: s,
      offset: [-centerX, floorOffset, -centerZ] as [number, number, number],
      roomHalfWidth: ((box.max.x - box.min.x) * s) / 2,
      roomHalfDepth: ((box.max.z - box.min.z) * s) / 2,
    };
  }, [scene]);

  return (
    <group>
      {/* Always-on soft interior fill */}
      <ambientLight intensity={0.55} color="#fff3df" />

      {/* Warm ceiling PointLights for a cozy living room */}
      <pointLight position={[0, 2.5, 0]} intensity={9} distance={11} decay={1.5} color="#ffe9b8" />
      <pointLight position={[-1.8, 2.4, -1.5]} intensity={6.5} distance={9} decay={1.6} color="#ffebc2" />
      <pointLight position={[1.8, 2.4, 1.5]} intensity={6.5} distance={9} decay={1.6} color="#ffebc2" />
      <pointLight position={[0, 2.2, 2.4]} intensity={4.0} distance={7} decay={1.7} color="#fff1cc" />

      {/* Explorable interior geometry (walkable floors / walls / doorways) */}
      <RigidBody type="fixed" colliders="trimesh" friction={0.85} restitution={0.1}>
        <group scale={[scale, scale, scale]} position={offset}>
          <primitive object={clone} />
        </group>
      </RigidBody>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[roomHalfWidth - 0.12, 0.1, roomHalfDepth - 0.12]}
          position={[0, -0.1, 0]}
        />
        <CuboidCollider
          args={[0.12, 1.4, roomHalfDepth - 0.12]}
          position={[roomHalfWidth - 0.12, 1.4, 0]}
        />
        <CuboidCollider
          args={[0.12, 1.4, roomHalfDepth - 0.12]}
          position={[-roomHalfWidth + 0.12, 1.4, 0]}
        />
        <CuboidCollider
          args={[roomHalfWidth - 0.12, 1.4, 0.12]}
          position={[0, 1.4, roomHalfDepth - 0.12]}
        />
        <CuboidCollider
          args={[roomHalfWidth - 0.12, 1.4, 0.12]}
          position={[0, 1.4, -roomHalfDepth + 0.12]}
        />
      </RigidBody>

      {/* Glowing exit mat on the inside of the front door */}
      <mesh
        position={[INDOOR_MAT_POSITION[0], 0.012, INDOOR_MAT_POSITION[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[1.8, 1.0]} />
        <meshBasicMaterial color="#ffd95a" transparent opacity={0.85} />
      </mesh>
    </group>
  );
};

useGLTF.preload('/models/environment/heeler_house_interior.glb');