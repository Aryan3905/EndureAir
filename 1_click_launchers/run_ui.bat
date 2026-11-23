@echo off
cd /d "%~dp0"
if not exist "server.js" cd /d "%~dp0.."
echo ==============================================================================
echo  Launching EndureAir 3D Web Portal on http://localhost:3000
echo ==============================================================================
node server.js
