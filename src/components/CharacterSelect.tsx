import React from 'react';
import { useGameStore } from '../store/gameStore';

const ROLE_LABELS: Record<string, string> = {
  kid: 'Kid',
  adult: 'Family',
  destiny: 'Driver',
};

/**
 * Colorful 8-card grid loaded from manifest.json (via the zustand store).
 * Selecting any character sets them active and starts the ARRIVAL_CUTSCENE.
 */
export const CharacterSelect: React.FC = () => {
  const mode = useGameStore((s) => s.mode);
  const characters = useGameStore((s) => s.characters);
  const selectCharacter = useGameStore((s) => s.selectCharacter);

  if (mode !== 'CHARACTER_SELECT') return null;

  return (
    <div className="character-select-overlay">
      <div className="character-select-panel">
        <h2 className="character-select-title">Who do you want to play?</h2>
        <p className="character-select-subtitle">Pick a pup from the Heeler crew!</p>

        <div className="character-card-grid">
          {characters.map((char) => (
            <button
              key={char.id}
              type="button"
              className="character-card"
              style={{ '--char-color': char.accentColor } as React.CSSProperties}
              onClick={() => selectCharacter(char.id, true)}
            >
              <span
                className="character-card-avatar"
                style={{ background: char.accentColor }}
              >
                {char.name.slice(0, 1)}
              </span>
              <span className="character-card-name">{char.name}</span>
              <span className="character-card-role">{ROLE_LABELS[char.role]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};