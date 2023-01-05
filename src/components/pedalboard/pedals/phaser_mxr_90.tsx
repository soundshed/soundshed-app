import React, { Suspense } from "react";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

const PhaserMXR90 = ({ position }) => {
  const model = useLoader(
    GLTFLoader,
    "./images/models/guitar_pedal_phase90.glb"
  );

  return (
    <Suspense fallback={null}>
      <primitive
        position={position}
        object={model.scene} rotation={[1.57,0,0]}
        scale={[0.7, 0.7, 0.7]}
      />
    </Suspense>
  );
};

export default PhaserMXR90;
