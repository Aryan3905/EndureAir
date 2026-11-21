-- ============================================================================
-- EndureAir: Crash-Consistent Airline Reservation & Payment Reconciliation DB
-- Target Dialect: MySQL 8.0+ (InnoDB Engine)
-- Syllabus Coverage:
--   * DBMS Unit 2: ER Model, Weak Entity (Seats of Flights), Structural Constraints
--   * DBMS Unit 3: DDL, Triggers, Views, Stored Procedures, B-Tree Indexes (EXPLAIN)
--   * DBMS Unit 4: 3NF/BCNF Functional Dependencies + 4NF Multivalued Decomposition
--   * DBMS Unit 5: ACID, Strict 2PL, Optimistic Versioning, Booking Journal & Recovery
-- ============================================================================

CREATE DATABASE IF NOT EXISTS endure_air_db;
USE endure_air_db;

-- ----------------------------------------------------------------------------
-- Drop Existing Objects in Reverse Dependency Order
-- ----------------------------------------------------------------------------
SET FOREIGN_KEY_CHECKS = 0;

DROP VIEW IF EXISTS v_reconciliation_discrepancies;
DROP VIEW IF EXISTS v_cabin_manifest;
DROP TRIGGER IF EXISTS trg_seats_state_audit;
DROP PROCEDURE IF EXISTS sp_hold_seat_with_expiry;
DROP PROCEDURE IF EXISTS sp_atomic_confirm_booking;
DROP PROCEDURE IF EXISTS sp_reap_expired_holds;
DROP PROCEDURE IF EXISTS sp_run_reconciler;

-- Drop legacy Phase-II tables if present
DROP TABLE IF EXISTS write_ahead_logs;
DROP TABLE IF EXISTS transactions_audit;
DROP TABLE IF EXISTS inventory_meals;
DROP TABLE IF EXISTS inventory_baggage;
DROP TABLE IF EXISTS meals;
DROP TABLE IF EXISTS baggage;
DROP TABLE IF EXISTS logs;

-- Drop revised tables
DROP TABLE IF EXISTS passenger_baggage_tags;
DROP TABLE IF EXISTS passenger_meal_choices;
DROP TABLE IF EXISTS reconciliation_audit;
DROP TABLE IF EXISTS booking_journal;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS outbox;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS idempotency_keys;
DROP TABLE IF EXISTS seats;
DROP TABLE IF EXISTS flights;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- 1. USERS TABLE (3NF / BCNF: user_id -> user_name, email, role, created_at)
-- ============================================================================
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    user_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    role ENUM('PASSENGER', 'ADMIN') NOT NULL DEFAULT 'PASSENGER',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================================
-- 2. FLIGHTS TABLE (3NF / BCNF: flight_id -> flight_number, origin, destination, ...)
-- ============================================================================
CREATE TABLE flights (
    flight_id INT AUTO_INCREMENT PRIMARY KEY,
    flight_number VARCHAR(20) UNIQUE NOT NULL,
    origin VARCHAR(50) NOT NULL,
    destination VARCHAR(50) NOT NULL,
    departure_time DATETIME NOT NULL,
    total_cabin_seats INT NOT NULL DEFAULT 30,
    flight_status ENUM('SCHEDULED', 'BOARDING', 'IN_FLIGHT', 'COMPLETED') DEFAULT 'BOARDING'
) ENGINE=InnoDB;

-- ============================================================================
-- 3. SEATS TABLE (Weak Entity of Flights: (flight_id, seat_no) -> id, status, ...)
--    Models the 3-State Machine: AVAILABLE -> HELD (with TTL expiry) -> BOOKED
-- ============================================================================
CREATE TABLE seats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    flight_id INT NOT NULL DEFAULT 1,
    seat_no INT NOT NULL,
    status ENUM('AVAILABLE', 'HELD', 'BOOKED') NOT NULL DEFAULT 'AVAILABLE',
    holder_id INT NULL,
    passenger_name VARCHAR(100) NOT NULL DEFAULT 'AVAILABLE',
    hold_expires_at DATETIME NULL,
    version INT NOT NULL DEFAULT 0 COMMENT 'Optimistic Concurrency Control (CAS) version',
    FOREIGN KEY (flight_id) REFERENCES flights(flight_id) ON DELETE CASCADE,
    FOREIGN KEY (holder_id) REFERENCES users(user_id) ON DELETE SET NULL,
    UNIQUE KEY uk_flight_seat (flight_id, seat_no)
) ENGINE=InnoDB;

