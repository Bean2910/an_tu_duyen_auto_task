@echo off
chcp 65001 >nul
title AN TỰ DUYÊN - 100 ĐỆ TỬ NGẦM

echo ========================================================================
echo        AN TỰ DUYÊN - CHẠY NHANH 100 ĐỆ TỬ NGẦM (VƯỢT GIỚI HẠN IP)
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

:: Nếu có file proxies.txt chứa proxy riêng thì ưu tiên dùng
if exist proxies.txt (
    findstr /r "[0-9]" proxies.txt >nul 2>nul
    if %errorlevel% equ 0 (
        echo [THÔNG BÁO] Tìm thấy danh sách trong proxies.txt, đang kết nối 100 đệ tử...
        node disciples.js --count=100 --proxy-file=proxies.txt --follow --auto --hang=5
        goto end
    )
)

echo Đang khởi động 100 đệ tử chạy qua kho 3.000+ Proxy SOCKS5 sống (Vượt giới hạn IP)...
echo Đệ tử sẽ tự động vào phòng chùa, tự bám theo và tự lạy cùng Acc chính!
echo.
node disciples.js --count=100 --free-proxy --follow --auto --hang=5

:end
pause
