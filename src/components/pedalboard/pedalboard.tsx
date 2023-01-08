import React, { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Stats, OrbitControls } from "@react-three/drei";
import OverdriveBossMT2 from "./pedals/overdrive_boss_mt2";
import AmpMesaDual from "./amps/amp_mesa_dual";
import PhaserMXR90 from "./pedals/phaser_mxr_90";
import GenericFXPedal from "./pedals/generic_pedal";

const PedalboardControl = () => {

  return (
    <Canvas camera={{ position: [0, 0, 18] }}>
      <ambientLight />
      <pointLight position={[10, 10, 10]} />
      <OverdriveBossMT2 position={[0, 0, 0]} />
     
      <AmpMesaDual position={[0, 5, 0]} />
      <PhaserMXR90 position={[-5, 0, 0]} />
      <GenericFXPedal position={[-10, 0, 0]} />

      <OrbitControls />
      <Stats />
    </Canvas>
  );
};

export default PedalboardControl;
