import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Loader } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { HeelerHouseAndYard } from './components/HeelerHouseAndYard';
import { HeelerHouseInterior } from './components/HeelerHouseInterior';
import { DropOffCutscene } from './components/DropOffCutscene';
import { Player } from './components/Player';
import { NpcFamily } from './components/NpcFamily';
import { KeepyUppyBalloon } from './components/KeepyUppyBalloon';
import { HUD } from './components/HUD';
import { GameAudio } from './components/GameAudio';
import { OrbitingCamera } from './components/OrbitingCamera';
import { MainMenu } from './components/MainMenu';
import { CharacterSelect } from './components/CharacterSelect';
import { LoadingTransition } from './components/LoadingTransition';
import { MeEasterEgg } from './components/MeEasterEgg';
import { TouchControls } from './components/TouchControls';
import { useGameStore } from './store/gameStore';

export const App: React.FC = () => {
  const keepyUppyEnabled = useGameStore((state) => state.keepyUppyEnabled);

  return (
    <div className="game-viewport">
      <GameAudio />
      <Canvas
        shadows
        dpr={[1, 1.5]}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        camera={{ position: [-5.5, 3.1, 20.0], fov: 50, near: 0.15, far: 250 }}
      >
        <color attach="background" args={['#9fd8ff']} />
        <fog attach="fog" args={['#b8e4ff', 42, 115]} />

        <Suspense fallback={null}>
          <MeEasterEgg />
          <Physics gravity={[0, -16.5, 0]} timeStep="vary">
            <OrbitingCamera />
            <HeelerHouseAndYard />
            <HeelerHouseInterior />
            <DropOffCutscene />
            <Player />
            <NpcFamily />
            {keepyUppyEnabled && <KeepyUppyBalloon />}
          </Physics>
        </Suspense>
      </Canvas>

      <MainMenu />
      <CharacterSelect />
      <LoadingTransition />
      <HUD />
      <TouchControls />

      <Loader
        containerStyles={{
          background: 'linear-gradient(180deg, #88c9f9 0%, #bce6ff 65%, #9be16b 100%)',
        }}
        innerStyles={{
          background: '#ffffff',
          border: '3px solid #1d2b53',
          borderRadius: '999px',
          padding: '6px',
          width: '260px',
        }}
        barStyles={{
          background: '#ff6b6b',
          height: '14px',
          borderRadius: '999px',
        }}
        dataStyles={{
          color: '#1d2b53',
          fontFamily: "'Fredoka', sans-serif",
          fontSize: '18px',
          fontWeight: 700,
        }}
        dataInterpolation={(p) => `Loading Bluey's House... ${p.toFixed(0)}%`}
      />
    </div>
  );
};

export default App;
