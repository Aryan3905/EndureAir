#ifndef BIJENDRA_DBMS_H
#define BIJENDRA_DBMS_H

#include <string>
#include <vector>
#include <mutex>

// ========================================================
// Database Schema Data Models
// ========================================================
constexpr int DB_TOTAL_SEATS = 10;

// Individual Seat Entity with Row-Level Lock
struct DbSeat {
    int seatNumber;
    bool isBooked;
    int bookedByUserId;
    std::string passengerName;
    std::mutex seatLock; // Row-level lock protecting seat from race conditions
};

// Booking Record Entity (ACID Transactions Table)
struct BookingRecord {
    int bookingId;
    int txnId;
    int userId;
    std::string passengerName;
    int seatNumber;
    int meals;
    int baggageKg;
    std::string status; // "COMMITTED", "ROLLED_BACK", "IN_FLIGHT"
};

// Write-Ahead Logging (WAL) Record Types
enum LogRecordType { LOG_START, LOG_UPDATE, LOG_COMMIT, LOG_ABORT, LOG_CHECKPOINT };

// Individual WAL Record Entry
struct WalEntry {
    int txnId;
    LogRecordType type;
    std::string item;
    std::string oldValue;
    std::string newValue;
};

// ========================================================
// Storage Engine: Write-Ahead Logger (WAL)
// ========================================================
class WriteAheadLogger {
private:
    std::string logFilePath;
    std::mutex walMutex;

public:
    WriteAheadLogger(const std::string& path = "wal.log");

    // Appends transaction log record to disk before modifying in-memory state
    void logRecord(int txnId, LogRecordType type, 
                   const std::string& item = "", 
                   const std::string& oldVal = "", 
                   const std::string& newVal = "");

    void truncateLog();
};

#endif // BIJENDRA_DBMS_H
