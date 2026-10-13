#include <iostream>
#include <string>
#include <vector>
#include <memory>
#include "aryan_os.h"
#include "bijendra_dbms.h"

// ========================================================
// EndureAir Core Orchestrator & Dashboards
// ========================================================
class EndureAirSystem {
private:
    BankersAlgorithm bankerEngine;
    PriorityQueueWithAging queueEngine;
    EndureAirDatabase dbmsEngine;
    int transactionCounter;
    int requestCounter;

public:
    EndureAirSystem()
        : bankerEngine({TOTAL_SEATS_COUNT, 15, 300}), // 10 Seats, 15 Meals, 300kg Baggage
          dbmsEngine(15, 300),
          transactionCounter(5001),
          requestCounter(101) {}

    // Main End-to-End Booking Pipeline
    void handleBookingRequest(int userId, const std::string& userName,
                             int seatNum, int meals, int baggageKg,
                             int priority, int crashSimulationMode = 0) {
        int reqId = requestCounter++;
        int txnId = transactionCounter++;

        std::cout << "\n--------------------------------------------------------------\n";
        std::cout << ">>> [Core Orchestrator] Processing Booking Request #" << reqId 
                  << " for Passenger: " << userName << "\n";
        std::cout << "--------------------------------------------------------------\n";

        // Pre-check if seat is already occupied in the database
        if (dbmsEngine.isSeatBooked(seatNum)) {
            std::cout << "❌ [Validation Error] Seat #" << seatNum << " is already occupied. Please select an available seat.\n";
            return;
        }

        // STEP 1: OS Deadlock Avoidance Check (Banker's Algorithm)
        int requestedRes[NUM_RESOURCES] = {1, meals, baggageKg};
        std::vector<int> safeSequence;

        std::cout << ">>> [Deadlock Avoidance] Invoking Banker's Safety Algorithm...\n";
        bool isSafe = bankerEngine.requestResources(userId, requestedRes, safeSequence);

        if (!isSafe) {
            std::cout << "⚠️  [Deadlock Prevention] Allocation would place system in UNSAFE STATE!\n";
            std::cout << ">> Queuing request in Starvation-Free Priority Queue with Aging...\n";
            BookingRequest req = {
                reqId, userId, userName, seatNum,
                {1, meals, baggageKg},
                priority, 0,
                std::chrono::steady_clock::now()
            };
            queueEngine.enqueueRequest(req);
            return;
        }

        std::cout << "✅ [Banker's Check SAFE] System remains in Safe State! Safe Sequence: ";
        for (int uid : safeSequence) std::cout << "P" << uid << " ";
        std::cout << "\n";

        // STEP 2: DBMS ACID Transaction & Row-Level Locking
        std::cout << ">>> [Transaction Pipeline] Submitting to ACID Storage Engine with Row Lock & WAL...\n";
        bool txnSuccess = dbmsEngine.executeBookingTransaction(
            txnId, userId, userName, seatNum, meals, baggageKg, crashSimulationMode
        );

        if (!txnSuccess) {
            std::cout << "❌ [Transaction Rollback] Rolling back Banker's Algorithm resource reservations...\n";
            bankerEngine.releaseResources(userId, requestedRes);
        } else {
            std::cout << "🎉 [SUCCESS] Booking Confirmed! E-Ticket generated for " << userName 
                      << " (Seat: " << seatNum << ", Meals: " << meals << ", Baggage: " << baggageKg << "kg)\n";
        }
    }

    // Process Pending Waitlist Requests
    void processNextWaitingRequest() {
        if (queueEngine.isEmpty()) {
            std::cout << ">> Waiting queue is currently empty.\n";
            return;
        }

        std::cout << "\n>>> [Process Scheduler] De-queuing next request from Priority Queue (Evaluating Aging)...\n";
        BookingRequest req = queueEngine.popHighestPriority();
        std::cout << ">> Serving De-queued Request #" << req.requestId 
                  << " for " << req.userName 
                  << " (Effective Priority with Aging: " << req.getEffectivePriority() << ")\n";

        handleBookingRequest(req.userId, req.userName, req.seatNumber,
                             req.requestedResources[1], req.requestedResources[2],
                             req.priority, 0);
    }

