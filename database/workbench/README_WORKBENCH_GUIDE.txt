=====================================================================
  ENDUREAIR: SQL WORKBENCH QUICK START & EVALUATION GUIDE (REVISED)
=====================================================================

This package contains the complete MySQL 8.0 database schema, triggers,
views, stored procedures, B-Tree indexes, and evaluation queries for the
revised EndureAir Crash-Consistent Reservation & Payment Reconciler.

---------------------------------------------------------------------
PACKAGE CONTENTS:
---------------------------------------------------------------------
1. 01_endure_air_schema_and_seed.sql
   - 3NF/BCNF + 4NF relational schema:
     * users, flights, seats (Weak Entity with 60s hold_expires_at TTL & version)
     * idempotency_keys, outbox (Producer-Consumer queue)
     * payments (External Mock Gateway Ledger)
     * bookings, booking_journal (with Checkpoints), reconciliation_audit
     * passenger_meal_choices & passenger_baggage_tags (4NF example)
   - DBMS Unit 3 Programmability:
     * B-Tree Index: idx_seats_status_expiry ON seats(status, hold_expires_at)
     * Trigger: trg_seats_state_audit
     * Views: v_cabin_manifest, v_reconciliation_discrepancies
     * Stored Procedures:
       - sp_hold_seat_with_expiry
       - sp_atomic_confirm_booking
       - sp_reap_expired_holds
       - sp_run_reconciler

2. 02_evaluation_demo_queries.sql
   - Ready-to-run queries for the evaluator:
     * Query 1: Live 30-Seat State Machine (AVAILABLE, HELD with TTL, BOOKED)
     * Query 2: EXPLAIN query proving B-Tree Index usage on hold expiry
     * Query 3: Automated 4 Golden Invariants Verification (0 violations)
     * Query 4: Discrepancy diagnosis view (Gateway vs. Database)
     * Query 5: Application-level Booking Journal with Checkpoints
     * Query 6: Reconciler Audit Trail

3. 03_ER_Diagram_and_Architecture.md
   - Complete ER Diagram (with Weak Entity), Functional Dependencies,
     formal 3NF/BCNF & 4NF proofs, and the 5-Row Reconciler Decision Table.

---------------------------------------------------------------------
HOW TO RUN IN MYSQL COMMAND LINE OR WORKBENCH:
---------------------------------------------------------------------
1. Load Schema:
   mysql -u root -pyash1906 < EndureAir_Database_Workbench/01_endure_air_schema_and_seed.sql

2. Run Evaluation Queries:
   mysql -u root -pyash1906 endure_air_db < EndureAir_Database_Workbench/02_evaluation_demo_queries.sql
=====================================================================
