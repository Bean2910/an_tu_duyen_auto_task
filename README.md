# an_tu_duyen_auto_task
## An Tự Duyên Auto Task – Chrome Extension 2.0

## Cấu hình đã thiết lập
- Tác vụ: Mõ, Chuỗi hạt (beads), Thắp hương, Thỉnh chuông, Thắp đèn, Quét lá, Phóng sinh (cá), Nhận nhiệm vụ (claim).
- Thời gian nghỉ giữa các bước: 3 giây.
- Nhật ký hoạt động: bật.

## Cài đặt
1. Giải nén `AnTuDuyen-AutoTask-Chrome.zip`.
2. Mở Chrome và truy cập `chrome://extensions`.
3. Bật **Developer mode / Chế độ dành cho nhà phát triển**.
4. Chọn **Load unpacked / Tải tiện ích đã giải nén**.
5. Chọn thư mục `an_tu_duyen_auto_task`.
6. Mở hoặc tải lại `https://didenchua.online/`. Bảng trợ lý xuất hiện ở góc phải.

## Cách sử dụng
1. Đăng nhập game và để game tải xong.
2. Tự di chuyển nhân vật đến khu vực cần làm nhiệm vụ.
3. Bấm **Chạy**. Tiện ích sẽ tìm các nút/điều khiển đang hiển thị trong giao diện game và thao tác qua chúng.
4. Bấm **Dừng** bất cứ lúc nào.

## Giới hạn quan trọng
Game thực hiện nhiều hành động thông qua tương tác 3D và yêu cầu vị trí/điều kiện thật:
- Mõ: cần mở bảng Tụng kinh/Mõ để tiện ích bật chế độ Mõ tự động chính thức của game.
- Chuỗi hạt: cần mở bảng Chuỗi hạt; tiện ích chỉ chạm hạt trong bảng đang mở.
- Thắp hương, thỉnh chuông, thắp đèn, quét lá, phóng sinh: cần tự đưa nhân vật tới đúng địa điểm để nút hành động của game xuất hiện. Quét lá và phóng sinh còn cần người chơi tự di chuyển đúng cách.
- Nhận nhiệm vụ: cần mở Menu → Nhiệm vụ; tiện ích chỉ bấm các nút `[data-claim]` do giao diện game hiển thị.

Tiện ích **không** kết nối/hook WebSocket, không gửi gói tin game, không sửa dữ liệu, không giả mạo vị trí, không tạo hoặc cộng công đức. Nếu điều kiện game chưa sẵn sàng, nhật ký sẽ ghi hướng dẫn thay vì cố gửi hành động.

## Quyền riêng tư
Tiện ích chỉ chạy trên `didenchua.online` và không yêu cầu quyền truy cập dữ liệu khác.
