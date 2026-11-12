@echo off
chcp 65001 >nul
title CÀI ĐẶT TOR MULTI-CIRCUIT - AN TỰ DUYÊN

echo ========================================================================
echo       CÀI ĐẶT TOR MULTI-CIRCUIT CHO 100 ĐỆ TỬ (AN TỰ DUYÊN)
echo ========================================================================
echo.
echo Tor giúp bạn tạo ra 100 đường truyền mạng với 100 IP khác nhau hoàn toàn,
echo giúp chạy 100 đệ tử cùng lúc mà KHÔNG BAO GIỜ bị giới hạn IP hay bị ngắt kết nối.
echo.
echo ▶ LỰA CHỌN CÀI ĐẶT:
echo   [1] Tự động tải Tor Portable siêu nhẹ (~15MB, KHÔNG CẦN CÀI ĐẶT, khuyên dùng)
echo   [2] Cài đặt Tor Browser chính chủ (qua công cụ winget của Windows)
echo   [3] Mở trang chủ Tor Project để tự tải bằng trình duyệt
echo.
set /p CHOICE="▶ Nhập lựa chọn của bạn [1-3] (Nhấn Enter mặc định là 1): "
if "%CHOICE%"=="" set CHOICE=1

if "%CHOICE%"=="1" (
    echo.
    echo ------------------------------------------------------------------------
    echo Đang kết nối máy chủ Tor Project để tải bản Tor Expert Bundle 64-bit...
    echo ------------------------------------------------------------------------
    if not exist "tor" mkdir "tor"
    
    :: Tải gói Tor Expert Bundle chính chủ bằng curl tích hợp sẵn trên Windows
    curl.exe -L "https://archive.torproject.org/tor-package-archive/torbrowser/14.0.8/tor-expert-bundle-windows-x86_64-14.0.8.tar.gz" -o "tor_bundle.tar.gz" --progress-bar
    
    if exist "tor_bundle.tar.gz" (
        echo.
        echo Đang giải nén Tor vào thư mục tor/...
        tar.exe -xzf "tor_bundle.tar.gz" -C "tor"
        del "tor_bundle.tar.gz" >nul 2>nul
        echo.
        echo ========================================================================
        echo [THÀNH CÔNG] ĐÃ TẢI VÀ GIẢI NÉN TOR PORTABLE VÀO THƯ MỤC 'tor'!
        echo ========================================================================
        echo.
        echo Bây giờ bạn chỉ cần nhấp đúp vào file 'chay_100_de_tu_tor.bat'
        echo Hệ thống sẽ tự động khởi động Tor và chạy 100 đệ tử cùng lúc!
    ) else (
        echo.
        echo [LỖI] Không tải được file tự động (có thể do kết nối mạng).
        echo Bạn có thể chọn [3] để tải file cài đặt Tor thủ công từ trình duyệt.
    )
) else if "%CHOICE%"=="2" (
    echo.
    echo ------------------------------------------------------------------------
    echo Đang cài đặt Tor Browser qua Windows winget...
    echo ------------------------------------------------------------------------
    winget install TorProject.TorBrowser --accept-package-agreements --accept-source-agreements
    echo.
    echo Sau khi cài xong Tor Browser, bạn chỉ cần mở Tor Browser lên và
    echo nhấp đúp vào file 'chay_100_de_tu_tor.bat' để gọi 100 đệ tử!
) else (
    echo.
    echo Đang mở trình duyệt vào trang tải chính thức của Tor Project...
    start https://www.torproject.org/download/
    echo.
    echo Hãy tải và cài đặt Tor Browser. Sau đó mở Tor Browser và
    echo chạy file 'chay_100_de_tu_tor.bat'.
)

echo.
pause

