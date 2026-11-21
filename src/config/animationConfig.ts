import * as THREE from 'three';

export type SceneId = 'intro' | 'rotation' | 'exploded' | 'cutaway' | 'cabin' | 'final';

export type AircraftPartName =
  | 'Nose_Cockpit_Assembly'
  | 'Fuselage_Upper_Crown_Forward'
  | 'Fuselage_Upper_Crown_Aft'
  | 'Fuselage_Lower_Belly_Forward'
  | 'Fuselage_Lower_Belly_Aft'
  | 'Tail_Cone_Assembly'
  | 'Wing_Left_Assembly'
  | 'Wing_Right_Assembly'
  | 'Tail_Vertical_Stabilizer'
  | 'Tail_Horizontal_Stabilizer_L'
  | 'Tail_Horizontal_Stabilizer_R'
  | 'Engine_GEnx_Left'
  | 'Engine_GEnx_Right'
  | 'Landing_Gear_Nose'
  | 'Landing_Gear_Main_L'
  | 'Landing_Gear_Main_R'
  | 'Cabin_Interior_Structure';

export interface TransformState {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

export type ComponentRegistry = Partial<
  Record<
    AircraftPartName,
    {
      object: THREE.Object3D;
      original: TransformState;
      materials?: THREE.Material[];
    }
  >
>;

export interface PartVectorConfig {
  explodedPos: [number, number, number];
  explodedRot?: [number, number, number];
  cutawayPos: [number, number, number];
  cutawayRot?: [number, number, number];
  cabinPos: [number, number, number];
  cutawayOpacity?: number;
  cabinOpacity?: number;
}

/**
 * Deterministic 3D disassembly vectors in the local space of `airplane_crj-900_nirvana.glb`
 * (where local X = Left/Right wingspan, local Y = Nose(0) to Tail(3.65), local Z = Bottom(0) to Top(0.71)).
 * Since the root group scales by 4.2x, a local offset of 0.5 equals 2.1 world units.
 */
export const PART_DISASSEMBLY_VECTORS: Record<AircraftPartName, PartVectorConfig> = {
  Nose_Cockpit_Assembly: {
    explodedPos: [0, -0.65, 0.04],
    cutawayPos: [0, -1.25, 0.15],
    cabinPos: [0, -2.8, 0.6],
    cutawayOpacity: 0.75,
    cabinOpacity: 0.0,
  },
  Fuselage_Upper_Crown_Forward: {
    explodedPos: [0, -0.15, 0.52],
    cutawayPos: [0, -0.25, 1.25],
    cabinPos: [0, -0.4, 2.6],
    cutawayOpacity: 0.18,
    cabinOpacity: 0.0,
  },
  Fuselage_Upper_Crown_Aft: {
    explodedPos: [0, 0.15, 0.52],
    cutawayPos: [0, 0.25, 1.25],
    cabinPos: [0, 0.4, 2.6],
    cutawayOpacity: 0.18,
    cabinOpacity: 0.0,
  },
  Fuselage_Lower_Belly_Forward: {
    explodedPos: [0, -0.12, -0.26],
    cutawayPos: [0, -0.2, -0.48],
    cabinPos: [0, -0.3, -1.2],
    cutawayOpacity: 0.5,
    cabinOpacity: 0.0,
  },
  Fuselage_Lower_Belly_Aft: {
    explodedPos: [0, 0.12, -0.26],
    cutawayPos: [0, 0.2, -0.48],
    cabinPos: [0, 0.3, -1.2],
    cutawayOpacity: 0.5,
    cabinOpacity: 0.0,
  },
  Tail_Cone_Assembly: {
    explodedPos: [0, 0.65, 0.04],
    cutawayPos: [0, 1.35, 0.12],
    cabinPos: [0, 2.8, 0.4],
    cutawayOpacity: 0.65,
    cabinOpacity: 0.0,
  },
  Wing_Left_Assembly: {
    explodedPos: [0.68, 0.0, -0.05],
    cutawayPos: [1.35, 0.0, -0.1],
    cabinPos: [2.6, 0.0, -0.3],
    cutawayOpacity: 0.65,
    cabinOpacity: 0.0,
  },
  Wing_Right_Assembly: {
    explodedPos: [-0.68, 0.0, -0.05],
    cutawayPos: [-1.35, 0.0, -0.1],
    cabinPos: [-2.6, 0.0, -0.3],
    cutawayOpacity: 0.65,
    cabinOpacity: 0.0,
  },
  Tail_Vertical_Stabilizer: {
    explodedPos: [0, 0.78, 0.48],
    cutawayPos: [0, 1.5, 0.95],
    cabinPos: [0, 3.0, 2.0],
    cutawayOpacity: 0.65,
    cabinOpacity: 0.0,
  },
  Tail_Horizontal_Stabilizer_L: {
    explodedPos: [0.45, 0.85, 0.62],
    cutawayPos: [0.95, 1.6, 1.15],
    cabinPos: [2.0, 3.0, 2.2],
    cutawayOpacity: 0.65,
    cabinOpacity: 0.0,
  },
  Tail_Horizontal_Stabilizer_R: {
    explodedPos: [-0.45, 0.85, 0.62],
    cutawayPos: [-0.95, 1.6, 1.15],
    cabinPos: [-2.0, 3.0, 2.2],
    cutawayOpacity: 0.65,
    cabinOpacity: 0.0,
  },
  Engine_GEnx_Left: {
    explodedPos: [0.62, 0.35, 0.18],
    cutawayPos: [1.25, 0.65, 0.35],
    cabinPos: [2.5, 1.2, 0.7],
    cutawayOpacity: 0.7,
    cabinOpacity: 0.0,
  },
  Engine_GEnx_Right: {
    explodedPos: [-0.62, 0.35, 0.18],
    cutawayPos: [-1.25, 0.65, 0.35],
    cabinPos: [-2.5, 1.2, 0.7],
    cutawayOpacity: 0.7,
    cabinOpacity: 0.0,
  },
  Landing_Gear_Nose: {
    explodedPos: [0, -0.45, -0.42],
    cutawayPos: [0, -0.85, -0.85],
    cabinPos: [0, -1.8, -1.8],
    cutawayOpacity: 0.5,
    cabinOpacity: 0.0,
  },
  Landing_Gear_Main_L: {
    explodedPos: [0.35, 0.0, -0.45],
    cutawayPos: [0.75, 0.0, -0.9],
    cabinPos: [1.6, 0.0, -1.8],
    cutawayOpacity: 0.5,
    cabinOpacity: 0.0,
  },
  Landing_Gear_Main_R: {
    explodedPos: [-0.35, 0.0, -0.45],
    cutawayPos: [-0.75, 0.0, -0.9],
    cabinPos: [-1.6, 0.0, -1.8],
    cutawayOpacity: 0.5,
    cabinOpacity: 0.0,
  },
  Cabin_Interior_Structure: {
    explodedPos: [0, 0, 0],
    cutawayPos: [0, 0, 0],
    cabinPos: [0, 0, 0],
    cutawayOpacity: 1.0,
    cabinOpacity: 1.0,
  },
};

export interface CameraKeyframe {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export const CAMERA_KEYFRAMES: Record<SceneId, CameraKeyframe> = {
  // Scene 01: Three-quarter hero view of airplane_crj-900_nirvana.glb flying over mountains
  intro: {
    position: [-12.5, 3.2, 11.2],
    target: [0.0, 0.0, 0.2],
    fov: 38,
  },
  // Scene 02: Side/profile inspection view
  rotation: {
    position: [-16.5, 2.6, 1.5],
    target: [0.0, 0.1, 0.0],
    fov: 36,
  },
  // Scene 03: Wide exploded engineering view showing all 16 separated CRJ-900 components
  exploded: {
    position: [-15.2, 6.4, 12.8],
    target: [0.0, 0.2, 0.0],
    fov: 40,
  },
  // Scene 04: Elevated cutaway view looking into the opening fuselage & airplane_inside.glb cabin
  cutaway: {
    position: [-6.8, 4.6, 7.8],
    target: [0.0, -0.1, -0.4],
    fov: 44,
  },
  // Scene 05a: Entering the front of the airplane_inside.glb cabin aisle looking down at all 30 seats
  cabin: {
    position: [0.0, 2.2, 6.2],
    target: [0.0, 0.05, -1.5],
    fov: 52,
  },
  // Scene 05b: Final composed panoramic cabin view framing all 30 seats (#01-#30) across 5 spacious rows
  final: {
    position: [0.0, 2.65, 5.4],
    target: [0.0, 0.12, -1.8],
    fov: 54,
  },
};

export interface MasterScrollState {
  progress: number;
  activeScene: number;
  sceneId: SceneId;