    // Dashboards & Audit Views
    void showUserDashboard() {
        std::cout << "\n=======================================================\n";
        std::cout << "              USER DASHBOARD: FLIGHT OVERVIEW          \n";
        std::cout << "=======================================================\n";
        dbmsEngine.printSeatMap();
        queueEngine.printQueueStatus();
    }

    void showAdminDashboard() {
        std::cout << "\n=======================================================\n";
        std::cout << "              ADMIN DASHBOARD: SYSTEM CONSOLE          \n";
        std::cout << "=======================================================\n";
        bankerEngine.printMatrix();
        dbmsEngine.printSeatMap();
        dbmsEngine.wal.displayRawLogs();
        dbmsEngine.printAuditReport();
    }

    void showDirectDatabaseAccess() {
        std::cout << "\n=======================================================\n";
        std::cout << "          DIRECT DATABASE INSPECTION & SQL TABLES      \n";
        std::cout << "=======================================================\n";
        std::cout << ">> Synchronizing in-memory relational tables with persistent disk storage...\n";
        dbmsEngine.dumpDatabaseToFile("database_state.txt");
        std::cout << ">> [STORAGE STATUS] Database snapshot synchronized: database_state.txt\n";
        std::cout << ">> [STORAGE STATUS] Active Write-Ahead Log stream: wal.log\n";
        std::cout << ">> [STORAGE STATUS] Relational DDL Schema reference: schema.sql\n\n";
        dbmsEngine.printSeatMap();
        dbmsEngine.printAuditReport();
    }

    void triggerCrashRecoveryEngine() {
        dbmsEngine.performCrashRecovery();
    }

    void clearLogs() {
        dbmsEngine.wal.truncateLog();
        std::cout << ">> Write-Ahead Log truncated successfully.\n";
    }

    // Administrator Authentication Gatekeeper
    bool authenticateAdmin() {
        std::string inputId, inputPass;
        std::cout << "\n=======================================================\n";
        std::cout << "          ADMINISTRATIVE AUTHENTICATION PORTAL         \n";
        std::cout << "=======================================================\n";
        std::cout << "Enter Administrator ID: ";
        std::cin >> inputId;
        std::cout << "Enter Administrator Password: ";
        std::cin >> inputPass;

        if (inputId == "admin" && inputPass == "admin123") {
            std::cout << "✅ [Access Granted] Welcome, Administrator.\n";
            return true;
        } else {
            std::cout << "❌ [Access Denied] Invalid Administrator ID or Password!\n";
            return false;
        }
    }
    // ========================================================
    // User Interface Portal (Passenger Self-Service)
    // ========================================================
    void runUserPortal() {
        int userChoice;
        while (true) {
            std::cout << "\n---------------------------------------------------------------\n";
            std::cout << "              PASSENGER USER INTERFACE (SELF-SERVICE)          \n";
            std::cout << "---------------------------------------------------------------\n";
            std::cout << " [1] Book Flight Ticket (Seat, Meals, Baggage, Priority)\n";
            std::cout << " [2] View Cabin Seat Map & Live Inventory\n";
            std::cout << " [3] View Waiting Queue Position & Aging Priority\n";
            std::cout << " [4] View My Booking Status & E-Ticket Lookup\n";
            std::cout << " [5] Return to Main Portal Selection\n";
            std::cout << "---------------------------------------------------------------\n";
            std::cout << "Enter choice [1-5]: ";

            if (!(std::cin >> userChoice)) {
                std::cin.clear();
                std::cin.ignore(1000, '\n');
                continue;
            }

            if (userChoice == 1) {
                int uid, seat, meals, baggage, prio;
                std::string name;
                std::cout << "Enter User ID (e.g. 101): "; std::cin >> uid;
                std::cout << "Enter Passenger Name: "; std::cin >> name;
                std::cout << "Enter Seat Number (1-10): "; std::cin >> seat;
                std::cout << "Enter Number of Meals: "; std::cin >> meals;
                std::cout << "Enter Baggage Weight (kg): "; std::cin >> baggage;
                std::cout << "Enter Request Priority (1-10): "; std::cin >> prio;

                handleBookingRequest(uid, name, seat, meals, baggage, prio, 0);
            } else if (userChoice == 2) {
                dbmsEngine.printSeatMap();
            } else if (userChoice == 3) {
                queueEngine.printQueueStatus();
            } else if (userChoice == 4) {
                int searchUid;
                std::cout << "\nEnter your User ID to lookup booking status: ";
                std::cin >> searchUid;
                std::cout << "\n>>> [Database Query] Retrieving confirmed reservation for User #" << searchUid << "...\n";
                dbmsEngine.printAuditReport();
            } else if (userChoice == 5) {
                break;
            } else {
                std::cout << "Invalid choice! Enter 1-5.\n";
            }
        }
    }

