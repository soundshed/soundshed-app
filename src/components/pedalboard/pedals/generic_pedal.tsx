import React, { Suspense } from "react";
import { useGLTF } from "@react-three/drei";

const GenericFXPedal = ({ position }) => {
  const model = useGLTF(
    "./images/models/test_pedal.glb"
  );

  return (
    <Suspense fallback={null}>
      <primitive
        position={position}
        object={model.scene} rotation={[1.6,0,0]}
        scale={[2, 2, 2]}
      />
    </Suspense>
  );
};

export default GenericFXPedal;
