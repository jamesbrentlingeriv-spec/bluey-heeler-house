export type StandardActionKey =
  | 'Idle'
  | 'Walk'
  | 'Run'
  | 'Jump'
  | 'Swat'
  | 'Wave'
  | 'SitDrive';

export type CharacterRole = 'kid' | 'adult' | 'destiny';

export interface CharacterManifestItem {
  id: string;
  name: string;
  role: CharacterRole;
  path: string;
  nativeHeight: number;
  targetHeight: number;
  heightScale: number;
  bubbleOffsetY: number;
  accentColor: string;
  greetingFromKids: string;
  arrivalLine: string;
  npcGreetingTemplate: string;
  clips: Partial<Record<StandardActionKey, string>> & {
    Idle: string;
    Walk: string;
    Run: string;
    Jump: string;
    Swat: string;
    Wave: string;
  };
}

export interface CharacterManifestFile {
  version: number;
  characters: CharacterManifestItem[];
}

export interface SpeechEntry {
  characterId: string;
  text: string;
  createdAt: number;
  expiresAt: number;
  nonce: number;
}

/**
 * Top-level game state machine:
 * MAIN_MENU -> CHARACTER_SELECT -> ARRIVAL_CUTSCENE -> PLAYING
 */
export type GamePhase = 'MAIN_MENU' | 'CHARACTER_SELECT' | 'ARRIVAL_CUTSCENE' | 'PLAYING';

export type ZoneName = 'OUTDOOR_YARD' | 'INDOOR_HOUSE' | 'BACKYARD';

export type AiLevel = 'NORMAL' | 'SUPER';

export interface ZoneTransition {
  active: boolean;
  message: string;
  target: ZoneName;
  spawnPosition?: [number, number, number];
}

export interface NpcSwatRequest {
  nonce: number;
  characterId: string;
  characterName: string;
  phrase: string;
  sourceX: number;
  sourceZ: number;
  targetX: number;
  targetZ: number;
}
