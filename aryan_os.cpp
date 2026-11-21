#include "aryan_os.h"
#include <iostream>
#include <iomanip>
#include <algorithm>
#include <thread>
#include <cstdlib>

const std::string RESOURCE_NAMES[NUM_RESOURCES] = {"Seats", "Meals", "Baggage(kg)"};

// ============================================================================
// 1. Crash Harness Implementation (OS Unit 1: Signals & Process Termination)
// ============================================================================
std::string CrashHarness::failPointToString(FailPoint fp) {
    switch (fp) {
        case FP_NONE:           return "NONE";
        case FP_AFTER_HOLD:     return "AFTER_HOLD (Scenario A)";
        case FP_AFTER_PAYMENT:  return "AFTER_PAYMENT (Scenario B)";
        case FP_BEFORE_CONFIRM: return "BEFORE_CONFIRM (Scenario B/C)";
        case FP_MID_RECONCILE:  return "MID_RECONCILE (Scenario G)";
    }
    return "UNKNOWN";
}

void CrashHarness::maybeTriggerCrash(FailPoint currentStep, FailPoint targetFailPoint,
                                     const std::string& contextMsg, bool realProcessExit) {
    if (currentStep == FP_NONE || currentStep != targetFailPoint) {
        return;
    }

    std::cout << "\n[CRASH HARNESS - SIGKILL (kill -9) AT FAIL POINT: "
              << failPointToString(currentStep) << "]\n";
    std::cout << "  Context: " << contextMsg << "\n";

    if (realProcessExit) {
        std::cout << "  Executing immediate OS _exit(137) (ungraceful SIGKILL termination)...\n";
        std::cout.flush();
        std::_Exit(137);
    }

    throw WorkerCrashException(currentStep, 137, contextMsg);
}

// ============================================================================
// 2. Wait-For Graph (WFG) Deadlock Detector & Lock Ordering (OS Unit 3)
// ============================================================================
WaitForGraph::WaitForGraph() : logicalClock(0) {}

void WaitForGraph::reset() {
    std::lock_guard<std::mutex> lock(wfgMutex);
    seatOwner.clear();
    waitForEdges.clear();
    txnArrivalOrder.clear();
    logicalClock = 0;
}

void WaitForGraph::registerTransaction(int txnId) {
    std::lock_guard<std::mutex> lock(wfgMutex);
    if (txnArrivalOrder.find(txnId) == txnArrivalOrder.end()) {
        txnArrivalOrder[txnId] = ++logicalClock;
    }
}

bool WaitForGraph::requestSeatLock(int txnId, int seatNo) {
    std::lock_guard<std::mutex> lock(wfgMutex);
    if (txnArrivalOrder.find(txnId) == txnArrivalOrder.end()) {
        txnArrivalOrder[txnId] = ++logicalClock;
    }

    auto it = seatOwner.find(seatNo);
    if (it == seatOwner.end() || it->second == txnId) {
        seatOwner[seatNo] = txnId;
        return true;
    }

    int holderTxn = it->second;
    waitForEdges[txnId].insert(holderTxn);
    return false;
}

void WaitForGraph::releaseTransactionLocks(int txnId) {
    std::lock_guard<std::mutex> lock(wfgMutex);
    for (auto it = seatOwner.begin(); it != seatOwner.end(); ) {
        if (it->second == txnId) {
            it = seatOwner.erase(it);
        } else {
            ++it;
        }
    }
    waitForEdges.erase(txnId);
    for (auto& kv : waitForEdges) {
        kv.second.erase(txnId);
    }
}

bool WaitForGraph::dfsCycleVisit(int currTxn, std::map<int, int>& color,
                                 std::vector<int>& path, std::vector<int>& outCycle) {
    color[currTxn] = 1; // GRAY (in current recursion stack)
    path.push_back(currTxn);

    auto it = waitForEdges.find(currTxn);
    if (it != waitForEdges.end()) {
        for (int nextTxn : it->second) {
            if (color[nextTxn] == 1) {
                // Found cycle! Extract cycle from path
                outCycle.clear();
                auto startIt = std::find(path.begin(), path.end(), nextTxn);
                for (auto p = startIt; p != path.end(); ++p) {
                    outCycle.push_back(*p);
                }
                outCycle.push_back(nextTxn);
                return true;
            } else if (color[nextTxn] == 0) {
                if (dfsCycleVisit(nextTxn, color, path, outCycle)) {
                    return true;
                }
            }
        }
    }

    path.pop_back();
    color[currTxn] = 2; // BLACK (fully explored)
    return false;
}

