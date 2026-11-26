import React from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useGameStore } from '../store/gameStore';

/**
 * Slow, cinematic orbiting camera for the title screen (MAIN_MENU) and the
 * character-select screen (CHARACTER_SELECT). Gentle-ly circles the camera around
 * Bluey's Heeler House + front yard while the live 3D scene idles behind the
 * 2D overlay. Does nothing during ARRIVAL_CUTSCENE / PLAYING so the cutscene and
 * third-person cameras take over.
 */
export const OrbitingCamera: React.FC = () => {
  const { camera } = useThree();
  const mode = useGameStore((s) => s.mode);

  useFrame((state) => {
    if (mode !== 'MAIN_MENU' && mode !== 'CHARACTER_SELECT') return;
    const t = state.clock.elapsedTime;
    const angle = t * 0.09;
    const radius = 13.5;
    const target = new THREE.Vector3(0, 1.4, 6.5);

    const desired = new THREE.Vector3(
      target.x + Math.sin(angle) * radius,
      4.3 + Math.sin(t * 0.4) * 0.6,
      target.z + Math.cos(angle) * radius
    );
    camera.position.lerp(desired, 0.04);
    camera.lookAt(target);
  });

  return null;
};