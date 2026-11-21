#!/usr/bin/env bash
# ==============================================================================
# EndureAir — OS Unit 5 Shell Crash-Test Runner (Linux / WSL2)
# Exercises real process kills (SIGKILL / exit 137) across named fail points,
# runs the Reconciler, and uses grep / awk to verify the 4 Golden Invariants.
# ==============================================================================

set -u

BINARY="./endure_air"
if [ -f "./endure_air.exe" ]; then
    BINARY="./endure_air.exe"
elif [ ! -f "$BINARY" ]; then
    echo "[BUILD] Compiling EndureAir binary..."
    g++ -std=c++17 -O2 aryan_os.cpp bijendra_dbms.cpp yash_app.cpp -o endure_air -lpthread
fi

echo "=============================================================================="
echo " [OS UNIT 5: SHELL CRASH HARNESS] Starting Real Worker Process-Kill Tests"
echo "=============================================================================="

$BINARY --reset

# 1. Fail Point 1: Kill worker after Seat Hold, before Payment (Scenario A)
echo ""
echo ">>> Test 1: Killing worker at FP_AFTER_HOLD (Seat #1)..."
$BINARY --worker-crash 1 301 "ShellUser_A" 1 "SHELL-KEY-1"
EXIT_CODE=$?
echo "    Worker terminated with OS exit code: $EXIT_CODE (Expected 137 / SIGKILL)"
$BINARY --expire-seat 1
$BINARY --reconcile

# 2. Fail Point 2: Kill worker after Payment CHARGED, before DB Confirm (Scenario B)
echo ""
echo ">>> Test 2: Killing worker at FP_AFTER_PAYMENT (Seat #2)..."
$BINARY --worker-crash 2 302 "ShellUser_B" 2 "SHELL-KEY-2"
EXIT_CODE=$?
echo "    Worker terminated with OS exit code: $EXIT_CODE (Expected 137 / SIGKILL)"
$BINARY --reconcile

# 3. Fail Point 3: Kill worker immediately prior to atomic confirm (Seat #3)
echo ""
echo ">>> Test 3: Killing worker at FP_BEFORE_CONFIRM (Seat #3)..."
$BINARY --worker-crash 3 303 "ShellUser_C" 3 "SHELL-KEY-3"
EXIT_CODE=$?
echo "    Worker terminated with OS exit code: $EXIT_CODE (Expected 137 / SIGKILL)"
$BINARY --reconcile

# 4. Verify the 4 Golden Invariants using grep and awk on output & database_state.txt
echo ""
echo ">>> Verifying 4 Golden Correctness Invariants with grep & awk..."
VERIFY_OUT=$($BINARY --verify-invariants)
echo "$VERIFY_OUT"

PASS_COUNT=$(echo "$VERIFY_OUT" | grep -c "PASS (0 violations)")
BOOKED_SEATS=$(awk '/^[0-9]+[[:space:]]+BOOKED/ { count++ } END { print count+0 }' database_state.txt)

echo "------------------------------------------------------------------------------"
echo " [AWK / GREP INVARIANT REPORT]"
echo " - Invariants Passed (out of 4) : $PASS_COUNT / 4"
echo " - Confirmed Booked Seats (awk) : $BOOKED_SEATS (Expected 2: Seats #2 and #3)"
echo "------------------------------------------------------------------------------"

# 5. Execute 500-iteration automated crash loop
$BINARY --crash-loop 500
