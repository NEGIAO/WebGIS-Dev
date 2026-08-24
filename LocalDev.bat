@echo off
REM ============================================================
REM WebGIS Local Dev Launcher v3.0
REM Frontend: http://localhost:5173
REM Backend:  http://localhost:7860
REM ============================================================

chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

REM Helper: call Write-Color.ps1 with message ID
set "WC=powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Write-Color.ps1""

%WC% 100
%WC% 101
%WC% 102

set PROJECT_ROOT=%~dp0
set FRONTEND_DIR=%PROJECT_ROOT%frontend
set BACKEND_DIR=%PROJECT_ROOT%backend


REM ====================================================================
REM Step 1: Check dependencies
REM ====================================================================
%WC% 200
echo.

REM 1. Node.js toolchain is containerized (web service runs Vite inside Docker);
REM    host Node/npm are optional and no longer required.
echo.

REM 2. Docker
where docker >nul 2>&1
if errorlevel 1 goto :ERR_DOCKER

%WC% 302

REM 3. Docker running?
docker info >nul 2>&1
if errorlevel 1 (
    %WC% 500
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    %WC% 701
    timeout /t 15 /nobreak >nul
    docker info >nul 2>&1
    if errorlevel 1 goto :ERR_DOCKER_START
)

%WC% 303
echo.

REM 4. docker compose
docker compose version >nul 2>&1
if errorlevel 1 goto :ERR_COMPOSE

%WC% 304
echo.
%WC% 305
echo.

REM ====================================================================
REM Step 2: Frontend env config
REM ====================================================================
%WC% 201
echo.

REM --- Deploy .env auto-create (L1 local config lives in deploy\, key catalog in deploy\.env.example) ---
if not exist "%PROJECT_ROOT%deploy\.env" (
    if exist "%PROJECT_ROOT%deploy\.env.example" (
        copy /y "%PROJECT_ROOT%deploy\.env.example" "%PROJECT_ROOT%deploy\.env" >nul
        echo [OK] deploy\.env created from deploy\.env.example (deployment baseline; dev mode enabled by docker-compose APP_ENV=development)
    )
)

REM --- Advisory gates (non-blocking): config registry + structure tree drift ---
where python >nul 2>&1
if not errorlevel 1 (
    echo [Gate] Running config registry / structure tree checks...
    python "%PROJECT_ROOT%Scripts\CheckConfigRegistry.py" 2>nul
    python "%PROJECT_ROOT%Scripts\CheckStructureTree.py" --quiet 2>nul
    echo [Gate] Advisory only - warnings above do not block startup
)

if not exist "%FRONTEND_DIR%" (
    %WC% 501
    mkdir "%FRONTEND_DIR%"
)

REM --- Env unified in deploy\: Vite envDir points to deploy\, VITE_* read from deploy\.env(.local) ---
echo [OK] Frontend env unified: edit VITE_* in deploy\.env ^(production^) or deploy\.env.local ^(dev^)
echo.

REM ====================================================================
REM Step 3: Start backend (Docker Compose)
REM ====================================================================
%WC% 202
%WC% 700
echo.

cd /d "%PROJECT_ROOT%"

if not exist "deploy\docker-compose.yml" goto :ERR_COMPOSE_FILE

REM --- Smart image build detection ---
%WC% 703
echo.

set DOCKER_ACTION=up
set IMAGE_NAME=negiao/webgis:latest

docker image inspect !IMAGE_NAME! >nul 2>&1
if errorlevel 1 (
    %WC% 600
    set DOCKER_ACTION=build
    goto :DO_DOCKER
)

REM Compare Dockerfile time vs image creation time
for /f "tokens=*" %%t in ('docker inspect --format "{{.Created}}" !IMAGE_NAME! 2^>nul') do (
    > "%TEMP%\wc_img_time.txt" echo %%t
)
set /p IMG_TIME=<"%TEMP%\wc_img_time.txt"

%WC% 704 "!IMG_TIME!"

powershell -NoProfile -Command "$img=[DateTime]::Parse((Get-Content '%TEMP%\wc_img_time.txt'));$f=(Get-Item 'deploy\Dockerfile').LastWriteTime;if($f-gt$img){exit 1}else{exit 0}"

if errorlevel 1 (
    echo.
    %WC% 502
    %WC% 705
    echo.
    %WC% 603
    set /p REBUILD_CHOICE=
    if /I "!REBUILD_CHOICE!"=="Y" (
        set DOCKER_ACTION=build
    ) else (
        %WC% 601
    )
) else (
    %WC% 308
)

:DO_DOCKER
echo.
%WC% 706

if "!DOCKER_ACTION!"=="build" (
    docker compose -f deploy\docker-compose.yml up --build -d
    if errorlevel 1 goto :ERR_BACKEND_BUILD
) else (
    docker compose -f deploy\docker-compose.yml up -d
    if errorlevel 1 goto :ERR_BACKEND_UP
)

%WC% 707
timeout /t 5 /nobreak >nul

docker compose ps | findstr "Up" >nul
if errorlevel 1 (
    %WC% 503
) else (
    %WC% 309
)

netstat -ano | findstr :7860 >nul
if errorlevel 1 (
    %WC% 504
) else (
    %WC% 310
)

echo.

REM ====================================================================
REM Step 4: Frontend setup
REM ====================================================================
%WC% 203
echo.

cd /d "%FRONTEND_DIR%"

echo [OK] Frontend deps install inside web container on first start.

REM ====================================================================
REM Step 5: Start frontend (Vite)
REM ====================================================================
%WC% 204
%WC% 708

for /f "tokens=4 delims= " %%i in ('route print ^| findstr 0.0.0.0 ^| findstr /V "127.0.0.1" ^| findstr /V "255.255.255.255"') do (
    set LOCAL_IP=%%i
    goto :IP_FOUND
)
:IP_FOUND
%WC% 602 "http://!LOCAL_IP!:5173"
%WC% 709
echo.

timeout /t 8 /nobreak >nul

REM ====================================================================
REM Step 6: Open browser
REM ====================================================================
%WC% 205
%WC% 710
echo.

timeout /t 3 /nobreak

start http://localhost:5173

echo.
%WC% 100
%WC% 313
%WC% 102
echo.
%WC% 800
%WC% 900
%WC% 711
echo.
%WC% 801
%WC% 901
%WC% 902
%WC% 712
echo.
%WC% 802
%WC% 903
%WC% 713
%WC% 904
%WC% 713
%WC% 714
%WC% 713
%WC% 715
echo.
%WC% 803
%WC% 716
%WC% 717
%WC% 718
%WC% 719
%WC% 720
echo.
%WC% 804
%WC% 721
%WC% 722
%WC% 723
echo.
%WC% 100
%WC% 728
%WC% 102
echo.

echo.
%WC% 729
pause >nul

endlocal
exit /b 0

REM ====================================================================
REM Error handlers (goto targets)
REM ====================================================================
:ERR_DOCKER
%WC% 402
%WC% 733
pause
exit /b 1

:ERR_DOCKER_START
%WC% 403
pause
exit /b 1

:ERR_COMPOSE
%WC% 404
pause
exit /b 1

:ERR_COMPOSE_FILE
%WC% 405
%WC% 734
pause
exit /b 1

:ERR_BACKEND_BUILD
%WC% 406
pause
exit /b 1

:ERR_BACKEND_UP
%WC% 407
pause
exit /b 1
