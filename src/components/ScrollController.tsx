import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import {
  CAMERA_KEYFRAMES,
  masterScrollState,
  SceneId,
} from '../config/animationConfig';

gsap.registerPlugin(ScrollTrigger);

let activeLenisInstance: Lenis | null = null;

export function smoothScrollToElement(elementId: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  if (activeLenisInstance) {
    activeLenisInstance.scrollTo(el, { duration: 1.0 });
  } else {
    el.scrollIntoView({ behavior: 'smooth' });
  }
}

export function setLenisPaused(paused: boolean) {
  if (!activeLenisInstance) return;
  if (paused) {
    activeLenisInstance.stop();
  } else {
    activeLenisInstance.start();
  }
}

interface ScrollControllerProps {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onSceneChange: (sceneIndex: number) => void;
}

export const ScrollController: React.FC<ScrollControllerProps> = React.memo(
  ({ scrollContainerRef, onSceneChange }) => {
    const lastSceneRef = useRef<number>(1);

    useEffect(() => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const prefersReducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches;

      const lenis = new Lenis({
        lerp: prefersReducedMotion ? 1 : 0.09,
        smoothWheel: !prefersReducedMotion,
        wheelMultiplier: 0.9,
        touchMultiplier: 1.25,
        syncTouch: true,
      });
      activeLenisInstance = lenis;

      lenis.on('scroll', ScrollTrigger.update);

      const tickerUpdate = (time: number) => {
        lenis.raf(time * 1000);
      };
      gsap.ticker.add(tickerUpdate);
      gsap.ticker.lagSmoothing(0);

      const proxy = {
        camX: CAMERA_KEYFRAMES.intro.position[0],
        camY: CAMERA_KEYFRAMES.intro.position[1],
        camZ: CAMERA_KEYFRAMES.intro.position[2],
        targetX: CAMERA_KEYFRAMES.intro.target[0],
        targetY: CAMERA_KEYFRAMES.intro.target[1],
        targetZ: CAMERA_KEYFRAMES.intro.target[2],
        fov: CAMERA_KEYFRAMES.intro.fov,

        rotationWeight: 0,
        explodeWeight: 0,
        cutawayWeight: 0,
        cabinWeight: 0,
        dollyWeight: 0,

        aircraftRotY: 0.18,
        aircraftRotX: 0.03,
        aircraftRotZ: -0.04,

        studioMix: 0,
        cabinLightIntensity: 0.25,
      };

      const syncProxyToMaster = (overallProgress: number) => {
        masterScrollState.progress = overallProgress;
        masterScrollState.camPos[0] = proxy.camX;
        masterScrollState.camPos[1] = proxy.camY;
        masterScrollState.camPos[2] = proxy.camZ;
        masterScrollState.camTarget[0] = proxy.targetX;
        masterScrollState.camTarget[1] = proxy.targetY;
        masterScrollState.camTarget[2] = proxy.targetZ;
        masterScrollState.camFov = proxy.fov;

        masterScrollState.rotationWeight = proxy.rotationWeight;
        masterScrollState.explodeWeight = proxy.explodeWeight;
        masterScrollState.cutawayWeight = proxy.cutawayWeight;
        masterScrollState.cabinWeight = proxy.cabinWeight;
        masterScrollState.dollyWeight = proxy.dollyWeight;

        masterScrollState.aircraftRotY = proxy.aircraftRotY;
        masterScrollState.aircraftRotX = proxy.aircraftRotX;
        masterScrollState.aircraftRotZ = proxy.aircraftRotZ;

        masterScrollState.studioMix = proxy.studioMix;
        masterScrollState.cabinLightIntensity = proxy.cabinLightIntensity;

        // Direct DOM update for progress percentage & scroll hint (zero React re-renders!)
        const pctEl = document.getElementById('scroll-progress-label');
        if (pctEl) {
          pctEl.textContent = `${Math.round(overallProgress * 100)}%`;
        }
        const hintEl = document.getElementById('scroll-hint-indicator');
        if (hintEl) {
          hintEl.style.opacity = overallProgress < 0.08 ? '0.9' : '0';
        }

        let activeScene = 1;
        let sceneId: SceneId = 'intro';
        if (overallProgress < 0.18) {
          activeScene = 1;
          sceneId = 'intro';
        } else if (overallProgress < 0.38) {
          activeScene = 2;
          sceneId = 'rotation';
        } else if (overallProgress < 0.6) {
          activeScene = 3;
          sceneId = 'exploded';
        } else if (overallProgress < 0.8) {
          activeScene = 4;
          sceneId = 'cutaway';
        } else {
          activeScene = 5;
          sceneId = overallProgress > 0.92 ? 'final' : 'cabin';
        }

        masterScrollState.activeScene = activeScene;
        masterScrollState.sceneId = sceneId;

        if (activeScene !== lastSceneRef.current) {
          lastSceneRef.current = activeScene;
          onSceneChange(activeScene);
        }
      };

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: container,
          start: 'top top',
          end: 'bottom bottom',
          scrub: true, // Direct 1:1 lock with Lenis so there is zero double-smoothing lag
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            syncProxyToMaster(self.progress);
          },
        },
      });

      tl.addLabel('intro', 0)
        .to(
          proxy,
          {
            camX: CAMERA_KEYFRAMES.rotation.position[0],
            camY: CAMERA_KEYFRAMES.rotation.position[1],
            camZ: CAMERA_KEYFRAMES.rotation.position[2],
            targetX: CAMERA_KEYFRAMES.rotation.target[0],
            targetY: CAMERA_KEYFRAMES.rotation.target[1],
            targetZ: CAMERA_KEYFRAMES.rotation.target[2],
            fov: CAMERA_KEYFRAMES.rotation.fov,
            rotationWeight: 1,
            aircraftRotY: 0.0,
            aircraftRotX: 0.01,
            aircraftRotZ: 0.0,
            studioMix: 0.15,
            duration: 1.0,
            ease: 'power2.inOut',
          },
          'intro'
        )
        .addLabel('rotation');

      tl.to(
        proxy,
        {
          camX: CAMERA_KEYFRAMES.exploded.position[0],
          camY: CAMERA_KEYFRAMES.exploded.position[1],
          camZ: CAMERA_KEYFRAMES.exploded.position[2],
          targetX: CAMERA_KEYFRAMES.exploded.target[0],
          targetY: CAMERA_KEYFRAMES.exploded.target[1],
          targetZ: CAMERA_KEYFRAMES.exploded.target[2],
          fov: CAMERA_KEYFRAMES.exploded.fov,
          explodeWeight: 1,
          aircraftRotY: 0.08,
          aircraftRotX: 0.02,
          studioMix: 0.55,
          cabinLightIntensity: 0.5,
          duration: 1.2,
          ease: 'power2.inOut',
        },
        'rotation'
      ).addLabel('exploded');

      tl.to(
        proxy,
        {
          camX: CAMERA_KEYFRAMES.cutaway.position[0],
          camY: CAMERA_KEYFRAMES.cutaway.position[1],
          camZ: CAMERA_KEYFRAMES.cutaway.position[2],
          targetX: CAMERA_KEYFRAMES.cutaway.target[0],
          targetY: CAMERA_KEYFRAMES.cutaway.target[1],
          targetZ: CAMERA_KEYFRAMES.cutaway.target[2],
          fov: CAMERA_KEYFRAMES.cutaway.fov,
          cutawayWeight: 1,
          aircraftRotY: 0.0,
          aircraftRotX: 0.0,
          aircraftRotZ: 0.0,
          studioMix: 0.92,
          cabinLightIntensity: 0.85,
          duration: 1.1,
          ease: 'power2.inOut',
        },
        'exploded'
      ).addLabel('cutaway');

      tl.to(
        proxy,
        {
          camX: CAMERA_KEYFRAMES.cabin.position[0],
          camY: CAMERA_KEYFRAMES.cabin.position[1],
          camZ: CAMERA_KEYFRAMES.cabin.position[2],
          targetX: CAMERA_KEYFRAMES.cabin.target[0],
          targetY: CAMERA_KEYFRAMES.cabin.target[1],
          targetZ: CAMERA_KEYFRAMES.cabin.target[2],
          fov: CAMERA_KEYFRAMES.cabin.fov,
          cabinWeight: 1,
          aircraftRotY: 0.0,
          aircraftRotX: 0.0,
          aircraftRotZ: 0.0,
          studioMix: 1.0,
          cabinLightIntensity: 1.0,
          duration: 1.0,
          ease: 'power2.inOut',
        },
        'cutaway'
      ).addLabel('cabin');

      tl.to(
        proxy,
        {
          camX: CAMERA_KEYFRAMES.final.position[0],
          camY: CAMERA_KEYFRAMES.final.position[1],
          camZ: CAMERA_KEYFRAMES.final.position[2],
          targetX: CAMERA_KEYFRAMES.final.target[0],
          targetY: CAMERA_KEYFRAMES.final.target[1],
          targetZ: CAMERA_KEYFRAMES.final.target[2],
          fov: CAMERA_KEYFRAMES.final.fov,
          dollyWeight: 1,
          cabinLightIntensity: 1.15,
          duration: 1.0,
          ease: 'sine.inOut',
        },
        'cabin'
      ).addLabel('final');

      const handleResize = () => {
        ScrollTrigger.refresh();
      };
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        tl.kill();
        ScrollTrigger.getAll().forEach((st) => st.kill());
        gsap.ticker.remove(tickerUpdate);
        lenis.destroy();
        activeLenisInstance = null;
      };
    }, [scrollContainerRef, onSceneChange]);

    return null;
  }
);
