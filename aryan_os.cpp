#include "aryan_os.h"
#include <iostream>
#include <iomanip>
#include <algorithm>

const std::string RESOURCE_NAMES[NUM_RESOURCES] = {"Seats", "Meals", "Baggage(kg)"};

// Initialize system with total available resource vectors
BankersAlgorithm::BankersAlgorithm(const std::vector<int>& initialResources) {
    available = initialResources;
}

// Register user maximum claim vector (Max matrix initialization)
void BankersAlgorithm::registerUserClaim(int userId, const std::vector<int>& maxResources) {
    std::lock_guard<std::mutex> lock(baMutex);
    maxClaim[userId] = maxResources;
    allocation[userId] = std::vector<int>(NUM_RESOURCES, 0);
}

// Banker's Safety Algorithm: Verifies if system can finish all processes without deadlock
bool BankersAlgorithm::isStateSafe(const std::vector<int>& workAvail,
                                   const std::map<int, std::vector<int>>& currentAlloc,
                                   const std::map<int, std::vector<int>>& claims,
                                   std::vector<int>& outSafeSeq) {
    std::vector<int> work = workAvail;
    std::map<int, bool> finish;
    for (const auto& pair : currentAlloc) {
        finish[pair.first] = false;
    }

    outSafeSeq.clear();
    int completedCount = 0;
    int totalUsers = static_cast<int>(currentAlloc.size());

    while (completedCount < totalUsers) {
        bool progress = false;
        for (const auto& pair : currentAlloc) {
            int uid = pair.first;
            const auto& allocVec = pair.second;

            if (!finish[uid]) {
                bool canSatisfy = true;
                const auto& claimVec = claims.at(uid);

                // Check: Need_i <= Work
                for (int j = 0; j < NUM_RESOURCES; ++j) {
                    int need = claimVec[j] - allocVec[j];
                    if (need > work[j]) {
                        canSatisfy = false;
                        break;
                    }
                }

                if (canSatisfy) {
                    // Work = Work + Allocation_i
                    for (int j = 0; j < NUM_RESOURCES; ++j) {
                        work[j] += allocVec[j];
                    }
                    finish[uid] = true;
                    outSafeSeq.push_back(uid);
                    progress = true;
                    completedCount++;
                }
            }
        }

        if (!progress) {
            return false; // Deadlock or unsafe state detected!
        }
    }
    return true; // System is in a safe state!
}

// Resource-Request Algorithm: 4-Step Validation & Trial Allocation
bool BankersAlgorithm::requestResources(int userId, const int request[NUM_RESOURCES], std::vector<int>& outSafeSeq) {
    std::lock_guard<std::mutex> lock(baMutex);

    if (maxClaim.find(userId) == maxClaim.end()) {
        maxClaim[userId] = {request[0], request[1], request[2]};
        allocation[userId] = {0, 0, 0};
    }

    // Step 1: Check Request <= Need
    for (int j = 0; j < NUM_RESOURCES; ++j) {
        int need = maxClaim[userId][j] - allocation[userId][j];
        if (request[j] > need) {
            std::cout << "[Deadlock Prevention] User #" << userId 
                      << " exceeded declared claim for " << RESOURCE_NAMES[j] << "!\n";
            return false;
        }
    }

    // Step 2: Check Request <= Available
    for (int j = 0; j < NUM_RESOURCES; ++j) {
        if (request[j] > available[j]) {
            std::cout << "[Deadlock Prevention] Insufficient immediate " << RESOURCE_NAMES[j] 
                      << " (Requested: " << request[j] << ", Available: " << available[j] << ")\n";
            return false;
        }
    }

    // Step 3: Trial Allocation (Simulate state transition)
    std::vector<int> trialAvailable = available;
    std::map<int, std::vector<int>> trialAlloc = allocation;
    std::map<int, std::vector<int>> trialMax = maxClaim;

    for (int j = 0; j < NUM_RESOURCES; ++j) {
        trialAvailable[j] -= request[j];
        trialAlloc[userId][j] += request[j];
    }

    // Step 4: Run Safety Algorithm on trial state
    if (isStateSafe(trialAvailable, trialAlloc, trialMax, outSafeSeq)) {
        // Safe state preserved! Apply changes permanently
        available = trialAvailable;
        allocation = trialAlloc;
        return true;
    }

    // Unsafe state! Deny allocation to prevent potential deadlock
    return false;
}

