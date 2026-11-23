@echo off
REM ============================================================================
REM EndureAir — Automated Subprocess Crash-Test Runner (Windows Batch)
REM Spawns separate worker processes, triggers ungraceful exit(137) at named
REM fail points, runs the Reconciler, and verifies all 4 Golden Invariants.
REM ============================================================================

echo ==============================================================================
echo  [OS UNIT 1 ^& UNIT 5] ENDUREAIR SUBPROCESS CRASH-TEST HARNESS
echo ==============================================================================

if not exist "endure_air.exe" call build.bat

.\endure_air.exe --reset

echo.
echo [TEST 1] Spawning Worker Subprocess -> Kill at FP_AFTER_HOLD (Scenario A, Seat #1)...
.\endure_air.exe --worker-crash 1 301 ShellUser_A 1 SHELL-KEY-1
echo   Subprocess exited with code: %errorlevel% (137 = SIGKILL)
.\endure_air.exe --expire-seat 1
.\endure_air.exe --reconcile

echo.
echo [TEST 2] Spawning Worker Subprocess -> Kill at FP_AFTER_PAYMENT (Scenario B, Seat #2)...
.\endure_air.exe --worker-crash 2 302 ShellUser_B 2 SHELL-KEY-2
echo   Subprocess exited with code: %errorlevel% (137 = SIGKILL)
.\endure_air.exe --reconcile

echo.
echo [TEST 3] Spawning Worker Subprocess -> Kill at FP_BEFORE_CONFIRM (Scenario B/C, Seat #3)...
.\endure_air.exe --worker-crash 3 303 ShellUser_C 3 SHELL-KEY-3
echo   Subprocess exited with code: %errorlevel% (137 = SIGKILL)
.\endure_air.exe --reconcile

echo.
echo [TEST 4] Verifying 4 Golden Correctness Invariants across persisted state...
.\endure_air.exe --verify-invariants

echo.
echo [TEST 5] Running 500-Iteration Crash ^& Race Injection Loop...
.\endure_air.exe --crash-loop 500
