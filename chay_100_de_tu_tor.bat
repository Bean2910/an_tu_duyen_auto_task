@echo off
chcp 65001 >nul
title AN TỰ DUYÊN - 100 ĐỆ TỬ NGẦM (TOR MULTI-CIRCUIT)

echo ========================================================================
echo        AN TỰ DUYÊN - CHẠY 100 ĐỆ TỬ NGẦM (TOR MULTI-CIRCUIT)
echo ========================================================================
echo.

:: 1. Kiểm tra xem máy đã cài Node.js chưa
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [LỖI] Máy tính này chưa cài đặt Node.js!
    echo Vui lòng tải và cài đặt Node.js tại: https://nodejs.org/ (bản LTS).
    echo Sau khi cài xong, mở lại file này là chạy được ngay!
    echo.
    pause
    exit /b
)

:: 2. Kiểm tra xem cổng Tor (9050 hoặc 9150) đã mở chưa
set TOR_RUNNING=0
netstat -ano | findstr ":9050" >nul 2>nul
if %errorlevel% equ 0 set TOR_RUNNING=1

netstat -ano | findstr ":9150" >nul 2>nul
if %errorlevel% equ 0 set TOR_RUNNING=1

if %TOR_RUNNING% equ 1 (
    echo [TOR] Dịch vụ Tor đã được phát hiện đang chạy sẵn sàng!
    goto start_disciples
)

:: 3. Nếu chưa chạy, tìm file tor.exe để tự động khởi động
set TOR_EXE=
if exist "tor\tor.exe" set TOR_EXE=tor\tor.exe
if exist "tor\tor\tor.exe" set TOR_EXE=tor\tor\tor.exe

if "%TOR_EXE%"=="" (
    where tor >nul 2>nul
    if %errorlevel% equ 0 set TOR_EXE=tor
)

if "%TOR_EXE%"=="" (
    if exist "%LOCALAPPDATA%\Programs\Tor Browser\Browser\TorBrowser\Tor\tor.exe" (
        set TOR_EXE=%LOCALAPPDATA%\Programs\Tor Browser\Browser\TorBrowser\Tor\tor.exe
    )
)

if "%TOR_EXE%"=="" (
    if exist "C:\Program Files\Tor\tor.exe" (
        set TOR_EXE=C:\Program Files\Tor\tor.exe
    )
)

:: Nếu không tìm thấy tor.exe ở bất kỳ đâu
if "%TOR_EXE%"=="" (
    echo [CHƯA CÓ TOR] Máy bạn chưa tải hoặc cài đặt Tor!
    echo.
    set /p INSTALL_NOW="▶ Bạn có muốn chạy 'cai_dat_tor.bat' để tải Tor tự động không? [Y/N]: "
    if /i "%INSTALL_NOW%"=="Y" (
        call cai_dat_tor.bat
        goto check_again
    ) else (
        echo.
        echo [LƯU Ý] Nếu không dùng Tor, bạn có thể chạy file 'chay_de_tu.bat' để dùng Proxy miễn phí.
        pause
        exit /b
    )
)

:launch_tor
echo [TOR] Đang khởi động tiến trình Tor ngầm: %TOR_EXE%...
start "Tor Service (Chạy ngầm)" /min "%TOR_EXE%"
echo [TOR] Đang đợi Tor khởi tạo mạch mạng trong 5 giây...
timeout /t 5 /nobreak >nul

:start_disciples
echo.
echo ========================================================================
echo Đang kết nối 100 đệ tử qua Tor Multi-Circuit...
echo Mỗi đệ tử sẽ nhận một địa chỉ IP riêng biệt từ Tor!
echo ========================================================================
echo.
node disciples.js --count=100 --tor --follow --auto --hang=5

pause
exit /b

:check_again
if exist "tor\tor.exe" (
    set TOR_EXE=tor\tor.exe
    goto launch_tor
)
if exist "tor\tor\tor.exe" (
    set TOR_EXE=tor\tor\tor.exe
    goto launch_tor
)
echo.
echo Sau khi tải Tor xong, vui lòng nhấp đúp lại file này để chạy!
pause