// Release allocated resources back into available pool on rollback/cancel
void BankersAlgorithm::releaseResources(int userId, const int release[NUM_RESOURCES]) {
    std::lock_guard<std::mutex> lock(baMutex);
    if (allocation.find(userId) != allocation.end()) {
        for (int j = 0; j < NUM_RESOURCES; ++j) {
            allocation[userId][j] -= release[j];
            available[j] += release[j];
        }
    }
}

std::vector<int> BankersAlgorithm::getAvailableResources() {
    std::lock_guard<std::mutex> lock(baMutex);
    return available;
}

// ========================================================
// Priority Queue Implementation with Dynamic Aging
// ========================================================
void PriorityQueueWithAging::enqueueRequest(const BookingRequest& req) {
    std::lock_guard<std::mutex> lock(queueMutex);
    BookingRequest newReq = req;
    newReq.agingBonus = 0;
    newReq.arrivalTime = std::chrono::steady_clock::now();
    waitingQueue.push_back(newReq);
    std::cout << "[Process Scheduler] Request #" << req.requestId 
              << " parked in Waiting Priority Queue. (Priority: " << req.priority << ")\n";
}

// Dynamic aging: boosts effective priority over time to guarantee starvation freedom
void PriorityQueueWithAging::applyAgingStep() {
    for (auto& req : waitingQueue) {
        req.agingBonus += 1;
    }
}

bool PriorityQueueWithAging::isEmpty() {
    std::lock_guard<std::mutex> lock(queueMutex);
    return waitingQueue.empty();
}

BookingRequest PriorityQueueWithAging::popHighestPriority() {
    std::lock_guard<std::mutex> lock(queueMutex);
    applyAgingStep();

    auto bestIt = std::max_element(waitingQueue.begin(), waitingQueue.end(),
        [](const BookingRequest& a, const BookingRequest& b) {
            return a.getEffectivePriority() < b.getEffectivePriority();
        });

    BookingRequest selected = *bestIt;
    waitingQueue.erase(bestIt);
    return selected;
}

void PriorityQueueWithAging::printQueueStatus() {
    std::lock_guard<std::mutex> lock(queueMutex);
    std::cout << "\n================ WAITING QUEUE MONITOR (WITH AGING METRICS) ================\n";
    if (waitingQueue.empty()) {
        std::cout << ">> No requests currently waiting in queue.\n";
    } else {
        std::cout << std::left << std::setw(8) << "ReqID"
                  << std::setw(14) << "User Name"
                  << std::setw(10) << "Seat #"
                  << std::setw(12) << "Base Prio"
                  << std::setw(12) << "Aging Pts"
                  << std::setw(16) << "Effective Prio\n";
        std::cout << "----------------------------------------------------------------------------\n";
        for (const auto& r : waitingQueue) {
            std::cout << std::left << std::setw(8) << r.requestId
                      << std::setw(14) << r.userName
                      << std::setw(10) << r.seatNumber
                      << std::setw(12) << r.priority
                      << std::setw(12) << r.agingBonus
                      << std::setw(16) << r.getEffectivePriority() << "\n";
        }
    }
    std::cout << "============================================================================\n\n";
}

// Simulated crash injection: instantly terminates process mid-execution
void triggerSimulatedCrash(int exitCode, const std::string& reason) {
    std::cout << "\n============================================================\n";
    std::cout << "  💥 FAILURE INJECTION: SIMULATED SYSTEM CRASH TRIGGERED    \n";
    std::cout << "============================================================\n";
    std::cout << "Diagnostic Reason: " << reason << "\n";
    std::cout << "Terminating active process immediately with exit code (" << exitCode << ")...\n";
    std::cout << "============================================================\n";
    exit(exitCode);
}
