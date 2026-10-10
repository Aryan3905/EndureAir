#include <iostream>
#include <string>
#include <vector>
#include <memory>
#include "aryan_os.h"
#include "bijendra_dbms.h"

// ========================================================
// Yash's Module: Integration & Dashboards Controller
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
        std::cout << ">>> [YASH INTEGRATOR] Processing Booking Request #" << reqId 
                  << " for Passenger: " << userName << "\n";
        std::cout << "--------------------------------------------------------------\n";

        // Pre-check if seat is already occupied in the database
        if (dbmsEngine.isSeatBooked(seatNum)) {
            std::cout << "❌ [Integrator Warning] Seat #" << seatNum << " is already occupied. Please pick another seat.\n";
            return;
        }

        // STEP 1: OS Deadlock Avoidance Check (Aryan's Banker's Algorithm)
        int requestedRes[NUM_RESOURCES] = {1, meals, baggageKg};
        std::vector<int> safeSequence;

        std::cout << ">>> [Step 1: Deadlock Avoidance] Calling Aryan's Banker's Algorithm...\n";
        bool isSafe = bankerEngine.requestResources(userId, requestedRes, safeSequence);

        if (!isSafe) {
            std::cout << "⚠️  [Banker's Check UNSAFE] Immediate allocation would risk Deadlock!\n";
            std::cout << ">> Parking request in Aryan's Starvation-Free Priority Queue...\n";
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

        // STEP 2: DBMS ACID Transaction & Row-Level Locking (Bijendra's Engine)
        std::cout << ">>> [Step 2: Database Transaction] Calling Bijendra's DBMS Engine with Row-Level Lock & WAL...\n";
        bool txnSuccess = dbmsEngine.executeBookingTransaction(
            txnId, userId, userName, seatNum, meals, baggageKg, crashSimulationMode
        );

        if (!txnSuccess) {
            std::cout << "❌ [Transaction FAILED] Rolling back Banker's Algorithm resource reservations...\n";
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

        std::cout << "\n>>> [YASH INTEGRATOR] Extracting next request from Aryan's Aging Priority Queue...\n";
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

    void triggerCrashRecoveryEngine() {
        dbmsEngine.performCrashRecovery();
    }

    void clearLogs() {
        dbmsEngine.wal.truncateLog();
        std::cout << ">> Write-Ahead Log truncated successfully.\n";
    }
};

// ========================================================
// Yash's Interactive Console Interface
// ========================================================
int main() {
    EndureAirSystem app;
    int choice;

    while (true) {
        std::cout << "\n===============================================================\n";
        std::cout << "     ENDUREAIR — BOOKING THAT SURVIVES THE CRASH (PHASE 2)     \n";
        std::cout << "     Team #Nirvana | Aryan (OS) | Bijendra (DBMS) | Yash (Int) \n";
        std::cout << "===============================================================\n";
        std::cout << " [1] Book Flight (User Flow: Deadlock Check + Row Lock + WAL)\n";
        std::cout << " [2] User Dashboard (View Seats & Queue Status)\n";
        std::cout << " [3] Admin Dashboard (Banker's Matrices, Seat Map & WAL Dump)\n";
        std::cout << " [4] Process Next Request in Waiting Queue (With Aging)\n";
        std::cout << " [5] [SIMULATE CRASH] Crash Mid-Transaction (Before COMMIT)\n";
        std::cout << " [6] [CRASH RECOVERY] Run Undo/Redo Recovery on WAL\n";
        std::cout << " [7] Clear / Reset WAL Log File\n";
        std::cout << " [8] Exit Program\n";
        std::cout << "---------------------------------------------------------------\n";
        std::cout << "Enter your choice [1-8]: ";

        if (!(std::cin >> choice)) {
            std::cin.clear();
            std::cin.ignore(1000, '\n');
            continue;
        }

        if (choice == 1) {
            int uid, seat, meals, baggage, prio;
            std::string name;
            std::cout << "Enter User ID (e.g. 101): "; std::cin >> uid;
            std::cout << "Enter Passenger Name: "; std::cin >> name;
            std::cout << "Enter Seat Number (1-10): "; std::cin >> seat;
            std::cout << "Enter Number of Meals: "; std::cin >> meals;
            std::cout << "Enter Baggage Weight (kg): "; std::cin >> baggage;
            std::cout << "Enter Request Priority (1-10): "; std::cin >> prio;

            app.handleBookingRequest(uid, name, seat, meals, baggage, prio, 0);
        } else if (choice == 2) {
            app.showUserDashboard();
        } else if (choice == 3) {
            app.showAdminDashboard();
        } else if (choice == 4) {
            app.processNextWaitingRequest();
        } else if (choice == 5) {
            std::cout << "\n[Crash Simulation] Launching booking for Passenger 'CrashUser' on Seat #4...\n";
            std::cout << "[Crash Simulation] Will kill process after DB state modification but BEFORE writing COMMIT log!\n";
            app.handleBookingRequest(999, "CrashUser", 4, 1, 15, 8, 2);
        } else if (choice == 6) {
            app.triggerCrashRecoveryEngine();
        } else if (choice == 7) {
            app.clearLogs();
        } else if (choice == 8) {
            std::cout << "Exiting EndureAir. Have a great day!\n";
            break;
        } else {
            std::cout << "Invalid selection! Please enter a number from 1 to 8.\n";
        }
    }

    return 0;
}
