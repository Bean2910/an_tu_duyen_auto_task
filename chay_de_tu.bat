@echo off
chcp 65001 >nul
title AN TỰ DUYÊN - BẦY ĐỆ TỬ NGẦM

echo ========================================================================
echo                 AN TỰ DUYÊN - TRÌNH ĐIỀU HÀNH ĐỆ TỬ NGẦM
echo ========================================================================
echo.

:: Kiểm tra xem máy đã cài Node.js chưa
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [LỖI] Máy tính này chưa cài đặt Node.js!
    echo Vui lòng tải và cài đặt Node.js tại: https://nodejs.org/ (chọn bản LTS).
    echo Sau khi cài xong, mở lại file này là chạy được ngay!
    echo.
    pause
    exit /b
)

set /p COUNT="▶ Nhập số lượng đệ tử muốn gọi (Nhấn Enter mặc định là 20): "
if "%COUNT%"=="" set COUNT=20

echo.
echo ▶ Chọn chế độ kết nối:
echo   [1] Tự động cào Proxy miễn phí (Khuyên dùng để tránh giới hạn IP)
echo   [2] Kết nối trực tiếp (Khi dùng mạng bình thường hoặc đã bật WARP)
echo.
set /p MODE="▶ Lựa chọn của bạn (Nhấn Enter mặc định là 1): "
if "%MODE%"=="" set MODE=1

if "%MODE%"=="1" (
    echo.
    echo Đang khởi động %COUNT% đệ tử với Proxy miễn phí tự động...
    node disciples.js --count=%COUNT% --free-proxy --follow --auto
) else (
    echo.
    echo Đang khởi động %COUNT% đệ tử kết nối trực tiếp...
    node disciples.js --count=%COUNT% --follow --auto
)

pause
