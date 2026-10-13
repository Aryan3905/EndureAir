#include "aryan_os.h"
#include <iostream>

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
