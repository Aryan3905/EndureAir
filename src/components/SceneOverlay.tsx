import React, { useEffect, useState } from 'react';
import { SCENES_METADATA } from '../config/animationConfig';
import { SeatRecord } from './CabinInterior';
import { setLenisPaused } from './ScrollController';
import { TiltedCard } from './reactbits/TiltedCard';
import { SpotlightCard } from './reactbits/SpotlightCard';
import { CountUp } from './reactbits/CountUp';

export interface BookingRecord {
  id: number;
  seat_number: string;
  passenger_name: string;
  passenger_email?: string;
  seat_class: string;
  seat_type?: string;
  price: number;
  meal?: string;
  baggage?: string;
  booked_at: string;
}

interface SceneOverlayProps {
  activeScene: number;
  seats: SeatRecord[];
  bookings: BookingRecord[];
  selectedSeatNumber: string | null;
  onSelectSeat: (seatNumber: string) => void;
  onScrollToScene: (sceneIndex: number) => void;
  onRefreshData: () => Promise<void>;
  onDirectDataUpdate: (
    newSeats?: SeatRecord[],
    newBookings?: BookingRecord[]
  ) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  externalModalRequest?: 'none' | 'reserve' | 'passes' | 'adminLogin' | null;
  onClearExternalModal?: () => void;
}

