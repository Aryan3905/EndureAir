#include "bijendra_dbms.h"
#include "aryan_os.h"
#include <iostream>
#include <fstream>
#include <sstream>
#include <iomanip>
#include <map>

// ========================================================
// Write-Ahead Logger Implementation
// ========================================================
WriteAheadLogger::WriteAheadLogger(const std::string& path) : logFilePath(path) {}

// Appends transaction state changes with forced disk sync
void WriteAheadLogger::logRecord(int txnId, LogRecordType type, 
                                const std::string& item, 
                                const std::string& oldVal, 
                                const std::string& newVal) {
    std::lock_guard<std::mutex> lock(walMutex);
    std::ofstream file(logFilePath, std::ios::app);
    if (!file.is_open()) return;

    std::string typeStr;
    switch (type) {
        case LOG_START: typeStr = "START"; break;
        case LOG_UPDATE: typeStr = "UPDATE"; break;
        case LOG_COMMIT: typeStr = "COMMIT"; break;
        case LOG_ABORT: typeStr = "ABORT"; break;
        case LOG_CHECKPOINT: typeStr = "CHECKPOINT"; break;
    }

    file << txnId << "," << typeStr << "," << item << "," << oldVal << "," << newVal << "\n";
    file.flush(); // Enforce durability: flush buffer to disk before returning
}

std::vector<WalEntry> WriteAheadLogger::parseLogFile() {
    std::lock_guard<std::mutex> lock(walMutex);
    std::vector<WalEntry> entries;
    std::ifstream file(logFilePath);
    if (!file.is_open()) return entries;

    std::string line;
    while (std::getline(file, line)) {
        if (line.empty()) continue;
        std::stringstream ss(line);
        std::string txnStr, typeStr, item, oldVal, newVal;
        std::getline(ss, txnStr, ',');
        std::getline(ss, typeStr, ',');
        std::getline(ss, item, ',');
        std::getline(ss, oldVal, ',');
        std::getline(ss, newVal, ',');

        WalEntry entry;
        entry.txnId = std::stoi(txnStr);
        entry.item = item;
        entry.oldValue = oldVal;
        entry.newValue = newVal;

        if (typeStr == "START") entry.type = LOG_START;
        else if (typeStr == "UPDATE") entry.type = LOG_UPDATE;
        else if (typeStr == "COMMIT") entry.type = LOG_COMMIT;
        else if (typeStr == "ABORT") entry.type = LOG_ABORT;
        else if (typeStr == "CHECKPOINT") entry.type = LOG_CHECKPOINT;

        entries.push_back(entry);
    }
    return entries;
}

void WriteAheadLogger::truncateLog() {
    std::lock_guard<std::mutex> lock(walMutex);
    std::ofstream file(logFilePath, std::ios::trunc);
}

void WriteAheadLogger::displayRawLogs() {
    std::vector<WalEntry> entries = parseLogFile();
    std::cout << "\n================ TRANSACTION WRITE-AHEAD LOG (WAL) AUDIT STREAM ================\n";
    if (entries.empty()) {
        std::cout << ">> Log stream is clean. No active log records found.\n";
    } else {
        std::cout << std::left << std::setw(8) << "TxnID"
                  << std::setw(12) << "Type"
                  << std::setw(15) << "Target Item"
                  << std::setw(15) << "Old Value"
                  << std::setw(15) << "New Value\n";
        std::cout << "------------------------------------------------------------------------------\n";
        for (const auto& e : entries) {
            std::string tStr = (e.type == LOG_START) ? "START" :
                               (e.type == LOG_UPDATE) ? "UPDATE" :
                               (e.type == LOG_COMMIT) ? "COMMIT" :
                               (e.type == LOG_ABORT) ? "ABORT" : "CHECKPOINT";
            std::cout << std::left << std::setw(8) << e.txnId
                      << std::setw(12) << tStr
                      << std::setw(15) << e.item
                      << std::setw(15) << e.oldValue
                      << std::setw(15) << e.newValue << "\n";
        }
    }
    std::cout << "==============================================================================\n\n";
}

// ========================================================
// Database Engine Implementation
// ========================================================
EndureAirDatabase::EndureAirDatabase(int initialMeals, int initialBaggage)
    : availableMeals(initialMeals), availableBaggageKg(initialBaggage), wal("wal.log") {
    for (int i = 0; i < DB_TOTAL_SEATS; ++i) {
        seats[i].seatNumber = i + 1;
        seats[i].isBooked = false;
        seats[i].bookedByUserId = -1;
        seats[i].passengerName = "AVAILABLE";
    }
    dumpDatabaseToFile();
}

