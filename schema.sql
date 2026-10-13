
CREATE DATABASE IF NOT EXISTS endure_air_db;
USE endure_air_db;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS Users (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    user_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Seats Table (With Row-Level Locking Support)
CREATE TABLE IF NOT EXISTS Seats (
    seat_number INT PRIMARY KEY,
    is_booked BOOLEAN DEFAULT FALSE,
    booked_by_user_id INT NULL,
    passenger_name VARCHAR(100) DEFAULT 'AVAILABLE',
    FOREIGN KEY (booked_by_user_id) REFERENCES Users(user_id) ON DELETE SET NULL
);

-- 3. Resource Inventory Tables
CREATE TABLE IF NOT EXISTS Meals (
    meal_id INT PRIMARY KEY AUTO_INCREMENT,
    meal_type VARCHAR(50) NOT NULL,
    quantity_available INT NOT NULL DEFAULT 15
);

CREATE TABLE IF NOT EXISTS Baggage (
    baggage_id INT PRIMARY KEY AUTO_INCREMENT,
    total_capacity_kg INT NOT NULL DEFAULT 300,
    available_capacity_kg INT NOT NULL DEFAULT 300
);

-- 4. Bookings Table (Stores Confirmed ACID Transactions)
CREATE TABLE IF NOT EXISTS Bookings (
    booking_id INT PRIMARY KEY AUTO_INCREMENT,
    transaction_id INT NOT NULL,
    user_id INT NOT NULL,
    passenger_name VARCHAR(100) NOT NULL,
    seat_number INT NOT NULL,
    meals_count INT DEFAULT 1,
    baggage_kg INT DEFAULT 15,
    status ENUM('COMMITTED', 'ROLLED_BACK', 'IN_FLIGHT') DEFAULT 'COMMITTED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(user_id),
    FOREIGN KEY (seat_number) REFERENCES Seats(seat_number)
);

-- 5. Write-Ahead Logs (WAL) Audit Table
CREATE TABLE IF NOT EXISTS Logs (
    log_id INT PRIMARY KEY AUTO_INCREMENT,
    transaction_id INT NOT NULL,
    log_type ENUM('START', 'UPDATE', 'COMMIT', 'ABORT', 'CHECKPOINT') NOT NULL,
    target_item VARCHAR(50),
    old_value VARCHAR(100),
    new_value VARCHAR(100),
    log_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================
-- Seed Data Initialization
-- =====================================================================
-- Initialize 10 Flight Seats
INSERT IGNORE INTO Seats (seat_number, is_booked, booked_by_user_id, passenger_name) VALUES
(1, FALSE, NULL, 'AVAILABLE'),
(2, FALSE, NULL, 'AVAILABLE'),
(3, FALSE, NULL, 'AVAILABLE'),
(4, FALSE, NULL, 'AVAILABLE'),
(5, FALSE, NULL, 'AVAILABLE'),
(6, FALSE, NULL, 'AVAILABLE'),
(7, FALSE, NULL, 'AVAILABLE'),
(8, FALSE, NULL, 'AVAILABLE'),
(9, FALSE, NULL, 'AVAILABLE'),
(10, FALSE, NULL, 'AVAILABLE');

-- Initialize Resource Inventory Pools
INSERT IGNORE INTO Meals (meal_id, meal_type, quantity_available) VALUES (1, 'Standard In-Flight Meal', 15);
INSERT IGNORE INTO Baggage (baggage_id, total_capacity_kg, available_capacity_kg) VALUES (1, 300, 300);
