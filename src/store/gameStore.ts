import { create } from 'zustand';
import manifestJson from '../../public/models/characters/manifest.json';
import type {
  AiLevel,
  CharacterManifestFile,
  CharacterManifestItem,
  GamePhase,
  NpcSwatRequest,
  SpeechEntry,
  ZoneName,
  ZoneTransition,
} from '../types/game';
import { playBubblePop, setSoundMuted } from '../utils/soundEffects';
import {
  BACKYARD_PLAYER_SPAWN,
  INDOOR_BACKYARD_SPAWN,
  INDOOR_PLAYER_SPAWN,
  OUTDOOR_PLAYER_SPAWN,
} from '../constants/zones';

const initialCharacters = (manifestJson as CharacterManifestFile).characters;

export const SWAT_CELEBRATION_LINES = [
  'Yay, yippee!',
  'Keep it up!',
  'Woohoo!',
  'Got it!',
  'Boop!',
  "Don't let it drop!",
];

export const NPC_SWAT_LINES = [
  'Got it!',
  'My turn!',
  'Yay, yippee!',
  'Woohoo!',
];

export const NPC_CHEER_LINES = ['Woohoo!', 'Keep it up!', 'Nice one!', 'Yay, yippee!'];

export const TRAMPOLINE_LINES = [
  'Bouncy!',
  'Wheee!',
  'So high!',
  'Boing boing!',
];

interface GameState {
  characters: CharacterManifestItem[];
  selectedCharacterId: string;
  mode: GamePhase;
  cutsceneRunId: number;
  currentZone: ZoneName;
  keepyUppyEnabled: boolean;
  zoneTransition: ZoneTransition | null;
  nearDoor: ZoneName | null;
  aiHelpers: AiLevel;
  playerSpawnPosition: [number, number, number];
  playerPosition: [number, number, number];
  npcPositions: Record<string, [number, number, number]>;
  balloonPosition: [number, number, number];
  balloonVelocity: [number, number, number];
  currentChaserId: string | null;
  npcSwatRequest: NpcSwatRequest | null;
  speechBubbles: Record<string, SpeechEntry>;
  keepyStreak: number;
  bestStreak: number;
  lastHitterName: string;
  balloonRespawnNonce: number;
  swatTriggerNonce: number;
  soundMuted: boolean;

  startGame: () => void;
  openCharacterSelect: () => void;
  selectCharacter: (characterId: string, withCutscene?: boolean) => void;
  replayCutscene: () => void;
  finishCutscene: (handoffPosition?: [number, number, number]) => void;
  skipCutscene: () => void;
  setPlayerPosition: (pos: [number, number, number]) => void;
  setNpcPosition: (characterId: string, pos: [number, number, number]) => void;
  setBalloonPose: (pos: [number, number, number], vel: [number, number, number]) => void;
  setCurrentChaser: (characterId: string | null) => void;
  setNearDoor: (zone: ZoneName | null) => void;
  setCurrentZone: (zone: ZoneName) => void;
  requestNpcSwat: (req: Omit<NpcSwatRequest, 'nonce'>) => void;
  clearNpcSwat: () => void;
  requestZoneChange: (
    target: ZoneName,
    spawnPosition?: [number, number, number]
  ) => void;
  interact: () => void;
  completeZoneChange: (target: ZoneName) => void;
  toggleAiHelpers: () => void;
  triggerSpeech: (
    characterId: string,
    text: string,
    durationMs?: number,
    silent?: boolean
  ) => void;
  pruneExpiredSpeech: () => void;
  registerBalloonHit: (characterId: string, characterName: string, phrase?: string) => number;
  resetBalloonStreak: (notifyCharacterId?: string) => void;
  summonBalloonNearPlayer: () => void;
  respawnBalloonPreserveStreak: () => void;
  triggerPlayerSwat: () => void;
  toggleMute: () => void;
  toggleKeepyUppy: () => void;
}

let speechCounter = 1;
let npcSwatCounter = 1;

const ZONE_MESSAGES: Record<ZoneName, string> = {
  INDOOR_HOUSE: "Going inside Bluey's house...",
  OUTDOOR_YARD: 'Heading out to the yard...',
  BACKYARD: 'Heading to the backyard...',
};

