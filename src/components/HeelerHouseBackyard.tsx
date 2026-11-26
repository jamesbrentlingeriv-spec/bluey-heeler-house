import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import {
  BACKYARD_HOUSE_DOOR_POSITION,
  BACKYARD_CENTER_Z,
  BACKYARD_SCALE,
} from '../constants/zones';
import { useGameStore } from '../store/gameStore';

const BACKYARD_MODEL_PATH = '/models/environment/heeler_house_backyard.glb';
const SPRINKLER_POSITION: [number, number, number] = [-3.1, 0, BACKYARD_CENTER_Z - 5];

export const BackyardAssetPreloader: React.FC = () => {
  const currentZone = useGameStore((state) => state.currentZone);
  const playerZ = useGameStore((state) => state.playerPosition[2]);
  const requestedRef = useRef(false);

  useEffect(() => {
    if (
      !requestedRef.current &&
      (currentZone === 'INDOOR_HOUSE' || playerZ < -4)
    ) {
      requestedRef.current = true;
      useGLTF.preload(BACKYARD_MODEL_PATH);
    }
  }, [currentZone, playerZ]);

  return null;
};

export const HeelerHouseBackyard: React.FC = () => {
  const currentZone = useGameStore((state) => state.currentZone);
  if (currentZone !== 'BACKYARD') return null;
  return <BackyardMap />;
};

const BackyardMap: React.FC = () => {
  const { scene } = useGLTF(BACKYARD_MODEL_PATH);

  const { clone, scale, offset, halfWidth, halfDepth } = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) {
        const mesh = object as THREE.Mesh;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
      }
    });

    const bounds = new THREE.Box3().setFromObject(cloned);
    const centerX = (bounds.min.x + bounds.max.x) / 2;
    const centerZ = (bounds.min.z + bounds.max.z) / 2;
    const floorOffset = -bounds.min.y * BACKYARD_SCALE;

    return {
      clone: cloned,
      scale: BACKYARD_SCALE,
      offset: [
        -centerX * BACKYARD_SCALE,
        floorOffset,
        BACKYARD_CENTER_Z - centerZ * BACKYARD_SCALE,
      ] as [number, number, number],
      halfWidth: ((bounds.max.x - bounds.min.x) * BACKYARD_SCALE) / 2,
      halfDepth: ((bounds.max.z - bounds.min.z) * BACKYARD_SCALE) / 2,
    };
  }, [scene]);

  return (
    <group>
      <group scale={[scale, scale, scale]} position={offset}>
        <primitive object={clone} />
      </group>

      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[halfWidth, 0.12, halfDepth]}
          position={[0, -0.12, BACKYARD_CENTER_Z]}
        />
      </RigidBody>

      <mesh
        position={[
          BACKYARD_HOUSE_DOOR_POSITION[0],
          0.015,
          BACKYARD_HOUSE_DOOR_POSITION[2],
        ]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[1.8, 1.0]} />
        <meshBasicMaterial color="#78dfff" transparent opacity={0.85} />
      </mesh>

      <Sprinkler position={SPRINKLER_POSITION} />
    </group>
  );
};

const DROPLET_COUNT = 36;

const Sprinkler: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const headRef = useRef<THREE.Group>(null);
  const dropletsRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const geometry = useMemo(() => new THREE.SphereGeometry(0.055, 6, 6), []);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#78dfff',
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
      }),
    []
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );

  useFrame(({ clock }) => {
    const elapsed = clock.elapsedTime;
    if (headRef.current) headRef.current.rotation.y = elapsed * 0.9;
    if (!dropletsRef.current) return;

    for (let i = 0; i < DROPLET_COUNT; i++) {
      const life = ((elapsed * 0.8 + i / DROPLET_COUNT) % 1) * 1.1;
      const angle = elapsed * 0.9 + i * 2.399;
      const height = 0.3 + 5.2 * life - 4.9 * life * life;
      const active = height > 0.08;
      const radius = life * 2.7;

      dummy.position.set(
        Math.cos(angle) * radius,
        Math.max(height, 0),
        Math.sin(angle) * radius
      );
      dummy.scale.setScalar(active ? 0.7 + Math.sin(i + elapsed * 8) * 0.15 : 0);
      dummy.updateMatrix();
      dropletsRef.current.setMatrixAt(i, dummy.matrix);
    }
    dropletsRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group position={position}>
      <mesh position={[0, 0.08, 0]} castShadow>
        <cylinderGeometry args={[0.19, 0.22, 0.16, 12]} />
        <meshStandardMaterial color="#34495e" roughness={0.55} metalness={0.25} />
      </mesh>
      <group ref={headRef} position={[0, 0.19, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.07, 0.28, 8]} />
          <meshStandardMaterial color="#3b8beb" roughness={0.4} metalness={0.2} />
        </mesh>
        <mesh position={[0, 0.04, 0]}>
          <sphereGeometry args={[0.075, 10, 8]} />
          <meshStandardMaterial color="#4ea4f5" roughness={0.35} metalness={0.2} />
        </mesh>
      </group>
      <instancedMesh
        ref={dropletsRef}
        args={[geometry, material, DROPLET_COUNT]}
        frustumCulled={false}
      />
    </group>
  );
};
