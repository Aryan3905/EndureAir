import React, { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html, useGLTF } from '@react-three/drei';
import { masterScrollState } from '../config/animationConfig';

export interface SeatRecord {
  id: number;
  seat_number: string;
  seat_class: string;
  price: number;
  is_booked: number | boolean;
  passenger_name?: string | null;
}

interface CabinInteriorProps {
  seats: SeatRecord[];
  selectedSeatNumber: string | null;
  onSelectSeat: (seatNumber: string) => void;
}

const nullRaycast = () => null;

// Exact measured row Z coordinates and spacious 6-column X coordinates
// Left bank at -7.60, Right bank at +7.60 creates a wide 8.84-unit aisle, completely de-clustering the cabin!
const ROW_Z = [12.16, 5.36, -1.43, -8.17, -14.98];
const COL_X = [-10.70, -7.60, -4.34, 4.50, 7.60, 10.86];

export const CabinInterior: React.FC<CabinInteriorProps> = React.memo(
  ({ seats, selectedSeatNumber, onSelectSeat }) => {
    const interiorGltf = useGLTF('/models/airplane_inside.glb');
    const cabinRootRef = useRef<THREE.Group>(null);
    const leftWallGroupRef = useRef<THREE.Group>(null);
    const [showSeatBadges, setShowSeatBadges] = useState(false);
    const lastBadgeState = useRef(false);

    // Extract the 7 meshes from `airplane_inside.glb` once and optimize their materials
    const extractedParts = useMemo(() => {
      const chairMeshes: Array<{
        geometry: THREE.BufferGeometry;
        material: THREE.Material;
      }> = [];
      const wallMeshes: Array<{
        geometry: THREE.BufferGeometry;
        material: THREE.Material;
      }> = [];
      const floorMeshes: Array<{
        geometry: THREE.BufferGeometry;
        material: THREE.Material;
      }> = [];

      interiorGltf.scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const m = child as THREE.Mesh;
          const mat = (
            Array.isArray(m.material) ? m.material[0] : m.material
          ).clone() as THREE.MeshStandardMaterial;
          mat.side = THREE.DoubleSide;

          if (m.name.startsWith('Chair')) {
            mat.roughness = 0.45;
            mat.metalness = 0.18;
            chairMeshes.push({ geometry: m.geometry, material: mat });
          } else if (m.name.startsWith('Floor')) {
            mat.roughness = 0.65;
            mat.metalness = 0.1;
            floorMeshes.push({ geometry: m.geometry, material: mat });
          } else if (m.name.startsWith('Wall') || m.name.startsWith('Window')) {
            mat.roughness = 0.4;
            mat.metalness = 0.12;
            if (m.name.startsWith('Window')) {
              mat.emissive = new THREE.Color('#38bdf8');
              mat.emissiveIntensity = 0.45;
            }
            wallMeshes.push({ geometry: m.geometry, material: mat });
          }
        }
      });

      return { chairMeshes, wallMeshes, floorMeshes };
    }, [interiorGltf.scene]);

    // 30 Seat Coordinates mapped 1:1 onto the two 15-seat banks of `airplane_inside.glb`
    const seatAnchors = useMemo(() => {
      const list: Array<{
        seatNumber: string;
        x: number;
        z: number;
        isBusiness: boolean;
      }> = [];

      let idx = 1;
      for (let r = 0; r < ROW_Z.length; r++) {
        for (let c = 0; c < COL_X.length; c++) {
          const seatNumber = String(idx).padStart(2, '0');
          list.push({
            seatNumber,
            x: COL_X[c],
            z: ROW_Z[r],
            isBusiness: idx <= 9,
          });
          idx++;
        }
      }
      return list;
    }, []);

    const seatLookup = useMemo(() => {
      const map = new Map<string, SeatRecord>();
      seats.forEach((s) => map.set(String(s.seat_number).padStart(2, '0'), s));
      return map;
    }, [seats]);

    // Shared lightweight geometries & materials for the 30 interactive seat status pads
    const indicatorAssets = useMemo(
      () => ({
        headrestCapGeo: new THREE.BoxGeometry(2.15, 0.55, 0.85),
        cushionPadGeo: new THREE.BoxGeometry(2.25, 0.35, 2.15),
        aisleRunnerGeo: new THREE.BoxGeometry(7.2, 0.12, 34.2),
        aisleStripGeo: new THREE.BoxGeometry(0.14, 0.14, 34.0),
        aisleRunnerMat: new THREE.MeshStandardMaterial({
          color: '#0b1626',
          roughness: 0.72,
        }),
        aisleStripMat: new THREE.MeshStandardMaterial({
          color: '#f5d77f',
          emissive: '#d4af37',
          emissiveIntensity: 1.0,
        }),
        // Business Class: Rich Brushed Antique Gold
        availBizMat: new THREE.MeshStandardMaterial({
          color: '#c5a059',
          roughness: 0.32,
          metalness: 0.35,
        }),
        // Economy Class: Elegant Deep Steel Blue
        availEcoMat: new THREE.MeshStandardMaterial({
          color: '#233d5d',
          roughness: 0.42,
          metalness: 0.18,
        }),
        // Booked: Preserved as Crimson Rose so it is never confused with brand colors
        bookedMat: new THREE.MeshStandardMaterial({
          color: '#be123c',
          emissive: '#881337',
          emissiveIntensity: 0.4,
          roughness: 0.35,
        }),
        // Selected: Radiant Pearl White with Golden Champagne Core
        selectedMat: new THREE.MeshStandardMaterial({
          color: '#fffdf5',
          emissive: '#d4af37',
          emissiveIntensity: 0.95,
          roughness: 0.2,
          metalness: 0.25,
        }),
      }),
      []
    );

    useFrame(() => {
      const s = masterScrollState;
      if (!cabinRootRef.current) return;

      // Hide interior completely during Scene 01 & 02 exterior flight so exterior is 100% clean
      const isVisible = s.explodeWeight > 0.12;
      cabinRootRef.current.visible = isVisible;
      if (!isVisible) return;

      // Smoothly expand the `airplane_inside.glb` 30-seat cabin from nested fuselage size (Scene 03)
      // to cutaway size (Scene 04) to full walk-in cabin view (Scene 05)
      let scaleVal = THREE.MathUtils.lerp(0.045, 0.085, s.explodeWeight);
      scaleVal = THREE.MathUtils.lerp(scaleVal, 0.165, s.cutawayWeight);
      scaleVal = THREE.MathUtils.lerp(scaleVal, 0.22, s.cabinWeight);

      const yOffset = THREE.MathUtils.lerp(
        -0.25,
        -0.95,
        Math.max(s.cutawayWeight, s.cabinWeight)
      );

      cabinRootRef.current.scale.setScalar(scaleVal);
      cabinRootRef.current.position.set(0, yOffset, 0);

      // In Scene 04 (Cutaway), hide the Left Wall so the side cutaway view is unobstructed;
      // In Scene 05 (Cabin View), show both Left and Right Walls for a complete enclosed cabin!
      if (leftWallGroupRef.current) {
        leftWallGroupRef.current.visible = s.cabinWeight > 0.45;
      }

      const shouldShowBadges = s.cabinWeight > 0.35;
      if (shouldShowBadges !== lastBadgeState.current) {
        lastBadgeState.current = shouldShowBadges;
        setShowSeatBadges(shouldShowBadges);
      }
    });

    return (
      <group
        ref={cabinRootRef}
        name="Airplane_Inside_30Seat_Cabin"
        visible={false}
      >
        {/* Warm Champagne & Pearl interior illumination */}
        <pointLight
          position={[0, 11.5, 6]}
          intensity={1.9}
          distance={45}
          color="#fef3c7"
        />
        <pointLight
          position={[0, 11.5, -8]}
          intensity={1.7}
          distance={45}
          color="#e0f2fe"
        />

        {/* ===================================================================
            RIGHT CABIN BANK (Original 15 Seats + Right Wall + Windows + Floor)
        =================================================================== */}
        <group position={[7.60, 0, 0]}>
          {extractedParts.floorMeshes.map((m, i) => (
            <mesh
              key={`r-floor-${i}`}
              geometry={m.geometry}
              material={m.material}
              raycast={nullRaycast}
            />
          ))}
          {extractedParts.wallMeshes.map((m, i) => (
            <mesh
              key={`r-wall-${i}`}
              geometry={m.geometry}
              material={m.material}
              raycast={nullRaycast}
            />
          ))}
          {extractedParts.chairMeshes.map((m, i) => (
            <mesh
              key={`r-chair-${i}`}
              geometry={m.geometry}
              material={m.material}
              raycast={nullRaycast}
            />
          ))}
        </group>

        {/* ===================================================================
            LEFT CABIN BANK (Copied 15 Seats = 30 Total + Mirrored Left Wall/Floor)
        =================================================================== */}
        <group position={[-7.60, 0, 0]}>
          {/* Second Copy of the 15-Seat Chair Assembly (Facing +Z) */}
          {extractedParts.chairMeshes.map((m, i) => (
            <mesh
              key={`l-chair-${i}`}
              geometry={m.geometry}
              material={m.material}
              raycast={nullRaycast}
            />
          ))}

          {/* Mirrored Left Floor */}
          <group scale={[-1, 1, 1]}>
            {extractedParts.floorMeshes.map((m, i) => (
              <mesh
                key={`l-floor-${i}`}
                geometry={m.geometry}
                material={m.material}
                raycast={nullRaycast}
              />
            ))}
          </group>

          {/* Mirrored Left Cabin Wall & Windows (Shown in Scene 05 Cabin View) */}
          <group ref={leftWallGroupRef} scale={[-1, 1, 1]}>
            {extractedParts.wallMeshes.map((m, i) => (
              <mesh
                key={`l-wall-${i}`}
                geometry={m.geometry}
                material={m.material}
                raycast={nullRaycast}
              />
            ))}
          </group>
        </group>

        {/* ===================================================================
            CENTER AISLE CARPET & PHOTOLUMINESCENT GUIDE STRIPS
        =================================================================== */}
        <mesh
          position={[0, 0.68, 0]}
          geometry={indicatorAssets.aisleRunnerGeo}
          material={indicatorAssets.aisleRunnerMat}
          raycast={nullRaycast}
        />
        <mesh
          position={[-2.15, 0.72, 0]}
          geometry={indicatorAssets.aisleStripGeo}
          material={indicatorAssets.aisleStripMat}
          raycast={nullRaycast}
        />
        <mesh
          position={[2.15, 0.72, 0]}
          geometry={indicatorAssets.aisleStripGeo}
          material={indicatorAssets.aisleStripMat}
          raycast={nullRaycast}
        />

        {/* ===================================================================
            30 INTERACTIVE SEAT STATUS PADS & NUMBER BADGES (#01 - #30)
            (Lightweight 12-triangle hitboxes for instant 0.01ms raycasting!)
        =================================================================== */}
        {seatAnchors.map((sa) => {
          const dbRecord = seatLookup.get(sa.seatNumber);
          const isBooked = Boolean(dbRecord?.is_booked);
          const isSelected = selectedSeatNumber === sa.seatNumber;

          const statusMat = isSelected
            ? indicatorAssets.selectedMat
            : isBooked
            ? indicatorAssets.bookedMat
            : sa.isBusiness
            ? indicatorAssets.availBizMat
            : indicatorAssets.availEcoMat;

          return (
            <group key={sa.seatNumber} position={[sa.x, 0, sa.z]}>
              {/* Interactive Headrest Status Cap */}
              <mesh
                position={[0, 6.82, -1.45]}
                geometry={indicatorAssets.headrestCapGeo}
                material={statusMat}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSeat(sa.seatNumber);
                }}
              />

              {/* Interactive Seat Cushion Accent Pad */}
              <mesh
                position={[0, 2.75, 0.15]}
                geometry={indicatorAssets.cushionPadGeo}
                material={statusMat}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSeat(sa.seatNumber);
                }}
              />

              {/* Crisp Seat Number Pill in Scene 05 with distanceFactor=18 to avoid overlapping clusters */}
              {showSeatBadges && (
                <Html
                  position={[0, 7.85, -1.45]}
                  center
                  distanceFactor={18}
                  zIndexRange={[18, 0]}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectSeat(sa.seatNumber);
                    }}
                    className={`px-1.5 py-0.5 rounded-sm font-mono text-[9px] font-medium tracking-wider transition-all duration-150 cursor-pointer select-none shadow-md ${
                      isSelected
                        ? 'bg-gradient-to-r from-[#d4af37] via-[#f3e5ab] to-[#c5a059] text-[#060b13] scale-125 ring-2 ring-[#f3e5ab] shadow-lg shadow-[#d4af37]/40 font-bold'
                        : isBooked
                        ? 'bg-rose-950/90 text-rose-300 border border-rose-500/50 hover:bg-rose-900'
                        : sa.isBusiness
                        ? 'bg-[#0f1b2b]/95 text-[#f3e5ab] border border-[#d4af37]/40 hover:border-[#d4af37] hover:bg-[#d4af37] hover:text-[#060b13] hover:scale-105'
                        : 'bg-[#0a121c]/95 text-[#e2e8f0] border border-[#304766]/40 hover:border-[#60a5fa] hover:bg-[#1a2d45] hover:scale-105'
                    }`}
                  >
                    #{sa.seatNumber}
                  </button>
                </Html>
              )}
            </group>
          );
        })}
      </group>
    );
  }
);

useGLTF.preload('/models/airplane_inside.glb');
