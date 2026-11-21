import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SCENES_METADATA } from './config/animationConfig';
import { AircraftScene } from './components/AircraftScene';
import { SeatRecord } from './components/CabinInterior';
import { LoadingScreen } from './components/LoadingScreen';
import { BookingRecord, SceneOverlay } from './components/SceneOverlay';
import {
  ScrollController,
  smoothScrollToElement,
} from './components/ScrollController';
import { BlurText } from './components/reactbits/BlurText';
import { DecryptedText } from './components/reactbits/DecryptedText';
import { SpotlightCard } from './components/reactbits/SpotlightCard';
import { NoiseOverlay } from './components/reactbits/NoiseOverlay';
import { TargetCursor } from './components/reactbits/TargetCursor';

const INITIAL_SEATS: SeatRecord[] = Array.from({ length: 30 }, (_, i) => ({
  id: i + 1,
  seat_number: String(i + 1).padStart(2, '0'),
  seat_class: i < 9 ? 'Business' : 'Economy',
  price: i < 9 ? 1450 : 620,
  is_booked: 0,
  passenger_name: null,
}));

export const App: React.FC = () => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [inspectedNodeCount, setInspectedNodeCount] = useState(0);

  const [activeScene, setActiveScene] = useState<number>(1);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const [seats, setSeats] = useState<SeatRecord[]>(INITIAL_SEATS);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [selectedSeatNumber, setSelectedSeatNumber] = useState<string | null>(
    '01'
  );

  const [externalModalRequest, setExternalModalRequest] = useState<
    'none' | 'reserve' | 'passes' | 'adminLogin' | null
  >(null);

  const fetchLiveDatabase = useCallback(async () => {
    try {
      const res = await fetch('/api/cabin-data');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.seats)) setSeats(data.seats);
        if (Array.isArray(data.bookings)) setBookings(data.bookings);
      }
    } catch {
      // Keep existing state if offline
    }
  }, []);

  const handleDirectDataUpdate = useCallback(
    (newSeats?: SeatRecord[], newBookings?: BookingRecord[]) => {
      if (Array.isArray(newSeats)) setSeats(newSeats);
      if (Array.isArray(newBookings)) setBookings(newBookings);
    },
    []
  );

  useEffect(() => {
    fetchLiveDatabase();
  }, [fetchLiveDatabase]);

  const handleModelReady = useCallback((nodeCount: number) => {
    setInspectedNodeCount(nodeCount);
    setModelReady(true);
  }, []);

  const handleScrollToScene = useCallback((sceneIndex: number) => {
    smoothScrollToElement(`scene-section-${sceneIndex}`);
  }, []);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const handleClearExternalModal = useCallback(() => {
    setExternalModalRequest(null);
  }, []);

  return (
    <div
      className={`relative min-h-screen selection:bg-white selection:text-black ${
        theme === 'light' ? 'text-slate-900' : 'text-white'
      }`}
    >
      <NoiseOverlay />
      <TargetCursor />

      <LoadingScreen
        modelReady={modelReady}
        inspectedNodeCount={inspectedNodeCount}
      />

      <AircraftScene
        seats={seats}
        selectedSeatNumber={selectedSeatNumber}
        onSelectSeat={setSelectedSeatNumber}
        onModelReady={handleModelReady}
        theme={theme}
      />

      <ScrollController
        scrollContainerRef={scrollContainerRef}
        onSceneChange={setActiveScene}
      />

      <SceneOverlay
        activeScene={activeScene}
        seats={seats}
        bookings={bookings}
        selectedSeatNumber={selectedSeatNumber}
        onSelectSeat={setSelectedSeatNumber}
        onScrollToScene={handleScrollToScene}
        onRefreshData={fetchLiveDatabase}
        onDirectDataUpdate={handleDirectDataUpdate}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        externalModalRequest={externalModalRequest}
        onClearExternalModal={handleClearExternalModal}
      />

      {/* =====================================================================
          CONTINUOUS 5-SCENE SCROLLYTELLING TRACK (MOSA EDITORIAL UI)
      ===================================================================== */}
      <main
        ref={scrollContainerRef}
        className="relative z-10 pointer-events-none"
      >
        {/* ===================================================================
            SCENE 01: HERO VIEWPORT (BOTTOM-LEFT HEADLINE + SPLIT CTA + CREDITS)
        =================================================================== */}
        <section
          id="scene-section-1"
          className="h-[115vh] w-full flex flex-col justify-end px-6 md:px-14 pb-12 pt-24"
        >
          <div
            className={`w-full flex flex-col lg:flex-row lg:items-end justify-between gap-8 transition-all duration-500 ${
              activeScene === 1
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-4'
            }`}
          >
            {/* Bottom-Left Editorial Stack (Matches Screenshot 1) */}
            <div className="max-w-xl">
              <div className="text-xs font-mono text-[#f3e5ab] tracking-wide mb-3 flex items-center gap-1.5">
                <span className="text-[#d4af37]">•</span>
                <DecryptedText
                  text={SCENES_METADATA[0].eyebrow}
                  speed={35}
                  trigger={activeScene === 1}
                />
              </div>
              <h1 className="text-5xl sm:text-6xl md:text-[64px] font-normal tracking-[-0.03em] leading-[1.04] text-[#f8fafc] drop-shadow-md">
                <BlurText
                  text="Beyond the Surface."
                  delay={60}
                  trigger={activeScene === 1}
                />
                <br />
                <span className="text-[#cbd5e1]">
                  <BlurText
                    text="Engineered to Fly."
                    delay={80}
                    trigger={activeScene === 1}
                  />
                </span>
              </h1>
              <p className="mt-5 text-sm md:text-base text-[#cbd5e1]/95 font-normal max-w-md leading-relaxed">
                {SCENES_METADATA[0].supporting} Scroll down to disassemble the
                aircraft and enter the 30-seat interactive cabin.
              </p>

              {/* Signature Split Dual CTA Button Box (Option 2: Antique Gold + Steel Blue) */}
              <div className="mt-7 inline-flex items-center rounded-[5px] border border-[#d4af37]/40 overflow-hidden shadow-[0_8px_30px_rgba(212,175,55,0.18)] pointer-events-auto">
                <button
                  onClick={() => setExternalModalRequest('reserve')}
                  className="px-5 py-3 bg-gradient-to-r from-[#d4af37] via-[#f3e5ab] to-[#c5a059] hover:brightness-110 text-[#060b13] font-mono text-xs font-semibold uppercase tracking-[0.12em] transition-all cursor-pointer"
                >
                  RESERVE SEAT ›
                </button>
                <button
                  onClick={() => handleScrollToScene(5)}
                  className="px-5 py-3 bg-[#0c1624]/90 hover:bg-[#142338] text-[#f8fafc] font-mono text-xs uppercase tracking-[0.12em] transition-colors cursor-pointer border-l border-[#d4af37]/30"
                >
                  EXPLORE CABIN ›
                </button>
              </div>
            </div>

            {/* Bottom-Right Telemetry / Architecture Strip (Matches Screenshot 1) */}
            <div
              id="scroll-hint-indicator"
              className="lg:text-right transition-opacity duration-300"
              style={{ opacity: 0.9 }}
            >
              <div className="text-xs font-mono text-[#d4af37] mb-1.5 font-medium tracking-wide">
                Architecture
              </div>
              <div className="text-xs md:text-sm font-normal text-[#cbd5e1] tracking-tight flex flex-wrap lg:justify-end items-center gap-2">
                <span className="text-[#f8fafc] font-medium">CRJ-900 Nirvana</span>
                <span className="text-[#385173]">/</span>
                <span>30-Seat Cabin</span>
                <span className="text-[#385173]">/</span>
                <span className="text-[#f3e5ab]">MySQL 8.0 Live</span>
                <span className="text-[#385173]">/</span>
                <span>Three.js WebGL</span>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            SCENE 02: THE AIRCRAFT ROTATES (TWO-TONE HEADLINE)
        =================================================================== */}
        <section
          id="scene-section-2"
          className="h-[115vh] w-full flex items-end justify-end px-6 md:px-14 pb-20"
        >
          <SpotlightCard
            className={`max-w-lg transition-all duration-500 p-7 rounded-[10px] bg-[#0c1524]/92 border border-[#304766]/50 shadow-2xl pointer-events-auto ${
              activeScene === 2
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-6'
            }`}
          >
            <div className="text-xs font-mono text-[#f3e5ab] mb-2.5 flex items-center gap-1.5">
              <span className="text-[#d4af37]">•</span>
              <DecryptedText
                text="Introducing Aerodynamics"
                speed={30}
                trigger={activeScene === 2}
              />
            </div>
            <h2 className="text-3xl md:text-4xl font-normal tracking-[-0.025em] leading-[1.12] text-[#f8fafc]">
              Sculpted by airflow.{' '}
              <span className="text-[#94a3b8]">
                Engineered for transonic precision.
              </span>
            </h2>
            <p className="mt-3.5 text-sm text-[#cbd5e1] leading-relaxed">
              {SCENES_METADATA[1].supporting}
            </p>
          </SpotlightCard>
        </section>

        {/* ===================================================================
            SCENE 03: THE EXPLODED VIEW (MOSA WORKFLOW BENTO CARD)
        =================================================================== */}
        <section
          id="scene-section-3"
          className="h-[125vh] w-full flex flex-col justify-end px-6 md:px-14 pb-16"
        >
          <SpotlightCard
            className={`max-w-md transition-all duration-500 p-6 rounded-[10px] bg-[#0c1524]/92 border border-[#304766]/50 shadow-2xl pointer-events-auto ${
              activeScene === 3
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-6'
            }`}
          >
            <div className="text-xs font-mono text-[#f3e5ab] mb-2 flex items-center gap-1.5">
              <span className="text-[#d4af37]">•</span>
              <DecryptedText
                text="Disassembly Sequence"
                speed={30}
                trigger={activeScene === 3}
              />
            </div>
            <h2 className="text-3xl md:text-4xl font-normal tracking-[-0.025em] leading-[1.1] text-[#f8fafc]">
              Every detail.{' '}
              <span className="text-[#94a3b8]">By design.</span>
            </h2>

            {/* Mosa-Style Inner Framed Workflow Steps */}
            <div className="mt-5 space-y-2">
              <div className="px-3.5 py-2 rounded-[6px] bg-[#080d16]/85 border border-[#304766]/40 flex items-center justify-between text-xs font-mono">
                <span className="text-[#cbd5e1]">
                  ✦ 01. Nose & Flight Deck (+Z)
                </span>
                <span className="px-2.5 py-0.5 rounded-[4px] bg-[#d4af37] text-[#060b13] font-semibold text-[10px]">
                  Unfold
                </span>
              </div>
              <div className="px-3.5 py-2 rounded-[6px] bg-[#080d16]/85 border border-[#304766]/40 flex items-center justify-between text-xs font-mono">
                <span className="text-[#cbd5e1]">
                  ✦ 02. Upper Crown & Wings (±X)
                </span>
                <span className="px-2.5 py-0.5 rounded-[4px] bg-[#d4af37] text-[#060b13] font-semibold text-[10px]">
                  Separate
                </span>
              </div>
              <div className="px-3.5 py-2 rounded-[6px] bg-[#080d16]/85 border border-[#304766]/40 flex items-center justify-between text-xs font-mono">
                <span className="text-[#cbd5e1]">
                  ✦ 03. Twin Turbofans & T-Tail
                </span>
                <span className="px-2.5 py-0.5 rounded-[4px] bg-[#d4af37] text-[#060b13] font-semibold text-[10px]">
                  Inspect
                </span>
              </div>
            </div>

            <p className="mt-4 text-xs md:text-sm text-[#cbd5e1] leading-relaxed">
              {SCENES_METADATA[2].supporting}
            </p>
          </SpotlightCard>
        </section>

        {/* ===================================================================
            SCENE 04: THE FUSELAGE OPENS (CUTAWAY REVEAL)
        =================================================================== */}
        <section
          id="scene-section-4"
          className="h-[115vh] w-full flex items-end justify-end px-6 md:px-14 pb-28"
        >
          <SpotlightCard
            className={`max-w-lg transition-all duration-500 p-7 rounded-[10px] bg-[#0c1524]/92 border border-[#304766]/50 shadow-2xl pointer-events-auto ${
              activeScene === 4
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-6'
            }`}
          >
            <div className="text-xs font-mono text-[#f3e5ab] mb-2 flex items-center gap-1.5">
              <span className="text-[#d4af37]">•</span>
              <DecryptedText
                text="Structural Cutaway"
                speed={30}
                trigger={activeScene === 4}
              />
            </div>
            <h2 className="text-3xl md:text-4xl font-normal tracking-[-0.025em] leading-[1.1] text-[#f8fafc]">
              Inside the{' '}
              <span className="text-[#94a3b8]">extraordinary.</span>
            </h2>
            <p className="mt-3 text-sm text-[#cbd5e1] leading-relaxed">
              {SCENES_METADATA[3].supporting}
            </p>
          </SpotlightCard>
        </section>

        {/* ===================================================================
            SCENE 05: THE CABIN AND SEATS REVEAL (MATCHES SCREENSHOT 3 CTA)
        =================================================================== */}
        <section
          id="scene-section-5"
          className="h-[125vh] w-full flex flex-col justify-start items-center px-6 md:px-14 pt-20"
        >
          <SpotlightCard
            className={`max-w-xl text-center transition-all duration-500 px-8 py-6 rounded-[10px] bg-[#0c1524]/92 border border-[#304766]/50 shadow-2xl pointer-events-auto ${
              activeScene === 5
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 -translate-y-4'
            }`}
          >
            <div className="text-xs font-mono text-[#f3e5ab] mb-2 flex items-center justify-center gap-1.5">
              <span className="text-[#d4af37]">•</span>
              <DecryptedText
                text="Begin Your Journey"
                speed={30}
                trigger={activeScene === 5}
              />
            </div>
            <h2 className="text-4xl md:text-5xl font-normal tracking-[-0.03em] leading-[1.08] text-[#f8fafc]">
              Designed{' '}
              <span className="text-[#94a3b8]">around you.</span>
            </h2>
            <p className="mt-3 text-xs md:text-sm text-[#cbd5e1] max-w-md mx-auto leading-relaxed">
              {SCENES_METADATA[4].supporting} Click any of the 30 seats below or
              open the live reservation manifest.
            </p>

            {/* Centered Split Dual CTA Box (Option 2: Antique Gold + Steel Blue) */}
            <div className="mt-5 inline-flex items-center rounded-[5px] border border-[#d4af37]/40 overflow-hidden shadow-[0_8px_30px_rgba(212,175,55,0.18)] pointer-events-auto">
              <button
                onClick={() => setExternalModalRequest('reserve')}
                className="px-5 py-2.5 bg-gradient-to-r from-[#d4af37] via-[#f3e5ab] to-[#c5a059] hover:brightness-110 text-[#060b13] font-mono text-xs font-semibold uppercase tracking-[0.12em] transition-all cursor-pointer"
              >
                RESERVE SEAT ›
              </button>
              <button
                onClick={() => setExternalModalRequest('passes')}
                className="px-5 py-2.5 bg-[#0c1624]/90 hover:bg-[#142338] text-[#f8fafc] font-mono text-xs uppercase tracking-[0.12em] transition-colors cursor-pointer border-l border-[#d4af37]/30"
              >
                BOARDING PASSES ›
              </button>
            </div>
          </SpotlightCard>
        </section>
      </main>
    </div>
  );
};

export default App;
