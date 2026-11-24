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
  price: number;
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
            passenger_email: passengerEmail.trim() || 'guest@endureair.aero',
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || 'Booking failed');
        }
        setBookingStatus({
          type: 'success',
          message: `Seat #${selectedSeatNumber} reserved in MySQL for ${passengerName.trim()}!`,
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#060b13]/85 p-4 backdrop-blur-md modal-backdrop-animate"
          >
            <div className="w-full max-w-4xl rounded-[12px] bg-[#0c1524] border border-[#304766]/55 shadow-2xl p-6 md:p-8 text-[#f8fafc] max-h-[90vh] overflow-y-auto modal-card-animate">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#304766]/40">
                <div>
                  <div className="text-xs font-mono text-[#d4af37] mb-1 font-medium">
                    • Live MySQL 8.0 Seat Reservation
                  </div>
                  <h2 className="text-2xl md:text-3xl font-normal tracking-tight text-[#f8fafc]">
                    Select Your Cabin Seat{' '}
                    <span className="text-[#94a3b8]">(#01–#30)</span>
                  </h2>
                </div>
                <button
                  onClick={() => setActiveModal('none')}
                  className="px-3.5 py-1.5 rounded-[4px] bg-[#142338]/80 hover:bg-[#1c324e] border border-[#304766]/60 text-xs font-mono uppercase text-[#cbd5e1] hover:text-white cursor-pointer btn-smooth"
                >
                  ✕ Close
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 p-4 rounded-[8px] bg-[#080e18] border border-[#304766]/40">
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#94a3b8] mb-3">
                    <span className="text-[#f3e5ab]">FRONT CABIN AISLE ↑</span>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#3b82f6] inline-block" />{' '}
                        Available
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />{' '}
                        Booked
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#d4af37] inline-block" />{' '}
                        Selected
                      </span>
                    </div>
                  </div>

                  {/* 5 Rows × 6 Seats Across (Left 3 + Right 3) */}
                  <div className="grid grid-cols-6 gap-2">
                    {seats.map((s) => {
                      const num = String(s.seat_number).padStart(2, '0');
                      const isBooked = Boolean(s.is_booked);
                      const isSelected = selectedSeatNumber === num;
                      const isBusiness = Number(s.seat_number) <= 12;
                      const seatType = s.seat_type || getSeatType(num);
                      const isWindow = seatType === 'Window';
                      return (
                        <button
                          key={num}
                          onClick={() => {
                            onSelectSeat(num);
                            setBookingStatus({ type: 'idle', message: '' });
                          }}
                          className={`p-2 rounded-[5px] border text-left cursor-pointer btn-smooth ${
                            isSelected
                              ? 'bg-gradient-to-r from-[#d4af37] via-[#f3e5ab] to-[#c5a059] text-[#060b13] border-[#f3e5ab] font-bold shadow-md shadow-[#d4af37]/30 scale-[1.02]'
                              : isBooked
                              ? 'bg-rose-950/60 border-rose-500/40 text-rose-200 hover:bg-rose-900/60'
                              : isBusiness
                              ? 'bg-[#131f30] hover:bg-[#1a2d45] border-[#d4af37]/40 text-[#f3e5ab]'
                              : 'bg-[#0c1624] hover:bg-[#15253a] border-[#304766]/50 text-[#cbd5e1]'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="font-bold">#{num}</span>
                            <span className="text-[9px] opacity-90 font-medium">
                              ₹{s.price.toLocaleString('en-IN')}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[9px] font-mono truncate opacity-85 mt-0.5">
                            <span>
                              {isBooked
                                ? (s.passenger_name ? s.passenger_name.split(' ')[0] : 'Booked')
                                : s.seat_class}
                            </span>
                            <span className={`text-[8px] font-bold px-1 rounded ${isWindow ? 'bg-[#d4af37]/25 text-[#f3e5ab]' : 'bg-[#1e293b] text-[#94a3b8]'}`}>
                              {seatType[0]}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="lg:col-span-5 p-5 rounded-[8px] bg-[#080e18] border border-[#304766]/40 flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-mono text-[#d4af37] mb-3 font-medium">
                      • Passenger Manifest Entry
                    </div>

                    {selectedSeatObj ? (
                      <div className="mb-4 p-3.5 rounded-[6px] bg-[#0c1524] border border-[#304766]/50">
                        <div className="text-base font-mono font-medium text-[#f8fafc] flex items-center justify-between">
                          <span>Seat <span className="text-[#f3e5ab]">#{selectedSeatNumber}</span> — {selectedSeatObj.seat_class}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] bg-[#d4af37]/20 text-[#f3e5ab] border border-[#d4af37]/40 font-mono font-semibold">
                            {selectedSeatObj.seat_type || getSeatType(selectedSeatNumber || '1')} Seat
                          </span>
                        </div>
                        <div className="text-xs font-mono text-[#94a3b8] mt-1.5 flex items-center justify-between">
                          <span>Fare: <span className="text-[#f8fafc] font-bold text-sm">₹{selectedSeatObj.price.toLocaleString('en-IN')}</span></span>
                          <span className="text-[10px] text-[#94a3b8]">All Taxes & Charges Incl.</span>
                        </div>
                        <div className="text-xs font-mono mt-1">
                          Status:{' '}
                          {selectedSeatObj.is_booked ? (
                            <span className="text-rose-400 font-semibold">
                              Occupied ({selectedSeatObj.passenger_name})
                            </span>
                          ) : (
                            <span className="text-[#f3e5ab] font-semibold">Available</span>
                          )}
                        </div>
                      </div>
                    ) : null}

                    <form onSubmit={handleBookSeat} className="space-y-3.5">
                      <div>
                        <label className="block text-[11px] font-mono uppercase text-[#94a3b8] mb-1">
                          Passenger Full Name
                        </label>
                        <input
                          type="text"
                          required
                          value={passengerName}
                          onChange={(e) => setPassengerName(e.target.value)}
                          placeholder="e.g. Capt. Arjun Mehta"
                          className="w-full px-4 py-2.5 rounded-[6px] bg-[#060b13] border border-[#304766]/50 text-sm text-[#f8fafc] placeholder-[#64748b] focus:outline-none focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37]/40 input-smooth font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-mono uppercase text-[#94a3b8] mb-1">
                          Contact Email
                        </label>
                        <input
                          type="email"
                          value={passengerEmail}
                          onChange={(e) => setPassengerEmail(e.target.value)}
                          placeholder="arjun@endureair.in"
                          className="w-full px-4 py-2.5 rounded-[6px] bg-[#060b13] border border-[#304766]/50 text-sm text-[#f8fafc] placeholder-[#64748b] focus:outline-none focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37]/40 input-smooth font-mono"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={
                          !selectedSeatObj ||
                          Boolean(selectedSeatObj.is_booked) ||
                          bookingStatus.type === 'loading'
                        }
                        className="w-full py-3 rounded-[6px] bg-gradient-to-r from-[#d4af37] via-[#f3e5ab] to-[#c5a059] disabled:opacity-40 text-xs font-mono font-bold uppercase tracking-widest text-[#060b13] cursor-pointer shadow-lg shadow-[#d4af37]/20 btn-smooth"
                      >
                        {bookingStatus.type === 'loading'
                          ? 'Booking in MySQL...'
                          : 'Confirm Reservation ›'}
                      </button>
                    </form>

                    {bookingStatus.message && (
                      <div
                        className={`mt-3 p-3 rounded-[5px] text-xs font-mono ${
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

                  <div className="mt-6 pt-4 border-t border-[#304766]/40 text-[11px] font-mono text-[#94a3b8] flex justify-between">
                    <span>Available: <strong className="text-[#f3e5ab]">{availableCount}</strong></span>
                    <span>Booked: <strong className="text-rose-400">{bookedCount}</strong></span>
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
                        <div className="text-xs text-[#94a3b8] mt-1 font-mono">
                          FLIGHT EA-900 • NIRVANA CABIN • FARE ₹{b.price.toLocaleString('en-IN')}
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
