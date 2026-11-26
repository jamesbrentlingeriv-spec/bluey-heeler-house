import React, { useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';

const ARRIVAL_TRACKS: Record<string, string> = {
  destiny: '/audio/Bluey%20Destiny.mp3',
  marleigh: '/audio/Bluey%20Marleigh.mp3',
  alex: '/audio/Bluey%20Alex.mp3',
  callie: '/audio/Bluey%20Callie.mp3',
};

const INTRO_TRACK = '/audio/Bluey%20Intro.mp3';
const BACKGROUND_TRACK = '/audio/bluey.mp3';
const BACKGROUND_VOLUME = 0.6;
const DUCKED_BACKGROUND_VOLUME = 0.15;
const VOLUME_FADE_MS = 450;

export const GameAudio: React.FC = () => {
  const mode = useGameStore((state) => state.mode);
  const selectedCharacterId = useGameStore((state) => state.selectedCharacterId);
  const cutsceneRunId = useGameStore((state) => state.cutsceneRunId);
  const soundMuted = useGameStore((state) => state.soundMuted);
  const backgroundAudioRef = useRef<HTMLAudioElement | null>(null);
  const foregroundAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingPlaybackRef = useRef(new Set<HTMLAudioElement>());
  const fadeFrameRef = useRef<number | null>(null);

  const handlePlayError = (audio: HTMLAudioElement, error: unknown) => {
    if (error instanceof DOMException) {
      if (error.name === 'AbortError') return;
      if (error.name === 'NotAllowedError') {
        pendingPlaybackRef.current.add(audio);
        return;
      }
    }

    console.error('Unable to play game audio.', error);
  };

  const startPlayback = (audio: HTMLAudioElement) => {
    pendingPlaybackRef.current.delete(audio);
    void audio.play().catch((error: unknown) => handlePlayError(audio, error));
  };

  useEffect(() => {
    const backgroundAudio = new Audio(BACKGROUND_TRACK);
    backgroundAudio.preload = 'auto';
    backgroundAudio.loop = true;
    backgroundAudio.volume = BACKGROUND_VOLUME;

    const foregroundAudio = new Audio();
    foregroundAudio.preload = 'auto';
    foregroundAudio.volume = 0.6;

    backgroundAudioRef.current = backgroundAudio;
    foregroundAudioRef.current = foregroundAudio;

    const fadeBackgroundTo = (targetVolume: number) => {
      if (fadeFrameRef.current !== null) {
        window.cancelAnimationFrame(fadeFrameRef.current);
      }

      const startVolume = backgroundAudio.volume;
      const startedAt = performance.now();
      const animate = (now: number) => {
        const progress = Math.min((now - startedAt) / VOLUME_FADE_MS, 1);
        const easedProgress = progress * progress * (3 - 2 * progress);
        backgroundAudio.volume =
          startVolume + (targetVolume - startVolume) * easedProgress;

        if (progress < 1) {
          fadeFrameRef.current = window.requestAnimationFrame(animate);
        } else {
          fadeFrameRef.current = null;
        }
      };

      fadeFrameRef.current = window.requestAnimationFrame(animate);
    };

    const duckBackground = () => fadeBackgroundTo(DUCKED_BACKGROUND_VOLUME);
    const restoreBackground = () => fadeBackgroundTo(BACKGROUND_VOLUME);
    const retryBlockedPlayback = () => {
      for (const audio of [...pendingPlaybackRef.current]) {
        startPlayback(audio);
      }
    };

    foregroundAudio.addEventListener('play', duckBackground);
    foregroundAudio.addEventListener('ended', restoreBackground);
    foregroundAudio.addEventListener('pause', restoreBackground);
    window.addEventListener('pointerdown', retryBlockedPlayback, true);
    window.addEventListener('keydown', retryBlockedPlayback, true);
    startPlayback(backgroundAudio);

    return () => {
      foregroundAudio.removeEventListener('play', duckBackground);
      foregroundAudio.removeEventListener('ended', restoreBackground);
      foregroundAudio.removeEventListener('pause', restoreBackground);
      window.removeEventListener('pointerdown', retryBlockedPlayback, true);
      window.removeEventListener('keydown', retryBlockedPlayback, true);
      if (fadeFrameRef.current !== null) {
        window.cancelAnimationFrame(fadeFrameRef.current);
        fadeFrameRef.current = null;
      }
      backgroundAudio.pause();
      foregroundAudio.pause();
      pendingPlaybackRef.current.clear();
      backgroundAudioRef.current = null;
      foregroundAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = foregroundAudioRef.current;
    if (!audio) return;

    const track =
      mode === 'MAIN_MENU'
        ? INTRO_TRACK
        : mode === 'ARRIVAL_CUTSCENE'
          ? ARRIVAL_TRACKS[selectedCharacterId]
          : undefined;

    pendingPlaybackRef.current.delete(audio);
    audio.pause();
    if (!track) return;

    audio.src = track;
    audio.load();
    audio.currentTime = 0;
    startPlayback(audio);
  }, [mode, selectedCharacterId, cutsceneRunId]);

  useEffect(() => {
    if (backgroundAudioRef.current) {
      backgroundAudioRef.current.muted = soundMuted;
    }
    if (foregroundAudioRef.current) {
      foregroundAudioRef.current.muted = soundMuted;
    }
  }, [soundMuted]);

  return null;
};
