@echo off
echo ========================================================
echo   Compiling EndureAir (OS-DBMS PBL Project Phase 2)
echo ========================================================
g++ -std=c++17 aryan_os.cpp bijendra_dbms.cpp yash_app.cpp -o endure_air.exe

if %errorlevel% equ 0 (
    echo.
    echo [BUILD SUCCESS] endure_air.exe compiled successfully!
    echo Run it using: endure_air.exe
) else (
    echo.
    echo [BUILD FAILED] Compilation errors occurred.
)
pause
