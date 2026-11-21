#include "bijendra_dbms.h"
#include <iostream>
#include <fstream>
#include <sstream>
#include <iomanip>
#include <algorithm>
#include <cstdlib>

// ============================================================================
// Booking Journal Implementation (DBMS Unit 5: Cross-System Workflow Log)
// ============================================================================
BookingJournal::BookingJournal(const std::string& path) : journalPath(path) {}

void BookingJournal::append(int txnId, const std::string& idemKey, const std::string& step,
                            const std::string& state, const std::string& details) {
    std::lock_guard<std::mutex> lock(journalMutex);
    int nextId = static_cast<int>(entries.size() + 1);
    entries.push_back({nextId, txnId, idemKey, step, state, details});

    std::ofstream file(journalPath, std::ios::app);
    if (file.is_open()) {
        file << nextId << " | Txn#" << txnId << " | Key=" << idemKey
             << " | Step=" << std::left << std::setw(18) << step
             << " | State=" << std::setw(18) << state
             << " | " << details << "\n";
        file.flush();
    }
}

void BookingJournal::clear() {
    std::lock_guard<std::mutex> lock(journalMutex);
    entries.clear();
    std::ofstream file(journalPath, std::ios::trunc);
    if (file.is_open()) {
        file << "1 | Txn#0 | Key=SYSTEM_BOOT | Step=CHECKPOINT         | State=CLEAN_INIT         | Engine Initialized at Stable Checkpoint (All 30 Seats AVAILABLE)\n";
        file.flush();
    }
    entries.push_back({1, 0, "SYSTEM_BOOT", "CHECKPOINT", "CLEAN_INIT", "Engine Initialized at Stable Checkpoint (All 30 Seats AVAILABLE)"});
}

void BookingJournal::printJournal() {
    std::lock_guard<std::mutex> lock(journalMutex);
    std::cout << "\n================ [DBMS UNIT 5] APPLICATION BOOKING JOURNAL (WITH CHECKPOINTS) ================\n";
    std::cout << "Note: InnoDB redo logs protect single-DB pages; this journal tracks cross-system workflows.\n";
    std::cout << "----------------------------------------------------------------------------------------------\n";
    std::cout << std::left << std::setw(5) << "ID"
              << std::setw(8) << "TxnID"
              << std::setw(18) << "IdempotencyKey"
              << std::setw(20) << "Workflow Step"
              << std::setw(18) << "State"
              << "Details\n";
    std::cout << "----------------------------------------------------------------------------------------------\n";
    for (const auto& e : entries) {
        std::cout << std::left << std::setw(5) << e.id
                  << std::setw(8) << e.txnId
                  << std::setw(18) << e.idempotencyKey
                  << std::setw(20) << e.step
                  << std::setw(18) << e.state
                  << e.details << "\n";
    }
    std::cout << "==============================================================================================\n\n";
}

// ============================================================================
// EndureAirDatabase Implementation
// ============================================================================
EndureAirDatabase::EndureAirDatabase(bool enableMySqlSync)
    : nextPaymentId(1), nextBookingId(1), nextTxnId(101),
      syncWithMySqlServer(enableMySqlSync), journal("wal.log"), outboxQueue(64) {
    for (int i = 0; i < DB_TOTAL_SEATS; ++i) {
        seats[i].seatNumber = i + 1;
        seats[i].status = SEAT_AVAILABLE;
        seats[i].holderUserId = -1;
        seats[i].passengerName = "AVAILABLE";
        seats[i].holdExpiresAt = 0;
        seats[i].version = 0;
    }
}

void EndureAirDatabase::executeMySqlCommand(const std::string& sql) {
    if (!syncWithMySqlServer) return;
    std::ofstream sqlOut("database_state.sql", std::ios::app);
    if (sqlOut.is_open()) {
        sqlOut << sql << "\n";
        sqlOut.flush();
    }
    std::string cmd = "\"\"C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe\" -u root -pyash1906 endure_air_db -e \"" + sql + "\" >nul 2>&1\"";
    std::system(cmd.c_str());
}

void EndureAirDatabase::resetAllClean() {
    std::lock_guard<std::mutex> lock(dbGlobalMutex);
    for (int i = 0; i < DB_TOTAL_SEATS; ++i) {
        seats[i].seatNumber = i + 1;
        seats[i].status = SEAT_AVAILABLE;
        seats[i].holderUserId = -1;
        seats[i].passengerName = "AVAILABLE";
        seats[i].holdExpiresAt = 0;
        seats[i].version = 0;
    }
    idempotencyTable.clear();
    outboxTable.clear();
    OutboxMessage dummy;
    while (outboxQueue.tryConsume(dummy)) {}
    paymentsLedger.clear();
    bookingsTable.clear();
    reconciliationAudit.clear();
    nextPaymentId = 1;
    nextBookingId = 1;
    nextTxnId = 101;

    journal.clear();

    std::ofstream sqlOut("database_state.sql", std::ios::trunc);
    if (sqlOut.is_open()) {
        sqlOut << "-- EndureAir Live SQL Transaction Ledger (Revised Plan)\nUSE endure_air_db;\n\n";
    }

    dumpDatabaseToFile("database_state.txt");
    saveBinaryState("engine_state.dat");
}

