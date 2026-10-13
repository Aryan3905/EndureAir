#ifndef ARYAN_OS_H
#define ARYAN_OS_H

#include <vector>
#include <string>
#include <map>
#include <mutex>
#include <chrono>

// Core system resource types: [0] Seats, [1] Meals, [2] Baggage Allowance (kg)
constexpr int NUM_RESOURCES = 3;
extern const std::string RESOURCE_NAMES[NUM_RESOURCES];
constexpr int TOTAL_SEATS_COUNT = 10;

// Booking Request Model for OS scheduling
struct BookingRequest {
    int requestId;
    int userId;
    std::string userName;
    int seatNumber;
    int requestedResources[NUM_RESOURCES]; // [Seats, Meals, Baggage]
    int priority;                          // Base priority (1-10)
    int agingBonus;                        // Dynamically incremented to prevent starvation
    std::chrono::steady_clock::time_point arrivalTime;

    int getEffectivePriority() const {
        return priority + agingBonus;
    }
};

// ========================================================
// Deadlock Avoidance Engine: Banker's Algorithm
// ========================================================
class BankersAlgorithm {
private:
    std::vector<int> available;
    std::map<int, std::vector<int>> maxClaim;
    std::map<int, std::vector<int>> allocation;
    std::mutex baMutex;

    // Safety Algorithm subroutine
    bool isStateSafe(const std::vector<int>& workAvail,
                     const std::map<int, std::vector<int>>& currentAlloc,
                     const std::map<int, std::vector<int>>& claims,
                     std::vector<int>& outSafeSeq);

public:
    BankersAlgorithm(const std::vector<int>& initialResources);
    void registerUserClaim(int userId, const std::vector<int>& maxResources);
    
    // Resource-Request Algorithm: validates if immediate allocation is safe
    bool requestResources(int userId, const int request[NUM_RESOURCES], std::vector<int>& outSafeSeq);

    // De-allocates resources on transaction completion or rollback
    void releaseResources(int userId, const int release[NUM_RESOURCES]);
    std::vector<int> getAvailableResources();
};

#endif // ARYAN_OS_H
