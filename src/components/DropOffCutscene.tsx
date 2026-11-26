import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useGameStore } from '../store/gameStore';
import { CharacterAvatar } from './CharacterAvatar';
import { playCarHorn } from '../utils/soundEffects';
import type { CharacterManifestItem, StandardActionKey } from '../types/game';

const STREET_Z = 15.0;
const STOP_X = -0.4;
const CAR_SCALE = 2.3;
const CAR_GROUND_OFFSET = 0.356 * CAR_SCALE;

function smoothStep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function easeOutCubic(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - c, 3);
}

/** World-space seat offsets; +X is the vehicle's forward direction. */
const SEAT_OFFSETS: Record<string, [number, number, number]> = {
  destiny: [0.18, 0.22, 0.42],
  alex: [0.18, 0.22, -0.42],
  marleigh: [-0.68, 0.22, 0.3],
  callie: [-0.68, 0.22, -0.3],
};

const HOP_TARGETS: Record<string, [number, number]> = {
  destiny: [0.4, 12.5],
  alex: [2.0, 12.7],
  marleigh: [-0.6, 12.9],
  callie: [-2.0, 12.6],
};

const ARRIVAL_FINAL: Record<string, [number, number, number]> = {
  destiny: [1.1, 0, 9.0],
  alex: [1.7, 0, 9.8],
  marleigh: [-0.6, 0, 10.0],
  callie: [-1.4, 0, 9.4],
};

const GREETER_RENDER: Record<string, [number, number, number]> = {
  bluey: [-1.55, 0, 7.3],
  bingo: [1.55, 0, 7.3],
  bandit: [-2.2, 0.72, 2.2],
  chilli: [2.2, 0.72, 2.2],
};

const FINAL_HANDOFF: Record<string, [number, number, number]> = {
  bluey: [-1.55, 0.15, 7.3],
  bingo: [1.55, 0.15, 7.3],
  bandit: [-2.2, 0.87, 2.2],
  chilli: [2.2, 0.87, 2.2],
  destiny: [1.1, 0.15, 9.0],
  alex: [1.7, 0.15, 9.8],
  marleigh: [-0.6, 0.15, 10.0],
  callie: [-1.4, 0.15, 9.4],
};

const EXIT_BUBBLES: Record<string, string> = {
  destiny: "Let's play Keepy Uppy!",
  alex: "We're here!",
  marleigh: 'Yay, yippee!',
  callie: 'Yay, yippee!',
};

const GREET_BUBBLES: Record<string, string> = {
  bluey: 'Hey Marleigh!',
  bingo: 'Hey Callie!',
  bandit: 'Hi Destiny & Alex!',
  chilli: 'Yay, yippee!',
};

const ARRIVING_IDS = ['destiny', 'alex', 'marleigh', 'callie'];
const GREETER_IDS = ['bluey', 'bingo', 'bandit', 'chilli'];

const INITIAL_ACTIONS: Record<string, StandardActionKey> = {
  destiny: 'SitDrive',
  alex: 'SitDrive',
  marleigh: 'SitDrive',
  callie: 'SitDrive',
  bluey: 'Idle',
  bingo: 'Idle',
  bandit: 'Idle',
  chilli: 'Idle',
};

/**
 * Group Arrival Drop-Off Cutscene (identical for all 8 selectable characters):
 * Destiny drives car.glb up with Alex (front) + Marleigh & Callie (back),
 * beeps at the curb, Bluey/Bingo/Bandit/Chilli wave from the porch, the four
 * arrivals hop out onto the lawn, then the camera blends behind the selected pup.
 */