bool WaitForGraph::detectDeadlockCycle(std::vector<int>& outCycle) {
    std::lock_guard<std::mutex> lock(wfgMutex);
    std::map<int, int> color; // 0 = WHITE, 1 = GRAY, 2 = BLACK
    for (const auto& kv : txnArrivalOrder) {
        color[kv.first] = 0;
    }

    for (const auto& kv : txnArrivalOrder) {
        int txnId = kv.first;
        if (color[txnId] == 0) {
            std::vector<int> path;
            if (dfsCycleVisit(txnId, color, path, outCycle)) {
                return true;
            }
        }
    }
    return false;
}

int WaitForGraph::selectYoungestVictim(const std::vector<int>& cycle) {
    std::lock_guard<std::mutex> lock(wfgMutex);
    int victimTxn = -1;
    int maxOrder = -1;
    for (int txnId : cycle) {
        int order = txnArrivalOrder[txnId];
        if (order > maxOrder) {
            maxOrder = order;
            victimTxn = txnId;
        }
    }
    return victimTxn;
}

void WaitForGraph::printGraph() {
    std::lock_guard<std::mutex> lock(wfgMutex);
    std::cout << "  [Wait-For Graph Edges]: ";
    if (waitForEdges.empty()) {
        std::cout << "(No blocked transactions)\n";
        return;
    }
    for (const auto& kv : waitForEdges) {
        for (int target : kv.second) {
            std::cout << "T" << kv.first << " -> T" << target << "   ";
        }
    }
    std::cout << "\n";
}

void WaitForGraph::runGroupBookingComparisonDemo() {
    std::cout << "\n========================================================================\n";
    std::cout << " [OS UNIT 3] SCENARIO F: MULTI-SEAT GROUP BOOKING DEADLOCK STUDY\n";
    std::cout << "========================================================================\n";

    // Part 1: Unordered Locking -> Circular Wait Deadlock -> WFG Detection & Recovery
    std::cout << "\n--- PART 1: UNORDERED LOCKING (T1: Seat 1 -> Seat 2, T2: Seat 2 -> Seat 1) ---\n";
    WaitForGraph wfg;
    wfg.registerTransaction(101); // Older transaction T101
    wfg.registerTransaction(102); // Younger transaction T102

    wfg.requestSeatLock(101, 1);
    std::cout << "  Step 1: T101 acquires lock on Seat #1.\n";
    wfg.requestSeatLock(102, 2);
    std::cout << "  Step 2: T102 acquires lock on Seat #2.\n";

    bool t1GotSeat2 = wfg.requestSeatLock(101, 2);
    std::cout << "  Step 3: T101 requests Seat #2 -> " << (t1GotSeat2 ? "GRANTED" : "BLOCKED (Held by T102)") << "\n";

    bool t2GotSeat1 = wfg.requestSeatLock(102, 1);
    std::cout << "  Step 4: T102 requests Seat #1 -> " << (t2GotSeat1 ? "GRANTED" : "BLOCKED (Held by T101)") << "\n";

    wfg.printGraph();

    std::vector<int> cycle;
    if (wfg.detectDeadlockCycle(cycle)) {
        std::cout << "  [WFG DFS DETECTOR] DEADLOCK CYCLE DETECTED: ";
        for (size_t i = 0; i < cycle.size(); ++i) {
            std::cout << "T" << cycle[i] << (i + 1 < cycle.size() ? " -> " : "");
        }
        std::cout << "\n";

        int victim = wfg.selectYoungestVictim(cycle);
        std::cout << "  [DEADLOCK RECOVERY] Selecting youngest transaction T" << victim
                  << " as victim -> Aborting & releasing its locks.\n";
        wfg.releaseTransactionLocks(victim);

        if (wfg.requestSeatLock(101, 2)) {
            std::cout << "  [RECOVERY COMPLETE] T101 now acquires Seat #2 and commits both seats!\n";
            wfg.releaseTransactionLocks(101);
        }
    }

    // Part 2: Deadlock Prevention via Ascending Lock Ordering
    std::cout << "\n--- PART 2: DEADLOCK PREVENTION VIA ASCENDING LOCK ORDERING ---\n";
    std::cout << "  Rule: Always sort requested seat IDs in ascending order: lock(min(s1,s2)) then lock(max(s1,s2)).\n";
    std::cout << "  - T101 wants {Seat 1, Seat 2} -> Sorted order: Seat 1, then Seat 2.\n";
    std::cout << "  - T102 wants {Seat 2, Seat 1} -> Sorted order: Seat 1, then Seat 2.\n";
    wfg.reset();
    wfg.registerTransaction(101);
    wfg.registerTransaction(102);

    wfg.requestSeatLock(101, 1);
    std::cout << "  Step 1: T101 locks Seat #1 first.\n";
    bool t2First = wfg.requestSeatLock(102, 1);
    std::cout << "  Step 2: T102 also requests Seat #1 first -> " << (t2First ? "GRANTED" : "WAITS CLEANLY (No hold-and-wait cycle)") << "\n";
    wfg.requestSeatLock(101, 2);
    std::cout << "  Step 3: T101 locks Seat #2, commits, and releases {Seat 1, Seat 2}.\n";
    wfg.releaseTransactionLocks(101);

    std::vector<int> checkCycle;
    std::cout << "  [WFG CHECK] Deadlock Cycles Detected: " << (wfg.detectDeadlockCycle(checkCycle) ? "YES" : "0 (Coffman Circular Wait Broken!)") << "\n";

    // Part 3: Banker's Algorithm Comparison
    BankersAlgorithm::printWhyBankersDoesNotFitBooking();
}

