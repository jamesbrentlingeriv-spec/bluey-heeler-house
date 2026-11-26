import React, { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';

/**
 * ~1.2-second cartoon loading screen shown while switching between the outdoor yard
 * and the indoor house. Shows a bouncing red balloon icon + friendly progress message,
 * then commits the zone change (teleport player & NPCs, respawn balloon, swap lighting).
 */
export const LoadingTransition: React.FC = () => {
  const zoneTransition = useGameStore((s) => s.zoneTransition);
  const completeZoneChange = useGameStore((s) => s.completeZoneChange);

  useEffect(() => {
    if (!zoneTransition?.active) return;
    const target = zoneTransition.target;
    const timer = window.setTimeout(() => {
      completeZoneChange(target);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [zoneTransition, completeZoneChange]);

  if (!zoneTransition?.active) return null;

  return (
    <div className="loading-overlay">
      <div className="loading-card">
        <div className="loading-balloon">🎈</div>
        <div className="loading-message">{zoneTransition.message}</div>
        <div className="loading-dots">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </div>
      </div>
    </div>
  );
};