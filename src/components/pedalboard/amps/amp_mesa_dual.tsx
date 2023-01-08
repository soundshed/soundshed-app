import React, { Suspense } from "react";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

const AmpMesaDual = ({ position }) => {
  const model = useLoader(
    GLTFLoader,
    "./images/models/mesa_boogie_dual_rectifier.glb"
  );

  return (
    <Suspense fallback={null}>
      <primitive 
        position={position}
        object={model.scene}
        scale={[0.2, 0.2, 0.2]}
      />
    </Suspense>
  );
};

export default AmpMesaDual;
