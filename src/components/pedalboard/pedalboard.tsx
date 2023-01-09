import React, { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  Stats,
  OrbitControls,
  Stage,
  Grid,
  Environment,
  Box,
  Backdrop,
  QuadraticBezierLine,
  Sky,
  Stars,
  ContactShadows,
  MeshReflectorMaterial,
} from "@react-three/drei";
import OverdriveBossMT2 from "./pedals/overdrive_boss_mt2";
import AmpMesaDual from "./amps/amp_mesa_dual";
import PhaserMXR90 from "./pedals/phaser_mxr_90";
import GenericFXPedal from "./pedals/generic_pedal";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { MeshStandardMaterial, Vector3 } from "three";
import { CuboidCollider, Debug, Physics, RigidBody } from "@react-three/rapier";

const PedalboardControl = () => {
  return (
    <Canvas
      gl={{ logarithmicDepthBuffer: true }}
      shadows
      camera={{ position: [0, 0, 35], fov: 25 }}
    >
      <fog attach="fog" args={["black", 15, 50]} />
      <Stars
        radius={100}
        depth={50}
        count={5000}
        factor={4}
        saturation={0}
        fade
        speed={1}
      />
      <Stage
        intensity={0.1}
        environment="studio"
        shadows={{ type: "accumulative", bias: -0.001 }}
        adjustCamera={false}
      >
        <Suspense>
          <Physics colliders="hull">
            <RigidBody>
              <GenericFXPedal position={[-10, 5, 0]} />
            </RigidBody>

            <RigidBody>
              <PhaserMXR90 position={[-5, 5, 0]} />
            </RigidBody>

            <RigidBody restitution={0.1}>
            <OverdriveBossMT2 position={[0, 5, 0]} />
            </RigidBody>

            <RigidBody restitution={0.2} colliders="trimesh">
              <AmpMesaDual position={[10, 5, 0]} />
            </RigidBody>

            {/* Floor */}
            <CuboidCollider position={[0, -5, 0]} args={[40, 1, 20]} />
            {/*<Debug/> */}
            
            <ContactShadows
              scale={20}
              blur={0.6}
              opacity={0.2}
              position={[0, -4, 0]}
            />
          </Physics>
        </Suspense>
      </Stage>

      {/* <Grid
        renderOrder={-1}
        position={[0, -1.85, 0]}
        infiniteGrid
        cellSize={0.6}
        cellThickness={0.6}
        sectionSize={3.3}
        sectionThickness={1.5}
        fadeDistance={30}
  /> */}
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
