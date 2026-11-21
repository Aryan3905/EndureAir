import React from 'react';

interface LoadingScreenProps {
  modelReady: boolean;
  inspectedNodeCount: number;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = React.memo(
  ({ modelReady, inspectedNodeCount }) => {
    if (modelReady) return null;

    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#060b13] text-[#f8fafc] pointer-events-none">
        <div className="relative flex flex-col items-center max-w-md w-full px-8 border border-[#304766]/50 bg-[#0c1524] py-10 shadow-2xl rounded-[6px]">
          <div className="text-[11px] font-mono uppercase tracking-[0.28em] text-[#d4af37] mb-3">
            • ENDURE AIR // WEBGL 3D ENGINE
          </div>
          <h1 className="text-2xl md:text-3xl font-normal tracking-tight text-[#f8fafc] mb-6 text-center">
            Initializing Aerostructure Assembly
          </h1>

          <div className="w-full h-[2px] bg-[#1a2b3d] overflow-hidden mb-4 rounded-full">
            <div className="h-full w-3/4 bg-gradient-to-r from-[#d4af37] via-[#f3e5ab] to-[#d4af37] animate-pulse" />
          </div>

          <div className="w-full flex items-center justify-between text-[11px] font-mono text-[#94a3b8]">
            <span>LOADING GLB HIERARCHY ({inspectedNodeCount || 16} NODES)...</span>
            <span className="text-[#f3e5ab] font-semibold">READY</span>
          </div>
        </div>
      </div>
    );
  }
);
