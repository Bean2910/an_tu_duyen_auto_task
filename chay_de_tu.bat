@echo off
chcp 65001 >nul
title AN TỰ DUYÊN - TRÌNH ĐIỀU HÀNH ĐỆ TỬ NGẦM

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

set /p COUNT="▶ Nhập số lượng đệ tử muốn gọi (Nhấn Enter mặc định là 100): "
if "%COUNT%"=="" set COUNT=100

echo.
echo ▶ Chọn chế độ kết nối mạng cho %COUNT% đệ tử:
echo   [1] Cào 3.000+ Proxy SOCKS5 miễn phí từ GitHub & Proxyscrape (Mặc định)
echo   [2] Dùng Tor Multi-Circuit (Khuyên dùng cho 100 đệ tử: 100 IP riêng, không dis)
echo   [3] Dùng danh sách Proxy riêng trong file proxies.txt
echo   [4] Kết nối trực tiếp không qua proxy (chỉ nên dùng khi gọi dưới 10 đệ tử)
echo.
set /p MODE="▶ Lựa chọn của bạn (Nhấn Enter mặc định là 1): "
if "%MODE%"=="" set MODE=1

if "%MODE%"=="1" (
    echo.
    echo Đang khởi động %COUNT% đệ tử với kho Proxy SOCKS5 miễn phí...
    node disciples.js --count=%COUNT% --free-proxy --follow --auto --hang=5
) else if "%MODE%"=="2" (
    echo.
    echo Đang khởi động %COUNT% đệ tử qua Tor Multi-Circuit (cần mở cửa sổ 'tor' trước)...
    node disciples.js --count=%COUNT% --tor --follow --auto --hang=5
) else if "%MODE%"=="3" (
    echo.
    echo Đang nạp proxy từ file proxies.txt cho %COUNT% đệ tử...
    node disciples.js --count=%COUNT% --proxy-file=proxies.txt --follow --auto --hang=5
) else (
    echo.
    echo Đang khởi động %COUNT% đệ tử kết nối trực tiếp...
    node disciples.js --count=%COUNT% --follow --auto
)

pause
