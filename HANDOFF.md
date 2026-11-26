# Bluey's Heeler House & Keepy Uppy 3D — Complete Handoff Guide (`HANDOFF.md`)

**Phase 1** (Blender 4.3 character rigging, animation baking, asset normalization, procedural SUV generation), **Phase 2** (React 19 + TypeScript + React Three Fiber v9 + Drei + Rapier v2 + Zustand 3D game), and **Phase 3** (Main Menu → Character Select → Group Arrival cutscene, Keepy Uppy computer-AI teammates, and enterable house interior via loading screen) are **100% complete and verified**.

---

## Quick Start in VS Code

```bash
# 1. Start the Vite development server
npm run dev

# 2. Open http://localhost:5173 in your browser!

# 3. Type-check & build for production anytime
npm run build
```

### Re-running the Headless Blender Asset Pipeline (Optional)
If you ever swap raw `.glb` files inside `./raw models/` (symlinked at `./raw_models/`):
```bash
npm run prepare-characters   # blender -b -P scripts/process_characters.py
npm run prepare-assets       # blender -b -P scripts/prepare_assets.py
npm run verify-glbs          # blender -b -P scripts/verify_glbs.py
```

---

## Phase 1 Summary: Verified 3D `.glb` Assets & Exact Clip Names

### 1. Playable & NPC Characters (`public/models/characters/`)
All 8 characters are registered in `public/models/characters/manifest.json` with verified skeletons, textures, height scales, bubble offsets, and exact animation clip lookup maps:

| ID | Character | Role | Height (`heightScale`) | GLB Path | `Idle` | `Walk` | `Run` | `Jump` | `Swat` | `Wave` | `SitDrive` |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `bluey` | **Bluey** | `kid` | `1.10m` (`0.9991`) | `/models/characters/bluey.glb` | `Idle` | `Walk` | `Run` | `Jump` | `Swat` | `Wave` | — |
| `bingo` | **Bingo** | `kid` | `0.94m` (`0.9968`) | `/models/characters/bingo.glb` | `Idle` | `Walk` | `Run` | `Jump` | `Swat` | `Wave` | — |
| `bandit` | **Bandit** | `adult` | `1.68m` (`0.9964`) | `/models/characters/bandit.glb` | `Idle` | `Walk` | `Run` | `Jump` | `Swat` | `Wave` | — |
| `chilli` | **Chilli** | `adult` | `1.60m` (`0.9988`) | `/models/characters/chilli.glb` | `Idle` | `Walk` | `Run` | `Jump` | `Swat` | `Wave` | — |
| `destiny` | **Destiny** | `destiny` | `1.64m` (`1.0282`) | `/models/characters/destiny.glb` | `Idle_3` | `Walking` | `Running` | `Jump_Over_Obstacle_2_inplace` | `swat` | `Wave_One_Hand` | `drive` |
| `alex` | **Alex** | `adult` | `1.72m` (`1.0611`) | `/models/characters/alex.glb` | `Idle_3` | `Walking` | `Running` | `Jump_Over_Obstacle_2_inplace` | `swat` | `Wave_One_Hand` | — |
| `marleigh` | **Marleigh** | `kid` | `1.16m` (`0.6975`) | `/models/characters/marleigh.glb` | `Idle_4` | `Walking` | `Running` | `Jump_Over_Obstacle_2_inplace` | `swat` | `Wave_One_Hand` | — |
| `callie` | **Callie** | `kid` | `0.95m` (`0.5775`) | `/models/characters/callie.glb` | `Idle_9` | `Walking` | `Running` | `Jump_Over_Obstacle_2_inplace` | `swat` | `Wave_One_Hand` | — |

**Key Blender Rigging Notes (`scripts/process_characters.py`):**
- **Meshy Pro characters (`destiny`, `alex`, `marleigh`, `callie`):** Original binary `.glb` skeletons, PBR textures, and animations are preserved 100% untouched; clip names are mapped via `manifest.json`.
- **Bluey family (`bluey`, `bingo`, `bandit`, `chilli`):** Fitted with a unified 20-bone `CartoonRig` (`Root`, `Pelvis`, `Spine`, `Chest`, `Head`, `Ear.L/R`, `Tail`, `UpperArm/LowerArm/Hand.L/R`, `UpperLeg/LowerLeg/Foot.L/R`). Rigid `1.0` `Head` weights protect boxy faces/snouts/eyes from stretching, `Tail` is bound cleanly to `Pelvis`, Bandit & Bingo's closed eyelid shell meshes are removed to reveal open eyes, and horizontal T-pose arms are relaxed into a natural 40° cartoon A-pose prior to keyframe baking.