export const getSeatType = (seatNum: string | number): 'Window' | 'Aisle' | 'Middle' => {
  const n = Number(seatNum);
  const col = ((n - 1) % 6) + 1;
  if (col === 1 || col === 6) return 'Window';
  if (col === 3 || col === 4) return 'Aisle';
  return 'Middle';
};

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AdminLoginModal: React.FC<AdminLoginModalProps> = React.memo(
  ({ isOpen, onClose, onSuccess }) => {
    const [adminUser, setAdminUser] = useState('');
    const [adminPass, setAdminPass] = useState('');
    const [adminError, setAdminError] = useState('');

    if (!isOpen) return null;

    const handleAdminLoginSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (adminUser.trim() === 'admin' && adminPass === 'admin123') {
        setAdminError('');
        onSuccess();
      } else {
        setAdminError(
          'Invalid credentials. Please enter username: admin / password: admin123'
        );
      }
    };

    return (
      <div
        data-lenis-prevent
        className="fixed inset-0 z-50 flex items-center justify-center bg-[#060b13]/85 p-4 backdrop-blur-md modal-backdrop-animate"
      >
        <div className="w-full max-w-md rounded-[12px] bg-[#0c1524] border border-[#304766]/60 shadow-[0_20px_60px_rgba(0,0,0,0.85)] p-7 text-[#f8fafc] modal-card-animate">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#d4af37] animate-pulse" />
              <span className="text-xs font-mono text-[#d4af37] font-semibold tracking-wider uppercase">
                Security Gate
              </span>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-[#142338]/60 hover:bg-[#1a2d45] flex items-center justify-center text-xs text-[#94a3b8] hover:text-white cursor-pointer btn-smooth"
            >
              ✕
            </button>
          </div>

          <h2 className="text-2xl font-light tracking-tight mb-1 text-[#f8fafc]">
            Admin Authentication
          </h2>
          <p className="text-xs text-[#94a3b8] mb-6">
            Enter administrator credentials to access live MySQL 8.0 cabin controls.
          </p>

          <form onSubmit={handleAdminLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-[#94a3b8] mb-1.5 font-medium">
                Username
              </label>
              <input
                type="text"
                required
                autoFocus
                value={adminUser}
                onChange={(e) => setAdminUser(e.target.value)}
                placeholder="Administrator ID (admin)"
                className="w-full px-4 py-3 rounded-[6px] bg-[#060b13]/90 border border-[#304766]/60 text-sm text-[#f8fafc] placeholder-[#64748b] focus:outline-none focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37]/40 input-smooth font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-[#94a3b8] mb-1.5 font-medium">
                Password
              </label>
              <input
                type="password"
                required
                value={adminPass}
                onChange={(e) => setAdminPass(e.target.value)}
                placeholder="•••••••• (admin123)"
                className="w-full px-4 py-3 rounded-[6px] bg-[#060b13]/90 border border-[#304766]/60 text-sm text-[#f8fafc] placeholder-[#64748b] focus:outline-none focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37]/40 input-smooth font-mono"
              />
            </div>

            {adminError && (
              <div className="p-3.5 rounded-[6px] bg-rose-950/80 border border-rose-500/50 text-xs font-mono text-rose-200 animate-fadeIn">
                {adminError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3.5 rounded-[6px] bg-gradient-to-r from-[#d4af37] via-[#f3e5ab] to-[#c5a059] text-xs font-mono font-bold uppercase tracking-widest text-[#060b13] cursor-pointer shadow-lg shadow-[#d4af37]/25 btn-smooth mt-2"
            >
              Unlock Admin Console ›
            </button>
          </form>
        </div>
      </div>
    );
  }
);

export const SceneOverlay: React.FC<SceneOverlayProps> = React.memo(
  ({
    activeScene,
    seats,
    bookings,
    selectedSeatNumber,
    onSelectSeat,
    onScrollToScene,
    onRefreshData,
    onDirectDataUpdate,
    theme,
    onToggleTheme,
    externalModalRequest,
    onClearExternalModal,
  }) => {
    const [activeModal, setActiveModal] = useState<
      'none' | 'reserve' | 'passes' | 'adminLogin' | 'adminPanel'
    >('none');

    const [passengerName, setPassengerName] = useState('');
    const [passengerEmail, setPassengerEmail] = useState('');
    const [mealType, setMealType] = useState('Royal Indian Vegetarian Thali');
    const [baggageTier, setBaggageTier] = useState('CHECKIN_15KG');
    const [bookingStatus, setBookingStatus] = useState<{
      type: 'idle' | 'loading' | 'success' | 'error';
      message: string;
    }>({ type: 'idle', message: '' });

    const [adminActionMsg, setAdminActionMsg] = useState('');

    useEffect(() => {
      if (externalModalRequest && externalModalRequest !== 'none') {
        setActiveModal(externalModalRequest);
        onClearExternalModal?.();
      }
    }, [externalModalRequest, onClearExternalModal]);

    useEffect(() => {
      setLenisPaused(activeModal !== 'none');
      return () => setLenisPaused(false);
    }, [activeModal]);

    const selectedSeatObj =
      seats.find(
        (s) => String(s.seat_number).padStart(2, '0') === selectedSeatNumber
      ) || null;

    const availableCount = seats.filter((s) => !s.is_booked).length;
    const bookedCount = seats.length - availableCount;

    const handleOpenAdmin = () => {
      setActiveModal('adminLogin');
    };

    const handleBookSeat = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedSeatNumber) {
        setBookingStatus({
          type: 'error',
          message: 'Please select a seat (#01–#30).',
        });
        return;
      }
      if (!passengerName.trim()) {
        setBookingStatus({
          type: 'error',
          message: 'Please enter passenger full name.',
        });
        return;
      }

      setBookingStatus({
        type: 'loading',
        message: 'Confirming reservation in MySQL 8.0...',
      });
      try {
        const res = await fetch('/api/book', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            seat_number: selectedSeatNumber,
            passenger_name: passengerName.trim(),
            passenger_email: passengerEmail.trim() || `${passengerName.trim().toLowerCase().replace(/[^a-z0-9]/g, '.')}@endureair.in`,
            meal_type: mealType,
            baggage_tier: baggageTier,
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || 'Booking failed');
        }
        setBookingStatus({
          type: 'success',
          message: `Seat #${selectedSeatNumber} reserved in MySQL for ${passengerName.trim()} with ${mealType}!`,
        });
        setPassengerName('');
        setPassengerEmail('');
        if (data.seats && data.bookings) {
          onDirectDataUpdate(data.seats, data.bookings);
        } else {
          await onRefreshData();
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Database error';
        setBookingStatus({ type: 'error', message: msg });
      }
    };

    const handleCancelSeat = async (seatNum: string) => {
      const targetNum = String(seatNum).padStart(2, '0');
      // Instant optimistic UI update for buttery-smooth responsiveness
      const updatedSeats = seats.map((s) =>
        String(s.seat_number).padStart(2, '0') === targetNum
          ? { ...s, is_booked: 0, status: 'AVAILABLE', passenger_name: null }
          : s
      );
      const updatedBookings = bookings.filter(
        (b) => String(b.seat_number).padStart(2, '0') !== targetNum
      );
      onDirectDataUpdate(updatedSeats, updatedBookings);
      setAdminActionMsg(`Releasing Seat #${targetNum} in MySQL...`);

      try {
        const res = await fetch('/api/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seat_number: Number(seatNum) }),
        });
        const data = await res.json();
        if (res.ok) {
          setAdminActionMsg(`Seat #${targetNum} successfully released to AVAILABLE in MySQL.`);
          if (data.seats && data.bookings) {
            onDirectDataUpdate(data.seats, data.bookings);
          } else {
            await onRefreshData();
          }
        } else {
          setAdminActionMsg(data.error || 'Failed to release seat in database.');
          await onRefreshData();
        }
      } catch {
        setAdminActionMsg('Network error while releasing seat.');
        await onRefreshData();
      }
    };

    const handleResetAllSeats = async () => {
      try {
        const res = await fetch('/api/reset', { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          setAdminActionMsg('All 30 seats reset to AVAILABLE in MySQL 8.0.');
          if (data.seats && data.bookings) {
            onDirectDataUpdate(data.seats, data.bookings);
          } else {
            await onRefreshData();
          }
        }
      } catch {
        setAdminActionMsg('Failed to reset database.');
      }
    };

    return (
      <>
        {/* =====================================================================
            MINIMALIST TOP NAVIGATION BAR (STEEL BLUE, PEARL WHITE, ANTIQUE GOLD)
        ===================================================================== */}
        <header className="fixed top-0 left-0 right-0 z-40 px-6 md:px-12 py-5 flex items-center justify-between pointer-events-auto">
          {/* Top-Left Concentric Geometric Emblem + Monospace Brand */}
          <button
            onClick={() => {
              setActiveModal('none');
              onScrollToScene(1);
            }}
            className="flex items-center gap-3 text-left group cursor-pointer"
          >
            <div className="w-7 h-7 rounded-full border border-[#d4af37]/80 flex items-center justify-center bg-[#0c1524]/80 group-hover:border-[#f3e5ab] transition-colors shadow-[0_0_12px_rgba(212,175,55,0.25)]">
              <div className="w-3.5 h-3.5 rounded-full border border-[#d4af37]/60 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-[#d4af37]" />
              </div>
            </div>
            <span className="font-mono text-sm md:text-base font-medium tracking-[0.22em] uppercase text-[#f8fafc] group-hover:text-white transition-colors">
              ENDURE AIR
            </span>
          </button>

          {/* Right Grouped Segmented Nav Box + Split Gold/Steel Action Box */}
          <div className="flex items-center gap-3">
            {/* Segmented Navigation Box in Deep Steel Blue Glass */}
            <nav className="hidden md:flex items-center rounded-[6px] border border-[#304766]/50 bg-[#0b1422]/90 divide-x divide-[#304766]/40 overflow-hidden shadow-lg backdrop-blur-md">
              <button
                onClick={() => {
                  setActiveModal('none');
                  onScrollToScene(1);
                }}
                className={`px-4 py-2 font-mono text-xs tracking-wide cursor-pointer btn-smooth ${
                  activeScene <= 2 && activeModal === 'none'
                    ? 'text-[#f3e5ab] bg-[#1a2d45] font-semibold border-b border-[#d4af37]/70'
                    : 'text-[#cbd5e1] hover:text-[#f8fafc] hover:bg-[#142338]/60'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => {
                  setActiveModal('none');
                  onScrollToScene(5);
                }}
                className={`px-4 py-2 font-mono text-xs tracking-wide cursor-pointer btn-smooth ${
                  activeScene === 5 && activeModal === 'none'
                    ? 'text-[#f3e5ab] bg-[#1a2d45] font-semibold border-b border-[#d4af37]/70'
                    : 'text-[#cbd5e1] hover:text-[#f8fafc] hover:bg-[#142338]/60'
                }`}
              >
                Cabin
              </button>
              <button
                onClick={() => setActiveModal('passes')}
                className={`px-4 py-2 font-mono text-xs tracking-wide cursor-pointer btn-smooth ${
                  activeModal === 'passes'
                    ? 'text-[#f3e5ab] bg-[#1a2d45] font-semibold border-b border-[#d4af37]/70'
                    : 'text-[#cbd5e1] hover:text-[#f8fafc] hover:bg-[#142338]/60'
                }`}
              >
                Passes ({bookings.length})
              </button>
              <button
                onClick={onToggleTheme}
                title="Toggle Atmosphere Mode"
                className="px-3 py-2 font-mono text-xs text-[#cbd5e1] hover:text-[#f8fafc] hover:bg-[#142338]/60 cursor-pointer btn-smooth"
              >
                {theme === 'dark' ? 'Day' : 'Night'}
              </button>
            </nav>

            {/* Split Dual CTA Box (Antique Gold + Steel Blue) */}
            <div className="inline-flex items-center rounded-[6px] border border-[#d4af37]/40 overflow-hidden shadow-[0_6px_25px_rgba(212,175,55,0.2)]">
              <button
                onClick={() => setActiveModal('reserve')}
                className="px-4 py-2 bg-gradient-to-r from-[#d4af37] via-[#f3e5ab] to-[#c5a059] text-[#060b13] font-mono text-xs font-semibold tracking-wide cursor-pointer flex items-center gap-1.5 btn-smooth"
              >
                <span>Reserve</span>
                <span className="text-[10px]">›</span>
              </button>
              <button
                onClick={handleOpenAdmin}
                className="px-4 py-2 bg-[#0c1624]/90 hover:bg-[#142338] text-[#f8fafc] font-mono text-xs uppercase tracking-wider cursor-pointer border-l border-[#d4af37]/30 btn-smooth"
              >
                ADMIN
              </button>
            </div>
          </div>
        </header>

        {/* =====================================================================
            RIGHT-SIDE MINIMALIST SCENE PROGRESS RAIL (01 - 05)
        ===================================================================== */}
        <aside className="fixed right-6 top-1/2 -translate-y-1/2 z-30 hidden md:flex flex-col items-end gap-3 pointer-events-auto">
          {SCENES_METADATA.map((s) => {
            const isCurrent = activeScene === s.index;
            return (
              <button
                key={s.id}
                onClick={() => onScrollToScene(s.index)}
                className="group flex items-center gap-2.5 cursor-pointer py-0.5"
                title={`Jump to Scene 0${s.index}`}
              >
                <span
                  className={`text-[10px] font-mono tracking-widest transition-opacity ${
                    isCurrent
                      ? 'text-[#f3e5ab] opacity-100 font-bold'
                      : 'text-[#64748b] opacity-0 group-hover:opacity-100'
                  }`}
                >
                  0{s.index}
                </span>
                <span
                  className={`h-[1.5px] transition-all duration-200 ${
                    isCurrent
                      ? 'w-6 bg-[#d4af37] shadow-[0_0_8px_#d4af37]'
                      : 'w-2.5 bg-[#385173]/50 group-hover:bg-[#d4af37]/60'
                  }`}
                />
              </button>
            );
          })}
          <div
            id="scroll-progress-label"
            className="mt-2 text-[10px] font-mono text-[#f3e5ab] font-medium"
          >
            0%
          </div>
        </aside>

        {/* =====================================================================
            FLOATING CABIN SEAT QUICK-ACTION BAR (VISIBLE IN SCENE 04 & 05)
        ===================================================================== */}
        {(activeScene === 4 || activeScene === 5) && activeModal === 'none' && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 w-[94%] max-w-3xl px-5 py-3.5 rounded-[8px] bg-[#0c1624]/95 border border-[#304766]/60 shadow-[0_12px_40px_rgba(0,0,0,0.7)] flex flex-col sm:flex-row items-center justify-between gap-4 pointer-events-auto backdrop-blur-md">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-[#d4af37] shadow-[0_0_8px_#d4af37]" />
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#d4af37] font-medium">
                  • 30-SEAT CABIN INTERIOR — CLICK ANY SEAT IN 3D
                </div>
                <div className="text-sm font-normal text-[#f8fafc] mt-0.5">
                  {selectedSeatObj ? (
                    <>
                      Seat{' '}
                      <span className="font-mono font-bold text-[#f3e5ab]">
                        #{selectedSeatNumber}
                      </span>{' '}
                      <span className="text-[#94a3b8]">
                        ({selectedSeatObj.seat_class} • {selectedSeatObj.seat_type || getSeatType(selectedSeatNumber || '1')} • ₹{selectedSeatObj.price.toLocaleString('en-IN')})
                      </span>{' '}
                      —{' '}
                      <span
                        className={
                          selectedSeatObj.is_booked
                            ? 'text-rose-400 font-mono text-xs font-medium'
                            : 'text-[#f3e5ab] font-mono text-xs font-medium'
                        }
                      >
                        {selectedSeatObj.is_booked
                          ? `BOOKED (${selectedSeatObj.passenger_name || 'Reserved'})`
                          : 'AVAILABLE'}
                      </span>
                    </>
                  ) : (
                    'Select any passenger seat (#01–#30) to inspect or book in MySQL'
                  )}
                </div>
              </div>
            </div>

            <div className="inline-flex items-center rounded-[6px] border border-[#d4af37]/40 overflow-hidden shrink-0 shadow-lg">
              <button
                onClick={() => setActiveModal('reserve')}
                className="px-4 py-2 bg-gradient-to-r from-[#d4af37] via-[#f3e5ab] to-[#c5a059] text-[#060b13] font-mono text-xs font-semibold tracking-wide cursor-pointer whitespace-nowrap btn-smooth"
              >
                {selectedSeatObj && !selectedSeatObj.is_booked
                  ? `Book Seat #${selectedSeatNumber} ›`
                  : 'Open Seat Map ›'}
              </button>
              <button
                onClick={() => setActiveModal('passes')}
                className="px-3.5 py-2 bg-[#0c1624] hover:bg-[#152438] text-[#f8fafc] font-mono text-xs tracking-wide cursor-pointer border-l border-[#d4af37]/30 whitespace-nowrap btn-smooth"
              >
                Passes ({bookings.length})
              </button>
            </div>
          </div>
        )}

        {/* =====================================================================
            DEDICATED MODAL 1: RESERVE SEAT (#01-#30 LIVE MYSQL WORKBENCH)
        ===================================================================== */}
        {activeModal === 'reserve' && (
          <div
            data-lenis-prevent
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#060b13]/85 p-3 md:p-6 backdrop-blur-md modal-backdrop-animate overflow-y-auto"
          >
            <div className="w-full max-w-5xl rounded-[14px] bg-[#0c1524] border border-[#304766]/60 shadow-[0_25px_70px_rgba(0,0,0,0.85)] p-5 md:p-7 text-[#f8fafc] max-h-[92vh] overflow-y-auto modal-card-animate">
              {/* Modal Top Header */}
              <div className="flex items-center justify-between mb-5 pb-4 border-b border-[#304766]/40">
                <div>
                  <div className="text-xs font-mono text-[#d4af37] mb-1 font-medium flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#d4af37] animate-pulse" />
                    <span>• NIRVANA CRJ-900 AIRLINER CABIN RESERVATION</span>
                  </div>
                  <h2 className="text-2xl md:text-3xl font-light tracking-tight text-[#f8fafc]">
                    Select Your Cabin Seat{' '}
                    <span className="text-[#94a3b8] text-xl font-normal">(30 Seats • 5 Rows)</span>
                  </h2>
                </div>
                <button
                  onClick={() => setActiveModal('none')}
                  className="px-4 py-2 rounded-[6px] bg-[#142338]/80 hover:bg-[#1c324e] border border-[#304766]/60 text-xs font-mono uppercase text-[#cbd5e1] hover:text-white cursor-pointer btn-smooth"
                >
                  ✕ Close
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* =============================================================
                    LEFT 7 COLS: UNCLUSTERED LUXURY 3D CABIN SEATING PLAN
                ============================================================= */}
                <div className="lg:col-span-7 p-4 sm:p-5 rounded-[10px] bg-[#080e18] border border-[#304766]/40">
                  {/* Cabin Top Flight Deck Direction & Legend */}
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-[#94a3b8] mb-4 pb-3 border-b border-[#304766]/30">
                    <div className="flex items-center gap-2 text-[#f3e5ab] font-medium text-[11px]">
                      <span className="text-[#d4af37]">▲</span> FRONT COCKPIT & FLIGHT DECK
                    </div>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-[3px] bg-[#385173] inline-block border border-[#60a5fa]/40" />
                        Available
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-[3px] bg-rose-600 inline-block" />
                        Booked
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-[3px] bg-gradient-to-r from-[#d4af37] to-[#f3e5ab] inline-block shadow-sm shadow-[#d4af37]" />
                        Selected
                      </span>
                    </div>
                  </div>

                  {/* Column Letter Badges above Seating Grid */}
                  <div className="flex items-center justify-between text-[10px] font-mono font-medium text-[#94a3b8] mb-2 px-1">
                    <div className="grid grid-cols-3 gap-2 flex-1 text-center">
                      <span className="text-[#f3e5ab]">A (Win)</span>
                      <span>B (Mid)</span>
                      <span className="text-[#93c5fd]">C (Ais)</span>
                    </div>
                    <div className="w-10 text-center font-bold text-[#d4af37] text-[9px] tracking-wider">
                      AISLE
                    </div>
                    <div className="grid grid-cols-3 gap-2 flex-1 text-center">
                      <span className="text-[#93c5fd]">D (Ais)</span>
                      <span>E (Mid)</span>
                      <span className="text-[#f3e5ab]">F (Win)</span>
                    </div>
                  </div>

                  {/* Cabin Class Header: Executive Business */}
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#d4af37] font-semibold flex items-center gap-1.5">
                      <span>👑</span> Executive Business Suite (Rows 01–02)
                    </span>
                    <span className="text-[10px] font-mono text-[#94a3b8]">From ₹13,000</span>
                  </div>

                  {/* The 5 Cabin Rows with Central Walkway Aisle */}
                  <div className="space-y-2.5">
                    {[
                      { row: 1, label: '01', left: ['01', '02', '03'], right: ['04', '05', '06'] },
                      { row: 2, label: '02', left: ['07', '08', '09'], right: ['10', '11', '12'] },
                    ].map((r) => (
                      <div key={r.label} className="flex items-center gap-2">
                        {/* Left Bank: A, B, C */}
                        <div className="grid grid-cols-3 gap-2 flex-1">
                          {r.left.map((num) => {
                            const s = seats.find((st) => String(st.seat_number).padStart(2, '0') === num);
                            if (!s) return null;
                            const isBooked = Boolean(s.is_booked);
                            const isSelected = selectedSeatNumber === num;
                            const seatType = s.seat_type || getSeatType(num);
                            return (
                              <button
                                key={num}
                                type="button"
                                onClick={() => {
                                  onSelectSeat(num);
                                  setBookingStatus({ type: 'idle', message: '' });
                                }}
                                className={`relative p-2.5 rounded-[8px] border text-left cursor-pointer btn-smooth flex flex-col justify-between h-[64px] transition-all ${
                                  isSelected
                                    ? 'bg-gradient-to-r from-[#d4af37] via-[#f3e5ab] to-[#c5a059] text-[#060b13] border-[#f3e5ab] shadow-lg shadow-[#d4af37]/35 ring-2 ring-[#f3e5ab] scale-[1.03]'
                                    : isBooked
                                    ? 'bg-rose-950/45 border-rose-500/35 text-rose-200/90 hover:bg-rose-900/50'
                                    : 'bg-[#101b2b] hover:bg-[#16273e] border-[#d4af37]/45 text-[#f3e5ab]'
                                }`}
                              >
                                <div className="flex items-center justify-between w-full">
                                  <span className="font-mono font-bold text-xs">#{num}</span>
                                  <span
                                    className={`text-[8px] font-mono font-bold px-1.5 py-0.2 rounded ${
                                      isSelected
                                        ? 'bg-[#060b13] text-[#d4af37]'
                                        : seatType === 'Window'
                                        ? 'bg-[#d4af37]/25 text-[#f3e5ab] border border-[#d4af37]/40'
                                        : seatType === 'Aisle'
                                        ? 'bg-sky-500/20 text-sky-200 border border-sky-500/30'
                                        : 'bg-slate-700/40 text-slate-300'
                                    }`}
                                  >
                                    {seatType === 'Window' ? 'WIN' : seatType === 'Aisle' ? 'AIS' : 'MID'}
                                  </span>
                                </div>
                                <div className="flex items-baseline justify-between w-full mt-1">
                                  <span className={`text-xs font-mono font-bold ${isSelected ? 'text-[#060b13]' : 'text-[#f8fafc]'}`}>
                                    ₹{s.price.toLocaleString('en-IN')}
                                  </span>
                                  <span className={`text-[8px] font-mono tracking-tight uppercase ${isSelected ? 'text-[#060b13] font-bold' : isBooked ? 'text-rose-400 font-semibold' : 'text-[#94a3b8]'}`}>
                                    {isBooked ? 'RESV' : 'OPEN'}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {/* Central Walkway Aisle Pillar */}
                        <div className="w-10 flex flex-col items-center justify-center text-center">
                          <span className="text-[10px] font-mono text-[#64748b] font-bold">R{r.label}</span>
                          <span className="text-[9px] text-[#334155]">│</span>
                        </div>

                        {/* Right Bank: D, E, F */}
                        <div className="grid grid-cols-3 gap-2 flex-1">
                          {r.right.map((num) => {
                            const s = seats.find((st) => String(st.seat_number).padStart(2, '0') === num);
                            if (!s) return null;
                            const isBooked = Boolean(s.is_booked);
                            const isSelected = selectedSeatNumber === num;
                            const seatType = s.seat_type || getSeatType(num);
                            return (
                              <button
                                key={num}
                                type="button"
                                onClick={() => {
                                  onSelectSeat(num);
                                  setBookingStatus({ type: 'idle', message: '' });
                                }}
                                className={`relative p-2.5 rounded-[8px] border text-left cursor-pointer btn-smooth flex flex-col justify-between h-[64px] transition-all ${
                                  isSelected
                                    ? 'bg-gradient-to-r from-[#d4af37] via-[#f3e5ab] to-[#c5a059] text-[#060b13] border-[#f3e5ab] shadow-lg shadow-[#d4af37]/35 ring-2 ring-[#f3e5ab] scale-[1.03]'
                                    : isBooked
                                    ? 'bg-rose-950/45 border-rose-500/35 text-rose-200/90 hover:bg-rose-900/50'
                                    : 'bg-[#101b2b] hover:bg-[#16273e] border-[#d4af37]/45 text-[#f3e5ab]'
                                }`}
                              >
                                <div className="flex items-center justify-between w-full">
                                  <span className="font-mono font-bold text-xs">#{num}</span>
                                  <span
                                    className={`text-[8px] font-mono font-bold px-1.5 py-0.2 rounded ${
                                      isSelected
                                        ? 'bg-[#060b13] text-[#d4af37]'
                                        : seatType === 'Window'
                                        ? 'bg-[#d4af37]/25 text-[#f3e5ab] border border-[#d4af37]/40'
                                        : seatType === 'Aisle'
                                        ? 'bg-sky-500/20 text-sky-200 border border-sky-500/30'
                                        : 'bg-slate-700/40 text-slate-300'
                                    }`}
                                  >
                                    {seatType === 'Window' ? 'WIN' : seatType === 'Aisle' ? 'AIS' : 'MID'}
                                  </span>
                                </div>
                                <div className="flex items-baseline justify-between w-full mt-1">
                                  <span className={`text-xs font-mono font-bold ${isSelected ? 'text-[#060b13]' : 'text-[#f8fafc]'}`}>
                                    ₹{s.price.toLocaleString('en-IN')}
                                  </span>
                                  <span className={`text-[8px] font-mono tracking-tight uppercase ${isSelected ? 'text-[#060b13] font-bold' : isBooked ? 'text-rose-400 font-semibold' : 'text-[#94a3b8]'}`}>
                                    {isBooked ? 'RESV' : 'OPEN'}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {/* Cabin Class Divider */}
                    <div className="py-2 flex items-center gap-3">
                      <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-[#304766]/60 to-transparent" />
                      <span className="text-[10px] font-mono uppercase tracking-widest text-[#94a3b8] bg-[#0c1524] px-3 py-1 rounded-full border border-[#304766]/50">
                        ✈️ Main Cabin • Economy Class (Rows 03–05)
                      </span>
                      <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-[#304766]/60 to-transparent" />
                    </div>

                    {[
                      { row: 3, label: '03', left: ['13', '14', '15'], right: ['16', '17', '18'] },
                      { row: 4, label: '04', left: ['19', '20', '21'], right: ['22', '23', '24'] },
                      { row: 5, label: '05', left: ['25', '26', '27'], right: ['28', '29', '30'] },
                    ].map((r) => (
                      <div key={r.label} className="flex items-center gap-2">
                        {/* Left Bank: A, B, C */}
                        <div className="grid grid-cols-3 gap-2 flex-1">
                          {r.left.map((num) => {
                            const s = seats.find((st) => String(st.seat_number).padStart(2, '0') === num);
                            if (!s) return null;
                            const isBooked = Boolean(s.is_booked);
                            const isSelected = selectedSeatNumber === num;
                            const seatType = s.seat_type || getSeatType(num);
                            return (
                              <button
                                key={num}
                                type="button"
                                onClick={() => {
                                  onSelectSeat(num);
                                  setBookingStatus({ type: 'idle', message: '' });
                                }}
                                className={`relative p-2.5 rounded-[8px] border text-left cursor-pointer btn-smooth flex flex-col justify-between h-[64px] transition-all ${
                                  isSelected
                                    ? 'bg-gradient-to-r from-[#d4af37] via-[#f3e5ab] to-[#c5a059] text-[#060b13] border-[#f3e5ab] shadow-lg shadow-[#d4af37]/35 ring-2 ring-[#f3e5ab] scale-[1.03]'
                                    : isBooked
                                    ? 'bg-rose-950/45 border-rose-500/35 text-rose-200/90 hover:bg-rose-900/50'
                                    : 'bg-[#09121f] hover:bg-[#122033] border-[#304766]/50 text-[#cbd5e1]'
                                }`}
                              >
                                <div className="flex items-center justify-between w-full">
                                  <span className="font-mono font-bold text-xs">#{num}</span>
                                  <span
                                    className={`text-[8px] font-mono font-bold px-1.5 py-0.2 rounded ${
                                      isSelected
                                        ? 'bg-[#060b13] text-[#d4af37]'
                                        : seatType === 'Window'
                                        ? 'bg-[#d4af37]/25 text-[#f3e5ab] border border-[#d4af37]/40'
                                        : seatType === 'Aisle'
                                        ? 'bg-sky-500/20 text-sky-200 border border-sky-500/30'
                                        : 'bg-slate-700/40 text-slate-300'
                                    }`}
                                  >
                                    {seatType === 'Window' ? 'WIN' : seatType === 'Aisle' ? 'AIS' : 'MID'}
                                  </span>
                                </div>
                                <div className="flex items-baseline justify-between w-full mt-1">
                                  <span className={`text-xs font-mono font-bold ${isSelected ? 'text-[#060b13]' : 'text-[#f8fafc]'}`}>
                                    ₹{s.price.toLocaleString('en-IN')}
                                  </span>
                                  <span className={`text-[8px] font-mono tracking-tight uppercase ${isSelected ? 'text-[#060b13] font-bold' : isBooked ? 'text-rose-400 font-semibold' : 'text-[#94a3b8]'}`}>
                                    {isBooked ? 'RESV' : 'OPEN'}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {/* Central Walkway Aisle Pillar */}
                        <div className="w-10 flex flex-col items-center justify-center text-center">
                          <span className="text-[10px] font-mono text-[#64748b] font-bold">R{r.label}</span>
                          <span className="text-[9px] text-[#334155]">│</span>
                        </div>

                        {/* Right Bank: D, E, F */}
                        <div className="grid grid-cols-3 gap-2 flex-1">
                          {r.right.map((num) => {
                            const s = seats.find((st) => String(st.seat_number).padStart(2, '0') === num);
                            if (!s) return null;
                            const isBooked = Boolean(s.is_booked);
                            const isSelected = selectedSeatNumber === num;
                            const seatType = s.seat_type || getSeatType(num);
                            return (
                              <button
                                key={num}
                                type="button"
                                onClick={() => {
                                  onSelectSeat(num);
                                  setBookingStatus({ type: 'idle', message: '' });
                                }}
                                className={`relative p-2.5 rounded-[8px] border text-left cursor-pointer btn-smooth flex flex-col justify-between h-[64px] transition-all ${
                                  isSelected
                                    ? 'bg-gradient-to-r from-[#d4af37] via-[#f3e5ab] to-[#c5a059] text-[#060b13] border-[#f3e5ab] shadow-lg shadow-[#d4af37]/35 ring-2 ring-[#f3e5ab] scale-[1.03]'
                                    : isBooked
                                    ? 'bg-rose-950/45 border-rose-500/35 text-rose-200/90 hover:bg-rose-900/50'
                                    : 'bg-[#09121f] hover:bg-[#122033] border-[#304766]/50 text-[#cbd5e1]'
                                }`}
                              >
                                <div className="flex items-center justify-between w-full">
                                  <span className="font-mono font-bold text-xs">#{num}</span>
                                  <span
                                    className={`text-[8px] font-mono font-bold px-1.5 py-0.2 rounded ${
                                      isSelected
                                        ? 'bg-[#060b13] text-[#d4af37]'
                                        : seatType === 'Window'
                                        ? 'bg-[#d4af37]/25 text-[#f3e5ab] border border-[#d4af37]/40'
                                        : seatType === 'Aisle'
                                        ? 'bg-sky-500/20 text-sky-200 border border-sky-500/30'
                                        : 'bg-slate-700/40 text-slate-300'
                                    }`}
                                  >
                                    {seatType === 'Window' ? 'WIN' : seatType === 'Aisle' ? 'AIS' : 'MID'}
                                  </span>
                                </div>
                                <div className="flex items-baseline justify-between w-full mt-1">
                                  <span className={`text-xs font-mono font-bold ${isSelected ? 'text-[#060b13]' : 'text-[#f8fafc]'}`}>
                                    ₹{s.price.toLocaleString('en-IN')}
                                  </span>
                                  <span className={`text-[8px] font-mono tracking-tight uppercase ${isSelected ? 'text-[#060b13] font-bold' : isBooked ? 'text-rose-400 font-semibold' : 'text-[#94a3b8]'}`}>
                                    {isBooked ? 'RESV' : 'OPEN'}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* =============================================================
                    RIGHT 5 COLS: PASSENGER MANIFEST, MEAL & BAGGAGE FORM
                ============================================================= */}
                <div className="lg:col-span-5 p-5 rounded-[10px] bg-[#080e18] border border-[#304766]/40 flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-mono text-[#d4af37] mb-3 font-medium flex items-center gap-1.5">
                      <span>•</span> PASSENGER MANIFEST & ONBOARD SERVICES
                    </div>

                    {/* Selected Seat Overview Pill */}
                    {selectedSeatObj ? (
                      <div className="mb-4 p-4 rounded-[8px] bg-[#0c1524] border border-[#304766]/50 shadow-md">
                        <div className="text-base font-mono font-medium text-[#f8fafc] flex items-center justify-between">
                          <span>
                            Seat <strong className="text-[#f3e5ab]">#{selectedSeatNumber}</strong> — {selectedSeatObj.seat_class}
                          </span>
                          <span className="px-2.5 py-0.5 rounded text-[10px] bg-[#d4af37]/20 text-[#f3e5ab] border border-[#d4af37]/40 font-mono font-semibold">
                            {selectedSeatObj.seat_type || getSeatType(selectedSeatNumber || '1')} Seat
                          </span>
                        </div>
                        <div className="text-xs font-mono text-[#94a3b8] mt-2 flex items-center justify-between">
                          <span>Fare: <strong className="text-[#f8fafc] text-sm">₹{selectedSeatObj.price.toLocaleString('en-IN')}</strong></span>
                          <span className="text-[10px] text-emerald-400">All Taxes & Fuel Surcharge Incl.</span>
                        </div>
                        <div className="text-xs font-mono mt-1.5">
                          Status:{' '}
                          {selectedSeatObj.is_booked ? (
                            <span className="text-rose-400 font-semibold">
                              Reserved ({selectedSeatObj.passenger_name})
                            </span>
                          ) : (
                            <span className="text-[#f3e5ab] font-semibold">Available for Instant Booking</span>
                          )}
                        </div>
                      </div>
                    ) : null}

                    {/* Booking Form with Name, Email, Meal and Baggage Selection */}
                    <form onSubmit={handleBookSeat} className="space-y-3.5">
                      <div>
                        <label className="block text-[11px] font-mono uppercase text-[#94a3b8] mb-1 font-medium">
                          Passenger Full Name
                        </label>
                        <input
                          type="text"
                          required
                          value={passengerName}
                          onChange={(e) => setPassengerName(e.target.value)}
                          placeholder="e.g. Capt. Arjun Mehta"
                          className="w-full px-3.5 py-2.5 rounded-[6px] bg-[#060b13] border border-[#304766]/50 text-sm text-[#f8fafc] placeholder-[#64748b] focus:outline-none focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37]/40 input-smooth font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-mono uppercase text-[#94a3b8] mb-1 font-medium">
                          Contact Email
                        </label>
                        <input
                          type="email"
                          value={passengerEmail}
                          onChange={(e) => setPassengerEmail(e.target.value)}
                          placeholder="arjun@endureair.in"
                          className="w-full px-3.5 py-2.5 rounded-[6px] bg-[#060b13] border border-[#304766]/50 text-sm text-[#f8fafc] placeholder-[#64748b] focus:outline-none focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37]/40 input-smooth font-mono"
                        />
                      </div>

                      {/* IN-FLIGHT MEAL SELECTION */}
                      <div>
                        <label className="block text-[11px] font-mono uppercase text-[#94a3b8] mb-1 font-medium flex items-center justify-between">
                          <span>🍽️ In-Flight Meal Preference</span>
                          <span className="text-[10px] text-[#f3e5ab] font-normal">Complimentary</span>
                        </label>
                        <select
                          value={mealType}
                          onChange={(e) => setMealType(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-[6px] bg-[#060b13] border border-[#304766]/60 text-xs text-[#f8fafc] focus:outline-none focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37]/40 input-smooth font-mono cursor-pointer"
                        >
                          <option value="Royal Indian Vegetarian Thali">Royal Indian Vegetarian Thali (Veg)</option>
                          <option value="Chef Gourmet Plate (Non-Veg)">Chef's Non-Veg Gourmet Delicacy</option>
                          <option value="Asian Vegan & Fresh Seasonal Fruit">Asian Vegan & Fresh Seasonal Fruit</option>
                          <option value="Halal Certified Special Meal">Halal Certified Special In-Flight Meal</option>
                          <option value="Diabetic & Low-Sodium Wellness Meal">Diabetic & Low-Sodium Wellness Meal</option>
                          <option value="Artisanal Beverage & Snacks Only">Artisanal Beverage & Light Snacks Only</option>
                        </select>
                      </div>

                      {/* BAGGAGE ALLOWANCE SELECTION */}
                      <div>
                        <label className="block text-[11px] font-mono uppercase text-[#94a3b8] mb-1 font-medium flex items-center justify-between">
                          <span>🧳 Baggage Allowance & Tag</span>
                          <span className="text-[10px] text-[#f3e5ab] font-normal">RFID Tracked</span>
                        </label>
                        <select
                          value={baggageTier}
                          onChange={(e) => setBaggageTier(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-[6px] bg-[#060b13] border border-[#304766]/60 text-xs text-[#f8fafc] focus:outline-none focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37]/40 input-smooth font-mono cursor-pointer"
                        >
                          <option value="CHECKIN_15KG">Standard Check-In (15 kg + 7 kg Cabin) — Included</option>
                          <option value="CABIN_7KG">Cabin Handbag Only (7 kg) — Light Travel</option>
                          <option value="PRIORITY_25KG">Priority Baggage (25 kg + 7 kg Cabin) — Included</option>
                          <option value="EXCESS_32KG">Executive Heavy Baggage (32 kg Allowance) — Included</option>
                        </select>
                      </div>

                      {/* Live Summary Receipt Box */}
                      {selectedSeatObj && (
                        <div className="p-3 rounded-[6px] bg-[#060b13] border border-[#304766]/40 text-xs font-mono space-y-1">
                          <div className="flex justify-between text-[#94a3b8]">
                            <span>Seat Base Fare:</span>
                            <span className="text-[#f8fafc]">₹{selectedSeatObj.price.toLocaleString('en-IN')}</span>
                          </div>
                          <div className="flex justify-between text-[#94a3b8]">
                            <span>Meal & Catering:</span>
                            <span className="text-[#f3e5ab]">FREE (Included)</span>
                          </div>
                          <div className="flex justify-between text-[#94a3b8]">
                            <span>Baggage Tag:</span>
                            <span className="text-[#f3e5ab]">FREE (Included)</span>
                          </div>
                          <div className="pt-1.5 border-t border-[#304766]/40 flex justify-between font-bold text-sm">
                            <span className="text-[#f8fafc]">Total Amount:</span>
                            <span className="text-[#f3e5ab]">₹{selectedSeatObj.price.toLocaleString('en-IN')}</span>
                          </div>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={
                          !selectedSeatObj ||
                          Boolean(selectedSeatObj.is_booked) ||
                          bookingStatus.type === 'loading'
                        }
                        className="w-full py-3.5 rounded-[6px] bg-gradient-to-r from-[#d4af37] via-[#f3e5ab] to-[#c5a059] disabled:opacity-40 text-xs font-mono font-bold uppercase tracking-widest text-[#060b13] cursor-pointer shadow-lg shadow-[#d4af37]/25 btn-smooth"
                      >
                        {bookingStatus.type === 'loading'
                          ? 'Confirming in MySQL 8.0...'
                          : 'Confirm Reservation ›'}
                      </button>
                    </form>

                    {bookingStatus.message && (
                      <div
                        className={`mt-3 p-3 rounded-[6px] text-xs font-mono animate-fadeIn ${
                          bookingStatus.type === 'error'
                            ? 'bg-rose-950/80 border border-rose-500/50 text-rose-200'
                            : bookingStatus.type === 'success'
                            ? 'bg-[#0f241a] border border-emerald-500/50 text-emerald-200'
                            : 'bg-[#0c1624] text-[#cbd5e1]'
                        }`}
                      >
                        {bookingStatus.message}
                      </div>
                    )}
                  </div>

                  <div className="mt-5 pt-3.5 border-t border-[#304766]/40 text-[11px] font-mono text-[#94a3b8] flex justify-between">
                    <span>Available Inventory: <strong className="text-[#f3e5ab]">{availableCount} Seats</strong></span>
                    <span>Reserved: <strong className="text-rose-400">{bookedCount} Seats</strong></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            DEDICATED MODAL 2: LIVE BOARDING PASSES
        ===================================================================== */}
        {activeModal === 'passes' && (
          <div
            data-lenis-prevent
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#060b13]/85 p-4 backdrop-blur-md modal-backdrop-animate"
          >
            <div className="w-full max-w-3xl rounded-[12px] bg-[#0c1524] border border-[#304766]/55 shadow-2xl p-6 md:p-8 text-[#f8fafc] max-h-[88vh] overflow-y-auto modal-card-animate">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#304766]/40">
                <div>
                  <div className="text-xs font-mono text-[#d4af37] mb-1 font-medium">
                    • Active Passenger Manifest
                  </div>
                  <h2 className="text-2xl font-normal tracking-tight text-[#f8fafc]">
                    Issued Boarding Passes{' '}
                    <span className="text-[#94a3b8]">({bookings.length})</span>
                  </h2>
                </div>
                <button
                  onClick={() => setActiveModal('none')}
                  className="px-3.5 py-1.5 rounded-[4px] bg-[#142338]/80 hover:bg-[#1c324e] border border-[#304766]/60 text-xs font-mono uppercase text-[#cbd5e1] hover:text-white cursor-pointer btn-smooth"
                >
                  ✕ Close
                </button>
              </div>

              {bookings.length === 0 ? (
                <div className="p-8 text-center rounded-[8px] bg-[#080e18] border border-[#304766]/40 text-[#94a3b8] font-mono text-xs">
                  No active boarding passes found in MySQL. Reserve a seat (#01–#30)
                  to generate a pass.
                </div>
              ) : (
                <div className="space-y-3">
                  {bookings.map((b) => (
                    <TiltedCard
                      key={b.id}
                      maxAngle={8}
                      className="p-4 rounded-[8px] bg-[#080e18] border border-[#304766]/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg"
                    >
                      <div>
                        <div className="flex items-center gap-2.5">
                          <span className="px-2.5 py-0.5 rounded-[4px] bg-gradient-to-r from-[#d4af37] via-[#f3e5ab] to-[#c5a059] text-[#060b13] font-mono text-xs font-bold">
                            SEAT #{String(b.seat_number).padStart(2, '0')}
                          </span>
                          <span className="text-base font-medium text-[#f8fafc]">
                            {b.passenger_name}
                          </span>
                          <span className="text-xs font-mono text-[#f3e5ab]">
                            ({b.seat_class} • {b.seat_type || getSeatType(b.seat_number)})
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#94a3b8] mt-1.5 font-mono">
                          <span>FLIGHT EA-900</span>
                          <span>•</span>
                          <span>FARE ₹{b.price.toLocaleString('en-IN')}</span>
                          <span>•</span>
                          <span className="text-[#f3e5ab]">🍽️ {b.meal || 'Royal Indian Vegetarian Thali'}</span>
                          <span>•</span>
                          <span className="text-[#93c5fd]">🧳 {b.baggage || '15 kg Checked Baggage'}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-[4px] bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 font-mono text-[11px] font-medium flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          CONFIRMED
                        </span>
                        <button
                          onClick={() => window.print()}
                          title="Print passenger boarding pass"
                          className="px-3 py-1.5 rounded-[4px] bg-[#142338]/80 hover:bg-[#1f3757] border border-[#304766]/60 text-[#cbd5e1] hover:text-white text-xs font-mono uppercase cursor-pointer btn-smooth"
                        >
                          Print Pass
                        </button>
                      </div>
                    </TiltedCard>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =====================================================================
            DEDICATED MODAL 3: PASSWORD-PROTECTED ADMIN LOGIN (admin / admin123)
        ===================================================================== */}
        <AdminLoginModal
          isOpen={activeModal === 'adminLogin'}
          onClose={() => setActiveModal('none')}
          onSuccess={() => setActiveModal('adminPanel')}
        />

        {/* =====================================================================
            DEDICATED MODAL 4: UNLOCKED ADMIN CONSOLE
        ===================================================================== */}
        {activeModal === 'adminPanel' && (
          <div
            data-lenis-prevent
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#060b13]/85 p-4 backdrop-blur-md modal-backdrop-animate"
          >
            <div className="w-full max-w-4xl rounded-[12px] bg-[#0c1524] border border-[#304766]/55 shadow-2xl p-6 md:p-8 text-[#f8fafc] max-h-[90vh] overflow-y-auto modal-card-animate">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-[#304766]/40">
                <div>
                  <div className="text-xs font-mono text-[#f3e5ab] mb-1 font-medium">
                    • Authenticated as Admin — MySQL 8.0 Live Console
                  </div>
                  <h2 className="text-2xl font-normal tracking-tight text-[#f8fafc]">
                    Fleet & Cabin{' '}
                    <span className="text-[#94a3b8]">
                      Database Administration
                    </span>
                  </h2>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={handleResetAllSeats}
                    className="px-3.5 py-2 rounded-[5px] bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-xs font-mono uppercase text-rose-200 cursor-pointer btn-smooth"
                  >
                    Reset All 30 Seats
                  </button>
                  <button
                    onClick={() => setActiveModal('none')}
                    className="px-3.5 py-2 rounded-[5px] bg-gradient-to-r from-[#d4af37] via-[#f3e5ab] to-[#c5a059] text-[#060b13] hover:brightness-110 text-xs font-mono uppercase font-bold cursor-pointer shadow-md shadow-[#d4af37]/20 btn-smooth"
                  >
                    Lock & Exit ›
                  </button>
                </div>
              </div>

              {adminActionMsg && (
                <div className="mb-4 p-3 rounded-[6px] bg-[#142338]/80 border border-[#304766]/60 text-xs text-[#cbd5e1] font-mono animate-fadeIn">
                  {adminActionMsg}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <SpotlightCard className="p-4 rounded-[8px] bg-[#080e18] border border-[#304766]/40">
                  <div className="text-[10px] font-mono text-[#94a3b8] uppercase">
                    TOTAL CABIN CAPACITY
                  </div>
                  <div className="text-2xl font-mono font-medium text-[#f8fafc] mt-1">
                    <CountUp to={30} duration={0.8} suffix=" Seats" />
                  </div>
                </SpotlightCard>
                <SpotlightCard className="p-4 rounded-[8px] bg-[#080e18] border border-[#304766]/40">
                  <div className="text-[10px] font-mono text-[#94a3b8] uppercase">
                    OCCUPIED / RESERVED
                  </div>
                  <div className="text-2xl font-mono font-medium text-rose-400 mt-1">
                    <CountUp to={bookedCount} duration={0.8} suffix=" Seats" />
                  </div>
                </SpotlightCard>
                <SpotlightCard className="p-4 rounded-[8px] bg-[#080e18] border border-[#304766]/40">
                  <div className="text-[10px] font-mono text-[#94a3b8] uppercase">
                    AVAILABLE INVENTORY
                  </div>
                  <div className="text-2xl font-mono font-medium text-[#f3e5ab] mt-1">
                    <CountUp to={availableCount} duration={0.8} suffix=" Seats" />
                  </div>
                </SpotlightCard>
              </div>

              <div className="overflow-x-auto rounded-[8px] border border-[#304766]/40 bg-[#080e18]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#304766]/40 text-[10px] font-mono uppercase text-[#94a3b8]">
                      <th className="py-3 px-4">Seat</th>
                      <th className="py-3 px-4">Class</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Fare (₹)</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Passenger</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seats.map((s) => {
                      const num = String(s.seat_number).padStart(2, '0');
                      const isBooked = Boolean(s.is_booked);
                      const isBusiness = Number(s.seat_number) <= 12;
                      const seatType = s.seat_type || getSeatType(num);
                      return (
                        <tr
                          key={num}
                          className="border-b border-[#304766]/20 hover:bg-[#121f30]/60 transition-colors"
                        >
                          <td className="py-2.5 px-4 font-mono font-bold text-[#f3e5ab]">
                            #{num}
                          </td>
                          <td className={`py-2.5 px-4 font-mono ${isBusiness ? 'text-[#f3e5ab]' : 'text-[#cbd5e1]'}`}>
                            {s.seat_class}
                          </td>
                          <td className="py-2.5 px-4 font-mono">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                              seatType === 'Window'
                                ? 'bg-[#d4af37]/20 text-[#f3e5ab] border-[#d4af37]/40'
                                : seatType === 'Aisle'
                                ? 'bg-sky-500/20 text-sky-200 border-sky-500/40'
                                : 'bg-slate-700/40 text-slate-300 border-slate-600/40'
                            }`}>
                              {seatType}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-mono font-medium text-[#f8fafc]">
                            ₹{s.price.toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 px-4">
                            {isBooked ? (
                              <span className="px-2 py-0.5 rounded-[3px] bg-rose-500/20 text-rose-300 font-mono text-[10px] border border-rose-500/30">
                                BOOKED
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-[3px] bg-[#1a2d45] text-[#f3e5ab] font-mono text-[10px] border border-[#d4af37]/40">
                                AVAILABLE
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-[#cbd5e1]">
                            {s.passenger_name || '—'}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            {isBooked ? (
                              <button
                                onClick={() => handleCancelSeat(num)}
                                className="px-3 py-1 rounded-[4px] bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/40 text-rose-200 font-mono text-[10px] uppercase cursor-pointer btn-smooth"
                              >
                                Release
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  onSelectSeat(num);
                                  setActiveModal('reserve');
                                }}
                                className="px-3 py-1 rounded-[4px] bg-gradient-to-r from-[#d4af37] via-[#f3e5ab] to-[#c5a059] text-[#060b13] hover:brightness-110 font-mono text-[10px] uppercase font-bold cursor-pointer shadow-sm shadow-[#d4af37]/20 btn-smooth"
                              >
                                Assign ›
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }
);
