#ifndef ARYAN_OS_H
#define ARYAN_OS_H

#include <vector>
#include <string>
#include <map>
#include <mutex>
#include <chrono>

// Number and names of managed resources
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
// Aryan's Module: Banker's Algorithm (Deadlock Avoidance)
// ========================================================
class BankersAlgorithm {
private:
    std::vector<int> available;
    std::map<int, std::vector<int>> maxClaim;
    std::map<int, std::vector<int>> allocation;
    std::mutex baMutex;

    bool isStateSafe(const std::vector<int>& workAvail,
                     const std::map<int, std::vector<int>>& currentAlloc,
                     const std::map<int, std::vector<int>>& claims,
                     std::vector<int>& outSafeSeq);

public:
    BankersAlgorithm(const std::vector<int>& initialResources);

    void registerUserClaim(int userId, const std::vector<int>& maxResources);
    bool requestResources(int userId, const int request[NUM_RESOURCES], std::vector<int>& outSafeSeq);
    void releaseResources(int userId, const int release[NUM_RESOURCES]);
    void printMatrix();
    std::vector<int> getAvailableResources();
};

// ========================================================
// Aryan's Module: Priority Queue with Aging (Scheduling)
// ========================================================
class PriorityQueueWithAging {
private:
    std::vector<BookingRequest> waitingQueue;
    std::mutex queueMutex;

public:
    void enqueueRequest(const BookingRequest& req);
    void applyAgingStep();
    bool isEmpty();
    BookingRequest popHighestPriority();
    void printQueueStatus();
};

// Function to simulate sudden crash (SIGKILL/mid-transaction termination)
void triggerSimulatedCrash(int exitCode, const std::string& reason);

#endif // ARYAN_OS_H
