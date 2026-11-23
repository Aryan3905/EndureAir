-- ============================================================================
-- EndureAir: Evaluation & Viva Demonstration Queries (Revised Plan)
-- Focus: Crash-Consistent Hold-Pay-Confirm-Reconcile, 4 Golden Invariants,
--        DBMS Unit 3 (Views, Triggers, Stored Procedures, B-Tree EXPLAIN)
-- ============================================================================

USE endure_air_db;

-- ============================================================================
-- QUERY 1: LIVE 30-SEAT CABIN STATE MACHINE (VIEW: v_cabin_manifest)
-- Shows AVAILABLE, HELD (with live countdown TTL in seconds), and BOOKED seats
-- ============================================================================
SELECT * FROM v_cabin_manifest;

-- ============================================================================
-- QUERY 2: B-TREE INDEX OPTIMIZATION PROOF WITH EXPLAIN (DBMS Unit 3)
-- Proves that the TTL Reaper uses idx_seats_status_expiry instead of a table scan
-- ============================================================================
EXPLAIN SELECT id, seat_no, status, hold_expires_at
FROM seats
WHERE status = 'HELD' AND hold_expires_at <= NOW();

-- ============================================================================
-- QUERY 3: THE 4 GOLDEN CORRECTNESS INVARIANTS CHECK (Must all equal 0!)
-- Headline Result: "N crash injections, 0 invariant violations"
-- ============================================================================
SELECT
    -- Invariant 1: Every CHARGED payment has exactly 1 CONFIRMED booking (0 mismatches)
    (SELECT COUNT(*)
     FROM payments p
     LEFT JOIN bookings b ON (p.payment_id = b.payment_id AND b.status = 'CONFIRMED')
     WHERE p.status = 'CHARGED' AND b.id IS NULL) AS invariant_1_unreconciled_charges,

    -- Invariant 2: No seat has two confirmed bookings
    (SELECT COUNT(*)
     FROM (
         SELECT seat_no FROM bookings WHERE status = 'CONFIRMED'
         GROUP BY seat_no HAVING COUNT(*) > 1
     ) dup_seats) AS invariant_2_double_booked_seats,

    -- Invariant 3: No hold remains past its expiry after reaper/reconciler run
    (SELECT COUNT(*)
     FROM seats
     WHERE status = 'HELD' AND hold_expires_at <= NOW()) AS invariant_3_expired_stuck_holds,

    -- Invariant 4: No idempotency_key produces two charges
    (SELECT COUNT(*)
     FROM (
         SELECT idempotency_key FROM payments
         GROUP BY idempotency_key HAVING COUNT(*) > 1
     ) dup_keys) AS invariant_4_duplicate_charges;

-- ============================================================================
-- QUERY 4: PAYMENT GATEWAY LEDGER VS. BOOKINGS DISCREPANCY VIEW
-- Surfaces any crash mismatch before & after running the Reconciler
-- ============================================================================
SELECT * FROM v_reconciliation_discrepancies;

-- ============================================================================
-- QUERY 5: APPLICATION-LEVEL BOOKING JOURNAL (WITH CHECKPOINTS - DBMS Unit 5)
-- Tracks cross-system workflow steps across DB + External Payment Gateway
-- ============================================================================
SELECT id, txn_id, idempotency_key, step, state, details, created_at
FROM booking_journal
ORDER BY id ASC;

-- ============================================================================
-- QUERY 6: RECONCILIATION AUDIT LOG (5-Row Decision Table Repairs)
-- Shows automatic repairs for Scenarios A, B, D, and G
-- ============================================================================
SELECT id, payment_id, idempotency_key, seat_no, action, reason, created_at
FROM reconciliation_audit
ORDER BY id ASC;

-- ============================================================================
-- QUERY 7: IDEMPOTENCY KEYS & TRANSACTIONAL OUTBOX (Producer-Consumer Queue)
-- ============================================================================
SELECT * FROM idempotency_keys;
SELECT * FROM outbox;
SELECT * FROM payments;
SELECT * FROM bookings;

-- ============================================================================
-- QUERY 8: LIVE STORED PROCEDURE DEMO (Hold -> Pay -> Atomic Confirm -> Reconcile)
-- ============================================================================
-- Example: Hold Seat #5 for User #101 with 60s expiry
-- CALL sp_hold_seat_with_expiry(5, 101, 'Aryan Bhatt', 'IDEM-DEMO-5', 60, @hold_status);
-- SELECT @hold_status;
--
-- Example: Run TTL Reaper to free expired holds
-- CALL sp_reap_expired_holds(@reaped_seats);
-- SELECT @reaped_seats;
--
-- Example: Run Idempotent Reconciler (5-Row Decision Table)
-- CALL sp_run_reconciler();
