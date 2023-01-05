import React, { Suspense } from "react";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

const OverdriveBossMT2 = ({ position }) => {
  const model = useLoader(
    GLTFLoader,
    "./images/models/boss_metal_zone_mt2_-_guitar_pedal.glb"
  );

  return (
    <Suspense fallback={null}>
      <primitive
        position={position}
        object={model.scene} rotation={[0.5,0,0]}
        scale={[10, 10, 10]}
      />
    </Suspense>
  );
};

export default OverdriveBossMT2;
