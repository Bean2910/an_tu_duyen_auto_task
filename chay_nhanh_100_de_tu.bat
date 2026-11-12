@echo off
chcp 65001 >nul
title AN TỰ DUYÊN - 100 ĐỆ TỬ NGẦM (PROXIES)

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

echo Đang khởi động 100 đệ tử chạy qua Proxy miễn phí...
echo Đệ tử sẽ tự động vào phòng chùa, tự bám theo và tự lạy cùng Acc chính!
echo.
node disciples.js --count=100 --free-proxy --follow --auto --hang=5

pause
