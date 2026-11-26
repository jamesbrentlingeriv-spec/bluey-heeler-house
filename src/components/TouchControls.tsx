import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { useGameStore } from '../store/gameStore';
import { mobileInput, resetMobileInput } from '../utils/mobileInput';

export const TouchControls = () => {
  const mode = useGameStore((state) => state.mode);
  const nearDoor = useGameStore((state) => state.nearDoor);
  const interact = useGameStore((state) => state.interact);
  const activePointerId = useRef<number | null>(null);
  const [knobPosition, setKnobPosition] = useState({ x: 0, y: 0 });

  const resetJoystick = () => {
    activePointerId.current = null;
    mobileInput.moveX = 0;
    mobileInput.moveForward = 0;
    setKnobPosition({ x: 0, y: 0 });
  };

  useEffect(() => {
    if (mode !== 'PLAYING') {
      activePointerId.current = null;
      setKnobPosition({ x: 0, y: 0 });
      resetMobileInput();
    }
    window.addEventListener('blur', resetMobileInput);
    return () => {
      window.removeEventListener('blur', resetMobileInput);
      resetMobileInput();
    };
  }, [mode]);

  const updateJoystick = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointerId.current !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const maxOffset = Math.min(bounds.width, bounds.height) * 0.27;
    let x = (event.clientX - (bounds.left + bounds.width / 2)) / maxOffset;
    let y = (event.clientY - (bounds.top + bounds.height / 2)) / maxOffset;
    const magnitude = Math.hypot(x, y);

    if (magnitude > 1) {
      x /= magnitude;
      y /= magnitude;
    }

    mobileInput.moveX = x;
    mobileInput.moveForward = -y;
    setKnobPosition({ x: x * maxOffset, y: y * maxOffset });
  };

  const handleJoystickDown = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointerId.current !== null) return;
    event.preventDefault();
    activePointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateJoystick(event);
  };

  const handleJoystickUp = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointerId.current !== event.pointerId) return;
    resetJoystick();
  };

  const queueJump = () => {
    mobileInput.jumpQueuedAt = performance.now();
  };

  const handleJumpKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    queueJump();
  };

  if (mode !== 'PLAYING') return null;

  return (
    <div className="mobile-touch-controls" role="group" aria-label="Touch controls">
      <div
        className="mobile-joystick"
        role="application"
        aria-label="Movement joystick"
        onPointerDown={handleJoystickDown}
        onPointerMove={updateJoystick}
        onPointerUp={handleJoystickUp}
        onPointerCancel={handleJoystickUp}
        onLostPointerCapture={resetJoystick}
      >
        <span className="mobile-joystick-ring" />
        <span
          className="mobile-joystick-knob"
          style={{
            left: `calc(50% + ${knobPosition.x}px)`,
            top: `calc(50% + ${knobPosition.y}px)`,
          }}
        />
      </div>

      <div className="mobile-action-buttons" role="group" aria-label="Character actions">
        <button
          type="button"
          className="mobile-action-button mobile-interact-button"
          aria-label={nearDoor ? 'Use nearby doorway' : 'Swat the balloon'}
          onClick={interact}
        >
          <span aria-hidden="true">{nearDoor ? '🚪' : '🐾'}</span>
          <span>{nearDoor ? 'Use' : 'Swat'}</span>
        </button>
        <button
          type="button"
          className="mobile-action-button mobile-jump-button"
          aria-label="Jump"
          onPointerDown={(event) => {
            event.preventDefault();
            queueJump();
          }}
          onKeyDown={handleJumpKeyDown}
        >
          <span aria-hidden="true">⬆</span>
          <span>Jump</span>
        </button>
      </div>
    </div>
  );
};
