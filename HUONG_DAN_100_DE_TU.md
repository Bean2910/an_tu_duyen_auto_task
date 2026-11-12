# 🏮 HƯỚNG DẪN CHẠY 100 ĐỆ TỬ NGẦM (HEADLESS DISCIPLES CLI)
### An Tự Duyên – Trợ lực công đức, hộ đạo & thuyết pháp quy mô lớn

Tài liệu này hướng dẫn chi tiết cách cài đặt, cấu hình và vận hành **100 đệ tử ngầm** chạy trực tiếp trong Terminal (cmd / powershell) với mức tiêu thụ tài nguyên siêu nhẹ (**0% GPU, < 15MB RAM, 0 tab trình duyệt, 0 thư viện npm bên ngoài**).

---

## 📌 MỤC LỤC
1. [Tại sao cần Proxy / Tor khi chạy 100 đệ tử?](#1-tại-sao-cần-proxy--tor-khi-chạy-100-đệ-tử)
2. [Cách 1 (Khuyên dùng): Tor Multi-Circuit (Miễn phí 100%, cực kỳ ổn định)](#2-cách-1-khuyên-dùng-tor-multi-circuit-miễn-phí-100-cực-kỳ-ổn-định)
3. [Cách 2: Sử dụng danh sách Proxy riêng (`proxies.txt`)](#3-cách-2-sử-dụng-danh-sách-proxy-riêng-proxiestxt)
4. [Cách 3: Tự động cào 3.000+ SOCKS5 Proxy miễn phí](#4-cách-3-tự-động-cào-3000-socks5-proxy-miễn-phí)
5. [Danh mục lệnh điều khiển trực tiếp trong Terminal](#5-danh-mục-lệnh-điều-khiển-trực-tiếp-trong-terminal)
6. [Các tính năng mới nổi bật](#6-các-tính-năng-mới-nổi-bật)
7. [Gợi ý & Mẹo tối ưu (Best Practices)](#7-gợi-ý--mẹo-tối-ưu-best-practices)

---

## 1. Lưu ý về Cơ chế Mạng & Cloudflare

Máy chủ game `didenchua.online` được bảo vệ bởi **Cloudflare WAF**:
- **Kết nối trực tiếp (Khuyên dùng)**: Hệ thống sử dụng bộ kết nối `PureWebSocket` chuẩn, hỗ trợ chạy mượt mà toàn bộ **100 đệ tử cùng lúc** trên 1 địa chỉ IP mà không bị ngắt kết nối, độ trễ cực thấp (0ms - 5ms).
- **Mạng Tor (Tor Multi-Circuit)**: Hiện tại Cloudflare tự động chặn các IP Exit Node của mạng Tor với mã lỗi `HTTP/1.1 403 Forbidden`. Nếu phát hiện lỗi này, hệ thống sẽ tự động chuyển về kết nối Trực tiếp để các đệ tử duy trì hoạt động bình thường.
- **Proxy riêng (`proxies.txt`)**: Nếu bạn muốn đổi IP cho từng đệ tử, hãy sử dụng danh sách Proxy riêng (SOCKS5/HTTP dân cư hoặc datacenter thông thường) dán vào `proxies.txt`.

---

## 🌟 CÁCH DÙNG MỚI (KHUYÊN DÙNG): BẢNG ĐIỀU KHIỂN GUI ĐỒ HỌA TRỰC QUAN

Nếu bạn không muốn gõ lệnh trong màn hình đen Terminal, bạn chỉ cần nhấp đúp chuột vào:
👉 [`chay_gui.bat`](file:///d:/Code/an_tu_duyen_auto_task/chay_gui.bat)

Hệ thống sẽ tự động bật một **cửa sổ ứng dụng Desktop (App Mode)** cực đẹp với đầy đủ các nút bấm:
- **Nút "Lạy Phật" to tướng**: Nhấp chuột hoặc bấm phím `Space` là 100 đệ tử lạy ngay.
- **Nút bật/tắt Tự động lạy**: Tự động lạy mỗi 7.5 giây.
- **Nút đổi đội hình 1-click**: 2 Hàng lối đi danh dự, 3 hàng, 5 hàng, hàng ngang, hàng dọc, trước mặt / sau lưng, khinh công bay lượn...
- **Radar người chơi**: Quét danh sách người chơi trong chùa, bấm nút **"🎯 Bám theo"** là đệ tử lập tức quay sang người đó.
- **Lưới đệ tử trực tiếp**: Theo dõi thời gian thực trạng thái và số lần lạy của từng đệ tử.
- **Tiêu thụ tài nguyên**: 0% GPU, < 15MB RAM, không cần cài Python hay Electron!

---

## 2. Cách 1: Tor Multi-Circuit (Miễn phí 100%, cực kỳ ổn định)

### 💡 Nguyên lý hoạt động:
Tor hỗ trợ tính năng **`IsolateSOCKSAuth`**. File `disciples.js` đã được tích hợp sẵn cơ chế cấp cho **mỗi đệ tử một ID xác thực riêng biệt**. Nhờ vậy, Tor sẽ tự động định tuyến mỗi đệ tử qua một đường truyền (circuit) độc lập với **100 địa chỉ IP khác nhau hoàn toàn trên toàn cầu**. Máy chủ game xem đây là 100 người dùng thật từ khắp nơi, không bao giờ lo bị nghẽn hay giới hạn IP!

### 🚀 Cách cài đặt và sử dụng (Chỉ cần 1 cú nhấp chuột):
1. **Bước 1 (Cài đặt Tor):**
   - Nhấp đúp vào file [`cai_dat_tor.bat`](file:///d:/python/an_tu_duyen_auto_task/cai_dat_tor.bat).
   - Chọn số `[1]`: Script sẽ tự động dùng lệnh native của Windows (`curl` & `tar`) tải bản **Tor Portable 64-bit chính chủ (~15MB)** về thư mục `tor\` mà không cần cài đặt rườm rà.
2. **Bước 2 (Chạy 100 đệ tử):**
   - Nhấp đúp vào file [`chay_100_de_tu_tor.bat`](file:///d:/python/an_tu_duyen_auto_task/chay_100_de_tu_tor.bat).
   - File `.bat` này sẽ tự động:
     - Khởi động Tor chạy ngầm ở chế độ thu nhỏ cửa sổ.
     - Tự động dò tìm cổng SOCKS5 (cổng `9050` của Tor Service hoặc `9150` của Tor Browser).
     - Khởi động 100 đệ tử kết nối qua Tor, xếp hàng 5 hàng tự động bám theo Acc chính và tự động lạy!

---

## 3. Cách 2: Sử dụng danh sách Proxy riêng (`proxies.txt`)

Nếu bạn có sẵn Proxy hoặc mua Proxy giá rẻ tại Việt Nam (như `proxyno1.com`, `tinproxy.com`, `proxyv6.net`... khoảng 5.000đ – 10.000đ/ngày):
- Ưu điểm: Ping siêu thấp (chỉ 5ms - 10ms), phản hồi tức thì, đệ tử di chuyển siêu mượt.
- **Cách dùng:**
  1. Mở file [`proxies.txt`](file:///d:/python/an_tu_duyen_auto_task/proxies.txt).
  2. Dán danh sách proxy vào file (mỗi dòng một proxy). Hỗ trợ cả SOCKS5 và HTTP, có hoặc không có tài khoản mật khẩu:
     ```text
     socks5://user123:pass456@103.1.2.3:1080
     http://user123:pass456@103.1.2.3:8080
     103.4.5.6:1080
     ```
  3. Mở [`chay_de_tu.bat`](file:///d:/python/an_tu_duyen_auto_task/chay_de_tu.bat) chọn `[3]` hoặc nhấp đúp [`chay_nhanh_100_de_tu.bat`](file:///d:/python/an_tu_duyen_auto_task/chay_nhanh_100_de_tu.bat). Hệ thống sẽ tự động đọc file và chia đều 100 đệ tử qua danh sách proxy!

---

## 4. Cách 3: Tự động cào 3.000+ SOCKS5 Proxy miễn phí

Nếu không cài Tor và không mua proxy:
- `disciples.js` được nâng cấp bộ thu thập tự động kết hợp từ **Proxyscrape API** và **kho SOCKS5 đồ sộ trên GitHub (TheSpeedX)** với hơn **3.000+ Proxy sống**.
- **Cơ chế tự hồi phục thông minh (`markProxyFailed`):** Khi một proxy bị đứt gánh giữa đường, hệ thống sẽ tự động gạch tên proxy đó, bốc một proxy mới từ kho 3.000+ proxy và cho đệ tử kết nối lại ngay lập tức sau 2.5 giây.
- **Cách chạy:** Nhấp đúp vào [`chay_nhanh_100_de_tu.bat`](file:///d:/python/an_tu_duyen_auto_task/chay_nhanh_100_de_tu.bat) hoặc chọn `[1]` trong [`chay_de_tu.bat`](file:///d:/python/an_tu_duyen_auto_task/chay_de_tu.bat).

---

## 5. Danh mục lệnh điều khiển trực tiếp trong Terminal

Khi cửa sổ Terminal đang chạy, bạn có thể gõ các lệnh sau và nhấn Enter để điều khiển ngay lập tức:

| Lệnh | Phím tắt | Ý nghĩa |
| :--- | :--- | :--- |
| **Phím Space / Enter** | `lay` hoặc `l` | Toàn bộ 100 đệ tử lạy Phật đồng loạt ngay lập tức! |
| **`list`** | `players`, `peers` | Xem danh sách tất cả người chơi có mặt trong chùa kèm số thứ tự `[1]`, `[2]`... |
| **`target <số/tên>`** | — | Chỉ định người để 100 đệ tử bám theo! (VD: `target 1` hoặc `target Sư cô`, `target auto` để về lại Acc chính) |
| **`follow`** | `f`, `bamtheo` | Bật / tắt chế độ Tự đi theo người chơi khác |
| **`corridor`** | `hang2`, `loidi` | Bật / tắt đội hình 2 hàng danh dự tạo lối đi thông thoáng ở giữa |
| **`rows <n>`** | `hang <n>` | Chia đều 100 đệ tử thành `n` hàng ngồi ngay ngắn nghe thuyết pháp (VD: `rows 5`) |
| **`ngang` / `doc`** | — | Đổi kiểu hàng: Xếp theo Hàng Ngang (ngồi cạnh nhau) ↔ Hàng Dọc (xếp thẳng ra sau) |
| **`front` / `behind`** | — | Đổi hướng ngồi: Ngồi trước mặt đối diện sư phụ ↔ Ngồi sau lưng sư phụ |
| **`greet <câu>`** | `chao` | Toàn bộ đệ tử chắp tay cúi chào và chat câu bạn muốn (VD: `greet A Di Đà Phật`) |
| **`autochat`** | `tudongchat` | Bật / tắt chế độ Tự động chat lặp lại theo chu kỳ (mặc định 15s) |
| **`dismiss`** | `thuhoi`, `giaitan` | Thu hồi / giải tán toàn bộ đệ tử rút khỏi phòng ngay lập tức |
| **`summon`** | `trieuhoi` | Triệu hồi kết nối lại toàn bộ đệ tử vào phòng |
| **`kemten`** | `tagname` | Bật / tắt tính năng tự động kèm tên người đang theo dõi khi chat (VD: "Chào Sư cô" ↔ "Chào") |
| **`air`** | `fly`, `khinhcong`| Bật / tắt chế độ Đi trên không (Khinh công lướt mây, bay lên lượn xuống, không độn thổ) |
| **`roam`** | `didao` | Cho 100 đệ tử tản ra đi dạo tự do khắp các địa danh trong chùa |
| **`hall`** | `chanhdien` | Triệu tập toàn bộ đệ tử về Chánh điện xếp hàng quỳ lạy |
| **`tor`** | — | Bật / tắt chế độ Tor Multi-Circuit ngay trong lúc đang chạy |
| **`proxy <url>`** | — | Đổi sang proxy mới ngay lập tức (VD: `proxy socks5://127.0.0.1:40000`) |
| **`freeproxy`** | `autoproxy` | Cào mới danh sách Proxy SOCKS5 miễn phí |
| **`noproxy`** | `tatproxy` | Tắt toàn bộ proxy, chuyển về kết nối trực tiếp |
| **`count <số>`** | `c <số>` | Tăng/giảm số lượng đệ tử linh hoạt (từ 1 đến 499) |
| **`name <tên>`** | `ten <tên>` | Đổi tên cho toàn bộ đệ tử (Hỗ trợ cú pháp `#` hoặc `{i}` để tự đánh số) |
| **`auto`** | — | Bật / tắt chế độ tự động lạy định kỳ mỗi 7.5 giây |
| **`status`** | — | Xem trạng thái kết nối, phòng và số lần đã lạy của từng đệ tử |
| **`room <tên>`** | — | Di chuyển toàn bộ đệ tử sang phòng chùa khác (VD: `room chua-2`) |
| **`exit`** | `quit`, `q` | Thoát chương trình an toàn, ngắt kết nối sạch sẽ |

---

## 6. Các tính năng mới nổi bật

1. **PureWebSocket (Zero Dependencies):**
   - Không cần chạy `npm install`, không kéo thêm bất kỳ gói npm nặng nề nào vào máy. Sử dụng hoàn toàn module lõi có sẵn của Node.js (`net`, `tls`, `crypto`, `https`).
2. **Hỗ trợ Xác thực Proxy RFC 1928 / RFC 1929:**
   - Hỗ trợ đầy đủ Username & Password cho cả SOCKS5 và HTTP Tunnel Proxy.
3. **Đồng bộ Hành động Lạy Phật (`emote: "lay"`):**
   - Khi bạn (Acc chính) bấm lạy Phật trên trình duyệt Chrome, toàn bộ 100 đệ tử trong Terminal sẽ lập tức lạy theo bạn trong tích tắc.
4. **Không Độn Thổ (Ground-Clamping):**
   - Tọa độ Y luôn được tính toán dựa trên độ cao mặt đất (`getGroundY`) của từng vùng bản đồ, đảm bảo đệ tử không bao giờ bị rơi xuống đáy bản đồ hay độn thổ.
5. **Đa dạng Trang phục & Pháp khí:**
   - Mỗi đệ tử tự động chọn ngẫu nhiên màu áo (nâu, lam, vàng, sen, tuyết...), pháp khí (mõ, tràng hạt, kinh, gậy trúc...) tạo nên không gian sinh động, ấm cúng.

---

## 7. Gợi ý & Mẹo tối ưu (Best Practices)

- **Khi sao chép sang máy tính khác:**
  - Bạn chỉ cần copy cả thư mục project sang máy mới.
  - Cài Node.js (nếu máy mới chưa có) tại [nodejs.org](https://nodejs.org/).
  - Chạy file [`cai_dat_tor.bat`](file:///d:/python/an_tu_duyen_auto_task/cai_dat_tor.bat) một lần duy nhất, sau đó nhấp đúp [`chay_100_de_tu_tor.bat`](file:///d:/python/an_tu_duyen_auto_task/chay_100_de_tu_tor.bat) là xong! Không cần gõ bất kỳ dòng lệnh nào trong terminal.
- **Treo máy 24/7:**
  - File `disciples.js` tiêu thụ chưa đến 15MB RAM và 0% GPU, bạn có thể cắm máy cả ngày lẫn đêm mà quạt máy tính không hề rú rít hay nóng máy.
- **Khi muốn đổi người bám theo:**
  - Gõ `list` để xem số thứ tự của các đạo hữu trong phòng.
  - Gõ `target 2` để 100 đệ tử đồng loạt quay đầu sang bảo hộ và nghe pháp cùng đạo hữu số 2!

