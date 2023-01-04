import {Camera} from 'three'

import React, { Suspense } from 'react'
import { Canvas, useLoader } from '@react-three/fiber'

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
const PedalboardControl = () => {

  
    const gltf = useLoader(GLTFLoader, './images/models/boss_metal_zone_mt2_-_guitar_pedal.glb')

    return (
        <Canvas camera={{ position: [0, 0, 0], fov: 80 }}>
            <ambientLight />
            <pointLight position={[10, 10, 10]} />
            <Suspense fallback={null}>
                <primitive object={gltf.scene} />
            </Suspense>
    
        </Canvas>

    );
};

export default PedalboardControl;

