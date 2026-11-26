import React, { useEffect, useState } from 'react';
import { Html } from '@react-three/drei';
import { useGameStore } from '../store/gameStore';

export interface SpeechBubbleProps {
  characterId?: string;
  text?: string;
  visible?: boolean;
  offsetY?: number;
  accentColor?: string;
}

/**
 * Bright, kid-friendly floating 3D cartoon comic speech bubble anchored above a character's head.
 * Uses @react-three/drei's <Html center distanceFactor={8} zIndexRange={[10, 0]}> so it always
 * faces the camera cleanly, scales naturally with distance, pops in smoothly, and auto-fades.
 */
export const SpeechBubble: React.FC<SpeechBubbleProps> = ({
  characterId,
  text: propText,
  visible: propVisible,
  offsetY = 1.65,
  accentColor = '#579be3',
}) => {
  const storeEntry = useGameStore((s) =>
    characterId ? s.speechBubbles[characterId] : undefined
  );

  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    if (!storeEntry) return;
    const timer = window.setInterval(() => {
      const t = performance.now();
      setNow(t);
      if (t >= storeEntry.expiresAt) {
        useGameStore.getState().pruneExpiredSpeech();
      }
    }, 80);
    return () => window.clearInterval(timer);
  }, [storeEntry]);

  const activeText = propText ?? storeEntry?.text ?? '';
  const isStoreVisible = Boolean(storeEntry && now < storeEntry.expiresAt);
  const isVisible = propVisible !== undefined ? propVisible && Boolean(activeText) : isStoreVisible;

  if (!isVisible || !activeText) {
    return null;
  }

  const remainingMs = storeEntry ? storeEntry.expiresAt - now : 1000;
  const isFadingOut = storeEntry ? remainingMs < 360 : false;
  const animKey = storeEntry ? storeEntry.nonce : activeText;

  return (
    <group position={[0, offsetY, 0]}>
      <Html
        center
        distanceFactor={8}
        zIndexRange={[10, 0]}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <div
          key={animKey}
          className={`cartoon-speech-bubble ${isFadingOut ? 'fading-out' : 'popping-in'}`}
          style={
            {
              '--bubble-accent': accentColor,
            } as React.CSSProperties
          }
        >
          <span className="cartoon-speech-text">{activeText}</span>
          <span className="cartoon-speech-tail" />
        </div>
      </Html>
    </group>
  );
};
