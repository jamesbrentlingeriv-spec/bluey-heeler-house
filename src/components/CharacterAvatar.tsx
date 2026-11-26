import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useAnimations, useGLTF } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CharacterManifestItem, StandardActionKey } from '../types/game';
import { SpeechBubble } from './SpeechBubble';

export interface CharacterAvatarProps {
  character: CharacterManifestItem;
  action: StandardActionKey;
  timeScale?: number;
  showSpeechBubble?: boolean;
  extraScale?: number;
}

/**
 * Reusable animated 3D glTF character renderer.
 * Clones SkinnedMesh hierarchies safely via SkeletonUtils.clone, applies heightScale
 * from manifest.json, crossfades between standard action keys (Idle, Walk, Run, Jump,
 * Swat, Wave, SitDrive), and renders the character's floating 3D SpeechBubble.
 */
export const CharacterAvatar: React.FC<CharacterAvatarProps> = ({
  character,
  action,
  timeScale = 1,
  showSpeechBubble = true,
  extraScale = 1,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(character.path);

  const clonedScene = useMemo(() => {
    const cloned = cloneSkeleton(scene);
    cloned.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
      }
    });
    return cloned;
  }, [scene]);

  const { actions } = useAnimations(animations, groupRef);
  const prevActionNameRef = useRef<string | null>(null);

  useEffect(() => {
    const clipName =
      character.clips[action] ??
      character.clips.Idle ??
      Object.values(character.clips)[0];
    if (!clipName) return;

    const nextAction = actions[clipName];
    if (!nextAction) return;

    const prevName = prevActionNameRef.current;
    if (prevName && prevName !== clipName && actions[prevName]) {
      actions[prevName]!.fadeOut(0.18);
    }

    nextAction.reset();
    nextAction.setEffectiveTimeScale(timeScale);
    if (action === 'Jump' || action === 'Swat') {
      nextAction.setLoop(THREE.LoopOnce, 1);
      nextAction.clampWhenFinished = true;
    } else {
      nextAction.setLoop(THREE.LoopRepeat, Infinity);
      nextAction.clampWhenFinished = false;
    }
    nextAction.fadeIn(0.18).play();
    prevActionNameRef.current = clipName;
  }, [action, actions, character.clips, timeScale]);

  const finalScale = character.heightScale * extraScale;

  return (
    <group>
      <group ref={groupRef} scale={[finalScale, finalScale, finalScale]}>
        <primitive object={clonedScene} />
      </group>
      {showSpeechBubble && (
        <SpeechBubble
          characterId={character.id}
          offsetY={character.bubbleOffsetY * extraScale}
          accentColor={character.accentColor}
        />
      )}
    </group>
  );
};