// ============================================================================
// 3. Banker's Algorithm (Comparative Study for OS Unit 3)
// ============================================================================
BankersAlgorithm::BankersAlgorithm(const std::vector<int>& initialResources)
    : available(initialResources) {}

void BankersAlgorithm::registerUserClaim(int userId, const std::vector<int>& maxResources) {
    std::lock_guard<std::mutex> lock(baMutex);
    maxClaim[userId] = maxResources;
    allocation[userId] = std::vector<int>(NUM_RESOURCES, 0);
}

bool BankersAlgorithm::isStateSafe(const std::vector<int>& workAvail,
                                   const std::map<int, std::vector<int>>& currentAlloc,
                                   const std::map<int, std::vector<int>>& claims,
                                   std::vector<int>& outSafeSeq) {
    std::vector<int> work = workAvail;
    std::map<int, bool> finish;
    for (const auto& pair : currentAlloc) finish[pair.first] = false;

    outSafeSeq.clear();
    int completedCount = 0;
    int totalUsers = static_cast<int>(currentAlloc.size());

    while (completedCount < totalUsers) {
        bool progress = false;
        for (const auto& pair : currentAlloc) {
            int uid = pair.first;
            if (!finish[uid]) {
                bool canSatisfy = true;
                for (int j = 0; j < NUM_RESOURCES; ++j) {
                    if (claims.at(uid)[j] - pair.second[j] > work[j]) {
                        canSatisfy = false;
                        break;
                    }
                }
                if (canSatisfy) {
                    for (int j = 0; j < NUM_RESOURCES; ++j) work[j] += pair.second[j];
                    finish[uid] = true;
                    outSafeSeq.push_back(uid);
                    progress = true;
                    completedCount++;
                }
            }
        }
        if (!progress) return false;
    }
    return true;
}

bool BankersAlgorithm::requestResources(int userId, const int request[NUM_RESOURCES], std::vector<int>& outSafeSeq) {
    std::lock_guard<std::mutex> lock(baMutex);
    if (maxClaim.find(userId) == maxClaim.end()) {
        maxClaim[userId] = {request[0], request[1], request[2]};
        allocation[userId] = {0, 0, 0};
    }
    for (int j = 0; j < NUM_RESOURCES; ++j) {
        if (request[j] > maxClaim[userId][j] - allocation[userId][j] || request[j] > available[j]) {
            return false;
        }
    }
    std::vector<int> trialAvail = available;
    auto trialAlloc = allocation;
    for (int j = 0; j < NUM_RESOURCES; ++j) {
        trialAvail[j] -= request[j];
        trialAlloc[userId][j] += request[j];
    }
    if (isStateSafe(trialAvail, trialAlloc, maxClaim, outSafeSeq)) {
        available = trialAvail;
        allocation = trialAlloc;
        return true;
    }
    return false;
}

void BankersAlgorithm::releaseResources(int userId, const int release[NUM_RESOURCES]) {
    std::lock_guard<std::mutex> lock(baMutex);
    if (allocation.find(userId) != allocation.end()) {
        for (int j = 0; j < NUM_RESOURCES; ++j) {
            allocation[userId][j] -= release[j];
            available[j] += release[j];
        }
    }
}

void BankersAlgorithm::printMatrix() {
    std::lock_guard<std::mutex> lock(baMutex);
    std::cout << "\n================ [OS UNIT 3] BANKER'S ALGORITHM MATRICES ================\n";
    for (int j = 0; j < NUM_RESOURCES; ++j) {
        std::cout << RESOURCE_NAMES[j] << ": " << available[j] << "   ";
    }
    std::cout << "\n=========================================================================\n";
}

void BankersAlgorithm::printWhyBankersDoesNotFitBooking() {
    std::cout << "\n--- PART 3: WHY BANKER'S ALGORITHM (AVOIDANCE) DOES NOT FIT BOOKING ---\n";
    std::cout << "  1. No A-Priori Maximum Demand: Passengers do not declare a lifetime\n"
              << "     maximum seat/meal claim before connecting to the booking server.\n";
    std::cout << "  2. No Incremental Hold-and-Wait Across Meals/Baggage: A booking does not\n"
              << "     hold a seat mutex while blocking on a meal counter.\n";
    std::cout << "  3. Fungible vs. Named Resources: Banker's treats resources as identical\n"
              << "     units, whereas Seat #1A and Seat #1B are distinct named rows.\n";
    std::cout << "  -> Conclusion: Production reservation engines use Ascending Lock Ordering\n"
              << "     (Prevention) + Wait-For Graph Cycle Detection (Detection & Recovery).\n";
    std::cout << "========================================================================\n\n";
}

