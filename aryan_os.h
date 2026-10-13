#ifndef ARYAN_OS_H
#define ARYAN_OS_H

#include <vector>
#include <string>
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

#endif // ARYAN_OS_H
