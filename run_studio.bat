@echo off
echo Starting Double Exposure Darkroom Studio...
echo.

:: Find the IP of the adapter that has a default gateway (the real WiFi/Ethernet, not virtual adapters)
for /f %%a in ('powershell -nologo -noprofile -command "$idx=(Get-NetRoute -DestinationPrefix '0.0.0.0/0'|Sort-Object RouteMetric|Select-Object -First 1).InterfaceIndex;(Get-NetIPAddress -InterfaceIndex $idx -AddressFamily IPv4).IPAddress"') do set LOCAL_IP=%%a

if "%LOCAL_IP%"=="" (
    echo WARNING: Could not detect your WiFi IP. QR code may not work on phone.
    set LOCAL_IP=localhost
)

echo -----------------------------------------------
echo   Laptop URL : http://localhost:8000
echo   Phone URL  : http://%LOCAL_IP%:8000
echo -----------------------------------------------
echo   Open the Phone URL on your laptop to make
echo   the QR code work on your phone's camera.
echo -----------------------------------------------
echo.

:: Start server in background
start /B python -m http.server 8000

:: Wait for server to be ready
timeout /t 2 /nobreak >nul

:: Open browser at localhost (camera works) with LAN IP as param (QR code still works on phone)
start http://localhost:8000?lanip=%LOCAL_IP%

echo Server is running. Press Ctrl+C to stop.
python -m http.server 8000 >nul 2>&1
pause
