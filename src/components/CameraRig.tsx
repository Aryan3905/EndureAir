import React, { useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { masterScrollState } from '../config/animationConfig';

export const CameraRig: React.FC = () => {
  const { camera, size } = useThree();
  const currentPos = useRef(new THREE.Vector3(-12.5, 3.2, 11.2));
  const currentTarget = useRef(new THREE.Vector3(0, 0, 0.2));
  const desiredPos = useRef(new THREE.Vector3());
  const desiredTarget = useRef(new THREE.Vector3());

  useFrame((state, delta) => {
    const s = masterScrollState;
    const t = state.clock.getElapsedTime();

    const isNarrow = size.width < 768;
    const exteriorFactor = 1 - s.cabinWeight;
    const mobilePullback = isNarrow ? 1 + 0.32 * exteriorFactor : 1;

    // Atmospheric drift: subtle natural float during flight, fades out when entering cabin
    const driftFactor = Math.max(0, 1 - s.cutawayWeight * 1.2);
    const driftX = Math.sin(t * 0.45) * 0.12 * driftFactor;
    const driftY = Math.cos(t * 0.35) * 0.06 * driftFactor;

    desiredPos.current.set(
      s.camPos[0] * mobilePullback + driftX,
      s.camPos[1] + driftY,
      s.camPos[2] * mobilePullback
    );
    desiredTarget.current.set(s.camTarget[0], s.camTarget[1], s.camTarget[2]);

    // High-responsiveness damping (36x delta) - eliminates double-lerp lag so Lenis momentum
    // directly drives the 3D camera without latency, while filtering mouse-wheel tick jitter.
    const damp = Math.min(1, delta * 36);
    currentPos.current.lerp(desiredPos.current, damp);
    currentTarget.current.lerp(desiredTarget.current, damp);

    camera.position.copy(currentPos.current);
    camera.lookAt(currentTarget.current);

    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const pCam = camera as THREE.PerspectiveCamera;
      if (Math.abs(pCam.fov - s.camFov) > 0.02) {
        pCam.fov = THREE.MathUtils.lerp(pCam.fov, s.camFov, damp);
        pCam.updateProjectionMatrix();
      }
    }
  });

  return null;
};
