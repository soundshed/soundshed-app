import React, { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import {
  Stats,
  OrbitControls,
  Stage,
  Grid,
  Environment,
  Box,
} from "@react-three/drei";
import OverdriveBossMT2 from "./pedals/overdrive_boss_mt2";
import AmpMesaDual from "./amps/amp_mesa_dual";
import PhaserMXR90 from "./pedals/phaser_mxr_90";
import GenericFXPedal from "./pedals/generic_pedal";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { MeshStandardMaterial } from "three";

const PedalboardControl = () => {
  return (
    <Canvas
      gl={{ logarithmicDepthBuffer: true }}
      shadows
      camera={{ position: [0, 0, 25], fov: 25 }}
    >
      <fog attach="fog" args={["black", 15, 50]} />
      <Stage
        intensity={0.3}
        environment="city"
        shadows={{ type: "accumulative", bias: -0.001 }}
        adjustCamera={false}
      >
        <group scale={[0.5, 0.5, 0.5]} >
          <GenericFXPedal position={[-10, -2, 0]} />
          <PhaserMXR90 position={[-5, 0, 0]} />
          <OverdriveBossMT2 position={[0, 0, 0]} />
          <AmpMesaDual  position={[10, -3, 0]} />
          
          <Box material-color="darkred" receiveShadow={true} position={[0, -4, 0]} scale={[40,1,10]} />
        </group>
      </Stage>
      <Grid
        renderOrder={-1}
        position={[0, -1.85, 0]}
        infiniteGrid
        cellSize={0.6}
        cellThickness={0.6}
        sectionSize={3.3}
        sectionThickness={1.5}
        fadeDistance={30}
      />
      <OrbitControls
        autoRotate
        autoRotateSpeed={0.05}
        enableZoom={true}
        makeDefault
        minPolarAngle={Math.PI / 2}
        maxPolarAngle={Math.PI / 2}
      />
      <EffectComposer disableNormalPass>
        <Bloom luminanceThreshold={1} mipmapBlur />
      </EffectComposer>
      <Environment background preset="sunset" blur={0.8} />
    </Canvas>
  );
};

export default PedalboardControl;