// ============================================================================
// Step 3 & Step 5: Hold Seat with Expiry + Idempotency + Outbox
// ============================================================================
bool EndureAirDatabase::holdSeatWithExpiry(int seatNo, int userId, const std::string& passengerName,
                                           const std::string& idempotencyKey, int ttlSeconds,
                                           std::string& outStatus) {
    if (seatNo < 1 || seatNo > DB_TOTAL_SEATS) {
        outStatus = "INVALID_SEAT";
        return false;
    }

    std::lock_guard<std::mutex> globalLock(dbGlobalMutex);
    std::string reqHash = std::to_string(userId) + ":" + std::to_string(seatNo);

    // Step 5: Check Idempotency Key first
    auto idemIt = idempotencyTable.find(idempotencyKey);
    if (idemIt != idempotencyTable.end()) {
        if (idemIt->second.requestHash != reqHash) {
            outStatus = "IDEMPOTENCY_PAYLOAD_MISMATCH_REJECTED";
            return false;
        }
        outStatus = "IDEMPOTENT_REPLAY:" + idemIt->second.responsePayload;
        return true;
    }

    DbSeat& seat = seats[seatNo - 1];
    std::lock_guard<std::mutex> rowLock(seat.seatLock);
    std::time_t now = std::time(nullptr);

    // Conditional update: AVAILABLE or (HELD and hold_expires_at <= NOW())
    bool isAvailableOrExpired = (seat.status == SEAT_AVAILABLE) ||
                                (seat.status == SEAT_HELD && seat.holdExpiresAt <= now);

    if (!isAvailableOrExpired) {
        outStatus = "SEAT_UNAVAILABLE";
        return false;
    }

    int txnId = nextTxnId++;
    seat.status = SEAT_HELD;
    seat.holderUserId = userId;
    seat.passengerName = passengerName;
    seat.holdExpiresAt = now + ttlSeconds;
    seat.version += 1;

    idempotencyTable[idempotencyKey] = {
        idempotencyKey, userId, seatNo, reqHash, "IN_PROGRESS", "SEAT_HELD"
    };

    OutboxMessage msg = {
        static_cast<int>(outboxTable.size() + 1),
        idempotencyKey, userId, passengerName, seatNo, 4500.00
    };
    outboxTable.push_back(msg);
    outboxQueue.produce(msg);

    journal.append(txnId, idempotencyKey, "HOLD_CREATED", "SEAT_HELD",
                   "Seat #" + std::to_string(seatNo) + " held for " + passengerName +
                   " (TTL=" + std::to_string(ttlSeconds) + "s) + Outbox PENDING");

    executeMySqlCommand("CALL sp_hold_seat_with_expiry(" + std::to_string(seatNo) + ", " +
                        std::to_string(userId) + ", '" + passengerName + "', '" +
                        idempotencyKey + "', " + std::to_string(ttlSeconds) + ", @st);");

    outStatus = "HOLD_ACQUIRED";
    dumpDatabaseToFile("database_state.txt");
    saveBinaryState("engine_state.dat");
    return true;
}

void EndureAirDatabase::forceExpireSeatHold(int seatNo) {
    if (seatNo < 1 || seatNo > DB_TOTAL_SEATS) return;
    std::lock_guard<std::mutex> lock(dbGlobalMutex);
    seats[seatNo - 1].holdExpiresAt = std::time(nullptr) - 10; // Expired 10s ago
    executeMySqlCommand("UPDATE seats SET hold_expires_at = NOW() - INTERVAL 10 SECOND WHERE flight_id = 1 AND seat_no = " + std::to_string(seatNo) + ";");
    dumpDatabaseToFile("database_state.txt");
    saveBinaryState("engine_state.dat");
}

// ============================================================================
// Step 4: TTL Reaper (Releases expired holds back to AVAILABLE)
// ============================================================================
int EndureAirDatabase::reapExpiredHolds() {
    std::lock_guard<std::mutex> lock(dbGlobalMutex);
    std::time_t now = std::time(nullptr);
    int reapedCount = 0;

    for (int i = 0; i < DB_TOTAL_SEATS; ++i) {
        if (seats[i].status == SEAT_HELD && seats[i].holdExpiresAt <= now) {
            seats[i].status = SEAT_AVAILABLE;
            seats[i].holderUserId = -1;
            seats[i].passengerName = "AVAILABLE";
            seats[i].holdExpiresAt = 0;
            seats[i].version += 1;
            reapedCount++;
            OutboxMessage dropped;
            outboxQueue.tryConsume(dropped);

            reconciliationAudit.push_back({
                static_cast<int>(reconciliationAudit.size() + 1),
                0,
                "TTL_REAPER_SEAT_" + std::to_string(seats[i].seatNumber),
                seats[i].seatNumber,
                "RELEASED_EXPIRED_HOLD",
                "TTL Reaper freed expired hold on Seat #" + std::to_string(seats[i].seatNumber)
            });

            journal.append(nextTxnId++, "TTL_REAPER", "RECONCILED", "HOLD_EXPIRED_FREED",
                           "Seat #" + std::to_string(seats[i].seatNumber) + " released back to AVAILABLE");
        }
    }

    if (reapedCount > 0) {
        executeMySqlCommand("CALL sp_reap_expired_holds(@r);");
        dumpDatabaseToFile("database_state.txt");
        saveBinaryState("engine_state.dat");
    }
    return reapedCount;
}

