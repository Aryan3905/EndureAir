#ifndef ARYAN_OS_H
#define ARYAN_OS_H

#include <vector>
#include <string>
#include <map>
#include <set>
#include <queue>
#include <mutex>
#include <condition_variable>
#include <chrono>
#include <stdexcept>

// ============================================================================
// Constants & System Parameters
// ============================================================================
constexpr int NUM_RESOURCES = 3;
extern const std::string RESOURCE_NAMES[NUM_RESOURCES];
constexpr int TOTAL_SEATS_COUNT = 30;
constexpr int DEFAULT_HOLD_TTL_SECONDS = 60;

// ============================================================================
// 1. Named Fail Points for Crash Harness (OS Unit 1: Signals & Process Kills)
// ============================================================================
enum FailPoint {
    FP_NONE = 0,
    FP_AFTER_HOLD = 1,        // Scenario A: Crash after seat hold, before payment
    FP_AFTER_PAYMENT = 2,     // Scenario B: Crash after payment succeeds, before confirm
    FP_BEFORE_CONFIRM = 3,    // Scenario B/C: Crash right before DB confirmation commit
    FP_MID_RECONCILE = 4      // Scenario G: Crash reconciler mid-run after partial repair
};

struct WorkerCrashException : public std::runtime_error {
    FailPoint failPoint;
    int exitSignal;
    WorkerCrashException(FailPoint fp, int sig, const std::string& msg)
        : std::runtime_error(msg), failPoint(fp), exitSignal(sig) {}
};

class CrashHarness {
public:
    // If realKillSubprocess == true (used by shell/batch runner --worker-crash),
    // calls _exit(137) (SIGKILL equivalent) to abruptly terminate the OS process.
    // Otherwise throws WorkerCrashException so interactive/loop driver can catch & recover.
    static void maybeTriggerCrash(FailPoint currentStep, FailPoint targetFailPoint,
                                  const std::string& contextMsg, bool realProcessExit = false);
    static std::string failPointToString(FailPoint fp);
};

// ============================================================================
// 2. Wait-For Graph (WFG) Deadlock Detector & Lock Ordering (OS Unit 3)
// ============================================================================
class WaitForGraph {
private:
    std::map<int, int> seatOwner;               // seatNo -> holding txnId
    std::map<int, std::set<int>> waitForEdges;  // txnId -> set of txnIds it waits for
    std::map<int, int> txnArrivalOrder;         // txnId -> logical timestamp (higher = younger)
    int logicalClock;
    std::mutex wfgMutex;

    bool dfsCycleVisit(int currTxn, std::map<int, int>& color,
                       std::vector<int>& path, std::vector<int>& outCycle);

public:
    WaitForGraph();
    void reset();
    void registerTransaction(int txnId);

    // Returns true if lock acquired immediately; false if blocked (adds WFG edge)
    bool requestSeatLock(int txnId, int seatNo);
    void releaseTransactionLocks(int txnId);

    // Detects directed cycle T_i -> T_j -> ... -> T_i using DFS
    bool detectDeadlockCycle(std::vector<int>& outCycle);

    // Selects youngest transaction in cycle as deadlock recovery victim
    int selectYoungestVictim(const std::vector<int>& cycle);

    void printGraph();

    // Runs Scenario F: Unordered Group Booking (Deadlock) vs. Ascending Lock Ordering (0 Deadlocks)
    static void runGroupBookingComparisonDemo();
};

// ============================================================================
// 3. Banker's Algorithm (Kept as Comparative Study for OS Unit 3)
//    Demonstrates why Deadlock Avoidance (a priori max claim) does not fit
//    dynamic airline seat reservations compared to WFG + Lock Ordering.
// ============================================================================
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
    static void printWhyBankersDoesNotFitBooking();
};

// ============================================================================
// 4. Priority Queue with Aging (OS Unit 2: Starvation-Free Scheduling)
// ============================================================================
struct BookingRequest {
    int requestId;
    int userId;
    std::string userName;
    int seatNumber;
    int priority;       // Base priority (1-10)
    int agingBonus;     // Incremented per scheduling tick to prevent starvation
    std::string idempotencyKey;
    std::chrono::steady_clock::time_point arrivalTime;

    int getEffectivePriority() const {
        return priority + agingBonus;
    }
};

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

// ============================================================================
// 5. Classical Synchronization #1: Producer-Consumer Outbox Queue (OS Unit 2)
// ============================================================================
struct OutboxMessage {
    int id;
    std::string idempotencyKey;
    int userId;
    std::string passengerName;
    int seatNo;
    double amount;
};

class OutboxProducerConsumerQueue {
private:
    std::queue<OutboxMessage> buffer;
    size_t capacity;
    std::mutex mtx;
    std::condition_variable cvNotEmpty;
    std::condition_variable cvNotFull;

public:
    OutboxProducerConsumerQueue(size_t maxCapacity = 64);
    void produce(const OutboxMessage& msg);
    bool tryConsume(OutboxMessage& outMsg);
    size_t size();
};

// ============================================================================
// 6. Classical Synchronization #2: Readers-Writers Seat Map Lock (OS Unit 2)
//    Allows many concurrent seat-map readers while giving exclusive lock to
//    booking writers.
// ============================================================================
class ReadersWritersSeatLock {
private:
    std::mutex mtx;
    std::condition_variable cv;
    int activeReaders;
    int waitingWriters;
    bool writerActive;

public:
    ReadersWritersSeatLock();
    void acquireReadLock();
    void releaseReadLock();
    void acquireWriteLock();
    void releaseWriteLock();
    static void runReadersWritersDemo();
};

#endif // ARYAN_OS_H