    // ========================================================
    // Direct Database Editor (Admin Data Overrides)
    // ========================================================
    void runAdminDatabaseEditor() {
        int editChoice;
        while (true) {
            std::cout << "\n---------------------------------------------------------------\n";
            std::cout << "          ADMINISTRATIVE DIRECT DATABASE EDITOR (CRUD)         \n";
            std::cout << "---------------------------------------------------------------\n";
            std::cout << " [1] Modify / Reassign Seat Record\n";
            std::cout << " [2] Adjust Inventory Levels (Meals & Baggage)\n";
            std::cout << " [3] Cancel / Rollback an Existing Booking\n";
            std::cout << " [4] View Current On-Disk Database State (Snapshot)\n";
            std::cout << " [5] Return to Administrator Console\n";
            std::cout << "---------------------------------------------------------------\n";
            std::cout << "Enter option [1-5]: ";

            if (!(std::cin >> editChoice)) {
                std::cin.clear();
                std::cin.ignore(1000, '\n');
                continue;
            }

            if (editChoice == 1) {
                int sNum, uId, stateInt;
                std::string pName;
                std::cout << "Enter Seat Number (1-10): "; std::cin >> sNum;
                std::cout << "Set Status (1 = Booked, 0 = Available): "; std::cin >> stateInt;
                if (stateInt == 1) {
                    std::cout << "Enter User ID: "; std::cin >> uId;
                    std::cout << "Enter Passenger Name: "; std::cin >> pName;
                    dbmsEngine.adminUpdateSeat(sNum, true, uId, pName);
                } else {
                    dbmsEngine.adminUpdateSeat(sNum, false, -1, "AVAILABLE");
                }
            } else if (editChoice == 2) {
                int m, b;
                std::cout << "Enter New Available Meals: "; std::cin >> m;
                std::cout << "Enter New Available Baggage Capacity (kg): "; std::cin >> b;
                dbmsEngine.adminUpdateInventory(m, b);
            } else if (editChoice == 3) {
                int bId;
                std::cout << "Enter Booking ID to cancel/rollback: "; std::cin >> bId;
                dbmsEngine.adminCancelBooking(bId);
            } else if (editChoice == 4) {
                showDirectDatabaseAccess();
            } else if (editChoice == 5) {
                break;
            } else {
                std::cout << "Invalid choice! Enter 1-5.\n";
            }
        }
    }