// ============================================================================
// Step 5: Idempotent Mock Payment Gateway
// ============================================================================
bool EndureAirDatabase::processIdempotentPayment(const std::string& idempotencyKey, int userId,
                                                 const std::string& passengerName, int seatNo,
                                                 double amount, GatewayMode mode,
                                                 int& outPaymentId, std::string& outGatewayStatus) {
    std::lock_guard<std::mutex> lock(dbGlobalMutex);

    // Consume pending message from Producer-Consumer Outbox Queue
    OutboxMessage consumedMsg;
    outboxQueue.tryConsume(consumedMsg);

    // Check if idempotencyKey already exists in the gateway's payments ledger!
    for (const auto& p : paymentsLedger) {
        if (p.idempotencyKey == idempotencyKey) {
            outPaymentId = p.paymentId;
            outGatewayStatus = p.status;
            journal.append(p.paymentId, idempotencyKey, "PAYMENT_CONFIRMED", "IDEMPOTENT_DEDUP",
                           "Gateway returned cached Payment #" + std::to_string(p.paymentId) + " (Zero double charge)");
            return p.status == "CHARGED";
        }
    }

    int pid = nextPaymentId++;
    outPaymentId = pid;

    std::string modeName = (mode == GW_SUCCESS) ? "SUCCESS" :
                           (mode == GW_FAILURE) ? "FAILURE" :
                           (mode == GW_CHARGED_RESPONSE_LOST) ? "CHARGED_RESPONSE_LOST" :
                           "SLOW_AFTER_EXPIRY";

    journal.append(pid, idempotencyKey, "PAYMENT_REQUESTED", modeName,
                   "Outbox worker called gateway for Seat #" + std::to_string(seatNo));

    if (mode == GW_FAILURE) {
        paymentsLedger.push_back({pid, idempotencyKey, userId, passengerName, seatNo, amount, "FAILED", modeName});
        outGatewayStatus = "FAILED";
        dumpDatabaseToFile("database_state.txt");
        saveBinaryState("engine_state.dat");
        return false;
    }

    // Record CHARGED in gateway ledger
    paymentsLedger.push_back({pid, idempotencyKey, userId, passengerName, seatNo, amount, "CHARGED", modeName});
    outGatewayStatus = "CHARGED";

    journal.append(pid, idempotencyKey, "PAYMENT_CONFIRMED", "CHARGED",
                   "Gateway charged Rs." + std::to_string(static_cast<int>(amount)) + " (Payment #" + std::to_string(pid) + ")");

    executeMySqlCommand("INSERT IGNORE INTO payments (payment_id, idempotency_key, user_id, passenger_name, seat_no, amount, status, gateway_mode) VALUES (" +
                        std::to_string(pid) + ", '" + idempotencyKey + "', " + std::to_string(userId) + ", '" +
                        passengerName + "', " + std::to_string(seatNo) + ", 4500.00, 'CHARGED', '" + modeName + "');");

    dumpDatabaseToFile("database_state.txt");
    saveBinaryState("engine_state.dat");

    if (mode == GW_CHARGED_RESPONSE_LOST) {
        outGatewayStatus = "NETWORK_TIMEOUT_RESPONSE_LOST";
        return false; // Client thinks it timed out, even though gateway charged!
    }

    return true;
}

// ============================================================================
// Step 6: Atomic Conditional Confirm (Stored Procedure Equivalent)
// ============================================================================
bool EndureAirDatabase::atomicConfirmBooking(int seatNo, int userId, const std::string& passengerName,
                                             int paymentId, const std::string& idempotencyKey,
                                             std::string& outConfirmStatus) {
    std::lock_guard<std::mutex> lock(dbGlobalMutex);

    // Idempotent check: if booking already exists for this paymentId/idempotencyKey, return true
    for (const auto& b : bookingsTable) {
        if (b.idempotencyKey == idempotencyKey && b.status == "CONFIRMED") {
            outConfirmStatus = "ALREADY_CONFIRMED_IDEMPOTENT";
            return true;
        }
    }

    DbSeat& seat = seats[seatNo - 1];
    std::lock_guard<std::mutex> rowLock(seat.seatLock);
    std::time_t now = std::time(nullptr);

    // Conditional check: status == HELD AND holder_id == userId AND hold_expires_at > NOW()
    if (seat.status == SEAT_HELD && seat.holderUserId == userId && seat.holdExpiresAt > now) {
        seat.status = SEAT_BOOKED;
        seat.holdExpiresAt = 0;
        seat.version += 1;

        int bid = nextBookingId++;
        bookingsTable.push_back({bid, seatNo, userId, passengerName, paymentId, idempotencyKey, "CONFIRMED"});

        if (idempotencyTable.find(idempotencyKey) != idempotencyTable.end()) {
            idempotencyTable[idempotencyKey].status = "COMPLETED";
            idempotencyTable[idempotencyKey].responsePayload = "CONFIRMED_BOOKING_" + std::to_string(bid);
        }

        journal.append(paymentId, idempotencyKey, "BOOKING_CONFIRMED", "BOOKED",
                       "Booking #" + std::to_string(bid) + " confirmed on Seat #" + std::to_string(seatNo));
        journal.append(paymentId, idempotencyKey, "CHECKPOINT", "WORKFLOW_COMPLETE",
                       "Cross-system workflow completed & checkpointed");

        executeMySqlCommand("CALL sp_atomic_confirm_booking(" + std::to_string(seatNo) + ", " +
                            std::to_string(userId) + ", '" + passengerName + "', " +
                            std::to_string(paymentId) + ", '" + idempotencyKey + "', @res);");

        outConfirmStatus = "BOOKING_CONFIRMED";
        dumpDatabaseToFile("database_state.txt");
        saveBinaryState("engine_state.dat");
        return true;
    }

    // Scenario D: Hold expired or seat taken by another user! Refund the late payment.
    for (auto& p : paymentsLedger) {
        if (p.paymentId == paymentId && p.status == "CHARGED") {
            p.status = "REFUNDED";
        }
    }
    if (idempotencyTable.find(idempotencyKey) != idempotencyTable.end()) {
        idempotencyTable[idempotencyKey].status = "FAILED";
        idempotencyTable[idempotencyKey].responsePayload = "REFUNDED_HOLD_EXPIRED";
    }

    reconciliationAudit.push_back({
        static_cast<int>(reconciliationAudit.size() + 1),
        paymentId, idempotencyKey, seatNo,
        "REFUNDED_LATE_PAYMENT",
        "Atomic confirm rejected late payment (hold expired/taken); automatically refunded Payment #" + std::to_string(paymentId)
    });

    journal.append(paymentId, idempotencyKey, "RECONCILED", "LATE_PAYMENT_REFUNDED",
                   "Hold expired on Seat #" + std::to_string(seatNo) + "; Payment #" + std::to_string(paymentId) + " refunded");

    executeMySqlCommand("CALL sp_atomic_confirm_booking(" + std::to_string(seatNo) + ", " +
                        std::to_string(userId) + ", '" + passengerName + "', " +
                        std::to_string(paymentId) + ", '" + idempotencyKey + "', @res);");

    outConfirmStatus = "REFUNDED_HOLD_EXPIRED";
    dumpDatabaseToFile("database_state.txt");
    saveBinaryState("engine_state.dat");
    return false;
}

