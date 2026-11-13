@echo off
chcp 65001 >nul
title AN TU DUYEN - BANG DIEU KHIEN DE TU (GUI)

echo ========================================================================
echo        AN TU DUYEN - BANG DIEU KHIEN QUAN DOAN DE TU (GUI)
echo ========================================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 goto no_node

if "%1"=="-tor" goto install_tor
if "%1"=="--tor" goto install_tor
if "%1"=="--install-tor" goto install_tor

goto start_gui

:install_tor
echo ========================================================================
echo               TU DONG CAI DAT TOR PORTABLE (~15MB)
echo ========================================================================
echo Dang ket noi Tor Project de tai ban Tor Expert Bundle 64-bit...
if not exist "tor" mkdir "tor"
curl.exe -L "https://archive.torproject.org/tor-package-archive/torbrowser/14.0.8/tor-expert-bundle-windows-x86_64-14.0.8.tar.gz" -o "tor_bundle.tar.gz" --progress-bar
if exist "tor_bundle.tar.gz" (
    echo Dang giai nen Tor vao thu muc tor/...
    tar.exe -xzf "tor_bundle.tar.gz" -C "tor"
    del "tor_bundle.tar.gz" >nul 2>nul
    echo [THANH CONG] Da cai dat Tor Portable vao thu muc 'tor'!
) else (
    echo [LOI] Khong tai duoc Tor bundle, vui long kiem tra ket noi mang.
)
echo.

:start_gui
echo Dang khoi dong giao dien dieu khien GUI va trieu hoi de tu...
node disciples.js --gui --count=100 --follow --auto --hang=5
goto end

:no_node
echo.
echo [LOI] May tinh nay chua cai dat Node.js!
echo Vui long tai va cai dat Node.js tai: https://nodejs.org/
echo Sau khi cai xong, mo lai file nay la chay duoc ngay!
echo.
pause
exit /b

:end
pause
