import React, { Suspense, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { masterScrollState } from '../config/animationConfig';
import { AircraftModel } from './AircraftModel';
import { CameraRig } from './CameraRig';
import { SeatRecord } from './CabinInterior';

interface AircraftSceneProps {
  seats: SeatRecord[];
  selectedSeatNumber: string | null;
  onSelectSeat: (seatNumber: string) => void;
  onModelReady: (nodeCount: number) => void;
  theme: 'dark' | 'light';
}

/**
 * Drives the real aerial video backdrop from inside the render loop:
 * fades it out as the scene transitions into the studio/cabin views and
 * pauses decoding entirely when it is invisible (saves GPU/CPU).
 * Writes straight to the DOM — zero React re-renders during scroll.
 */
const VideoBackdropFader: React.FC<{
  wrapperRef: React.RefObject<HTMLDivElement>;
  videoRef: React.RefObject<HTMLVideoElement>;
}> = ({ wrapperRef, videoRef }) => {
  const lastOpacity = useRef(-1);

  useFrame(() => {
    const wrapper = wrapperRef.current;
    const video = videoRef.current;
    if (!wrapper || !video) return;

    const opacity = Math.max(0, Math.min(1, 1 - masterScrollState.studioMix * 1.35));
    const rounded = Math.round(opacity * 100) / 100;
    if (rounded === lastOpacity.current) return;
    lastOpacity.current = rounded;

    wrapper.style.opacity = String(rounded);
    // Subtle push-in as the aircraft starts disassembling
    wrapper.style.transform = `scale(${1.04 + (1 - rounded) * 0.08})`;

    if (rounded <= 0.01) {
      if (!video.paused) video.pause();
    } else if (video.paused) {
      video.play().catch(() => undefined);
    }
  });

  return null;
};

const DynamicAtmosphereAndLighting: React.FC<{ theme: 'dark' | 'light' }> =
  React.memo(({ theme }) => {
    const sunLightRef = useRef<THREE.DirectionalLight>(null);
    const rimLightRef = useRef<THREE.DirectionalLight>(null);
    const fillLightRef = useRef<THREE.DirectionalLight>(null);
    const ambientRef = useRef<THREE.AmbientLight>(null);
    const hemiRef = useRef<THREE.HemisphereLight>(null);

    const warmSunColor = useMemo(() => new THREE.Color('#fffdf5'), []);
    const studioKeyColor = useMemo(() => new THREE.Color('#fdfaf2'), []);
    const exteriorFogColor = useMemo(
      () => new THREE.Color(theme === 'light' ? '#cbd5e1' : '#0b1422'),
      [theme]
    );
    const studioFogColor = useMemo(
      () => new THREE.Color(theme === 'light' ? '#e2e8f0' : '#060b13'),
      [theme]
    );

    useFrame(({ scene }) => {
      const s = masterScrollState;
      const mix = s.studioMix;

      if (sunLightRef.current) {
        sunLightRef.current.color.lerpColors(warmSunColor, studioKeyColor, mix);
        sunLightRef.current.intensity = THREE.MathUtils.lerp(3.2, 2.4, mix);
      }

      if (rimLightRef.current) {
        rimLightRef.current.intensity = THREE.MathUtils.lerp(1.5, 2.1, mix);
      }

      if (fillLightRef.current) {
        fillLightRef.current.intensity = THREE.MathUtils.lerp(0.95, 1.4, mix);
      }

      if (ambientRef.current) {
        ambientRef.current.intensity = THREE.MathUtils.lerp(0.9, 1.35, mix);
      }

      if (hemiRef.current) {
        hemiRef.current.intensity = THREE.MathUtils.lerp(1.1, 0.75, mix);
      }

      if (scene.fog && (scene.fog as THREE.FogExp2).isFogExp2) {
        const fog = scene.fog as THREE.FogExp2;
        fog.color.lerpColors(exteriorFogColor, studioFogColor, mix);
        fog.density = THREE.MathUtils.lerp(0.005, 0.004, mix);
      }
    });

    return (
      <>
        <fogExp2
          attach="fog"
          args={[theme === 'light' ? '#cbd5e1' : '#11161f', 0.005]}
        />
        <ambientLight ref={ambientRef} intensity={0.9} color="#f1f5f9" />
        <hemisphereLight
          ref={hemiRef}
          color="#cbd5e1"
          groundColor="#0f172a"
          intensity={1.1}
        />

        <directionalLight
          ref={sunLightRef}
          position={[18, 22, 16]}
          intensity={3.2}
          color="#f8fafc"
        />

        <directionalLight
          ref={rimLightRef}
          position={[-16, 10, -14]}
          intensity={1.5}
          color="#e2e8f0"
        />

        <directionalLight
          ref={fillLightRef}
          position={[-12, -6, 14]}
          intensity={0.95}
          color="#cbd5e1"
        />
      </>
    );
  });

export const AircraftScene: React.FC<AircraftSceneProps> = React.memo(
  ({ seats, selectedSeatNumber, onSelectSeat, onModelReady, theme }) => {
    const videoWrapperRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    return (
      <div className="fixed inset-0 w-full h-screen pointer-events-auto z-0 overflow-hidden">
        {/* Studio backdrop (revealed as the real footage fades out in Scenes 04–05) */}
        <div
          className={`absolute inset-0 transition-colors duration-500 pointer-events-none ${
            theme === 'light'
              ? 'bg-[radial-gradient(circle_at_55%_25%,#e2e8f0_0%,#94a3b8_55%,#475569_100%)]'
              : 'bg-[radial-gradient(circle_at_55%_28%,#18263a_0%,#0c1524_48%,#050911_100%)]'
          }`}
        />

        {/* Real aerial footage: flight above a sea of clouds over the snowy Alps (Mixkit free license) */}
        <div
          ref={videoWrapperRef}
          className="absolute inset-0 pointer-events-none will-change-[opacity,transform]"
          style={{ transform: 'scale(1.04)' }}
        >
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            src="/videos/alps_cloud_flight.mp4"
            poster="/videos/alps_cloud_flight_poster.jpg"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            disablePictureInPicture
            aria-hidden="true"
          />
          {/* Editorial grade: darken edges & bottom so typography + aircraft stay crisp */}
          <div
            className={`absolute inset-0 ${
              theme === 'light'
                ? 'bg-gradient-to-b from-white/10 via-transparent to-slate-900/45'
                : 'bg-gradient-to-b from-black/45 via-black/10 to-black/75'
            }`}
          />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.55)_100%)]" />
        </div>

        <Canvas
          dpr={[1, 1.5]}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.1,
          }}
          camera={{
            position: [-12.5, 3.2, 11.2],
            fov: 38,
            near: 0.1,
            far: 240,
          }}
        >
          <DynamicAtmosphereAndLighting theme={theme} />
          <CameraRig />
          <VideoBackdropFader wrapperRef={videoWrapperRef} videoRef={videoRef} />

          <Suspense fallback={null}>
            <AircraftModel
              seats={seats}
              selectedSeatNumber={selectedSeatNumber}
              onSelectSeat={onSelectSeat}
              onModelReady={onModelReady}
            />
          </Suspense>
        </Canvas>
      </div>
    );
  }
);