// ============================================================================
// End-to-End Reservation Workflow (Hold -> Outbox/Pay -> Atomic Confirm)
// ============================================================================
bool EndureAirDatabase::executeReservationWorkflow(int userId, const std::string& passengerName,
                                                   int seatNo, const std::string& idempotencyKey,
                                                   int ttlSeconds, GatewayMode gwMode,
                                                   FailPoint crashFp, bool realProcessExit) {
    std::string holdStatus;
    bool held = holdSeatWithExpiry(seatNo, userId, passengerName, idempotencyKey, ttlSeconds, holdStatus);

    if (!held) {
        std::cout << "  [Hold Step] Rejected: " << holdStatus << "\n";
        return false;
    }

    // If this is an idempotent retry of an already completed booking, return immediately!
    if (holdStatus.find("IDEMPOTENT_REPLAY:CONFIRMED") == 0) {
        std::cout << "  [Idempotency Layer] Duplicate request key '" << idempotencyKey
                  << "' detected! Returning cached confirmation: " << holdStatus << "\n";
        return true;
    }

    // Check Fail Point 1: Crash right after seat hold, before calling payment gateway (Scenario A)
    CrashHarness::maybeTriggerCrash(FP_AFTER_HOLD, crashFp,
        "Worker crashed after holding Seat #" + std::to_string(seatNo) + " before payment.", realProcessExit);

    // If Scenario D (GW_SLOW_AFTER_EXPIRY), simulate hold expiring before payment returns
    if (gwMode == GW_SLOW_AFTER_EXPIRY) {
        std::cout << "  [Gateway Slow Mode] Payment gateway delayed >60s; Seat #" << seatNo << " hold expires...\n";
        forceExpireSeatHold(seatNo);
        reapExpiredHolds();
    }

    int paymentId = -1;
    std::string gwStatus;
    bool paid = processIdempotentPayment(idempotencyKey, userId, passengerName, seatNo, 4500.00, gwMode, paymentId, gwStatus);

    // Check Fail Point 2: Crash right after payment succeeds at gateway, before DB confirm (Scenario B)
    CrashHarness::maybeTriggerCrash(FP_AFTER_PAYMENT, crashFp,
        "Worker crashed after Payment #" + std::to_string(paymentId) + " CHARGED, before DB booking confirm!", realProcessExit);

    if (!paid) {
        std::cout << "  [Gateway Step] Payment result: " << gwStatus << " (Payment ID: #" << paymentId << ")\n";
        return false;
    }

    // Check Fail Point 3: Crash right before confirm commit
    CrashHarness::maybeTriggerCrash(FP_BEFORE_CONFIRM, crashFp,
        "Worker crashed immediately prior to sp_atomic_confirm_booking!", realProcessExit);

    std::string confirmStatus;
    bool confirmed = atomicConfirmBooking(seatNo, userId, passengerName, paymentId, idempotencyKey, confirmStatus);
    std::cout << "  [Confirm Step] Result: " << confirmStatus << "\n";
    return confirmed;
}

