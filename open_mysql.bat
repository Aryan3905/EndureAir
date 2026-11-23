@echo off
title EndureAir - MySQL 8.0 Interactive Database Console
color 0b
echo ==================================================================
echo           EndureAir MySQL 8.0 Database (endure_air_db)
echo ==================================================================
echo.
echo [QUICK COMMANDS TO RUN FOR EVALUATOR]:
echo   1. SHOW TABLES;
echo   2. SELECT seat_no, status, passenger_name, version FROM seats;
echo   3. SELECT * FROM bookings;
echo   4. SELECT * FROM booking_journal ORDER BY id DESC LIMIT 10;
echo   5. SELECT * FROM reconciliation_audit;
echo.
"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -pyash1906 endure_air_db
