import React, { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useGameStore } from '../store/gameStore';
import { ZONE_BOUNDS } from '../constants/zones';
import { SpeechBubble } from './SpeechBubble';

/**
 * Secret "Cody" (me) easter-egg character.
 * NOT selectable, NOT an NPC — a standalone avatar that periodically drops in
 * from off-screen (above the camera), falls to the active-zone ground with the
 * `fall` clip, stands and waves (`Wave_One_Hand`) while introducing the maker,
 * then runs off-camera (`Running`) until the next round.
 *
 * Timeline (every ~5 minutes during PLAYING):
 * 1. falls from FALL_HEIGHT over FALL_DURATION seconds.
 * 2. stands + waves for WAVE_DURATION seconds, showing CODY_LINE speech bubble.
 * 3. runs off-camera for RUN_DURATION seconds.
 * 4. disappears; loop repeats.
 */
const ME_PATH = '/models/characters/me.glb';
const CYCLE_MS = 5 * 60 * 1000;
const FALL_HEIGHT = 20;
const FALL_DURATION = 1.6;
const WAVE_DURATION = 4.0;
const RUN_DURATION = 2.6;
const RUN_SPEED = 5.5;
const ME_TARGET_HEIGHT = 1.72;
const CODY_LINE = "Hey everybody, it's Cody! I made this game. Hope you like it!";

type Phase = 'inactive' | 'falling' | 'waving' | 'running';

export const MeEasterEgg: React.FC = () => {
  const { scene, animations } = useGLTF(ME_PATH);
  const rootRef = useRef<THREE.Group>(null);
  const animGroupRef = useRef<THREE.Group>(null);
  const { actions } = useAnimations(animations, animGroupRef);
  const triggerSpeech = useGameStore((s) => s.triggerSpeech);

  const { clone, scale } = useMemo(() => {
    const c = cloneSkeleton(scene);
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh;
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
      }
    });
    const box = new THREE.Box3().setFromObject(c);
    const h = Math.max(box.max.y - box.min.y, 0.1);
    return { clone: c, scale: ME_TARGET_HEIGHT / h };
  }, [scene]);

  const [phase, setPhase] = useState<Phase>('inactive');
  const elapsedRef = useRef(0);
  const posRef = useRef(new THREE.Vector3(0, FALL_HEIGHT, 8));
  const yawRef = useRef(Math.PI);
  const nextSpawnAtRef = useRef(performance.now() + CYCLE_MS);
  const currentClipRef = useRef<string | null>(null);

  const playClip = (name: string) => {
    if (currentClipRef.current === name) return;
    const next = actions[name];
    if (!next) return;
    const prev = currentClipRef.current;
    if (prev && actions[prev]) actions[prev].fadeOut(0.2);
    next.reset().fadeIn(0.2).play();
    currentClipRef.current = name;
  };

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const now = performance.now();
    const state = useGameStore.getState();

    if (phase === 'inactive') {
      if (now >= nextSpawnAtRef.current) {
        if (state.mode === 'PLAYING') {
          const b = ZONE_BOUNDS[state.currentZone];
          posRef.current.set(
            b.center[0] + (Math.random() * 5 - 2.5),
            FALL_HEIGHT,
            b.center[1] + (Math.random() * 3 - 1.5)
          );
          elapsedRef.current = 0;
          setPhase('falling');
          nextSpawnAtRef.current = now + CYCLE_MS;
        } else {
          // Not in gameplay — retry shortly without resetting the long cycle.
          nextSpawnAtRef.current = now + 1000;
        }
      }
      return;
    }

    elapsedRef.current += dt;

    if (phase === 'falling') {
      playClip('fall');
      const b = ZONE_BOUNDS[state.currentZone];
      const p = Math.min(1, elapsedRef.current / FALL_DURATION);
      posRef.current.y = THREE.MathUtils.lerp(FALL_HEIGHT, b.groundY + 0.05, p);
      if (p >= 1) {
        elapsedRef.current = 0;
        triggerSpeech('me', CODY_LINE, 6200);
        setPhase('waving');
      }
    } else if (phase === 'waving') {
      playClip('Wave_One_Hand');
      if (elapsedRef.current > WAVE_DURATION) {
        elapsedRef.current = 0;
        setPhase('running');
      }
    } else if (phase === 'running') {
      playClip('Running');
      posRef.current.z += RUN_SPEED * dt;
      if (elapsedRef.current > RUN_DURATION || posRef.current.z > 24) {
        Object.values(actions).forEach((a) => a?.fadeOut(0.2));
        currentClipRef.current = null;
        setPhase('inactive');
        return;
      }
    }

    if (rootRef.current) {
      rootRef.current.position.copy(posRef.current);
      // Wave at the player; run straight off-camera toward +Z.
      if (phase === 'waving') {
        const [px, , pz] = state.playerPosition;
        yawRef.current = Math.atan2(px - posRef.current.x, pz - posRef.current.z);
      } else if (phase === 'running') {
        yawRef.current = 0;
      }
      rootRef.current.rotation.y = yawRef.current;
    }
  });

  const visible = phase !== 'inactive';

  return (
    <group ref={rootRef} visible={visible}>
      <group ref={animGroupRef} scale={[scale, scale, scale]}>
        <primitive object={clone} />
      </group>
      {/* Speech bubble anchor above Cody's head (CODY_LINE). */}
      <SpeechBubble characterId="me" offsetY={2.05} accentColor="#1d2b53" />
    </group>
  );
};

useGLTF.preload(ME_PATH);