// ============================================================================
// Step 8: Idempotent Reconciler (Implements the 5-Row Decision Table)
// ============================================================================
int EndureAirDatabase::runReconciler(FailPoint crashFp, bool realProcessExit) {
    int actionsTaken = 0;

    // First: Run TTL Reaper (Row 4 of Decision Table: Not charged + Hold expired -> Release seat)
    actionsTaken += reapExpiredHolds();

    std::lock_guard<std::mutex> lock(dbGlobalMutex);
    std::time_t now = std::time(nullptr);

    for (size_t idx = 0; idx < paymentsLedger.size(); ++idx) {
        auto& p = paymentsLedger[idx];
        DbSeat& seat = seats[p.seatNo - 1];

        // Find if a confirmed booking exists for this payment
        BookingRecord* existingBooking = nullptr;
        for (auto& b : bookingsTable) {
            if (b.paymentId == p.paymentId && b.status == "CONFIRMED") {
                existingBooking = &b;
                break;
            }
        }

        if (p.status == "CHARGED") {
            if (existingBooking != nullptr) {
                // Row 3 of Decision Table: Charged + Booking exists -> Nothing to do (Idempotent no-op)
                continue;
            }

            // Check if hold is still valid for this user
            if (seat.status == SEAT_HELD && seat.holderUserId == p.userId && seat.holdExpiresAt > now) {
                // Row 1 of Decision Table: Charged + Hold valid, no booking -> Confirm the booking
                seat.status = SEAT_BOOKED;
                seat.holdExpiresAt = 0;
                seat.version += 1;

                int bid = nextBookingId++;
                bookingsTable.push_back({bid, p.seatNo, p.userId, p.passengerName, p.paymentId, p.idempotencyKey, "CONFIRMED"});

                if (idempotencyTable.find(p.idempotencyKey) != idempotencyTable.end()) {
                    idempotencyTable[p.idempotencyKey].status = "COMPLETED";
                    idempotencyTable[p.idempotencyKey].responsePayload = "CONFIRMED_BOOKING_" + std::to_string(bid);
                }

                reconciliationAudit.push_back({
                    static_cast<int>(reconciliationAudit.size() + 1),
                    p.paymentId, p.idempotencyKey, p.seatNo,
                    "CONFIRMED_BOOKING",
                    "Decision Row 1: Payment CHARGED & hold valid -> Reconciler confirmed Booking #" + std::to_string(bid)
                });

                journal.append(p.paymentId, p.idempotencyKey, "RECONCILED", "CONFIRMED_BOOKING",
                               "Reconciler repaired Scenario B crash: Confirmed Seat #" + std::to_string(p.seatNo));
                journal.append(p.paymentId, p.idempotencyKey, "CHECKPOINT", "WORKFLOW_COMPLETE",
                               "Reconciled workflow checkpointed");
                actionsTaken++;
            } else {
                // Row 2 of Decision Table: Charged + Hold expired or seat taken by another user -> Refund
                p.status = "REFUNDED";
                if (idempotencyTable.find(p.idempotencyKey) != idempotencyTable.end()) {
                    idempotencyTable[p.idempotencyKey].status = "FAILED";
                    idempotencyTable[p.idempotencyKey].responsePayload = "REFUNDED_BY_RECONCILER";
                }

                reconciliationAudit.push_back({
                    static_cast<int>(reconciliationAudit.size() + 1),
                    p.paymentId, p.idempotencyKey, p.seatNo,
                    "REFUNDED_LATE_PAYMENT",
                    "Decision Row 2: Payment CHARGED but hold expired/taken -> Reconciler refunded Payment #" + std::to_string(p.paymentId)
                });

                journal.append(p.paymentId, p.idempotencyKey, "RECONCILED", "REFUNDED_PAYMENT",
                               "Reconciler refunded orphan/late Payment #" + std::to_string(p.paymentId));
                actionsTaken++;
            }
        } else if (p.status == "REFUNDED" && existingBooking != nullptr) {
            // Row 5 of Decision Table: Refunded + Booking exists -> Cancel the booking
            existingBooking->status = "CANCELLED";
            if (seat.status == SEAT_BOOKED && seat.holderUserId == p.userId) {
                seat.status = SEAT_AVAILABLE;
                seat.holderUserId = -1;
                seat.passengerName = "AVAILABLE";
                seat.version += 1;
            }

            reconciliationAudit.push_back({
                static_cast<int>(reconciliationAudit.size() + 1),
                p.paymentId, p.idempotencyKey, p.seatNo,
                "CANCELLED_REFUNDED_BOOKING",
                "Decision Row 5: Payment REFUNDED while booking existed -> Cancelled booking"
            });
            actionsTaken++;
        }

        // Scenario G: Crash Reconciler mid-run after repairing 1 record
        if (crashFp == FP_MID_RECONCILE && actionsTaken == 1) {
            dumpDatabaseToFile("database_state.txt");
            saveBinaryState("engine_state.dat");
            CrashHarness::maybeTriggerCrash(FP_MID_RECONCILE, crashFp,
                "Reconciler crashed mid-run after repairing 1 item!", realProcessExit);
        }
    }

    if (actionsTaken > 0) {
        executeMySqlCommand("CALL sp_run_reconciler();");
    }
    dumpDatabaseToFile("database_state.txt");
    saveBinaryState("engine_state.dat");
    return actionsTaken;
}