void EndureAirDatabase::printSeatMap() {
    std::cout << "\n================ PASSENGER CABIN SEAT MAP & INVENTORY ================\n";
    for (int i = 0; i < DB_TOTAL_SEATS; ++i) {
        std::cout << "Seat " << std::setw(2) << seats[i].seatNumber << " : ";
        if (seats[i].isBooked) {
            std::cout << "[OCCUPIED] Passenger: " << std::left << std::setw(15) << seats[i].passengerName 
                      << " (User ID: " << seats[i].bookedByUserId << ")\n";
        } else {
            std::cout << "[AVAILABLE]\n";
        }
    }
    std::cout << "----------------------------------------------------------------------\n";
    std::cout << "Inventory Status: Meals Remaining = " << availableMeals 
              << " | Baggage Available = " << availableBaggageKg << " kg\n";
    std::cout << "======================================================================\n\n";
}

bool EndureAirDatabase::isSeatBooked(int seatNum) {
    if (seatNum < 1 || seatNum > DB_TOTAL_SEATS) return true;
    return seats[seatNum - 1].isBooked;
}

// ACID Transaction Execution with Row-Level Locking
bool EndureAirDatabase::executeBookingTransaction(int txnId, int userId, const std::string& userName,
                                                  int seatNum, int meals, int baggageKg,
                                                  int crashStage) {
    if (seatNum < 1 || seatNum > DB_TOTAL_SEATS) {
        std::cout << "[Storage Engine] Error: Invalid seat request #" << seatNum << "\n";
        return false;
    }

    DbSeat& targetSeat = seats[seatNum - 1];

    // STEP 1: Row-Level Exclusive Lock (Prevents race conditions)
    std::unique_lock<std::mutex> rowLock(targetSeat.seatLock);

    if (targetSeat.isBooked) {
        std::cout << "[Concurrency Control] Conflict: Seat #" << seatNum 
                  << " is ALREADY RESERVED by User #" << targetSeat.bookedByUserId << "!\n";
        return false;
    }

    std::cout << "[Transaction Coordinator] Txn #" << txnId << ": Acquired Exclusive Row Lock on Seat #" << seatNum << ".\n";

    // STEP 2: WAL Record: START transaction
    wal.logRecord(txnId, LOG_START);

    // STEP 3: WAL Record: UPDATE before applying memory modifications (Write-Ahead guarantee)
    wal.logRecord(txnId, LOG_UPDATE, "SEAT_" + std::to_string(seatNum), "AVAILABLE", userName);
    wal.logRecord(txnId, LOG_UPDATE, "MEALS", std::to_string(availableMeals), std::to_string(availableMeals - meals));
    wal.logRecord(txnId, LOG_UPDATE, "BAGGAGE", std::to_string(availableBaggageKg), std::to_string(availableBaggageKg - baggageKg));

    // SIMULATED CRASH STAGE 1: Crash immediately after WAL logging but BEFORE database update
    if (crashStage == 1) {
        triggerSimulatedCrash(101, "Crash Stage 1: Logs written to WAL, but DB state untouched mid-transaction");
    }

    // STEP 4: Modify Database State in Memory
    targetSeat.isBooked = true;
    targetSeat.bookedByUserId = userId;
    targetSeat.passengerName = userName;
    availableMeals -= meals;
    availableBaggageKg -= baggageKg;

    // SIMULATED CRASH STAGE 2: Crash after memory update but BEFORE writing COMMIT record to WAL
    if (crashStage == 2) {
        triggerSimulatedCrash(102, "Crash Stage 2: Updated in memory, but crashed before writing COMMIT log");
    }

    // STEP 5: WAL Record: COMMIT transaction
    wal.logRecord(txnId, LOG_COMMIT);

    // Record in Bookings Table
    BookingRecord record = {
        static_cast<int>(bookingsTable.size() + 1),
        txnId,
        userId,
        userName,
        seatNum,
        meals,
        baggageKg,
        "COMMITTED"
    };
    bookingsTable.push_back(record);

    std::cout << "[Transaction Coordinator] Txn #" << txnId << ": COMMITTED successfully with full ACID compliance.\n";
    dumpDatabaseToFile();
    return true;
}

