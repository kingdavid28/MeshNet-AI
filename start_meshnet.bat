@echo off
REM MeshNet AI - Emergency Mesh Communication
REM One-click startup script for emergency access
REM Double-click this file to start the app

echo ========================================
echo MeshNet AI - Emergency Communication
echo ========================================
echo.
echo Starting MeshNet AI application...
echo.

REM Change to the app directory
cd /d "%~dp0"

REM Ensure Windows Firewall allows the phone to reach Vite and the backend
echo Adding MeshNet firewall rule (UAC prompt)...
powershell -Command "Start-Process powershell -Verb RunAs -ArgumentList '-Command','New-NetFirewallRule -DisplayName MeshNet-Dev -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5173,4000 -Profile Any -ErrorAction SilentlyContinue'"

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing root dependencies...
    call npm install
    echo.
)

REM Install backend dependencies if needed
if not exist "backend\node_modules\ts-node-dev" (
    echo Installing backend dependencies...
    cd backend
    call npm install
    cd ..
    echo.
)

REM Start the Python FastAPI backend (bound to all interfaces for hotspot/LAN access)
echo Starting Python AI routing backend on 0.0.0.0:5050...
start /D "backend" "MeshNet Python" cmd /k "python -m uvicorn api_server:app --host 0.0.0.0 --port 5050 --reload"

REM Start the Node.js Express backend
echo Starting Node.js Express backend on :4000...
start /D "backend" "MeshNet Node" cmd /k "npm run dev"

REM Start the Vite frontend
echo Starting Vite frontend on :5173...
start "MeshNet Vite" cmd /k "npm run dev"
echo.

REM Give Vite a moment to start before Electron tries to load it
timeout /t 5 /nobreak > nul

REM Start the Electron desktop app with admin rights (needed for Wi-Fi hotspot netsh commands)
echo Starting Electron desktop app (admin prompt for Wi-Fi hotspot)...
start "MeshNet Electron" powershell -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoExit','-Command','cd ''%~dp0desktop''; npm start'"

echo.
echo All MeshNet services started. Close each window to stop.
pause