// ============================================================================
// Step 9: Automated 4 Golden Invariants Verification
// ============================================================================
InvariantReport EndureAirDatabase::verifyInvariants(bool verbose) {
    std::lock_guard<std::mutex> lock(dbGlobalMutex);
    InvariantReport rep = {0, 0, 0, 0};
    std::time_t now = std::time(nullptr);

    // Invariant 1: Every CHARGED payment has exactly 1 CONFIRMED booking (and every REFUNDED has 0)
    for (const auto& p : paymentsLedger) {
        int confirmedCount = 0;
        for (const auto& b : bookingsTable) {
            if (b.paymentId == p.paymentId && b.status == "CONFIRMED") {
                confirmedCount++;
            }
        }
        if (p.status == "CHARGED" && confirmedCount != 1) {
            rep.inv1UnreconciledCharges++;
        } else if (p.status == "REFUNDED" && confirmedCount != 0) {
            rep.inv1UnreconciledCharges++;
        }
    }

    // Invariant 2: No seat has two confirmed bookings
    std::map<int, int> seatBookingCounts;
    for (const auto& b : bookingsTable) {
        if (b.status == "CONFIRMED") {
            seatBookingCounts[b.seatNo]++;
        }
    }
    for (const auto& kv : seatBookingCounts) {
        if (kv.second > 1) {
            rep.inv2DoubleBookedSeats += (kv.second - 1);
        }
    }

    // Invariant 3: No hold remains past its expiry
    for (int i = 0; i < DB_TOTAL_SEATS; ++i) {
        if (seats[i].status == SEAT_HELD && seats[i].holdExpiresAt <= now) {
            rep.inv3ExpiredStuckHolds++;
        }
    }

    // Invariant 4: No idempotency_key produces two charges
    std::map<std::string, int> keyCounts;
    for (const auto& p : paymentsLedger) {
        keyCounts[p.idempotencyKey]++;
    }
    for (const auto& kv : keyCounts) {
        if (kv.second > 1) {
            rep.inv4DuplicateIdemCharges += (kv.second - 1);
        }
    }

    if (verbose) {
        std::cout << "\n================ [CORRECTNESS VERIFICATION: 4 GOLDEN INVARIANTS] ================\n";
        std::cout << "  Invariant 1 (Every CHARGED payment = 1 booking or 1 refund): "
                  << (rep.inv1UnreconciledCharges == 0 ? "PASS (0 violations)" : "FAIL (" + std::to_string(rep.inv1UnreconciledCharges) + " violations)") << "\n";
        std::cout << "  Invariant 2 (No seat has two confirmed bookings)           : "
                  << (rep.inv2DoubleBookedSeats == 0 ? "PASS (0 violations)" : "FAIL (" + std::to_string(rep.inv2DoubleBookedSeats) + " violations)") << "\n";
        std::cout << "  Invariant 3 (No hold remains past its expiry)              : "
                  << (rep.inv3ExpiredStuckHolds == 0 ? "PASS (0 violations)" : "FAIL (" + std::to_string(rep.inv3ExpiredStuckHolds) + " violations)") << "\n";
        std::cout << "  Invariant 4 (No idempotency_key produces two charges)      : "
                  << (rep.inv4DuplicateIdemCharges == 0 ? "PASS (0 violations)" : "FAIL (" + std::to_string(rep.inv4DuplicateIdemCharges) + " violations)") << "\n";
        std::cout << "---------------------------------------------------------------------------------\n";
        std::cout << "  OVERALL VERDICT: " << (rep.allPassed() ? "ALL 4 INVARIANTS HOLD (0 VIOLATIONS)" : "INVARIANT VIOLATION DETECTED") << "\n";
        std::cout << "=================================================================================\n\n";
    }
    return rep;
}

// ============================================================================
// Binary & Text State Persistence (for Multi-Process Crash Harness)
// ============================================================================
void EndureAirDatabase::saveBinaryState(const std::string& stateFile) {
    std::ofstream out(stateFile, std::ios::trunc);
    if (!out.is_open()) return;

    out << nextPaymentId << " " << nextBookingId << " " << nextTxnId << "\n";
    for (int i = 0; i < DB_TOTAL_SEATS; ++i) {
        out << seats[i].seatNumber << "|" << static_cast<int>(seats[i].status) << "|"
            << seats[i].holderUserId << "|" << seats[i].passengerName << "|"
            << seats[i].holdExpiresAt << "|" << seats[i].version << "\n";
    }

    out << idempotencyTable.size() << "\n";
    for (const auto& kv : idempotencyTable) {
        const auto& r = kv.second;
        out << r.idempotencyKey << "|" << r.userId << "|" << r.seatNo << "|"
            << r.requestHash << "|" << r.status << "|" << r.responsePayload << "\n";
    }

    out << paymentsLedger.size() << "\n";
    for (const auto& p : paymentsLedger) {
        out << p.paymentId << "|" << p.idempotencyKey << "|" << p.userId << "|"
            << p.passengerName << "|" << p.seatNo << "|" << p.amount << "|"
            << p.status << "|" << p.modeStr << "\n";
    }

    out << bookingsTable.size() << "\n";
    for (const auto& b : bookingsTable) {
        out << b.bookingId << "|" << b.seatNo << "|" << b.userId << "|"
            << b.passengerName << "|" << b.paymentId << "|" << b.idempotencyKey << "|"
            << b.status << "\n";
    }
    out.flush();
}