export const useGameStore = create<GameState>((set, get) => ({
  characters: initialCharacters,
  selectedCharacterId: 'bluey',
  mode: 'MAIN_MENU',
  cutsceneRunId: 1,
  currentZone: 'OUTDOOR_YARD',
  keepyUppyEnabled: true,
  zoneTransition: null,
  nearDoor: null,
  aiHelpers: 'NORMAL',
  playerSpawnPosition: [0, 0.15, 8.2],
  playerPosition: [0, 0, 8.2],
  npcPositions: {},
  balloonPosition: [0.6, 2.6, 6.6],
  balloonVelocity: [0, 0, 0],
  currentChaserId: null,
  npcSwatRequest: null,
  speechBubbles: {},
  keepyStreak: 0,
  bestStreak: 0,
  lastHitterName: '',
  balloonRespawnNonce: 1,
  swatTriggerNonce: 0,
  soundMuted: false,

  startGame: () => {
    set({ mode: 'CHARACTER_SELECT' });
  },

  openCharacterSelect: () => {
    set({ mode: 'CHARACTER_SELECT', speechBubbles: {} });
  },

  selectCharacter: (characterId, withCutscene = true) => {
    set((state) => ({
      selectedCharacterId: characterId,
      mode: withCutscene ? 'ARRIVAL_CUTSCENE' : 'PLAYING',
      cutsceneRunId: withCutscene ? state.cutsceneRunId + 1 : state.cutsceneRunId,
      speechBubbles: {},
      currentChaserId: null,
      npcSwatRequest: null,
      currentZone: 'OUTDOOR_YARD',
      playerSpawnPosition: OUTDOOR_PLAYER_SPAWN,
    }));
  },

  replayCutscene: () => {
    set((state) => ({
      mode: 'ARRIVAL_CUTSCENE',
      cutsceneRunId: state.cutsceneRunId + 1,
      speechBubbles: {},
      currentChaserId: null,
      npcSwatRequest: null,
      currentZone: 'OUTDOOR_YARD',
    }));
  },

  finishCutscene: (handoffPosition = OUTDOOR_PLAYER_SPAWN) => {
    set({
      mode: 'PLAYING',
      currentZone: 'OUTDOOR_YARD',
      playerSpawnPosition: handoffPosition,
      playerPosition: handoffPosition,
    });
  },

  skipCutscene: () => {
    const state = get();
    const active = state.characters.find((c) => c.id === state.selectedCharacterId);
    set({
      mode: 'PLAYING',
      currentZone: 'OUTDOOR_YARD',
      playerSpawnPosition: OUTDOOR_PLAYER_SPAWN,
      playerPosition: OUTDOOR_PLAYER_SPAWN,
      speechBubbles: {},
    });
    if (active) {
      get().triggerSpeech(active.id, active.arrivalLine, 2800);
    }
  },

  setPlayerPosition: (pos) => {
    set({ playerPosition: pos });
  },

  setNpcPosition: (characterId, pos) => {
    set((state) => ({
      npcPositions: { ...state.npcPositions, [characterId]: pos },
    }));
  },

  setBalloonPose: (pos, vel) => {
    set({ balloonPosition: pos, balloonVelocity: vel });
  },

  setCurrentChaser: (characterId) => {
    if (get().currentChaserId !== characterId) {
      set({ currentChaserId: characterId });
    }
  },

  setNearDoor: (zone) => {
    if (get().nearDoor !== zone) {
      set({ nearDoor: zone });
    }
  },

  setCurrentZone: (zone) => {
    if (get().currentZone !== zone) {
      set({ currentZone: zone, nearDoor: null });
    }
  },

  requestNpcSwat: (req) => {
    npcSwatCounter += 1;
    set({ npcSwatRequest: { ...req, nonce: npcSwatCounter } });
  },

  clearNpcSwat: () => {
    set({ npcSwatRequest: null });
  },

  requestZoneChange: (target, spawnPosition) => {
    const state = get();
    if (state.zoneTransition?.active || state.currentZone === target) return;
    set({
      zoneTransition: {
        active: true,
        message: ZONE_MESSAGES[target],
        target,
        spawnPosition,
      },
    });
  },

  interact: () => {
    const state = get();
    if (state.nearDoor) {
      state.requestZoneChange(
        state.nearDoor,
        state.currentZone === 'BACKYARD' && state.nearDoor === 'INDOOR_HOUSE'
          ? INDOOR_BACKYARD_SPAWN
          : undefined
      );
      return;
    }
    state.triggerPlayerSwat();
  },

  completeZoneChange: (target) => {
    const state = get();
    const defaultSpawn: Record<ZoneName, [number, number, number]> = {
      INDOOR_HOUSE: INDOOR_PLAYER_SPAWN,
      OUTDOOR_YARD: OUTDOOR_PLAYER_SPAWN,
      BACKYARD: BACKYARD_PLAYER_SPAWN,
    };
    const spawn =
      state.zoneTransition?.target === target
        ? state.zoneTransition.spawnPosition ?? defaultSpawn[target]
        : defaultSpawn[target];
    set({
      currentZone: target,
      zoneTransition: null,
      playerSpawnPosition: spawn,
      playerPosition: spawn,
      nearDoor: null,
      currentChaserId: null,
      npcSwatRequest: null,
    });
    get().respawnBalloonPreserveStreak();
  },

  toggleAiHelpers: () => {
    set((state) => ({
      aiHelpers: state.aiHelpers === 'NORMAL' ? 'SUPER' : 'NORMAL',
    }));
  },

  triggerSpeech: (characterId, text, durationMs = 2800, silent = false) => {
    const now = performance.now();
    speechCounter += 1;
    if (!silent) {
      playBubblePop();
    }
    set((state) => ({
      speechBubbles: {
        ...state.speechBubbles,
        [characterId]: {
          characterId,
          text,
          createdAt: now,
          expiresAt: now + durationMs,
          nonce: speechCounter,
        },
      },
    }));
  },

  pruneExpiredSpeech: () => {
    const now = performance.now();
    const current = get().speechBubbles;
    let changed = false;
    const next: Record<string, SpeechEntry> = {};
    for (const [id, entry] of Object.entries(current)) {
      if (entry.expiresAt > now) {
        next[id] = entry;
      } else {
        changed = true;
      }
    }
    if (changed) {
      set({ speechBubbles: next });
    }
  },

  registerBalloonHit: (characterId, characterName, phrase) => {
    const nextStreak = get().keepyStreak + 1;
    const nextBest = Math.max(get().bestStreak, nextStreak);
    set({
      keepyStreak: nextStreak,
      bestStreak: nextBest,
      lastHitterName: characterName,
    });
    const bubble =
      phrase ??
      SWAT_CELEBRATION_LINES[Math.floor(Math.random() * SWAT_CELEBRATION_LINES.length)];
    get().triggerSpeech(characterId, bubble, 2400, true);
    return nextStreak;
  },

  resetBalloonStreak: (notifyCharacterId) => {
    const hadStreak = get().keepyStreak > 0;
    set({ keepyStreak: 0 });
    if (hadStreak && notifyCharacterId) {
      get().triggerSpeech(notifyCharacterId, 'Uh oh! Try again!', 2600, true);
    }
  },

  summonBalloonNearPlayer: () => {
    set((state) => ({
      balloonRespawnNonce: state.balloonRespawnNonce + 1,
      keepyStreak: 0,
    }));
  },

  respawnBalloonPreserveStreak: () => {
    set((state) => ({
      balloonRespawnNonce: state.balloonRespawnNonce + 1,
    }));
  },

  triggerPlayerSwat: () => {
    if (get().keepyUppyEnabled) {
      set((state) => ({ swatTriggerNonce: state.swatTriggerNonce + 1 }));
    }
  },

  toggleKeepyUppy: () => {
    set((state) => ({
      keepyUppyEnabled: !state.keepyUppyEnabled,
      ...(state.keepyUppyEnabled
        ? {
            keepyStreak: 0,
            currentChaserId: null,
            npcSwatRequest: null,
          }
        : { balloonRespawnNonce: state.balloonRespawnNonce + 1 }),
    }));
  },

  toggleMute: () => {
    const next = !get().soundMuted;
    setSoundMuted(next);
    set({ soundMuted: next });
  },
}));
