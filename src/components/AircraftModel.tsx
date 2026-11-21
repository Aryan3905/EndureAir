import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html, useGLTF } from '@react-three/drei';
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

interface TechnicalCallout {
  id: string;
  code: string;
  title: string;
  spec: string;
  partName: AircraftPartName;
  worldOffset: [number, number, number];
  scenes: ('rotation' | 'exploded')[];
}

const TECHNICAL_CALLOUTS: TechnicalCallout[] = [
  {
    id: 'fuselage',
    code: 'SYS-01 // SEMI-MONOCOQUE BARREL',
    title: 'Pressurized Cabin Fuselage',
    spec: 'Aerospace Aluminum-Lithium Alloy • 30-Seat Cabin',
    partName: 'Fuselage_Upper_Crown_Forward',
    worldOffset: [0, 0.95, 1.6],
    scenes: ['rotation', 'exploded'],
  },
  {
    id: 'wings',
    code: 'SYS-02 // SUPERCRITICAL AIRFOIL',
    title: 'Swept Wings & Cantilever Winglets',
    spec: '24.85m Wingspan • High-Lift Slats & Flaps',
    partName: 'Wing_Left_Assembly',
    worldOffset: [3.8, -0.15, -0.4],
    scenes: ['rotation', 'exploded'],
  },
  {
    id: 'engines',
    code: 'SYS-03 // PROPULSION',
    title: 'Rear-Mounted High-Bypass Turbofans',
    spec: 'Twin CF34-8C5 • 14,510 lbf Thrust Each',
    partName: 'Engine_GEnx_Left',
    worldOffset: [1.3, 0.45, -3.7],
    scenes: ['rotation', 'exploded'],
  },
  {
    id: 'tail',
    code: 'SYS-04 // T-TAIL EMPENNAGE',
    title: 'High-Mounted T-Tail Stabilizer',
    spec: 'Clean Wake Airflow • Dual-Actuated Rudder',
    partName: 'Tail_Vertical_Stabilizer',
    worldOffset: [0, 1.85, -5.8],
    scenes: ['rotation', 'exploded'],
  },
  {
    id: 'nose',
    code: 'SYS-05 // FLIGHT DECK',
    title: 'Aerodynamic Radome & Cockpit',
    spec: 'Pro Line 4 Avionics • 6-Pane Windshield',
    partName: 'Nose_Cockpit_Assembly',
    worldOffset: [0, 0.25, 6.1],
    scenes: ['exploded'],
  },
];

const PART_NAMES = Object.keys(PART_DISASSEMBLY_VECTORS) as AircraftPartName[];

export const AircraftModel: React.FC<AircraftModelProps> = React.memo(
  ({ seats, selectedSeatNumber, onSelectSeat, onModelReady }) => {
    const gltf = useGLTF('/models/airplane_crj-900_nirvana.glb');
    const aircraftRootRef = useRef<THREE.Group>(null);
    const registryRef = useRef<ComponentRegistry>({});
    const [activeCalloutScene, setActiveCalloutScene] = useState<
      'none' | 'rotation' | 'exploded'
    >('none');
    const lastCalloutRef = useRef<'none' | 'rotation' | 'exploded'>('none');

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

      let desiredCallout: 'none' | 'rotation' | 'exploded' = 'none';
      if (s.explodeWeight > 0.25 && s.cutawayWeight < 0.55) {
        desiredCallout = 'exploded';
      } else if (s.rotationWeight > 0.25 && s.explodeWeight <= 0.25) {
        desiredCallout = 'rotation';
      }
      if (desiredCallout !== lastCalloutRef.current) {
        lastCalloutRef.current = desiredCallout;
        setActiveCalloutScene(desiredCallout);
      }

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

        {/* Scene 02 & Scene 03 3D Technical Callout Labels */}
        {activeCalloutScene !== 'none' &&
          TECHNICAL_CALLOUTS.filter((c) => c.scenes.includes(activeCalloutScene)).map(
            (callout) => {
              const cfg = PART_DISASSEMBLY_VECTORS[callout.partName];
              const isExploded = activeCalloutScene === 'exploded';
              // Convert local Object_2 exploded offset [dx, dy, dz] to world offset [dx*4.2, dz*4.2, -dy*4.2]
              const anchorPos: [number, number, number] = isExploded
                ? [
                    callout.worldOffset[0] + cfg.explodedPos[0] * 4.2,
                    callout.worldOffset[1] + cfg.explodedPos[2] * 4.2,
                    callout.worldOffset[2] - cfg.explodedPos[1] * 4.2,
                  ]
                : callout.worldOffset;

              return (
                <Html
                  key={callout.id}
                  position={anchorPos}
                  center
                  distanceFactor={15}
                  zIndexRange={[15, 0]}
                >
                  <div className="pointer-events-none select-none flex items-center gap-2.5 animate-fadeIn">
                    <div className="relative flex items-center">
                      <span className="w-2 h-2 rounded-full bg-[#d4af37] shadow-[0_0_10px_#d4af37]" />
                      <span className="w-7 h-[1px] bg-[#d4af37]/70" />
                    </div>
                    <div className="px-3.5 py-2 rounded-[6px] bg-[#09111c]/95 border border-[#304766]/50 shadow-2xl min-w-[190px]">
                      <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-[#f3e5ab]">
                        • {callout.code}
                      </div>
                      <div className="text-xs font-mono font-medium text-[#f8fafc] tracking-tight mt-0.5">
                        {callout.title}
                      </div>
                      <div className="text-[10px] text-[#94a3b8] font-normal mt-0.5">
                        {callout.spec}
                      </div>
                    </div>
                  </div>
                </Html>
              );
            }
          )}
      </group>
    );
  }
);

useGLTF.preload('/models/airplane_crj-900_nirvana.glb');
