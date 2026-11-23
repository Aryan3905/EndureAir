@echo off
echo ===========================================================================
echo   EndureAir: Crash-Consistent Airline Reservation ^& Payment Reconciler
echo   Building Modular C++ Engine (OS + DBMS + Mock Gateway + Benchmark)
echo ===========================================================================
g++ -std=c++20 -O2 cpp\aryan_os.cpp cpp\bijendra_dbms.cpp cpp\yash_app.cpp -I cpp -o endure_air.exe -lpthread

if %errorlevel% equ 0 (
    echo.
    echo [BUILD SUCCESS] Binary compiled: endure_air.exe
    echo   Interactive Console : .\endure_air.exe
    echo   All 7 Scenarios     : .\endure_air.exe --all-scenarios
    echo   500 Crash Loop      : .\endure_air.exe --crash-loop 500
    echo   Locking Benchmark   : .\endure_air.exe --benchmark
) else (
    echo.
    echo [BUILD ERROR] Compilation failed. Verify MinGW / g++ installation.
)
