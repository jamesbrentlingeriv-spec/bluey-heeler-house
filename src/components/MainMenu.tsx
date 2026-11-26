import React from 'react';
import { useGameStore } from '../store/gameStore';

/**
 * Bright cartoon title overlay over the live, slow-orbiting 3D Heeler House & yard.
 * A single big START button advances the state machine into CHARACTER_SELECT.
 */
export const MainMenu: React.FC = () => {
  const mode = useGameStore((s) => s.mode);
  const startGame = useGameStore((s) => s.startGame);
  const keepyUppyEnabled = useGameStore((s) => s.keepyUppyEnabled);
  const toggleKeepyUppy = useGameStore((s) => s.toggleKeepyUppy);

  if (mode !== 'MAIN_MENU') return null;

  return (
    <div className="menu-overlay">
      <div className="menu-panel">
        <img className="menu-logo" src="/icons/app-icon-512.png" alt="Bluey logo" />
        <div className="menu-kicker">🐶 Bluey's Heeler House</div>
        <h1 className="menu-title">
          Keepy Uppy!
          <span className="menu-title-balloon">🎈</span>
        </h1>
        <p className="menu-subtitle">
          {keepyUppyEnabled
            ? 'Keep the red balloon in the air with the whole Heeler family!'
            : "Explore Bluey's house, front yard, and backyard!"}
        </p>
        <button type="button" className="hud-btn btn-yellow" onClick={toggleKeepyUppy}>
          {keepyUppyEnabled ? '🎈 Keepy Uppy: On' : '🎈 Keepy Uppy: Off'}
        </button>
        <button type="button" className="menu-start-btn" onClick={startGame}>
          {"\u25B6"} START PLAYING
        </button>
      </div>
    </div>
  );
};