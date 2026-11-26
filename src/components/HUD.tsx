import React from 'react';
import { useGameStore } from '../store/gameStore';

/**
 * Kid-Friendly Cartoon HUD:
 * - Top-Left: Live Keepy Uppy Streak + Best Score, "Bring Balloon" & "Swat" buttons.
 * - Top-Right: Skip Intro (cutscene) / Switch Character, Enter House, AI Helpers,
 *   Replay Drop-Off, and Sound toggle.
 * - Bottom: controls hint pill. Hidden during MAIN_MENU / CHARACTER_SELECT.
 */
export const HUD: React.FC = () => {
  const mode = useGameStore((s) => s.mode);
  const keepyStreak = useGameStore((s) => s.keepyStreak);
  const bestStreak = useGameStore((s) => s.bestStreak);
  const soundMuted = useGameStore((s) => s.soundMuted);
  const aiHelpers = useGameStore((s) => s.aiHelpers);
  const keepyUppyEnabled = useGameStore((s) => s.keepyUppyEnabled);
  const nearDoor = useGameStore((s) => s.nearDoor);

  const skipCutscene = useGameStore((s) => s.skipCutscene);
  const replayCutscene = useGameStore((s) => s.replayCutscene);
  const summonBalloonNearPlayer = useGameStore((s) => s.summonBalloonNearPlayer);
  const triggerPlayerSwat = useGameStore((s) => s.triggerPlayerSwat);
  const toggleMute = useGameStore((s) => s.toggleMute);
  const openCharacterSelect = useGameStore((s) => s.openCharacterSelect);
  const toggleAiHelpers = useGameStore((s) => s.toggleAiHelpers);
  const toggleKeepyUppy = useGameStore((s) => s.toggleKeepyUppy);
  const interact = useGameStore((s) => s.interact);
  if (mode !== 'PLAYING' && mode !== 'ARRIVAL_CUTSCENE') return null;

  return (
    <div className="hud-overlay">
      {/* Top Bar */}
      <div className="hud-top-row">
        {/* Keepy Uppy Scoreboard */}
        {keepyUppyEnabled && (
          <div className="hud-card scoreboard-card">
            <div className="scoreboard-header">
              <span className="balloon-icon" aria-hidden="true">🎈</span>
              <div>
                <div className="scoreboard-title">Keepy Uppy!</div>
                <div className="scoreboard-subtitle">Don&apos;t let it touch the ground!</div>
              </div>
            </div>

            <div className="scoreboard-stats">
              <div className="stat-box streak-box">
                <span className="stat-label">STREAK</span>
                <span className="stat-value">{keepyStreak}</span>
              </div>
              <div className="stat-box best-box">
                <span className="stat-label">BEST</span>
                <span className="stat-value">{bestStreak}</span>
              </div>
            </div>

            {mode === 'PLAYING' && (
              <div className="scoreboard-actions">
                <button
                  type="button"
                  className="hud-btn btn-yellow"
                  onClick={summonBalloonNearPlayer}
                  title="Float the red balloon right over to you!"
                >
                  🎈 Bring Balloon
                </button>
                <button
                  type="button"
                  className="hud-btn btn-coral"
                  onClick={triggerPlayerSwat}
                  title="Swat the balloon upward! (F or Click)"
                >
                  🐾 Swat! (F)
                </button>
              </div>
            )}
          </div>
        )}

        {/* Right Controls */}
        <div className="hud-top-right">
          {mode === 'ARRIVAL_CUTSCENE' ? (
            <button type="button" className="hud-btn btn-skip-intro" onClick={skipCutscene}>
              Skip Intro ⏭
            </button>
          ) : (
            <>
              <button
                type="button"
                className="hud-btn btn-yellow"
                onClick={openCharacterSelect}
                title="Swap to a different character"
              >
                🔄 Switch Character
              </button>
              {nearDoor && (
                <button
                  type="button"
                  className="hud-btn btn-sky"
                  onClick={interact}
                  title="Use the nearby doorway"
                >
                  {nearDoor === 'BACKYARD'
                    ? '🌿 Go to Backyard'
                    : nearDoor === 'INDOOR_HOUSE'
                      ? '🏠 Enter House'
                      : '☀️ Go Outside'}
                </button>
              )}
              <button
                type="button"
                className="hud-btn btn-cream"
                onClick={toggleAiHelpers}
                title="Make the AI teammates quicker & reach higher"
              >
                🤖 AI Helpers: {aiHelpers === 'NORMAL' ? 'Normal' : 'Super Helpful'}
              </button>
              <button
                type="button"
                className="hud-btn btn-sky"
                onClick={replayCutscene}
                title="Watch the group arrival again!"
              >
                🚗 Replay Drop-Off
              </button>
            </>
          )}

          {(mode === 'PLAYING' || mode === 'ARRIVAL_CUTSCENE') && (
            <button type="button" className="hud-btn btn-yellow" onClick={toggleKeepyUppy}>
              {keepyUppyEnabled ? '🎈 Keepy Uppy: On' : '🎈 Keepy Uppy: Off'}
            </button>
          )}

          <button type="button" className="hud-btn btn-cream" onClick={toggleMute}>
            {soundMuted ? '🔇 Muted' : '🔊 Sound On'}
          </button>
        </div>
      </div>

      {/* Cutscene Banner */}
      {mode === 'ARRIVAL_CUTSCENE' && (
        <div className="cutscene-banner">
          🚗 Destiny &amp; friends are arriving at Bluey&apos;s House!
        </div>
      )}

      {/* Bottom Dock: Controls Hint */}
      <div className="hud-bottom-dock">
        {mode === 'PLAYING' && (
          <div className="controls-pill">
            <span><strong>WASD / Arrows</strong> Move</span>
            <span className="dot">•</span>
            <span><strong>Shift</strong> Run</span>
            <span className="dot">•</span>
            <span><strong>Space</strong> Jump</span>
            {keepyUppyEnabled && (
              <>
                <span className="dot">•</span>
                <span><strong>E</strong> Interact / <strong>F / Click</strong> Swat</span>
              </>
            )}
            <span className="dot">•</span>
            <span><strong>Drag</strong> Look Around</span>
            <span className="dot">•</span>
            <span><strong>Scroll</strong> Zoom</span>
          </div>
        )}
      </div>
    </div>
  );
};
