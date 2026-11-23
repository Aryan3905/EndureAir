#ifndef BIJENDRA_DBMS_H
#define BIJENDRA_DBMS_H

#include "aryan_os.h"
#include <string>
#include <vector>
#include <map>
#include <mutex>
#include <ctime>

constexpr int DB_TOTAL_SEATS = 30;

// ============================================================================
// 1. Seat State Machine (AVAILABLE -> HELD with TTL -> BOOKED)
// ============================================================================
enum SeatStatus {
    SEAT_AVAILABLE = 0,
    SEAT_HELD = 1,
    SEAT_BOOKED = 2
};

struct DbSeat {
    int seatNumber;
    SeatStatus status;
    int holderUserId;
    std::string passengerName;
    std::time_t holdExpiresAt; // 0 if not held; epoch seconds when HELD
    int version;               // Optimistic Concurrency Control (CAS) version
    std::mutex seatLock;       // Row-level mutex for pessimistic locking
};

// ============================================================================
// 2. Idempotency Keys, Outbox, Payment Gateway Ledger, Bookings & Audit Models
// ============================================================================
struct IdempotencyRecord {
    std::string idempotencyKey;
    int userId;
    int seatNo;
    std::string requestHash;
    std::string status;          // "IN_PROGRESS", "COMPLETED", "FAILED"
    std::string responsePayload;
};

enum GatewayMode {
    GW_SUCCESS = 0,
    GW_FAILURE = 1,
    GW_CHARGED_RESPONSE_LOST = 2, // Scenario C: Charges card, drops response
    GW_SLOW_AFTER_EXPIRY = 3      // Scenario D: Charges card after hold expires
};

struct PaymentRecord {
    int paymentId;
    std::string idempotencyKey;
    int userId;
    std::string passengerName;
    int seatNo;
    double amount;
    std::string status; // "CHARGED", "REFUNDED", "FAILED"
    std::string modeStr;
};

struct BookingRecord {
    int bookingId;
    int seatNo;
    int userId;
    std::string passengerName;
    int paymentId;
    std::string idempotencyKey;
    std::string status; // "CONFIRMED", "CANCELLED"
};

struct ReconciliationAuditRecord {
    int auditId;
    int paymentId;
    std::string idempotencyKey;
    int seatNo;
    std::string action; // "CONFIRMED_BOOKING", "REFUNDED_LATE_PAYMENT", "RELEASED_EXPIRED_HOLD", "CANCELLED_REFUNDED_BOOKING"
    std::string reason;
};

// ============================================================================
// 3. Application-Level Booking Journal (Cross-System Workflow Log + Checkpoints)
// ============================================================================
struct JournalEntry {
    int id;
    int txnId;
    std::string idempotencyKey;
    std::string step;    // "HOLD_CREATED", "PAYMENT_REQUESTED", "PAYMENT_CONFIRMED", "BOOKING_CONFIRMED", "CHECKPOINT", "RECONCILED"
    std::string state;
    std::string details;
};

class BookingJournal {
private:
    std::string journalPath;
    std::vector<JournalEntry> entries;
    std::mutex journalMutex;

public:
    BookingJournal(const std::string& path = "wal.log");
    void append(int txnId, const std::string& idemKey, const std::string& step,
                const std::string& state, const std::string& details);
    void clear();
    void printJournal();
    const std::vector<JournalEntry>& getEntries() const { return entries; }
};

// ============================================================================
// 4. Invariant Check Result (Section 8 & 12.3 of PDF)
// ============================================================================
struct InvariantReport {
    int inv1UnreconciledCharges;  // Every CHARGED payment has 1 CONFIRMED booking or 1 REFUND
    int inv2DoubleBookedSeats;    // No seat has 2 CONFIRMED bookings
    int inv3ExpiredStuckHolds;    // No HOLD remains past its expiry
    int inv4DuplicateIdemCharges; // No idempotency_key produces 2 charges

    bool allPassed() const {
        return inv1UnreconciledCharges == 0 &&
               inv2DoubleBookedSeats == 0 &&
               inv3ExpiredStuckHolds == 0 &&
               inv4DuplicateIdemCharges == 0;
    }
};

// ============================================================================
// 5. EndureAir Crash-Consistent Database & Reconciler Engine
// ============================================================================
class EndureAirDatabase {
private:
    DbSeat seats[DB_TOTAL_SEATS];
    std::map<std::string, IdempotencyRecord> idempotencyTable;
    std::vector<OutboxMessage> outboxTable;
    std::vector<PaymentRecord> paymentsLedger;
    std::vector<BookingRecord> bookingsTable;
    std::vector<ReconciliationAuditRecord> reconciliationAudit;

    ReadersWritersSeatLock rwSeatMapLock;
    std::mutex dbGlobalMutex;
    int nextPaymentId;
    int nextBookingId;
    int nextTxnId;
    bool syncWithMySqlServer;

    void executeMySqlCommand(const std::string& sql);

public:
    BookingJournal journal;
    OutboxProducerConsumerQueue outboxQueue;

    EndureAirDatabase(bool enableMySqlSync = false);

    void resetAllClean();

    // Persistent State Serialization (allows cross-process crash harness recovery)
    void saveBinaryState(const std::string& stateFile = "engine_state.dat");
    bool loadBinaryState(const std::string& stateFile = "engine_state.dat");
    void dumpDatabaseToFile(const std::string& filename = "database_state.txt");

    // Step 3: Hold Seat with Expiry (Conditional Update using clock)
    bool holdSeatWithExpiry(int seatNo, int userId, const std::string& passengerName,
                            const std::string& idempotencyKey, int ttlSeconds,
                            std::string& outStatus);

    // Force-expire a seat's hold timestamp (for deterministic Scenario A & D testing)
    void forceExpireSeatHold(int seatNo);

    // Step 4: Background TTL Reaper (Releases expired holds back to AVAILABLE)
    int reapExpiredHolds();

    // Step 5: Idempotent Mock Payment Gateway Execution
    bool processIdempotentPayment(const std::string& idempotencyKey, int userId,
                                  const std::string& passengerName, int seatNo,
                                  double amount, GatewayMode mode,
                                  int& outPaymentId, std::string& outGatewayStatus);

    // Step 6: Atomic Conditional Confirm (Stored Procedure Logic)
    bool atomicConfirmBooking(int seatNo, int userId, const std::string& passengerName,
                              int paymentId, const std::string& idempotencyKey,
                              std::string& outConfirmStatus);

    // Complete End-to-End Pipeline with Fail-Point & Gateway-Mode Injection
    bool executeReservationWorkflow(int userId, const std::string& passengerName,
                                    int seatNo, const std::string& idempotencyKey,
                                    int ttlSeconds = DEFAULT_HOLD_TTL_SECONDS,
                                    GatewayMode gwMode = GW_SUCCESS,
                                    FailPoint crashFp = FP_NONE,
                                    bool realProcessExit = false);

    // Step 8: Idempotent Reconciler (Implements 5-Row Decision Table from Page 12 of PDF)
    int runReconciler(FailPoint crashFp = FP_NONE, bool realProcessExit = false);

    // Step 9: Automated 4-Invariant Verification
    InvariantReport verifyInvariants(bool verbose = true);

    // Display & Inspection Methods
    void printSeatMap();
    void printPaymentAndBookingLedgers();
    void printReconciliationAudit();
    DbSeat* getRawSeats() { return seats; }
};

#endif // BIJENDRA_DBMS_H
