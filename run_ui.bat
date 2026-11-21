@echo off
echo ==================================================================
echo   Starting EndureAir Luxury Aviation & Live MySQL Web Portal
echo   URL      : http://localhost:3000
echo   Database : MySQL 8.0 (endure_air_db)
echo ==================================================================
start "" "http://localhost:3000"
node server.js
pause
