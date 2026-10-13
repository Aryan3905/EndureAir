#include "bijendra_dbms.h"
#include <iostream>
#include <fstream>
#include <sstream>
#include <iomanip>

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