    // ========================================================
    // Administrator Portal (Protected System Controls)
    // ========================================================
    void runAdminPortal() {
        if (!authenticateAdmin()) return;

        int adminChoice;
        while (true) {
            std::cout << "\n---------------------------------------------------------------\n";
            std::cout << "              ADMINISTRATOR MANAGEMENT CONSOLE                 \n";
            std::cout << "---------------------------------------------------------------\n";
            std::cout << " [1] View Banker's Algorithm Allocation Matrices (Deadlock)\n";
            std::cout << " [2] Process Next Request in Waiting Queue (With Aging)\n";
            std::cout << " [3] View Transaction Write-Ahead Log (WAL Dump)\n";
            std::cout << " [4] View SQL Transaction Audit Report\n";
            std::cout << " [5] Direct Database CRUD Editor (Modify Seats, Inventory, Bookings)\n";
            std::cout << " [6] Simulate Mid-Transaction System Crash\n";
            std::cout << " [7] Run 3-Pass Undo/Redo Crash Recovery Engine\n";
            std::cout << " [8] Reset / Truncate WAL Log File\n";
            std::cout << " [9] Logout & Return to Main Portal Selection\n";
            std::cout << "---------------------------------------------------------------\n";
            std::cout << "Enter admin choice [1-9]: ";

            if (!(std::cin >> adminChoice)) {
                std::cin.clear();
                std::cin.ignore(1000, '\n');
                continue;
            }

            if (adminChoice == 1) {
                bankerEngine.printMatrix();
            } else if (adminChoice == 2) {
                processNextWaitingRequest();
            } else if (adminChoice == 3) {
                dbmsEngine.wal.displayRawLogs();
            } else if (adminChoice == 4) {
                dbmsEngine.printAuditReport();
            } else if (adminChoice == 5) {
                runAdminDatabaseEditor();
            } else if (adminChoice == 6) {
                std::cout << "\n===============================================================\n";
                std::cout << "  💥 INJECTING SIMULATED FAILURE (POWER LOSS / SIGKILL)       \n";
                std::cout << "===============================================================\n";
                std::cout << "Initiating transactional booking for Seat #4...\n";
                std::cout << "Transaction will abort abruptly after WAL write but before COMMIT.\n";
                handleBookingRequest(999, "CrashTest", 4, 1, 15, 8, 2);
            } else if (adminChoice == 7) {
                std::cout << "\n>>> Starting ARIES-Style 3-Pass Recovery Routine...\n";
                triggerCrashRecoveryEngine();
                std::cout << ">>> Recovery complete. Verified database state synchronized.\n";
            } else if (adminChoice == 8) {
                clearLogs();
            } else if (adminChoice == 9) {
                std::cout << "Logging out from Administrator Console...\n";
                break;
            } else {
                std::cout << "Invalid choice! Enter 1-9.\n";
            }
        }
    }
};

// ========================================================
// Main Entry Point & Dual Portal Router
// ========================================================
int main() {
    EndureAirSystem app;
    int portalChoice;

    while (true) {
        std::cout << "\n===============================================================\n";
        std::cout << "        ENDUREAIR — RESILIENT AIRLINE TRANSACTION SYSTEM       \n";
        std::cout << "        Deadlock Prevention | Row Locking | WAL Crash Recovery \n";
        std::cout << "===============================================================\n";
        std::cout << " [1] Passenger User Interface (Open Access)\n";
        std::cout << " [2] Administrator Management Portal (Requires Login)\n";
        std::cout << " [3] Exit System\n";
        std::cout << "---------------------------------------------------------------\n";
        std::cout << "Select Portal [1-3]: ";

        if (!(std::cin >> portalChoice)) {
            std::cin.clear();
            std::cin.ignore(1000, '\n');
            continue;
        }

        if (portalChoice == 1) {
            app.runUserPortal();
        } else if (portalChoice == 2) {
            app.runAdminPortal();
        } else if (portalChoice == 3) {
            std::cout << "Shutting down EndureAir System. Goodbye!\n";
            break;
        } else {
            std::cout << "Invalid selection! Please enter 1, 2, or 3.\n";
        }
    }

    return 0;
}