-- DBMS Unit 3: Composite B-Tree Index for TTL Reaper & Hold Expiry Lookups
CREATE INDEX idx_seats_status_expiry ON seats(status, hold_expires_at);

-- ============================================================================
-- 4. IDEMPOTENCY KEYS TABLE (Prevents duplicate charges / double bookings on retry)
--    FD: idempotency_key -> user_id, seat_no, request_hash, status, response_payload
-- ============================================================================
CREATE TABLE idempotency_keys (
    idempotency_key VARCHAR(64) PRIMARY KEY,
    user_id INT NOT NULL,
    seat_no INT NOT NULL,
    request_hash VARCHAR(128) NOT NULL,
    status ENUM('IN_PROGRESS', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'IN_PROGRESS',
    response_payload VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================================
-- 5. TRANSACTIONAL OUTBOX TABLE (OS Unit 2 Producer-Consumer Pattern)
--    Written atomically in the same transaction as the seat hold.
-- ============================================================================
CREATE TABLE outbox (
    id INT AUTO_INCREMENT PRIMARY KEY,
    idempotency_key VARCHAR(64) UNIQUE NOT NULL,
    user_id INT NOT NULL,
    passenger_name VARCHAR(100) NOT NULL,
    seat_no INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL DEFAULT 4500.00,
    status ENUM('PENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (idempotency_key) REFERENCES idempotency_keys(idempotency_key) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- 6. PAYMENTS LEDGER (External Mock Payment Gateway Storage)
--    FD: payment_id -> idempotency_key, user_id, seat_no, amount, status
--    UNIQUE(idempotency_key) guarantees Invariant 4 (Zero Double Charges).
-- ============================================================================
CREATE TABLE payments (
    payment_id INT AUTO_INCREMENT PRIMARY KEY,
    idempotency_key VARCHAR(64) UNIQUE NOT NULL,
    user_id INT NOT NULL,
    passenger_name VARCHAR(100) NOT NULL,
    seat_no INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL DEFAULT 4500.00,
    status ENUM('CHARGED', 'REFUNDED', 'FAILED') NOT NULL DEFAULT 'CHARGED',
    gateway_mode VARCHAR(40) NOT NULL DEFAULT 'SUCCESS',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================================
-- 7. BOOKINGS TABLE (Confirmed ACID Reservations)
--    UNIQUE(seat_id) guarantees Invariant 2 (No seat has two confirmed bookings).
--    UNIQUE(payment_id) guarantees Invariant 1 (1-to-1 with charged payment).
-- ============================================================================
CREATE TABLE bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    seat_id INT UNIQUE NOT NULL,
    flight_id INT NOT NULL DEFAULT 1,
    seat_no INT NOT NULL,
    user_id INT NOT NULL,
    passenger_name VARCHAR(100) NOT NULL,
    payment_id INT UNIQUE NOT NULL,
    idempotency_key VARCHAR(64) UNIQUE NOT NULL,
    status ENUM('CONFIRMED', 'CANCELLED') NOT NULL DEFAULT 'CONFIRMED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (seat_id) REFERENCES seats(id),
    FOREIGN KEY (flight_id) REFERENCES flights(flight_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (payment_id) REFERENCES payments(payment_id)
) ENGINE=InnoDB;

-- ============================================================================
-- 8. BOOKING JOURNAL (Application-Level Cross-System Workflow Log + Checkpoints)
--    DBMS Unit 5: Tracks multi-system steps (unlike InnoDB redo log which only
--    tracks single-DB page writes).
-- ============================================================================
CREATE TABLE booking_journal (
    id INT AUTO_INCREMENT PRIMARY KEY,
    txn_id INT NOT NULL,
    idempotency_key VARCHAR(64) NOT NULL,
    step ENUM('HOLD_CREATED', 'PAYMENT_REQUESTED', 'PAYMENT_CONFIRMED', 'BOOKING_CONFIRMED', 'CHECKPOINT', 'ABORTED', 'RECONCILED') NOT NULL,
    state VARCHAR(50) NOT NULL,
    details VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================================
-- 9. RECONCILIATION AUDIT TABLE (Logs automatic repairs after crashes/timeouts)
-- ============================================================================
CREATE TABLE reconciliation_audit (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payment_id INT NULL,
    idempotency_key VARCHAR(64) NULL,
    seat_no INT NULL,
    action ENUM('CONFIRMED_BOOKING', 'REFUNDED_LATE_PAYMENT', 'RELEASED_EXPIRED_HOLD', 'CANCELLED_REFUNDED_BOOKING', 'NO_OP') NOT NULL,
    reason VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================================
-- 10. 4NF MULTIVALUED DEPENDENCY TABLES (DBMS Unit 4 Normalization Proof)
--     Decomposes independent multivalued attributes:
--     user_id ->> meal_code  AND  user_id ->> baggage_tag_code
-- ============================================================================
CREATE TABLE passenger_meal_choices (
    user_id INT NOT NULL,
    meal_code VARCHAR(50) NOT NULL,
    PRIMARY KEY (user_id, meal_code),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE passenger_baggage_tags (
    user_id INT NOT NULL,
    baggage_tag_code VARCHAR(50) NOT NULL,
    weight_kg INT NOT NULL DEFAULT 15,
    PRIMARY KEY (user_id, baggage_tag_code),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- DBMS UNIT 3: TRIGGER (Automatic Audit Journal on Seat State Transitions)
-- ============================================================================
DELIMITER //
CREATE TRIGGER trg_seats_state_audit
AFTER UPDATE ON seats
FOR EACH ROW
BEGIN
    IF OLD.status <> NEW.status THEN
        INSERT INTO booking_journal (txn_id, idempotency_key, step, state, details)
        VALUES (
            NEW.version,
            CONCAT('SEAT_', NEW.seat_no, '_V', NEW.version),
            CASE
                WHEN NEW.status = 'HELD' THEN 'HOLD_CREATED'
                WHEN NEW.status = 'BOOKED' THEN 'BOOKING_CONFIRMED'
                ELSE 'RECONCILED'
            END,
            CONCAT(OLD.status, ' -> ', NEW.status),
            CONCAT('Seat #', NEW.seat_no, ' transitioned from ', OLD.status, ' to ', NEW.status, ' (Holder: ', COALESCE(NEW.passenger_name, 'NONE'), ')')
        );
    END IF;
END //
DELIMITER ;

-- ============================================================================
-- DBMS UNIT 3: VIEWS (Virtual Tables for Reconciliation & Cabin Manifest)
-- ============================================================================
CREATE VIEW v_cabin_manifest AS
SELECT 
    s.seat_no,
    s.status AS seat_status,
    s.passenger_name,
    s.holder_id,
    s.hold_expires_at,
    CASE 
        WHEN s.status = 'HELD' AND s.hold_expires_at > NOW() 
            THEN TIMESTAMPDIFF(SECOND, NOW(), s.hold_expires_at)
        WHEN s.status = 'HELD' AND s.hold_expires_at <= NOW() 
            THEN -1
        ELSE NULL
    END AS hold_ttl_seconds_remaining,
    s.version AS lock_version,
    b.id AS booking_id,
    b.payment_id,
    b.idempotency_key
FROM seats s
LEFT JOIN bookings b ON (s.id = b.seat_id AND b.status = 'CONFIRMED')
ORDER BY s.seat_no ASC;

CREATE VIEW v_reconciliation_discrepancies AS
SELECT 
    p.payment_id,
    p.idempotency_key,
    p.user_id,
    p.passenger_name,
    p.seat_no,
    p.status AS gateway_payment_status,
    s.status AS db_seat_status,
    s.holder_id AS db_seat_holder_id,
    s.hold_expires_at,
    b.id AS confirmed_booking_id,
    CASE
        WHEN p.status = 'CHARGED' AND b.id IS NULL AND s.status = 'HELD' AND s.holder_id = p.user_id AND s.hold_expires_at > NOW()
            THEN 'NEEDS_CONFIRMATION (Scenario B: Crash after payment, hold still valid)'
        WHEN p.status = 'CHARGED' AND b.id IS NULL AND (s.status <> 'HELD' OR s.holder_id <> p.user_id OR s.hold_expires_at <= NOW())
            THEN 'NEEDS_REFUND (Scenario D: Payment arrived after hold expired / taken)'
        WHEN p.status = 'REFUNDED' AND b.id IS NOT NULL AND b.status = 'CONFIRMED'
            THEN 'NEEDS_BOOKING_CANCELLATION (Refunded payment has active booking)'
        ELSE 'CONSISTENT'
    END AS discrepancy_diagnosis
FROM payments p
JOIN seats s ON (s.flight_id = 1 AND s.seat_no = p.seat_no)
LEFT JOIN bookings b ON (b.payment_id = p.payment_id AND b.status = 'CONFIRMED');

-- ============================================================================
-- DBMS UNIT 3: STORED PROCEDURES (Step 3, Step 4, Step 6, Step 8 of PDF)
-- ============================================================================
DELIMITER //

-- Step 3 & 5: Hold Seat with 60s Expiry + Idempotency + Transactional Outbox
CREATE PROCEDURE sp_hold_seat_with_expiry(
    IN p_seat_no INT,
    IN p_user_id INT,
    IN p_passenger_name VARCHAR(100),
    IN p_idem_key VARCHAR(64),
    IN p_ttl_seconds INT,
    OUT p_status_code VARCHAR(40)
)
BEGIN
    DECLARE v_existing_status VARCHAR(20);
    DECLARE v_rows INT DEFAULT 0;

    START TRANSACTION;

    -- Ensure user exists
    INSERT IGNORE INTO users (user_id, user_name, email, role)
    VALUES (p_user_id, p_passenger_name, CONCAT('user', p_user_id, '@endureair.internal'), 'PASSENGER');

    -- Check Idempotency Key
    SELECT status INTO v_existing_status
    FROM idempotency_keys
    WHERE idempotency_key = p_idem_key
    FOR UPDATE;

    IF v_existing_status IS NOT NULL THEN
        SET p_status_code = CONCAT('IDEMPOTENT_REPLAY_', v_existing_status);
        COMMIT;
    ELSE
        -- Conditional Seat Hold using Database Clock (NOW() + INTERVAL p_ttl_seconds SECOND)
        UPDATE seats
        SET status = 'HELD',
            holder_id = p_user_id,
            passenger_name = p_passenger_name,
            hold_expires_at = NOW() + INTERVAL p_ttl_seconds SECOND,
            version = version + 1
        WHERE flight_id = 1
          AND seat_no = p_seat_no
          AND (status = 'AVAILABLE' OR (status = 'HELD' AND hold_expires_at <= NOW()));

        SET v_rows = ROW_COUNT();

        IF v_rows = 1 THEN
            INSERT INTO idempotency_keys (idempotency_key, user_id, seat_no, request_hash, status, response_payload)
            VALUES (p_idem_key, p_user_id, p_seat_no, SHA2(CONCAT(p_user_id, ':', p_seat_no), 256), 'IN_PROGRESS', 'SEAT_HELD');

            INSERT INTO outbox (idempotency_key, user_id, passenger_name, seat_no, amount, status)
            VALUES (p_idem_key, p_user_id, p_passenger_name, p_seat_no, 4500.00, 'PENDING');

            SET p_status_code = 'HOLD_ACQUIRED';
            COMMIT;
        ELSE
            SET p_status_code = 'SEAT_UNAVAILABLE';
            ROLLBACK;
        END IF;
    END IF;
END //

-- Step 6: Atomic Conditional Confirm (Confirms only if hold is still valid; else flags refund)
CREATE PROCEDURE sp_atomic_confirm_booking(
    IN p_seat_no INT,
    IN p_user_id INT,
    IN p_passenger_name VARCHAR(100),
    IN p_payment_id INT,
    IN p_idem_key VARCHAR(64),
    OUT p_result VARCHAR(40)
)
BEGIN
    DECLARE v_seat_id INT;
    DECLARE v_rows INT DEFAULT 0;

    START TRANSACTION;

    SELECT id INTO v_seat_id FROM seats WHERE flight_id = 1 AND seat_no = p_seat_no FOR UPDATE;

    UPDATE seats
    SET status = 'BOOKED',
        hold_expires_at = NULL,
        version = version + 1
    WHERE id = v_seat_id
      AND status = 'HELD'
      AND holder_id = p_user_id
      AND hold_expires_at > NOW();

    SET v_rows = ROW_COUNT();

    IF v_rows = 1 THEN
        INSERT INTO bookings (seat_id, flight_id, seat_no, user_id, passenger_name, payment_id, idempotency_key, status)
        VALUES (v_seat_id, 1, p_seat_no, p_user_id, p_passenger_name, p_payment_id, p_idem_key, 'CONFIRMED');

        UPDATE idempotency_keys
        SET status = 'COMPLETED', response_payload = CONCAT('CONFIRMED_SEAT_', p_seat_no)
        WHERE idempotency_key = p_idem_key;

        UPDATE outbox SET status = 'SENT' WHERE idempotency_key = p_idem_key;

        INSERT INTO booking_journal (txn_id, idempotency_key, step, state, details)
        VALUES (p_payment_id, p_idem_key, 'CHECKPOINT', 'WORKFLOW_COMPLETE', CONCAT('Seat #', p_seat_no, ' confirmed & checkpointed'));

        SET p_result = 'BOOKING_CONFIRMED';
        COMMIT;
    ELSE
        -- Hold expired or taken by another user! Automatically refund late payment (Scenario D)
        UPDATE payments SET status = 'REFUNDED' WHERE payment_id = p_payment_id;
        UPDATE idempotency_keys SET status = 'FAILED', response_payload = 'REFUNDED_HOLD_EXPIRED' WHERE idempotency_key = p_idem_key;

        INSERT INTO reconciliation_audit (payment_id, idempotency_key, seat_no, action, reason)
        VALUES (p_payment_id, p_idem_key, p_seat_no, 'REFUNDED_LATE_PAYMENT', 'Hold expired before confirmation; payment automatically refunded');

        SET p_result = 'REFUNDED_HOLD_EXPIRED';
        COMMIT;
    END IF;
END //

-- Step 4: TTL Reaper (Releases expired holds back to AVAILABLE)
CREATE PROCEDURE sp_reap_expired_holds(OUT p_reaped_count INT)
BEGIN
    START TRANSACTION;

    INSERT INTO reconciliation_audit (payment_id, idempotency_key, seat_no, action, reason)
    SELECT NULL, CONCAT('EXPIRED_SEAT_', seat_no), seat_no, 'RELEASED_EXPIRED_HOLD',
           CONCAT('TTL Reaper released expired hold on Seat #', seat_no)
    FROM seats
    WHERE status = 'HELD' AND hold_expires_at <= NOW();

    UPDATE seats
    SET status = 'AVAILABLE',
        holder_id = NULL,
        passenger_name = 'AVAILABLE',
        hold_expires_at = NULL,
        version = version + 1
    WHERE status = 'HELD' AND hold_expires_at <= NOW();

    SET p_reaped_count = ROW_COUNT();
    COMMIT;
END //

-- Step 8: Idempotent Reconciler (Implements the 5-Row Decision Table from Page 12 of PDF)
CREATE PROCEDURE sp_run_reconciler()
BEGIN
    -- Row 1 of Decision Table: Gateway CHARGED + Hold valid, no booking -> Confirm the booking
    INSERT INTO reconciliation_audit (payment_id, idempotency_key, seat_no, action, reason)
    SELECT p.payment_id, p.idempotency_key, p.seat_no, 'CONFIRMED_BOOKING',
           'Reconciler: Payment CHARGED & hold valid -> Confirmed booking after crash'
    FROM payments p
    JOIN seats s ON (s.flight_id = 1 AND s.seat_no = p.seat_no)
    LEFT JOIN bookings b ON b.payment_id = p.payment_id
    WHERE p.status = 'CHARGED'
      AND b.id IS NULL
      AND s.status = 'HELD'
      AND s.holder_id = p.user_id
      AND s.hold_expires_at > NOW();

    INSERT INTO bookings (seat_id, flight_id, seat_no, user_id, passenger_name, payment_id, idempotency_key, status)
    SELECT s.id, 1, p.seat_no, p.user_id, p.passenger_name, p.payment_id, p.idempotency_key, 'CONFIRMED'
    FROM payments p
    JOIN seats s ON (s.flight_id = 1 AND s.seat_no = p.seat_no)
    LEFT JOIN bookings b ON b.payment_id = p.payment_id
    WHERE p.status = 'CHARGED'
      AND b.id IS NULL
      AND s.status = 'HELD'
      AND s.holder_id = p.user_id
      AND s.hold_expires_at > NOW();

    UPDATE seats s
    JOIN bookings b ON s.id = b.seat_id
    SET s.status = 'BOOKED', s.hold_expires_at = NULL, s.version = s.version + 1
    WHERE s.status = 'HELD' AND b.status = 'CONFIRMED';

    UPDATE idempotency_keys ik
    JOIN bookings b ON ik.idempotency_key = b.idempotency_key
    SET ik.status = 'COMPLETED', ik.response_payload = CONCAT('RECONCILED_SEAT_', b.seat_no)
    WHERE ik.status <> 'COMPLETED';

    -- Row 2 of Decision Table: Gateway CHARGED + Hold expired or seat taken -> Refund payment
    INSERT INTO reconciliation_audit (payment_id, idempotency_key, seat_no, action, reason)
    SELECT p.payment_id, p.idempotency_key, p.seat_no, 'REFUNDED_LATE_PAYMENT',
           'Reconciler: Payment CHARGED but hold expired or seat taken -> Refunded'
    FROM payments p
    JOIN seats s ON (s.flight_id = 1 AND s.seat_no = p.seat_no)
    LEFT JOIN bookings b ON b.payment_id = p.payment_id
    WHERE p.status = 'CHARGED'
      AND b.id IS NULL
      AND (s.status <> 'HELD' OR s.holder_id <> p.user_id OR s.hold_expires_at <= NOW());

    UPDATE payments p
    JOIN seats s ON (s.flight_id = 1 AND s.seat_no = p.seat_no)
    LEFT JOIN bookings b ON b.payment_id = p.payment_id
    SET p.status = 'REFUNDED'
    WHERE p.status = 'CHARGED'
      AND b.id IS NULL
      AND (s.status <> 'HELD' OR s.holder_id <> p.user_id OR s.hold_expires_at <= NOW());

    -- Row 4 of Decision Table: Not charged + Hold expired -> Release seat if still held
    CALL sp_reap_expired_holds(@reaped);

    -- Row 5 of Decision Table: Gateway REFUNDED + Booking exists -> Cancel the booking
    INSERT INTO reconciliation_audit (payment_id, idempotency_key, seat_no, action, reason)
    SELECT p.payment_id, p.idempotency_key, p.seat_no, 'CANCELLED_REFUNDED_BOOKING',
           'Reconciler: Payment REFUNDED while booking existed -> Cancelled booking'
    FROM payments p
    JOIN bookings b ON b.payment_id = p.payment_id
    WHERE p.status = 'REFUNDED' AND b.status = 'CONFIRMED';

    UPDATE bookings b
    JOIN payments p ON b.payment_id = p.payment_id
    SET b.status = 'CANCELLED'
    WHERE p.status = 'REFUNDED' AND b.status = 'CONFIRMED';
END //

DELIMITER ;

-- ============================================================================
-- INITIAL CLEAN SEED DATA (30 AVAILABLE SEATS, ZERO DEMO BOOKINGS)
-- ============================================================================
INSERT INTO users (user_id, user_name, email, role) VALUES
(1, 'System Administrator', 'admin@endureair.internal', 'ADMIN');

INSERT INTO flights (flight_id, flight_number, origin, destination, departure_time, total_cabin_seats, flight_status) VALUES
(1, 'EA-101', 'DEL (New Delhi)', 'BOM (Mumbai)', '2026-10-30 18:30:00', 30, 'BOARDING');

INSERT INTO seats (flight_id, seat_no, status, holder_id, passenger_name, hold_expires_at, version) VALUES
(1, 1,  'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 2,  'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 3,  'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 4,  'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 5,  'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 6,  'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 7,  'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 8,  'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 9,  'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 10, 'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 11, 'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 12, 'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 13, 'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 14, 'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 15, 'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 16, 'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 17, 'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 18, 'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 19, 'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 20, 'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 21, 'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 22, 'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 23, 'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 24, 'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 25, 'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 26, 'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 27, 'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 28, 'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 29, 'AVAILABLE', NULL, 'AVAILABLE', NULL, 0),
(1, 30, 'AVAILABLE', NULL, 'AVAILABLE', NULL, 0);

INSERT INTO booking_journal (txn_id, idempotency_key, step, state, details) VALUES
(0, 'SYSTEM_BOOT', 'CHECKPOINT', 'CLEAN_INIT', 'Engine Initialized at Stable Checkpoint (All 30 Seats AVAILABLE)');

SELECT 'EndureAir Revised Schema Initialized!' AS Status,
       COUNT(*) AS Total_Seats,
       SUM(CASE WHEN status = 'AVAILABLE' THEN 1 ELSE 0 END) AS Available_Seats
FROM seats;
