import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import {
  AircraftPartName,
  ComponentRegistry,
  masterScrollState,
  PART_DISASSEMBLY_VECTORS,
} from '../config/animationConfig';
import { inspectAndPrepareAircraftModel } from './AircraftComponents';
import { CabinInterior, SeatRecord } from './CabinInterior';

interface AircraftModelProps {
  seats: SeatRecord[];
  selectedSeatNumber: string | null;
  onSelectSeat: (seatNumber: string) => void;
  onModelReady: (nodeCount: number) => void;
}

const PART_NAMES = Object.keys(PART_DISASSEMBLY_VECTORS) as AircraftPartName[];

export const AircraftModel: React.FC<AircraftModelProps> = React.memo(
  ({ seats, selectedSeatNumber, onSelectSeat, onModelReady }) => {
    const gltf = useGLTF('/models/airplane_crj-900_nirvana.glb');
    const aircraftRootRef = useRef<THREE.Group>(null);
    const registryRef = useRef<ComponentRegistry>({});

    const clonedScene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

    useEffect(() => {
      const { registry, inspectedCount } =
        inspectAndPrepareAircraftModel(clonedScene);
      registryRef.current = registry;
      onModelReady(inspectedCount);
    }, [clonedScene, onModelReady]);

    useFrame((state) => {
      const s = masterScrollState;
      const t = state.clock.getElapsedTime();

      if (aircraftRootRef.current) {
        const flightMotionFactor = Math.max(0, 1 - s.explodeWeight * 1.4);
        const bobY = Math.sin(t * 1.35) * 0.12 * flightMotionFactor;
        const bankZ = Math.cos(t * 0.9) * 0.025 * flightMotionFactor;

        aircraftRootRef.current.position.set(0, bobY, 0);
        aircraftRootRef.current.rotation.set(
          s.aircraftRotX,
          s.aircraftRotY,
          s.aircraftRotZ + bankZ
        );
      }

      const reg = registryRef.current;
      const wExplode = s.explodeWeight;
      const wCutaway = s.cutawayWeight;
      const wCabin = s.cabinWeight;

      for (let i = 0; i < PART_NAMES.length; i++) {
        const partName = PART_NAMES[i];
        const entry = reg[partName];
        if (!entry) continue;

        const cfg = PART_DISASSEMBLY_VECTORS[partName];
        const { object, original, materials } = entry;

        let x = original.position.x;
        let y = original.position.y;
        let z = original.position.z;

        if (wExplode > 0.0001) {
          x = THREE.MathUtils.lerp(
            x,
            original.position.x + cfg.explodedPos[0],
            wExplode
          );
          y = THREE.MathUtils.lerp(
            y,
            original.position.y + cfg.explodedPos[1],
            wExplode
          );
          z = THREE.MathUtils.lerp(
            z,
            original.position.z + cfg.explodedPos[2],
            wExplode
          );
        }

        if (wCutaway > 0.0001) {
          x = THREE.MathUtils.lerp(
            x,
            original.position.x + cfg.cutawayPos[0],
            wCutaway
          );
          y = THREE.MathUtils.lerp(
            y,
            original.position.y + cfg.cutawayPos[1],
            wCutaway
          );
          z = THREE.MathUtils.lerp(
            z,
            original.position.z + cfg.cutawayPos[2],
            wCutaway
          );
        }

        if (wCabin > 0.0001) {
          x = THREE.MathUtils.lerp(
            x,
            original.position.x + cfg.cabinPos[0],
            wCabin
          );
          y = THREE.MathUtils.lerp(
            y,
            original.position.y + cfg.cabinPos[1],
            wCabin
          );
          z = THREE.MathUtils.lerp(
            z,
            original.position.z + cfg.cabinPos[2],
            wCabin
          );
        }

        object.position.set(x, y, z);

        const targetCutawayOp = cfg.cutawayOpacity ?? 1.0;
        const targetCabinOp = cfg.cabinOpacity ?? 1.0;

        let opacity = 1.0;
        if (wCutaway > 0.0001) {
          opacity = THREE.MathUtils.lerp(opacity, targetCutawayOp, wCutaway);
        }
        if (wCabin > 0.0001) {
          opacity = THREE.MathUtils.lerp(opacity, targetCabinOp, wCabin);
        }

        const isVisible = opacity > 0.03;
        object.visible = isVisible;

        if (isVisible && materials) {
          for (let m = 0; m < materials.length; m++) {
            const mat = materials[m];
            mat.opacity = opacity;
            mat.depthWrite = opacity > 0.35;
          }
        }
      }
    });

    return (
      <group ref={aircraftRootRef} name="Exterior_And_Interior_Assembly">
        {/* Exterior Plane Model (`airplane_crj-900_nirvana.glb`) */}
        <primitive object={clonedScene} />

        {/* Interior 30-Seat Cabin Model (`airplane_inside.glb`) */}
        <CabinInterior
          seats={seats}
          selectedSeatNumber={selectedSeatNumber}
          onSelectSeat={onSelectSeat}
        />
      </group>
    );
  }
);

useGLTF.preload('/models/airplane_crj-900_nirvana.glb');