bool EndureAirDatabase::loadBinaryState(const std::string& stateFile) {
    std::lock_guard<std::mutex> lock(dbGlobalMutex);
    std::ifstream in(stateFile);
    if (!in.is_open()) return false;

    std::string line;
    if (!std::getline(in, line) || line.empty()) return false;
    {
        std::stringstream ss(line);
        ss >> nextPaymentId >> nextBookingId >> nextTxnId;
    }

    for (int i = 0; i < DB_TOTAL_SEATS; ++i) {
        if (!std::getline(in, line)) break;
        std::stringstream ss(line);
        std::string sNum, st, uid, name, exp, ver;
        std::getline(ss, sNum, '|');
        std::getline(ss, st, '|');
        std::getline(ss, uid, '|');
        std::getline(ss, name, '|');
        std::getline(ss, exp, '|');
        std::getline(ss, ver, '|');

        seats[i].seatNumber = std::stoi(sNum);
        seats[i].status = static_cast<SeatStatus>(std::stoi(st));
        seats[i].holderUserId = std::stoi(uid);
        seats[i].passengerName = name;
        seats[i].holdExpiresAt = static_cast<std::time_t>(std::stoll(exp));
        seats[i].version = std::stoi(ver);
    }

    if (std::getline(in, line)) {
        size_t count = std::stoul(line);
        idempotencyTable.clear();
        for (size_t i = 0; i < count; ++i) {
            std::getline(in, line);
            std::stringstream ss(line);
            IdempotencyRecord r;
            std::string uStr, sStr;
            std::getline(ss, r.idempotencyKey, '|');
            std::getline(ss, uStr, '|');
            std::getline(ss, sStr, '|');
            std::getline(ss, r.requestHash, '|');
            std::getline(ss, r.status, '|');
            std::getline(ss, r.responsePayload, '|');
            r.userId = std::stoi(uStr);
            r.seatNo = std::stoi(sStr);
            idempotencyTable[r.idempotencyKey] = r;
        }
    }

    if (std::getline(in, line)) {
        size_t count = std::stoul(line);
        paymentsLedger.clear();
        for (size_t i = 0; i < count; ++i) {
            std::getline(in, line);
            std::stringstream ss(line);
            PaymentRecord p;
            std::string pidStr, uStr, sStr, amtStr;
            std::getline(ss, pidStr, '|');
            std::getline(ss, p.idempotencyKey, '|');
            std::getline(ss, uStr, '|');
            std::getline(ss, p.passengerName, '|');
            std::getline(ss, sStr, '|');
            std::getline(ss, amtStr, '|');
            std::getline(ss, p.status, '|');
            std::getline(ss, p.modeStr, '|');
            p.paymentId = std::stoi(pidStr);
            p.userId = std::stoi(uStr);
            p.seatNo = std::stoi(sStr);
            p.amount = std::stod(amtStr);
            paymentsLedger.push_back(p);
        }
    }

    if (std::getline(in, line)) {
        size_t count = std::stoul(line);
        bookingsTable.clear();
        for (size_t i = 0; i < count; ++i) {
            std::getline(in, line);
            std::stringstream ss(line);
            BookingRecord b;
            std::string bidStr, sStr, uStr, pidStr;
            std::getline(ss, bidStr, '|');
            std::getline(ss, sStr, '|');
            std::getline(ss, uStr, '|');
            std::getline(ss, b.passengerName, '|');
            std::getline(ss, pidStr, '|');
            std::getline(ss, b.idempotencyKey, '|');
            std::getline(ss, b.status, '|');
            b.bookingId = std::stoi(bidStr);
            b.seatNo = std::stoi(sStr);
            b.userId = std::stoi(uStr);
            b.paymentId = std::stoi(pidStr);
            bookingsTable.push_back(b);
        }
    }
    return true;
}

void EndureAirDatabase::dumpDatabaseToFile(const std::string& filename) {
    std::ofstream out(filename, std::ios::trunc);
    if (!out.is_open()) return;

    std::time_t now = std::time(nullptr);
    out << "=====================================================================================\n";
    out << "        ENDUREAIR: CRASH-CONSISTENT DATABASE & PAYMENT LEDGER SNAPSHOT               \n";
    out << "=====================================================================================\n\n";

    out << "[TABLE 1: SEATS (STATE MACHINE: AVAILABLE -> HELD (TTL) -> BOOKED)]\n";
    out << std::left << std::setw(8) << "Seat_No"
        << std::setw(14) << "Status"
        << std::setw(10) << "Holder_ID"
        << std::setw(18) << "Passenger_Name"
        << std::setw(14) << "Hold_TTL_Sec"
        << std::setw(8) << "Version\n";
    out << "-------------------------------------------------------------------------------------\n";
    for (int i = 0; i < DB_TOTAL_SEATS; ++i) {
        std::string stStr = (seats[i].status == SEAT_AVAILABLE) ? "AVAILABLE" :
                            (seats[i].status == SEAT_HELD)      ? "HELD" : "BOOKED";
        std::string ttlStr = "-";
        if (seats[i].status == SEAT_HELD) {
            long rem = static_cast<long>(seats[i].holdExpiresAt - now);
            ttlStr = std::to_string(rem) + "s";
        }
        out << std::left << std::setw(8) << seats[i].seatNumber
            << std::setw(14) << stStr
            << std::setw(10) << (seats[i].holderUserId > 0 ? std::to_string(seats[i].holderUserId) : "-")
            << std::setw(18) << seats[i].passengerName
            << std::setw(14) << ttlStr
            << "v" << seats[i].version << "\n";
    }

    out << "\n[TABLE 2: PAYMENTS LEDGER (MOCK EXTERNAL GATEWAY)]\n";
    out << std::left << std::setw(8) << "Pay_ID"
        << std::setw(20) << "Idempotency_Key"
        << std::setw(16) << "Passenger"
        << std::setw(8) << "Seat"
        << std::setw(12) << "Status"
        << "Gateway_Mode\n";
    out << "-------------------------------------------------------------------------------------\n";
    if (paymentsLedger.empty()) {
        out << "(No payment records)\n";
    } else {
        for (const auto& p : paymentsLedger) {
            out << std::left << std::setw(8) << p.paymentId
                << std::setw(20) << p.idempotencyKey
                << std::setw(16) << p.passengerName
                << std::setw(8) << p.seatNo
                << std::setw(12) << p.status
                << p.modeStr << "\n";
        }
    }

    out << "\n[TABLE 3: BOOKINGS (CONFIRMED TICKETS)]\n";
    out << std::left << std::setw(8) << "Book_ID"
        << std::setw(8) << "Seat"
        << std::setw(16) << "Passenger"
        << std::setw(10) << "Pay_ID"
        << std::setw(20) << "Idempotency_Key"
        << "Status\n";
    out << "-------------------------------------------------------------------------------------\n";
    if (bookingsTable.empty()) {
        out << "(No confirmed bookings)\n";
    } else {
        for (const auto& b : bookingsTable) {
            out << std::left << std::setw(8) << b.bookingId
                << std::setw(8) << b.seatNo
                << std::setw(16) << b.passengerName
                << std::setw(10) << b.paymentId
                << std::setw(20) << b.idempotencyKey
                << b.status << "\n";
        }
    }

    out << "\n[TABLE 4: RECONCILIATION AUDIT LOG]\n";
    if (reconciliationAudit.empty()) {
        out << "(No reconciliation repairs logged yet)\n";
    } else {
        for (const auto& r : reconciliationAudit) {
            out << "#" << r.auditId << " | Seat #" << r.seatNo
                << " | Action=" << r.action << " | " << r.reason << "\n";
        }
    }
    out << "=====================================================================================\n";
}

