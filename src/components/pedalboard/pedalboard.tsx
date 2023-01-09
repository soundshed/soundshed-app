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
  Lightformer,
  Effects,
  AccumulativeShadows,
  RandomizedLight,
} from "@react-three/drei";
import OverdriveBossMT2 from "./pedals/overdrive_boss_mt2";
import AmpMesaDual from "./amps/amp_mesa_dual";
import PhaserMXR90 from "./pedals/phaser_mxr_90";
import GenericFXPedal from "./pedals/generic_pedal";
import {
  Bloom,
  DepthOfField,
  EffectComposer,
  Noise,
  Vignette,
} from "@react-three/postprocessing";
import { MeshStandardMaterial, Vector3 } from "three";
import { CuboidCollider, Debug, Physics, RigidBody } from "@react-three/rapier";

const PedalboardControl = () => {
  return (
    <Canvas
      gl={{ logarithmicDepthBuffer: true }}
      shadows
      camera={{ position: [0, 0, 35], fov: 25 }}
    >
      <color attach="background" args={["#15151a"]} />
      {/*<color attach="background" args={["#f0f0f0"]} />*/}
      <ambientLight intensity={0.3} />
      <pointLight position={[0, 5, 25]} intensity={1.5} />
      <Environment resolution={32}>
        <Lightformer position={[10, 10, 10]} scale={10} intensity={4} />
        <Lightformer
          position={[10, 0, -10]}
          scale={10}
          color="red"
          intensity={6}
        />
        <Lightformer position={[-10, -10, -10]} scale={10} intensity={4} />
      </Environment>

      <Stars
        radius={100}
        depth={50}
        count={5000}
        factor={4}
        saturation={0}
        fade
        speed={1}
      />

      <Physics colliders="hull" gravity={[0, -4, 0]}>
        <RigidBody>
          <GenericFXPedal position={[-10, 5, 0]} />
        </RigidBody>

        <RigidBody>
          <PhaserMXR90 position={[-5, 5, 0]} />
        </RigidBody>

        <RigidBody restitution={0.1}>
          <OverdriveBossMT2 position={[0, 3, 0]} />
        </RigidBody>

        <RigidBody restitution={0.2} colliders="trimesh">
          <AmpMesaDual position={[10, 5, 0]} />
        </RigidBody>

        {/* Floor */}
        <CuboidCollider
          position={[0, -5, 0]}
          args={[40, 1, 20]}
          restitution={0.1}
        />
        {/*<Debug/> */}

        <ContactShadows
          scale={20}
          blur={0.6}
          opacity={0.2}
          position={[0, -4, 0]}
        />
      </Physics>

      <AccumulativeShadows
        temporal
        frames={Infinity}
        alphaTest={1}
        blend={200}
        limit={1500}
        scale={25}
        position={[0, -0.05, 0]}
      >
        <RandomizedLight
          amount={1}
          mapSize={512}
          radius={5}
          ambient={0.5}
          position={[-10, 10, 15]}
          size={10}
          bias={0.001}
        />
      </AccumulativeShadows>

      <OrbitControls
        autoRotate
        autoRotateSpeed={0.05}
        enableZoom={true}
        makeDefault
        minPolarAngle={Math.PI / 2}
        maxPolarAngle={Math.PI / 2}
      />

      <EffectComposer>
        <Noise opacity={0.02} />
        <Vignette eskil={false} offset={0.1} darkness={1.1} />
      </EffectComposer>
    </Canvas>
  );
};

export default PedalboardControl;
