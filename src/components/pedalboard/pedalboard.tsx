import React, { Suspense } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { Stats, OrbitControls } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import OverdriveBossMT2 from "./pedals/overdrive_boss_mt2";
import AmpMesaDual from "./amps/amp_mesa_dual";
import PhaserMXR90 from "./pedals/phaser_mxr_90";
import GenericFXPedal from "./pedals/generic_pedal";

const PedalboardControl = () => {
  const gltf = useLoader(
    GLTFLoader,
    "./images/models/boss_metal_zone_mt2_-_guitar_pedal.glb"
  );

  return (
    <Canvas camera={{ position: [0, 0, 10] }}>
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
