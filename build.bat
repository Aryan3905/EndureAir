@echo off
echo ========================================================
echo   EndureAir: Resilient Transaction Processing System
echo   Building Modular C++ Binaries (OS + DBMS + UI)
echo ========================================================
g++ -std=c++17 aryan_os.cpp bijendra_dbms.cpp yash_app.cpp -o endure_air.exe

if %errorlevel% equ 0 (
    echo.
    echo [BUILD SUCCESS] Binary compiled: endure_air.exe
    echo Execute using: endure_air.exe
) else (
    echo.
    echo [BUILD ERROR] Compilation failed. Please verify MinGW / g++ installation.
)
pause
