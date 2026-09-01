# OS & DBMS Integrated Booking and Crash Recovery System

A simulation-based booking management system that integrates core **Operating System** and **Database Management System** concepts to handle resource allocation, concurrent bookings, system crashes, and recovery.

## 🚀 Overview

The system models a real-world booking platform where resources such as **seats, meals, and baggage slots** are allocated to users. It demonstrates how OS and DBMS concepts can work together to maintain consistency, prevent conflicts, and recover safely from failures.

## 🧠 OS Concepts Used

- **Deadlock Avoidance — Banker's Algorithm:** Checks whether a booking request keeps the system in a safe state.
- **Process Scheduling:** Handles multiple booking requests and queues requests when immediate allocation is unsafe.
- **Resource Allocation:** Seats, meals, and baggage slots are treated as OS-style resources.
- **Synchronization:** Locks/semaphores protect resources during concurrent bookings.
- **System Crash Simulation:** Simulates a process failure in the middle of a transaction.
- **Checkpointing & Crash Recovery:** Restores the system to a consistent resource state after a crash.

## 🗄️ DBMS Concepts Used

- **Transactions:** Every booking is handled as a transaction.
- **ACID Properties:** Ensures atomicity, consistency, isolation, and durability.
- **Concurrency Control:** Prevents conflicting operations and double-booking.
- **Row-Level Locking:** Locks only the required database rows during booking.
- **Isolation Levels:** Controls how simultaneous transactions interact.
- **Write-Ahead Logging (WAL):** Maintains logs before database changes are committed.
- **Undo/Redo Recovery:** Recovers committed and uncommitted changes after failures.
- **Query Processing:** SQL queries are used for auditing and system analysis.
- **Views:** Provides different access levels for Admins and Users.
- **Normalization & ER Model:** Ensures a structured and efficient database schema.

## 🔄 Booking Flow

```text
User Request
     ↓
Resource Availability Check
     ↓
Acquire Lock
     ↓
Banker's Algorithm
     ↓
Safe State?
   ↙       ↘
 Yes        No
 ↓           ↓
Allocate    Queue Request
Resource
 ↓
DB Transaction
 ↓
WAL / Commit
 ↓
Booking Confirmed
```

## 💥 Crash Recovery Flow

```text
Transaction Started
        ↓
WAL Generated
        ↓
Resource Allocation
        ↓
System Crash
        ↓
Recovery Manager
        ↓
Read Checkpoint + WAL
        ↓
Undo / Redo Operations
        ↓
Consistent State Restored
```

## 🎯 Key Features

- Deadlock-safe resource allocation
- Concurrent booking simulation
- Prevention of double-booking
- Transaction management
- Crash and failure simulation
- Checkpoint-based recovery
- WAL-based database recovery
- Admin and user views
- SQL-based audit and recovery history
- Integration of OS and DBMS concepts in one system

## 🛠️ Technologies

- **Frontend:** React.js
- **Backend:** FastAPI
- **Database:** PostgreSQL
- **Programming:** Python / C++
- **Database:** SQL

## 📚 Learning Objectives

This project demonstrates the practical integration of OS and DBMS concepts rather than treating them as isolated theoretical topics. It shows how deadlock avoidance, synchronization, transactions, concurrency control, and recovery mechanisms can work together in a real-world booking scenario.

## 👥 Access Control

### Admin
- View complete booking logs
- Monitor denied requests
- View safe sequences
- Inspect recovery history
- Monitor system/resource state

### User
- Create bookings
- View their own bookings
- Check booking status
- View their transaction history

## 🔮 Future Improvements

- Real-time booking dashboard
- Distributed transaction support
- Redis-based distributed locking
- Automatic failure injection
- Advanced recovery visualization
- Performance benchmarking
- Dockerized deployment

## 📌 Project Purpose

The main goal is to build an educational yet realistic system that demonstrates how **Operating System resource management** and **Database transaction management** can cooperate to create a reliable, concurrent, and crash-resilient booking system.