### 2. Normalized Environment & Props
- **`public/models/environment/heeler_house.glb`** (`20.2m × 25.6m × 8.2m`, `111.5k` manifold triangles):
  - Front lawn sits cleanly at `Y = 0.0`; front walkway steps (`Z = +4.5 -> +2.5`) lead up to the front porch (`Y = 0.72`), through the open front doorway (`Z ≈ 0`), and into walkable interior rooms (`ceiling Y ≈ 4.28`).
- **`public/models/props/balloon.glb`**:
  - Sphere bulb centered at `(0, 0, 0)` with `0.45m` diameter (`0.225m` radius) to match Rapier's `<BallCollider args={[0.23]} />` while the knot and string hang naturally underneath.
- **`public/models/props/destiny_car.glb`**:
  - Procedural Bluey-style family SUV with 4 hub-centered spinning child wheel meshes (`Wheel_FL`, `Wheel_FR`, `Wheel_RL`, `Wheel_RR`), `DriverSeatAnchor`, and `PassengerDropAnchor`.

---

## Phase 2 + 3 Summary: Where to Customize Everything in VS Code

| File | Purpose & What to Customize |
|---|---|
| `public/models/characters/manifest.json` | Edit character `targetHeight`, `bubbleOffsetY`, `accentColor`, cutscene `greetingFromKids`, `arrivalLine`, `npcGreetingTemplate`, or animation clip mappings — including the `SitDrive` seat clips now mapped for `destiny` (`drive`), `alex` (`Chair_Sit_Idle_M`), `marleigh` (`seat`) & `callie` (`seat`). Note: `me.glb` is intentionally **not** in this manifest so Cody is never selectable. |
| `src/store/gameStore.ts` | Top-level state machine `MAIN_MENU → CHARACTER_SELECT → ARRIVAL_CUTSCENE → PLAYING` plus `currentZone`, `zoneTransition`, `aiHelpers`, `balloonPosition/Velocity`, `npcPositions`, `currentChaserId`, `npcSwatRequest` and actions `startGame`, `openCharacterSelect`, `requestZoneChange`/`completeZoneChange`, `requestNpcSwat`, `respawnBalloonPreserveStreak`, `toggleAiHelpers`. Edit `SWAT_CELEBRATION_LINES`, `NPC_SWAT_LINES`, `NPC_CHEER_LINES`, `TRAMPOLINE_LINES`, default `selectedCharacterId`, or `triggerSpeech(...)`. |
| `src/constants/zones.ts` | **New** — `ZONE_BOUNDS` (outdoor lawn / indoor living-room play bounds), `OUTDOOR_PLAYER_SPAWN`, `INDOOR_PLAYER_SPAWN`, `OUTDOOR_MAT_POSITION`, `INDOOR_MAT_POSITION`. |
| `src/components/MainMenu.tsx` | **New** — Bright cartoon title overlay + big START button over the live slow-orbiting 3D house & yard. |
| `src/components/CharacterSelect.tsx` | **New** — Colorful 8-card grid loaded from `manifest.json`; selecting a character starts the arrival cutscene. |
| `src/components/OrbitingCamera.tsx` | **New** — Slow cinematic orbit of the house for `MAIN_MENU` / `CHARACTER_SELECT`. |
| `src/components/LoadingTransition.tsx` | **New** — ~1.2 s bouncing-red-balloon loading overlay while switching between `OUTDOOR_YARD` and `INDOOR_HOUSE`. |
| `src/components/MeEasterEgg.tsx` | **New** — secret, non-selectable **"Cody"** avatar (`/models/characters/me.glb`) that drops from off-screen every ~5 min, falls, waves, shows a "I made this game" bubble, then runs off-camera. Timeline constants live at the top of this file. |
| `src/components/SpeechBubble.tsx` & `src/index.css` | Customize floating 3D comic speech bubble styling (`.cartoon-speech-bubble`), font size, outline thickness, pop-in spring curve, `distanceFactor`, plus menu/select/loading overlay CSS. |
| `src/components/HeelerHouseAndYard.tsx` | Outdoor front yard + Heeler House GLB (trimesh colliders), fenced play bounds, trampoline, lawn, sidewalk/street. Renders only in `OUTDOOR_YARD` zone. |
| `src/components/DropOffCutscene.tsx` | Group arrival cutscene (identical for all 8 characters): Destiny drives `destiny_car.glb` with Alex (front) + Marleigh & Callie (back), beeps at the curb, Bluey/Bingo/Bandit/Chilli wave from porch, arrivals hop out, camera blends behind `activeCharacterId`. Tweak timing, wheel spin, camera, dialogue. |
| `src/components/Player.tsx` | Tune walk/run speeds (`3.5` / `5.6`), jump velocity (`6.1`), coyote time (`165ms`), trampoline bounce (`9.0`), or third-person camera — indoors shortened to `~3.2m` with a Rapier wall-collision raycast. |
| `src/components/KeepyUppyBalloon.tsx` | Zone-aware floor/respawn (`groundY`), syncs pose to store for NPC AI, handles NPC pass-back swats, upward boop speed, proximity swat reach, 3D star bursts. |
| `src/components/NpcFamily.tsx` | Keepy Uppy teammate AI: turn-taking closest-NPC chaser (predictive intercept + pass-back with `Run`/`Swat`) plus cheering spectators (`Wave` + bubbles). Zone-aware indoor/outdoor waypoints. |
| `src/components/HUD.tsx` | Keepy Uppy scoreboard + **Switch Character**, **Enter House / Go Outside**, **AI Helpers: Normal / Super Helpful**, Replay Drop-Off, Sound, Skip Intro buttons. (Backyard buttons removed — backyard disabled for now.) |
| `src/utils/soundEffects.ts` | Tweak procedural Web Audio synthesizer tones for the car horn, speech bubble pop, balloon boop pitch progression, jump, or trampoline sproing. |