  rotationWeight: number;
  explodeWeight: number;
  cutawayWeight: number;
  cabinWeight: number;
  dollyWeight: number;

  camPos: [number, number, number];
  camTarget: [number, number, number];
  camFov: number;

  aircraftRotY: number;
  aircraftRotX: number;
  aircraftRotZ: number;

  studioMix: number;
  cabinLightIntensity: number;
}

export const masterScrollState: MasterScrollState = {
  progress: 0,
  activeScene: 1,
  sceneId: 'intro',
  rotationWeight: 0,
  explodeWeight: 0,
  cutawayWeight: 0,
  cabinWeight: 0,
  dollyWeight: 0,
  camPos: [...CAMERA_KEYFRAMES.intro.position],
  camTarget: [...CAMERA_KEYFRAMES.intro.target],
  camFov: CAMERA_KEYFRAMES.intro.fov,
  aircraftRotY: 0.18,
  aircraftRotX: 0.03,
  aircraftRotZ: -0.04,
  studioMix: 0,
  cabinLightIntensity: 0.25,
};

export interface SceneMetadata {
  index: number;
  id: SceneId;
  eyebrow: string;
  headline: string;
  supporting: string;
  align: 'left' | 'center' | 'right';
}

export const SCENES_METADATA: SceneMetadata[] = [
  {
    index: 1,
    id: 'intro',
    eyebrow: 'THE ENGINEERING OF FLIGHT',
    headline: 'Beyond the Surface.',
    supporting: 'Discover the engineering behind the extraordinary.',
    align: 'left',
  },
  {
    index: 2,
    id: 'rotation',
    eyebrow: 'AERODYNAMIC ARCHITECTURE',
    headline: 'Sculpted by Airflow.',
    supporting:
      'Every contour—from swept supercritical winglets to rear-mounted high-bypass turbofans and T-tail empennage—is shaped for transonic efficiency.',
    align: 'right',
  },
  {
    index: 3,
    id: 'exploded',
    eyebrow: 'MODULAR AEROSTRUCTURE SYSTEMS',
    headline: 'Every Detail. By Design.',
    supporting:
      'Precision engineering connects thousands of individual components into one extraordinary aircraft.',
    align: 'left',
  },
  {
    index: 4,
    id: 'cutaway',
    eyebrow: 'STRUCTURAL CUTAWAY',
    headline: 'Inside the Extraordinary.',
    supporting:
      'Explore the space, structure, and design that shape every journey.',
    align: 'right',
  },
  {
    index: 5,
    id: 'cabin',
    eyebrow: '30-SEAT PASSENGER CABIN REVEAL',
    headline: 'Designed Around You.',
    supporting:
      'Every journey begins with thousands of carefully engineered details.',
    align: 'center',
  },
];
