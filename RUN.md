# Script hỗ trợ khởi chạy Backend & Dự án SmartLibrary nhanh nhất

## Cách 1: Sử dụng Makefile / npm Script từ Thư mục Gốc (Recommeded)
Bạn có thể chạy câu lệnh gộp từ gốc thư mục `SmartLibrary-FPT`:

```powershell
# Chạy Backend API (1 câu lệnh từ bất kỳ đâu trong thư mục gốc):
npm run dev:api

# Hoặc nếu ở sẵn thư mục apps/api:
dotnet run --project src/SmartLibrary.Api
```

---

## Cách 2: Chạy song song cả Backend (API) + Frontend (Web) + Mobile bằng 1 lệnh duy nhất
Tại thư mục gốc `SmartLibrary-FPT`:

```powershell
npm run dev
```
> Lệnh này sẽ dùng `concurrently` để kích hoạt cả 3 dự án Backend API, React Web Admin, và Expo Mobile cùng một lúc trong 1 Terminal.

---

## Danh sách Shortcut Scripts đã cấu hình sẵn trong package.json gốc:

| Lệnh | Mô tả |
| --- | --- |
| `npm run dev:api` | Khởi chạy duy nhất .NET Backend API (`http://localhost:5278/swagger`) |
| `npm run dev:web` | Khởi chạy React Web (Vite dev server) |
| `npm run dev:mobile` | Khởi chạy Expo React Native Mobile |
| `npm run test:api` | Chạy toàn bộ Unit Tests của Backend API |
| `npm run build:api` | Build kiểm tra toàn bộ Solution .NET Backend |
| `npm run dev` | Khởi chạy đồng thời Backend + Web + Mobile |