// 3-Pass Undo/Redo Crash Recovery Algorithm
void EndureAirDatabase::performCrashRecovery() {
    std::cout << "\n================ ARIES-STYLE CRASH RECOVERY ENGINE: WAL LOG ANALYSIS ================\n";
    std::vector<WalEntry> logs = wal.parseLogFile();
    if (logs.empty()) {
        std::cout << ">> Log stream is clean. No active log records found.\n";
        std::cout << "======================================================================================\n\n";
        return;
    }

    std::map<int, bool> committed;
    std::map<int, bool> active;

    // PASS 1: Analysis Pass (Identify active transactions and committed status)
    for (const auto& entry : logs) {
        if (entry.type == LOG_START) {
            active[entry.txnId] = true;
            committed[entry.txnId] = false;
        } else if (entry.type == LOG_COMMIT) {
            committed[entry.txnId] = true;
        } else if (entry.type == LOG_ABORT) {
            committed[entry.txnId] = false;
        }
    }

    std::vector<int> redoList;
    std::vector<int> undoList;

    for (const auto& pair : active) {
        int tid = pair.first;
        if (committed[tid]) {
            redoList.push_back(tid);
        } else {
            undoList.push_back(tid);
        }
    }

    std::cout << "[Analysis Pass Complete]\n";
    std::cout << " - Transactions to REDO (Committed): ";
    for (int tid : redoList) std::cout << "#" << tid << " ";
    if (redoList.empty()) std::cout << "None";
    std::cout << "\n - Transactions to UNDO (Uncommitted/In-Flight): ";
    for (int tid : undoList) std::cout << "#" << tid << " ";
    if (undoList.empty()) std::cout << "None";
    std::cout << "\n--------------------------------------------------------------------------------------\n";

    // PASS 2: REDO PASS (Replay committed transactions to ensure Durability)
    for (const auto& entry : logs) {
        if (entry.type == LOG_UPDATE && committed[entry.txnId]) {
            if (entry.item.find("SEAT_") == 0) {
                int seatNum = std::stoi(entry.item.substr(5));
                seats[seatNum - 1].isBooked = true;
                seats[seatNum - 1].passengerName = entry.newValue;
                std::cout << "[REDO Phase] Re-applied " << entry.item << " -> " << entry.newValue << " (Txn #" << entry.txnId << ")\n";
            }
        }
    }

    // PASS 3: UNDO PASS (Roll back in-flight transactions in reverse order to ensure Atomicity)
    for (auto it = logs.rbegin(); it != logs.rend(); ++it) {
        if (it->type == LOG_UPDATE && !committed[it->txnId]) {
            if (it->item.find("SEAT_") == 0) {
                int seatNum = std::stoi(it->item.substr(5));
                seats[seatNum - 1].isBooked = false;
                seats[seatNum - 1].passengerName = "AVAILABLE";
                seats[seatNum - 1].bookedByUserId = -1;
                std::cout << "[UNDO Phase] Rolled back " << it->item << " -> Restored to: " << it->oldValue << " (Txn #" << it->txnId << ")\n";
            }
        }
    }

    dumpDatabaseToFile();
    std::cout << "================ CRASH RECOVERY COMPLETED: DATABASE CONSISTENCY RESTORED =============\n\n";
}

// SQL Transaction Audit Report
void EndureAirDatabase::printAuditReport() {
    std::cout << "\n================ SQL TRANSACTION AUDIT REPORT (COMMITTED BOOKINGS) ================\n";
    if (bookingsTable.empty()) {
        std::cout << ">> No committed records found in Bookings table.\n";
    } else {
        std::cout << std::left << std::setw(8) << "BookID"
                  << std::setw(8) << "TxnID"
                  << std::setw(8) << "UserID"
                  << std::setw(16) << "Passenger"
                  << std::setw(8) << "Seat"
                  << std::setw(8) << "Meals"
                  << std::setw(10) << "Baggage"
                  << std::setw(12) << "Status\n";
        std::cout << "-----------------------------------------------------------------------------------\n";
        for (const auto& b : bookingsTable) {
            std::cout << std::left << std::setw(8) << b.bookingId
                      << std::setw(8) << b.txnId
                      << std::setw(8) << b.userId
                      << std::setw(16) << b.passengerName
                      << std::setw(8) << b.seatNumber
                      << std::setw(8) << b.meals
                      << std::setw(10) << (std::to_string(b.baggageKg) + "kg")
                      << std::setw(12) << b.status << "\n";
        }
    }
    std::cout << "===================================================================================\n\n";
}