---

## Phase 3 Summary (new in this build)

### 1. Main Menu → Character Select → Group Arrival Cutscene
- The zustand store's `mode` now runs `MAIN_MENU → CHARACTER_SELECT → ARRIVAL_CUTSCENE → PLAYING`.
- `MainMenu.tsx` shows a START button over the slow-orbiting house (`OrbitingCamera`); `CharacterSelect.tsx` shows the 8-card grid from `manifest.json`.
- `DropOffCutscene.tsx` plays a **group arrival** for every chosen character: Destiny (driving `SitDrive`) + Alex (front) + Marleigh & Callie (back) pull up the street with spinning wheels, beep at the curb, Bluey/Bingo/Bandit/Chilli wave from the porch, the four arrivals hop onto the lawn, and the camera blends behind the **selected** character — the other 7 immediately become yard NPCs.

### 2. Keepy Uppy Computer AI Teammates
- `NpcFamily.tsx` runs an AI director: when the balloon drops below `Y = 2.8m` and is `> 1.5m` from the human, the single closest NPC in the active zone chases it.
- The chaser predicts the landing `(x, z)` (clamped into `ZONE_BOUNDS`), runs to it, then `Swat`s it back toward the player / play-area center within `< 1.25m` (wider in Super Helpful), incrementing the streak and popping a `SpeechBubble`.
- Other NPCs spread out, face the balloon, and occasionally `Wave` + cheer (`"Woohoo!"`, `"Keep it up!"`).
- HUD toggle **AI Helpers: Normal / Super Helpful** raises NPC run speed and swat reach for younger kids.

### 3. Entering Bluey's House Interior
- `currentZone: 'OUTDOOR_YARD' | 'INDOOR_HOUSE'` lives in the store; glowing front-door welcome/exit sensor mats plus an `Enter House` / `Go Outside` HUD button trigger a zone switch.
- `LoadingTransition.tsx` shows a ~1.2 s cartoon loading screen, then `completeZoneChange` teleports the player, moves the 7 NPCs into the active zone's bounds, respawns the balloon in front of the player (streak preserved), swaps outdoor sunlight ↔ warm indoor `PointLight`s, and shortens the camera spring-arm indoors (`~3.2m` with Rapier wall raycast) so it never clips walls.
- **Backyard disabled** — the `BACKYARD` zone, `HeelerHouseBackyard.tsx`, and all backyard-related HUD buttons / constants have been removed. Only `OUTDOOR_YARD` ↔ `INDOOR_HOUSE` transitions work.

### 4. Updated Character Models — Sitting + "Cody" Secret Character
- The car passengers now **actually sit**: `manifest.json` maps `SitDrive` → `destiny` (`drive`), `alex` (`Chair_Sit_Idle_M`), `marleigh` (`seat`) & `callie` (`seat`), and `DropOffCutscene.tsx` plays `SitDrive` for all four occupants.
- Two model-side changes were reconciled in the manifest: `alex`'s idle was renamed (`Idle_3 → Idle_11`), and `marleigh`'s old `Wave_One_Hand` clip is gone (mapped `Wave → Idle_4` as a fallback so she idles instead of crashing — re-export a wave clip if Marleigh should wave again).
- **Cody / "me"** (`/models/characters/me.glb`) is a non-selectable easter egg handled entirely in `MeEasterEgg.tsx` (not in `manifest.json`): every ~5 minutes of playtime he falls from off-screen, gets up and waves, pops the bubble *"Hey everybody, it's Cody! I made this game. Hope you like it!"*, then runs off-camera. Tune `CYCLE_MS`, `FALL_DURATION`, `WAVE_DURATION`, `RUN_DURATION`/`RUN_SPEED`, or `CODY_LINE` at the top of that file.