// ============================================================================
// Display Methods
// ============================================================================
void EndureAirDatabase::printSeatMap() {
    rwSeatMapLock.acquireReadLock();
    std::time_t now = std::time(nullptr);
    std::cout << "\n================ [ENDUREAIR 30-SEAT CABIN STATE MACHINE] ================\n";
    std::cout << std::left << std::setw(8) << "Seat#"
              << std::setw(14) << "State"
              << std::setw(18) << "Holder/Passenger"
              << std::setw(16) << "Hold Expiry"
              << "Lock Ver\n";
    std::cout << "-------------------------------------------------------------------------\n";
    for (int i = 0; i < DB_TOTAL_SEATS; ++i) {
        std::string stStr = (seats[i].status == SEAT_AVAILABLE) ? "AVAILABLE" :
                            (seats[i].status == SEAT_HELD)      ? "HELD" : "BOOKED";
        std::string ttlStr = "-";
        if (seats[i].status == SEAT_HELD) {
            long rem = static_cast<long>(seats[i].holdExpiresAt - now);
            ttlStr = (rem > 0) ? (std::to_string(rem) + "s remaining") : "EXPIRED (" + std::to_string(rem) + "s)";
        }
        std::cout << std::left << std::setw(8) << seats[i].seatNumber
                  << std::setw(14) << stStr
                  << std::setw(18) << seats[i].passengerName
                  << std::setw(16) << ttlStr
                  << "v" << seats[i].version << "\n";
    }
    std::cout << "=========================================================================\n\n";
    rwSeatMapLock.releaseReadLock();
}

void EndureAirDatabase::printPaymentAndBookingLedgers() {
    std::lock_guard<std::mutex> lock(dbGlobalMutex);
    std::cout << "\n================ [EXTERNAL MOCK PAYMENT GATEWAY LEDGER] ================\n";
    if (paymentsLedger.empty()) {
        std::cout << ">> No payment transactions recorded.\n";
    } else {
        std::cout << std::left << std::setw(8) << "PayID"
                  << std::setw(20) << "IdempotencyKey"
                  << std::setw(16) << "Passenger"
                  << std::setw(8) << "Seat#"
                  << std::setw(12) << "Status"
                  << "GatewayMode\n";
        std::cout << "------------------------------------------------------------------------\n";
        for (const auto& p : paymentsLedger) {
            std::cout << std::left << std::setw(8) << p.paymentId
                      << std::setw(20) << p.idempotencyKey
                      << std::setw(16) << p.passengerName
                      << std::setw(8) << p.seatNo
                      << std::setw(12) << p.status
                      << p.modeStr << "\n";
        }
    }

    std::cout << "\n================ [DATABASE CONFIRMED BOOKINGS TABLE] ===================\n";
    if (bookingsTable.empty()) {
        std::cout << ">> No confirmed bookings in database.\n";
    } else {
        std::cout << std::left << std::setw(8) << "BookID"
                  << std::setw(8) << "Seat#"
                  << std::setw(16) << "Passenger"
                  << std::setw(10) << "PayID"
                  << std::setw(20) << "IdempotencyKey"
                  << "Status\n";
        std::cout << "------------------------------------------------------------------------\n";
        for (const auto& b : bookingsTable) {
            std::cout << std::left << std::setw(8) << b.bookingId
                      << std::setw(8) << b.seatNo
                      << std::setw(16) << b.passengerName
                      << std::setw(10) << b.paymentId
                      << std::setw(20) << b.idempotencyKey
                      << b.status << "\n";
        }
    }
    std::cout << "========================================================================\n\n";
}

void EndureAirDatabase::printReconciliationAudit() {
    std::lock_guard<std::mutex> lock(dbGlobalMutex);
    std::cout << "\n================ [RECONCILER 5-ROW DECISION TABLE AUDIT LOG] ================\n";
    if (reconciliationAudit.empty()) {
        std::cout << ">> No reconciliation actions logged yet.\n";
    } else {
        for (const auto& r : reconciliationAudit) {
            std::cout << "  [Audit #" << r.auditId << "] Seat #" << r.seatNo
                      << " | Action: " << std::left << std::setw(24) << r.action
                      << " | " << r.reason << "\n";
        }
    }
    std::cout << "=============================================================================\n\n";
}
