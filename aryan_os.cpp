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