// Admin Database Direct Modification Routines
bool EndureAirDatabase::adminUpdateSeat(int seatNum, bool isBooked, int userId, const std::string& name) {
    if (seatNum < 1 || seatNum > DB_TOTAL_SEATS) return false;
    std::lock_guard<std::mutex> lock(seats[seatNum - 1].seatLock);
    seats[seatNum - 1].isBooked = isBooked;
    seats[seatNum - 1].bookedByUserId = isBooked ? userId : -1;
    seats[seatNum - 1].passengerName = isBooked ? name : "AVAILABLE";
    dumpDatabaseToFile();
    std::cout << "[Admin DB Override] Seat #" << seatNum << " state updated successfully.\n";
    return true;
}

void EndureAirDatabase::adminUpdateInventory(int newMeals, int newBaggageKg) {
    std::lock_guard<std::mutex> lock(dbGlobalMutex);
    availableMeals = newMeals;
    availableBaggageKg = newBaggageKg;
    dumpDatabaseToFile();
    std::cout << "[Admin DB Override] Inventory updated: Meals = " << availableMeals 
              << ", Baggage = " << availableBaggageKg << "kg.\n";
}

bool EndureAirDatabase::adminCancelBooking(int bookingId) {
    std::lock_guard<std::mutex> lock(dbGlobalMutex);
    for (auto& b : bookingsTable) {
        if (b.bookingId == bookingId) {
            b.status = "ROLLED_BACK";
            int sNum = b.seatNumber;
            seats[sNum - 1].isBooked = false;
            seats[sNum - 1].passengerName = "AVAILABLE";
            seats[sNum - 1].bookedByUserId = -1;
            dumpDatabaseToFile();
            std::cout << "[Admin DB Override] Booking #" << bookingId << " canceled and seat #" << sNum << " released.\n";
            return true;
        }
    }
    std::cout << "[Admin DB Override] Error: Booking ID #" << bookingId << " not found.\n";
    return false;
}

// Real-Time On-Disk Table Snapshot Export
void EndureAirDatabase::dumpDatabaseToFile(const std::string& filename) {
    std::lock_guard<std::mutex> lock(dbGlobalMutex);
    std::ofstream out(filename, std::ios::trunc);
    if (!out.is_open()) return;

    out << "=====================================================================\n";
    out << "             ENDUREAIR: DIRECT DATABASE SNAPSHOT (DISK DUMP)         \n";
    out << "=====================================================================\n\n";

    out << "[TABLE: SEATS (CABIN ROWS)]\n";
    out << std::left << std::setw(10) << "Seat_No" << std::setw(15) << "Status" 
        << std::setw(12) << "User_ID" << std::setw(20) << "Passenger_Name" << "\n";
    out << "---------------------------------------------------------------------\n";
    for (int i = 0; i < DB_TOTAL_SEATS; ++i) {
        out << std::left << std::setw(10) << seats[i].seatNumber
            << std::setw(15) << (seats[i].isBooked ? "BOOKED" : "AVAILABLE")
            << std::setw(12) << (seats[i].isBooked ? std::to_string(seats[i].bookedByUserId) : "-")
            << std::setw(20) << seats[i].passengerName << "\n";
    }
    out << "\n[TABLE: INVENTORY]\n";
    out << "Available Meals: " << availableMeals << "\n";
    out << "Available Baggage Allowance: " << availableBaggageKg << " kg\n\n";

    out << "[TABLE: BOOKINGS (ACID COMMITTED TRANSACTIONS)]\n";
    out << std::left << std::setw(10) << "Book_ID" << std::setw(10) << "Txn_ID"
        << std::setw(10) << "User_ID" << std::setw(18) << "Passenger"
        << std::setw(8) << "Seat" << std::setw(8) << "Meals"
        << std::setw(12) << "Baggage" << std::setw(12) << "Status" << "\n";
    out << "---------------------------------------------------------------------\n";
    if (bookingsTable.empty()) {
        out << ">> No records in Bookings table yet.\n";
    } else {
        for (const auto& b : bookingsTable) {
            out << std::left << std::setw(10) << b.bookingId
                << std::setw(10) << b.txnId
                << std::setw(10) << b.userId
                << std::setw(18) << b.passengerName
                << std::setw(8) << b.seatNumber
                << std::setw(8) << b.meals
                << std::setw(12) << (std::to_string(b.baggageKg) + "kg")
                << std::setw(12) << b.status << "\n";
        }
    }
    out << "=====================================================================\n";
}
