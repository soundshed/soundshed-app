import React, { Suspense } from "react";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

const GenericFXPedal = ({ position }) => {
  const model = useLoader(
    GLTFLoader,
    "./images/models/pedal.glb"
  );

  return (
    <Suspense fallback={null}>
      <primitive
        position={position}
        object={model.scene} rotation={[1.57,3.14159,0]}
        scale={[0.3, 0.3, 0.3]}
      />
    </Suspense>
  );
};

export default GenericFXPedal;