// ============================================================================
// 4. Priority Queue with Aging Implementation (OS Unit 2)
// ============================================================================
void PriorityQueueWithAging::enqueueRequest(const BookingRequest& req) {
    std::lock_guard<std::mutex> lock(queueMutex);
    BookingRequest newReq = req;
    newReq.agingBonus = 0;
    newReq.arrivalTime = std::chrono::steady_clock::now();
    waitingQueue.push_back(newReq);
}

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
    std::cout << "\n================ [OS UNIT 2] PRIORITY QUEUE WITH AGING ================\n";
    if (waitingQueue.empty()) {
        std::cout << ">> Waiting queue is empty.\n";
    } else {
        std::cout << std::left << std::setw(8) << "ReqID"
                  << std::setw(16) << "Passenger"
                  << std::setw(8) << "Seat"
                  << std::setw(12) << "Base Prio"
                  << std::setw(12) << "Aging Bonus"
                  << std::setw(15) << "Effective Prio\n";
        std::cout << "-----------------------------------------------------------------------\n";
        for (const auto& r : waitingQueue) {
            std::cout << std::left << std::setw(8) << r.requestId
                      << std::setw(16) << r.userName
                      << std::setw(8) << r.seatNumber
                      << std::setw(12) << r.priority
                      << std::setw(12) << r.agingBonus
                      << std::setw(15) << r.getEffectivePriority() << "\n";
        }
    }
    std::cout << "=======================================================================\n\n";
}

// ============================================================================
// 5. Classical Synchronization #1: Producer-Consumer Outbox Queue (OS Unit 2)
// ============================================================================
OutboxProducerConsumerQueue::OutboxProducerConsumerQueue(size_t maxCapacity)
    : capacity(maxCapacity) {}

void OutboxProducerConsumerQueue::produce(const OutboxMessage& msg) {
    std::unique_lock<std::mutex> lock(mtx);
    cvNotFull.wait(lock, [this]() { return buffer.size() < capacity; });
    buffer.push(msg);
    cvNotEmpty.notify_one();
}

bool OutboxProducerConsumerQueue::tryConsume(OutboxMessage& outMsg) {
    std::unique_lock<std::mutex> lock(mtx);
    if (buffer.empty()) return false;
    outMsg = buffer.front();
    buffer.pop();
    cvNotFull.notify_one();
    return true;
}

size_t OutboxProducerConsumerQueue::size() {
    std::lock_guard<std::mutex> lock(mtx);
    return buffer.size();
}

// ============================================================================
// 6. Classical Synchronization #2: Readers-Writers Seat Map Lock (OS Unit 2)
// ============================================================================
ReadersWritersSeatLock::ReadersWritersSeatLock()
    : activeReaders(0), waitingWriters(0), writerActive(false) {}

void ReadersWritersSeatLock::acquireReadLock() {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, [this]() { return !writerActive && waitingWriters == 0; });
    activeReaders++;
}

void ReadersWritersSeatLock::releaseReadLock() {
    std::unique_lock<std::mutex> lock(mtx);
    activeReaders--;
    if (activeReaders == 0) {
        cv.notify_all();
    }
}

void ReadersWritersSeatLock::acquireWriteLock() {
    std::unique_lock<std::mutex> lock(mtx);
    waitingWriters++;
    cv.wait(lock, [this]() { return !writerActive && activeReaders == 0; });
    waitingWriters--;
    writerActive = true;
}

void ReadersWritersSeatLock::releaseWriteLock() {
    std::unique_lock<std::mutex> lock(mtx);
    writerActive = false;
    cv.notify_all();
}

void ReadersWritersSeatLock::runReadersWritersDemo() {
    std::cout << "\n================ [OS UNIT 2] READERS-WRITERS SEAT MAP DEMO ================\n";
    ReadersWritersSeatLock rwLock;
    rwLock.acquireReadLock();
    rwLock.acquireReadLock();
    std::cout << "  -> 2 Concurrent Seat-Map Viewers (Readers) acquired shared read lock simultaneously.\n";
    rwLock.releaseReadLock();
    rwLock.releaseReadLock();
    rwLock.acquireWriteLock();
    std::cout << "  -> 1 Booking Transaction (Writer) acquired exclusive write lock after readers finished.\n";
    rwLock.releaseWriteLock();
    std::cout << "===========================================================================\n\n";
}
