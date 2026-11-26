import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Sky, useGLTF } from '@react-three/drei';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { useGameStore } from '../store/gameStore';
import { OUTDOOR_MAT_POSITION } from '../constants/zones';

export const TRAMPOLINE_POSITION: [number, number, number] = [-6.8, 0.0, 7.6];
export const TRAMPOLINE_RADIUS = 1.55;

/**
 * Outdoor zones: front yard + house + street + trampoline (OUTDOOR_YARD),
 * and a fenced explorable backyard (BACKYARD). The walkable interior is a
 * separate map (HeelerHouseInterior) shown when INDOOR_HOUSE.
 */
export const HeelerHouseAndYard: React.FC = () => {
  const { scene } = useGLTF('/models/environment/heeler_house.glb');
  const currentZone = useGameStore((s) => s.currentZone);
  const isOutdoor = currentZone !== 'INDOOR_HOUSE';

  const { houseClone, autoScale } = useMemo(() => {
    const cloned = scene.clone(true);
    const box = new THREE.Box3().setFromObject(cloned);
    const height = Math.max(box.max.y - box.min.y, 0.1);
    const scale = height < 3.0 ? (1.65 * 5.0) / height : 1.0;
    cloned.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return { houseClone: cloned, autoScale: scale };
  }, [scene]);

  return (
    <group>
      <ambientLight intensity={0.35} color="#fff9eb" />

      {isOutdoor && (
        <>
          <Sky
            distance={450}
            sunPosition={[32, 38, 26]}
            inclination={0.52}
            azimuth={0.22}
            turbidity={3.2}
            rayleigh={0.85}
          />
          <ambientLight intensity={0.68} color="#fff9eb" />
          <hemisphereLight args={['#9fd8ff', '#8cd45b', 0.85]} />
          <directionalLight
            position={[22, 30, 20]}
            intensity={2.2}
            color="#fff4d6"
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-bias={-0.0004}
            shadow-camera-near={1}
            shadow-camera-far={85}
            shadow-camera-left={-22}
            shadow-camera-right={22}
            shadow-camera-top={22}
            shadow-camera-bottom={-22}
          />

          <RigidBody type="fixed" colliders={false} friction={0.9}>
            <CuboidCollider args={[45, 0.25, 45]} position={[0, -0.26, 0]} />
            <CuboidCollider args={[30, 5, 0.5]} position={[0, 4, 21.5]} />
            <CuboidCollider args={[30, 5, 0.5]} position={[0, 4, -30]} />
            <CuboidCollider args={[0.5, 5, 30]} position={[-22, 4, -4]} />
            <CuboidCollider args={[0.5, 5, 30]} position={[22, 4, -4]} />
          </RigidBody>

          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, -4]} receiveShadow>
            <planeGeometry args={[110, 130]} />
            <meshStandardMaterial color="#87cf54" roughness={0.92} />
          </mesh>
        </>
      )}

      {currentZone === 'OUTDOOR_YARD' && (
        <>
          <RigidBody type="fixed" colliders="trimesh" friction={0.85} restitution={0.1}>
            <primitive object={houseClone} scale={[autoScale, autoScale, autoScale]} />
          </RigidBody>

          <mesh
            position={[OUTDOOR_MAT_POSITION[0], 0.015, OUTDOOR_MAT_POSITION[2]]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
          >
            <planeGeometry args={[2.4, 1.3]} />
            <meshBasicMaterial color="#57d99a" transparent opacity={0.85} />
          </mesh>

          <group position={[0, 0.0, 15.1]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.015, -1.75]} receiveShadow>
              <planeGeometry args={[56, 1.35]} />
              <meshStandardMaterial color="#e8e2d5" roughness={0.85} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0.4]} receiveShadow>
              <planeGeometry args={[64, 4.4]} />
              <meshStandardMaterial color="#596273" roughness={0.88} />
            </mesh>
            {[-18, -12, -6, 0, 6, 12, 18].map((x) => (
              <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, -0.012, 0.4]}>
                <planeGeometry args={[2.6, 0.16]} />
                <meshStandardMaterial color="#fff3b0" roughness={0.6} />
              </mesh>
            ))}
          </group>

          <RigidBody
            type="fixed"
            colliders={false}
            position={TRAMPOLINE_POSITION}
            userData={{ isTrampoline: true }}
          >
            <CylinderCollider args={[0.24, TRAMPOLINE_RADIUS]} position={[0, 0.24, 0]} restitution={1.15} />
            <mesh position={[0, 0.44, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
              <torusGeometry args={[1.38, 0.18, 14, 32]} />
              <meshStandardMaterial color="#3b8beb" roughness={0.45} />
            </mesh>
            <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[1.32, 1.32, 0.06, 28]} />
              <meshStandardMaterial color="#273043" roughness={0.65} />
            </mesh>
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const ang = (i / 6) * Math.PI * 2;
              return (
                <mesh key={i} position={[Math.cos(ang) * 1.25, 0.21, Math.sin(ang) * 1.25]} castShadow>
                  <cylinderGeometry args={[0.055, 0.055, 0.42, 10]} />
                  <meshStandardMaterial color="#6c7a89" roughness={0.4} metalness={0.3} />
                </mesh>
              );
            })}
          </RigidBody>
        </>
      )}

      {currentZone === 'BACKYARD' && (
        <group position={[0, 0, -16]}>
          <mesh position={[0, 0.6, -6]} castShadow receiveShadow>
            <boxGeometry args={[18, 1.2, 0.15]} />
            <meshStandardMaterial color="#8a6b4f" roughness={0.9} />
          </mesh>
          <mesh position={[-9, 0.6, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.15, 1.2, 12]} />
            <meshStandardMaterial color="#8a6b4f" roughness={0.9} />
          </mesh>
          <mesh position={[9, 0.6, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.15, 1.2, 12]} />
            <meshStandardMaterial color="#8a6b4f" roughness={0.9} />
          </mesh>
          <group position={[-5, 0, -2]}>
            <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
              <boxGeometry args={[1.4, 1.0, 1.4]} />
              <meshStandardMaterial color="#c0392b" roughness={0.8} />
            </mesh>
            <mesh position={[0, 1.25, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
              <coneGeometry args={[1.1, 0.7, 4]} />
              <meshStandardMaterial color="#7f8c8d" roughness={0.8} />
            </mesh>
          </group>
          <group position={[4, 0, -2]}>
            <mesh position={[-1.5, 0.9, 0]} castShadow>
              <cylinderGeometry args={[0.05, 0.05, 1.8, 8]} />
              <meshStandardMaterial color="#95a5a6" />
            </mesh>
            <mesh position={[1.5, 0.9, 0]} castShadow>
              <cylinderGeometry args={[0.05, 0.05, 1.8, 8]} />
              <meshStandardMaterial color="#95a5a6" />
            </mesh>
            <mesh position={[0, 1.75, 0]} castShadow>
              <boxGeometry args={[3, 0.03, 0.03]} />
              <meshStandardMaterial color="#ecf0f1" />
            </mesh>
          </group>
          {[-2, 0, 2].map((gx, i) => (
            <mesh key={i} position={[gx, 0.12, 1]} receiveShadow>
              <boxGeometry args={[1.2, 0.24, 1.2]} />
              <meshStandardMaterial color="#5d4037" roughness={0.95} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
};

useGLTF.preload('/models/environment/heeler_house.glb');