export const DropOffCutscene: React.FC = () => {
  const { camera } = useThree();
  const mode = useGameStore((s) => s.mode);
  const cutsceneRunId = useGameStore((s) => s.cutsceneRunId);
  const selectedCharacterId = useGameStore((s) => s.selectedCharacterId);
  const characters = useGameStore((s) => s.characters);
  const triggerSpeech = useGameStore((s) => s.triggerSpeech);
  const finishCutscene = useGameStore((s) => s.finishCutscene);

  const { scene: carScene } = useGLTF('/models/props/car.glb');

  const carClone = useMemo(() => {
    const c = carScene.clone(true);
    c.scale.setScalar(CAR_SCALE);
    c.position.y = CAR_GROUND_OFFSET;
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return c;
  }, [carScene]);

  const byId = useMemo(() => {
    const map: Record<string, CharacterManifestItem> = {};
    for (const c of characters) map[c.id] = c;
    return map;
  }, [characters]);

  const carGroupRef = useRef<THREE.Group>(null);
  const charRefs = useRef<Record<string, THREE.Group | null>>({});

  const elapsedRef = useRef(0);
  const firedRef = useRef<Record<string, boolean>>({});

  const [actions, setActions] = useState<Record<string, StandardActionKey>>({ ...INITIAL_ACTIONS });
  const prevActionsRef = useRef<Record<string, StandardActionKey>>({ ...INITIAL_ACTIONS });

  const setAction = (id: string, action: StandardActionKey) => {
    if (prevActionsRef.current[id] === action) return;
    prevActionsRef.current[id] = action;
    setActions((prev) => ({ ...prev, [id]: action }));
  };

  useEffect(() => {
    const fresh = { ...INITIAL_ACTIONS };
    prevActionsRef.current = fresh;
    setActions(fresh);
  }, []);

  useEffect(() => {
    if (mode !== 'ARRIVAL_CUTSCENE') return;
    elapsedRef.current = 0;
    firedRef.current = {};
    const fresh = { ...INITIAL_ACTIONS };
    prevActionsRef.current = fresh;
    setActions(fresh);
  }, [mode, cutsceneRunId]);

  useFrame((_, rawDelta) => {
    if (mode !== 'ARRIVAL_CUTSCENE') return;
    const dt = Math.min(rawDelta, 0.05);
    elapsedRef.current += dt;
    const t = elapsedRef.current;
    const fired = firedRef.current;

    // 1. Car motion: drives up the street, brakes at the curb, then stays parked.
    const carX = t < 2.4 ? THREE.MathUtils.lerp(-18.5, STOP_X, easeOutCubic(t / 2.4)) : STOP_X;

    const engineBounce = Math.sin(t * 24) * (t < 2.4 ? 0.022 : 0.007);
    if (carGroupRef.current) {
      const brakePitch = t > 1.9 && t < 2.6 ? Math.sin(((t - 1.9) / 0.7) * Math.PI) * 0.045 : 0;
      carGroupRef.current.position.set(carX, engineBounce, STREET_Z);
      carGroupRef.current.rotation.set(0, Math.PI, -brakePitch);
    }

    // 2. Timeline events: horn, porch greetings, exit + excited bubbles.
    if (t >= 1.95 && !fired.horn) {
      fired.horn = true;
      playCarHorn();
      triggerSpeech('destiny', 'Beep-beep!', 2000);
    }
    if (t >= 2.55 && !fired.greet) {
      fired.greet = true;
      GREETER_IDS.forEach((id, i) => {
        window.setTimeout(() => {
          if (useGameStore.getState().mode === 'ARRIVAL_CUTSCENE') {
            triggerSpeech(id, GREET_BUBBLES[id], 2600);
          }
        }, i * 380);
      });
    }
    if (t >= 2.75 && !fired.hopOut) {
      fired.hopOut = true;
      ARRIVING_IDS.forEach((id, i) => {
        window.setTimeout(() => {
          if (useGameStore.getState().mode === 'ARRIVAL_CUTSCENE') {
            triggerSpeech(id, EXIT_BUBBLES[id], 2600);
          }
        }, i * 320);
      });
    }

    // 3. Place the four arrivals (in-car -> hop out -> run onto the lawn).
    for (const id of ARRIVING_IDS) {
      const group = charRefs.current[id];
      if (!group) continue;
      const seat = SEAT_OFFSETS[id];
      if (t < 2.75) {
        group.position.set(carX + seat[0], seat[1] + engineBounce, STREET_Z + seat[2]);
        group.rotation.y = Math.PI / 2;
        setAction(id, 'SitDrive');
      } else if (t < 3.5) {
        const hopP = smoothStep(2.75, 3.5, t);
        const [hx, hz] = HOP_TARGETS[id];
        const arcY = Math.sin(hopP * Math.PI) * 0.42;
        group.position.set(
          THREE.MathUtils.lerp(STOP_X + seat[0], hx, hopP),
          seat[1] + arcY,
          THREE.MathUtils.lerp(STREET_Z + seat[2], hz, hopP)
        );
        group.rotation.y = Math.PI;
        setAction(id, 'Wave');
      } else if (t < 5.6) {
        const runP = smoothStep(3.5, 5.6, t);
        const [hx, hz] = HOP_TARGETS[id];
        const final = ARRIVAL_FINAL[id];
        group.position.set(
          THREE.MathUtils.lerp(hx, final[0], runP),
          final[1],
          THREE.MathUtils.lerp(hz, final[2], runP)
        );
        group.rotation.y = Math.PI;
        setAction(id, 'Run');
      } else {
        const final = ARRIVAL_FINAL[id];
        group.position.set(final[0], final[1], final[2]);
        group.rotation.y = Math.PI;
        setAction(id, 'Idle');
      }
    }

    // 4. Greeters wave from walkway/porch.
    for (const id of GREETER_IDS) {
      const group = charRefs.current[id];
      if (group) {
        const p = GREETER_RENDER[id];
        group.position.set(p[0], p[1], p[2]);
        group.rotation.y = id === 'bluey' || id === 'bandit' ? 0.18 : -0.18;
        setAction(id, t >= 2.55 && t < 6.0 ? 'Wave' : 'Idle');
      }
    }

    // 5. Cinematic camera -> blend behind the selected character.
    const handoff = FINAL_HANDOFF[selectedCharacterId] ?? [0, 0.15, 8.2];
    const camPos = new THREE.Vector3();
    const lookTarget = new THREE.Vector3();

    if (t < 2.6) {
      const p = smoothStep(0, 2.6, t);
      camPos.set(
        THREE.MathUtils.lerp(-4.6, -1.6, p),
        THREE.MathUtils.lerp(2.6, 2.4, p),
        THREE.MathUtils.lerp(18.5, 17.0, p)
      );
      lookTarget.set(carX * 0.5, 1.1, THREE.MathUtils.lerp(12.5, 11.0, p));
    } else if (t < 4.6) {
      const p = smoothStep(2.6, 4.6, t);
      camPos.set(THREE.MathUtils.lerp(-1.6, 0.0, p), 2.4, THREE.MathUtils.lerp(17.0, 15.5, p));
      lookTarget.set(0, 1.1, THREE.MathUtils.lerp(11.0, 9.5, p));
    } else {
      const p = smoothStep(4.6, 6.9, t);
      camPos.set(
        THREE.MathUtils.lerp(0.0, handoff[0], p),
        THREE.MathUtils.lerp(2.4, handoff[1] + 2.4, p),
        THREE.MathUtils.lerp(15.5, handoff[2] + 3.0, p)
      );
      lookTarget.set(handoff[0], 1.0, handoff[2] - 1.0);
    }

    camera.position.lerp(camPos, 0.14);
    camera.lookAt(lookTarget);

    if (t >= 6.9) {
      finishCutscene(handoff);
    }
  });

  if (mode !== 'ARRIVAL_CUTSCENE') return null;

  return (
    <group>
      <group ref={carGroupRef} position={[-18.5, 0, STREET_Z]} rotation={[0, Math.PI, 0]}>
        <primitive object={carClone} />
      </group>

      {ARRIVING_IDS.map((id) => {
        const char = byId[id];
        if (!char) return null;
        return (
          <group
            key={id}
            ref={(el) => {
              charRefs.current[id] = el;
            }}
            position={[-18.5, 0.2, STREET_Z]}
          >
            <CharacterAvatar character={char} action={actions[id] ?? 'Idle'} />
          </group>
        );
      })}

      {GREETER_IDS.map((id) => {
        const char = byId[id];
        if (!char) return null;
        return (
          <group
            key={id}
            ref={(el) => {
              charRefs.current[id] = el;
            }}
            position={GREETER_RENDER[id]}
          >
            <CharacterAvatar character={char} action={actions[id] ?? 'Idle'} />
          </group>
        );
      })}
    </group>
  );
};

useGLTF.preload('/models/props/car.glb');
