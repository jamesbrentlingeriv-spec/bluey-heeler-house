import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier';
import { TRAMPOLINE_LINES, useGameStore } from '../store/gameStore';
import { CharacterAvatar } from './CharacterAvatar';
import { TRAMPOLINE_POSITION, TRAMPOLINE_RADIUS } from './HeelerHouseAndYard';
import {
  BACKYARD_ENTRY_Z,
  BACKYARD_PLAYER_SPAWN,
  FRONT_YARD_REENTRY_Z,
  INDOOR_PLAYER_SPAWN,
  OUTDOOR_PLAYER_SPAWN,
} from '../constants/zones';
import { playJumpSound, playTrampolineBounce } from '../utils/soundEffects';
import { mobileInput } from '../utils/mobileInput';
import type { StandardActionKey } from '../types/game';

/**
 * Kid-Friendly Third-Person Character Controller:
 * - WASD / Arrow Keys camera-relative movement, Shift to sprint
 * - Spacebar jump with forgiving 160ms coyote time + automatic trampoline super-bounce
 * - E to use a nearby doorway or swat; F / left-click always swats the balloon
 * - Smooth third-person camera with drag orbit, scroll zoom, and indoor wall avoidance
 */
export const Player: React.FC = () => {
  const { camera, gl } = useThree();
  const { world, rapier } = useRapier();
  const mode = useGameStore((s) => s.mode);
  const selectedCharacterId = useGameStore((s) => s.selectedCharacterId);
  const characters = useGameStore((s) => s.characters);
  const spawnPosition = useGameStore((s) => s.playerSpawnPosition);
  const swatTriggerNonce = useGameStore((s) => s.swatTriggerNonce);
  const currentZone = useGameStore((s) => s.currentZone);
  const setPlayerPosition = useGameStore((s) => s.setPlayerPosition);
  const setCurrentZone = useGameStore((s) => s.setCurrentZone);
  const triggerSpeech = useGameStore((s) => s.triggerSpeech);
  const interact = useGameStore((s) => s.interact);
  const triggerPlayerSwat = useGameStore((s) => s.triggerPlayerSwat);

  const activeChar = useMemo(
    () => characters.find((c) => c.id === selectedCharacterId) ?? characters[0],
    [characters, selectedCharacterId]
  );

  const bodyRef = useRef<RapierRigidBody>(null);
  const visualGroupRef = useRef<THREE.Group>(null);

  const keysRef = useRef<Record<string, boolean>>({});
  const cameraYawRef = useRef(0); // 0 = camera at +Z looking toward -Z (house!)
  const cameraPitchRef = useRef(0.32);
  const cameraZoomRef = useRef(0.9);
  const isPointerDraggingRef = useRef(false);
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null);

  const facingYawRef = useRef(Math.PI); // Models face +Z natively -> Math.PI faces -Z toward house!
  const lastGroundedAtRef = useRef(0);
  const jumpCooldownUntilRef = useRef(0);
  const swatUntilRef = useRef(0);
  const trampolineCooldownRef = useRef(0);
  const posSyncTimerRef = useRef(0);

  const [animAction, setAnimAction] = useState<StandardActionKey>('Idle');
  const prevActionRef = useRef<StandardActionKey>('Idle');

  const setActionSafe = (next: StandardActionKey) => {
    if (prevActionRef.current !== next) {
      prevActionRef.current = next;
      setAnimAction(next);
    }
  };

  // Capsule dimensions fitted cleanly to kid (~1.0m) or adult (~1.65m)
  const { capsuleRadius, capsuleHalfHeight } = useMemo(() => {
    const h = activeChar.targetHeight;
    const r = activeChar.role === 'kid' ? 0.24 : 0.28;
    const hh = Math.max(0.18, (h - 2 * r) * 0.5);
    return { capsuleRadius: r, capsuleHalfHeight: hh };
  }, [activeChar]);

  const colliderCenterY = capsuleRadius + capsuleHalfHeight;

  // Reset player body cleanly when entering gameplay mode or switching characters
  useEffect(() => {
    if (mode !== 'PLAYING' || !bodyRef.current) return;
    bodyRef.current.setTranslation(
      { x: spawnPosition[0], y: spawnPosition[1] + 0.08, z: spawnPosition[2] },
      true
    );
    bodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
    facingYawRef.current = Math.PI;
    cameraYawRef.current = 0;
    cameraPitchRef.current = 0.30;
  }, [mode, selectedCharacterId, spawnPosition]);

  // Trigger swat animation when a HUD, keyboard, mouse, or touch action swats.
  useEffect(() => {
    if (swatTriggerNonce === 0) return;
    swatUntilRef.current = performance.now() + 520;
    setActionSafe('Swat');
  }, [swatTriggerNonce]);

  // Keyboard & mouse controls
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
      if (useGameStore.getState().mode !== 'PLAYING') return;

      if (e.code === 'KeyE') {
        interact();
      } else if (e.code === 'KeyF') {
        triggerPlayerSwat();
      }
      if (e.code === 'Space') {
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };

    const dom = gl.domElement;
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 2) return;
      isPointerDraggingRef.current = false;
      pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!pointerDownPosRef.current) return;
      const dx = e.clientX - pointerDownPosRef.current.x;
      const dy = e.clientY - pointerDownPosRef.current.y;
      if (Math.hypot(dx, dy) > 5) {
        isPointerDraggingRef.current = true;
      }
      if (isPointerDraggingRef.current) {
        cameraYawRef.current -= e.movementX * 0.0055;
        cameraPitchRef.current = THREE.MathUtils.clamp(
          cameraPitchRef.current + e.movementY * 0.0045,
          0.08,
          0.85
        );
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      if (
        pointerDownPosRef.current &&
        !isPointerDraggingRef.current &&
        e.button === 0 &&
        useGameStore.getState().mode === 'PLAYING'
      ) {
        triggerPlayerSwat();
      }
      pointerDownPosRef.current = null;
      isPointerDraggingRef.current = false;
    };
    const onWheel = (e: WheelEvent) => {
      if (useGameStore.getState().mode !== 'PLAYING') return;
      e.preventDefault();
      cameraZoomRef.current = THREE.MathUtils.clamp(
        cameraZoomRef.current * Math.exp(e.deltaY * 0.001),
        0.4,
        1.6
      );
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [gl.domElement, interact, triggerPlayerSwat]);

  useFrame((_, rawDelta) => {
    if (mode !== 'PLAYING' || !bodyRef.current) return;
    const dt = Math.min(rawDelta, 0.05);
    const now = performance.now();
    const keys = keysRef.current;

    // Q / R optional keyboard camera orbit for laptop trackpad players
    if (keys['KeyQ']) cameraYawRef.current += 1.8 * dt;
    if (keys['KeyR']) cameraYawRef.current -= 1.8 * dt;

    const pos = bodyRef.current.translation();
    const vel = bodyRef.current.linvel();

    if (currentZone === 'OUTDOOR_YARD' && pos.z < BACKYARD_ENTRY_Z) {
      setCurrentZone('BACKYARD');
    } else if (currentZone === 'BACKYARD' && pos.z > FRONT_YARD_REENTRY_Z) {
      setCurrentZone('OUTDOOR_YARD');
    }

    // Fall safety rescue if ever below -3m
    if (pos.y < -3.0) {
      const rescueSpawn =
        currentZone === 'INDOOR_HOUSE'
          ? INDOOR_PLAYER_SPAWN
          : currentZone === 'BACKYARD'
            ? BACKYARD_PLAYER_SPAWN
            : OUTDOOR_PLAYER_SPAWN;
      bodyRef.current.setTranslation(
        { x: rescueSpawn[0], y: 1.2, z: rescueSpawn[2] },
        true
      );
      bodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }

    // Grounded check + forgiving 160ms coyote time
    const isNearlyGrounded = Math.abs(vel.y) < 0.85 && pos.y < 2.2;
    if (isNearlyGrounded) {
      lastGroundedAtRef.current = now;
    }
    const canCoyoteJump = now - lastGroundedAtRef.current < 165;
    const hasBufferedTouchJump =
      mobileInput.jumpQueuedAt > 0 && now - mobileInput.jumpQueuedAt <= 250;
    if (mobileInput.jumpQueuedAt > 0 && !hasBufferedTouchJump) {
      mobileInput.jumpQueuedAt = 0;
    }

    // Trampoline proximity auto-bounce!
    const distToTrampoline = Math.hypot(
      pos.x - TRAMPOLINE_POSITION[0],
      pos.z - TRAMPOLINE_POSITION[2]
    );
    if (
      distToTrampoline < TRAMPOLINE_RADIUS * 0.92 &&
      pos.y >= 0.25 &&
      pos.y <= 0.95 &&
      vel.y <= 1.2 &&
      now > trampolineCooldownRef.current
    ) {
      trampolineCooldownRef.current = now + 650;
      bodyRef.current.setLinvel({ x: vel.x, y: 9.0, z: vel.z }, true);
      playTrampolineBounce();
      const line = TRAMPOLINE_LINES[Math.floor(Math.random() * TRAMPOLINE_LINES.length)];
      triggerSpeech(activeChar.id, line, 2200, true);
    } else if (
      (keys['Space'] || keys['KeyK'] || hasBufferedTouchJump) &&
      canCoyoteJump &&
      now > jumpCooldownUntilRef.current
    ) {
      jumpCooldownUntilRef.current = now + 340;
      lastGroundedAtRef.current = 0;
      mobileInput.jumpQueuedAt = 0;
      bodyRef.current.setLinvel({ x: vel.x, y: 6.1, z: vel.z }, true);
      playJumpSound();
    }

    // Movement input in camera-relative horizontal plane
    const forwardInput =
      (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) -
      (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0) +
      mobileInput.moveForward;
    const rightInput =
      (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) -
      (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0) +
      mobileInput.moveX;

    const isRunning = Boolean(keys['ShiftLeft'] || keys['ShiftRight']);
    const inputMagnitude = Math.min(1, Math.hypot(forwardInput, rightInput));
    const moveSpeed = (isRunning ? 5.6 : 3.5) * inputMagnitude;

    const camForward = new THREE.Vector3(
      -Math.sin(cameraYawRef.current),
      0,
      -Math.cos(cameraYawRef.current)
    );
    const camRight = new THREE.Vector3(
      Math.cos(cameraYawRef.current),
      0,
      -Math.sin(cameraYawRef.current)
    );

    const moveDir = new THREE.Vector3()
      .addScaledVector(camForward, forwardInput)
      .addScaledVector(camRight, rightInput);

    const isMoving = moveDir.lengthSq() > 0.01 && inputMagnitude > 0.05;
    if (isMoving) {
      moveDir.normalize();
      // Smoothly assist step-up on front porch stairs (Z in [2.3, 4.7], |X| < 1.35)
      const onFrontStairs =
        forwardInput > 0 && Math.abs(pos.x) < 1.35 && pos.z > 2.2 && pos.z < 4.8 && pos.y < 0.78;
      const nextVy = onFrontStairs ? Math.max(bodyRef.current.linvel().y, 2.35) : bodyRef.current.linvel().y;

      bodyRef.current.setLinvel(
        {
          x: moveDir.x * moveSpeed,
          y: nextVy,
          z: moveDir.z * moveSpeed,
        },
        true
      );

      // Character meshes face +Z natively -> atan2(dx, dz) faces movement vector cleanly!
      const targetYaw = Math.atan2(moveDir.x, moveDir.z);
      let diff = targetYaw - facingYawRef.current;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      facingYawRef.current += diff * Math.min(1, dt * 12);
    } else {
      bodyRef.current.setLinvel(
        {
          x: vel.x * 0.78,
          y: bodyRef.current.linvel().y,
          z: vel.z * 0.78,
        },
        true
      );
    }

    if (visualGroupRef.current) {
      visualGroupRef.current.rotation.y = facingYawRef.current;
    }

    // Animation state machine
    if (now < swatUntilRef.current) {
      setActionSafe('Swat');
    } else if (!canCoyoteJump && Math.abs(bodyRef.current.linvel().y) > 1.1) {
      setActionSafe('Jump');
    } else if (isMoving) {
      setActionSafe(isRunning ? 'Run' : 'Walk');
    } else {
      setActionSafe('Idle');
    }

    // Sync lightweight player position to store (~12Hz) for NPC greetings & balloon summon
    posSyncTimerRef.current += dt;
    if (posSyncTimerRef.current > 0.08) {
      posSyncTimerRef.current = 0;
      setPlayerPosition([pos.x, pos.y, pos.z]);
    }

    // Third-person camera follow with smooth indoor porch/room ceiling & wall avoidance!
    const indoors = currentZone === 'INDOOR_HOUSE';
    const isUnderPorchOrIndoors =
      indoors || (Math.abs(pos.x) < 5.6 && pos.z < 2.8 && pos.z > -6.5);
    // Keep the indoor camera within the compact living room; porch stays snug.
    const desiredDist = (isUnderPorchOrIndoors ? 2.65 : 4.85) * cameraZoomRef.current;
    const desiredPitch = isUnderPorchOrIndoors
      ? Math.min(cameraPitchRef.current, 0.22)
      : cameraPitchRef.current;

    const headHeight = activeChar.targetHeight * 0.78;
    const focusPoint = new THREE.Vector3(pos.x, pos.y + headHeight, pos.z);

    const horizDist = Math.cos(desiredPitch) * desiredDist;
    let camY = focusPoint.y + Math.sin(desiredPitch) * desiredDist + 0.35;
    if (isUnderPorchOrIndoors) {
      // Keep camera safely below the ~4.1m indoor ceiling
      camY = Math.min(camY, 3.05);
    }

    const desiredCamPos = new THREE.Vector3(
      focusPoint.x + Math.sin(cameraYawRef.current) * horizDist,
      Math.max(0.75, camY),
      focusPoint.z + Math.cos(cameraYawRef.current) * horizDist
    );

    // Indoors: raycast from the player toward the desired camera to pull it in
    // front of any wall so it never clips through the interior.
    if (indoors) {
      const dir = desiredCamPos.clone().sub(focusPoint);
      const dist = dir.length();
      if (dist > 0.001) {
        dir.normalize();
        try {
          const ray = new rapier.Ray(
            { x: focusPoint.x, y: focusPoint.y, z: focusPoint.z },
            { x: dir.x, y: dir.y, z: dir.z }
          );
          const hit = world.castRay(
            ray,
            dist,
            true,
            undefined,
            undefined,
            undefined,
            bodyRef.current ?? undefined,
            undefined
          );
          if (hit && hit.timeOfImpact < dist) {
            const clamped = Math.max(0.6, hit.timeOfImpact - 0.25);
            desiredCamPos.copy(focusPoint).addScaledVector(dir, clamped);
          }
        } catch {
          // Ignore transient raycast errors (world may not be ready for a frame).
        }
      }
    }

    camera.position.lerp(desiredCamPos, 1 - Math.exp(-10 * dt));
    camera.lookAt(focusPoint);
  });

  if (mode !== 'PLAYING') {
    return null;
  }

  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      colliders={false}
      position={spawnPosition}
      enabledRotations={[false, false, false]}
      friction={0.2}
      linearDamping={0.5}
      userData={{ isPlayer: true, characterId: activeChar.id, characterName: activeChar.name }}
    >
      <CapsuleCollider args={[capsuleHalfHeight, capsuleRadius]} position={[0, colliderCenterY, 0]} />
      <group ref={visualGroupRef} rotation={[0, Math.PI, 0]}>
        <CharacterAvatar character={activeChar} action={animAction} />
      </group>
    </RigidBody>
  );
};
