# SmartLibrary - Architecture & Authentication Specification

## 1. Authentication Architecture Overview

SmartLibrary uses **Supabase Auth** as the primary Identity Provider (IdP) for securely managing user identities, hashing passwords, issuing JWT tokens, and handling email verification/password reset flows.

The **.NET 8 Web API** acts as the single point of entry for all Web & Mobile clients. Clients interact exclusively with the backend via `/api/v1/auth/*` endpoints.

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client (Web / Mobile)
    participant API as .NET 8 Web API
    participant DB as Supabase PostgreSQL
    participant Auth as Supabase GoTrue Auth

    note over Client, Auth: 1. Đăng ký tài khoản (Register)
    Client->>API: POST /api/v1/auth/register (Email, Password, FullName)
    API->>Auth: Signup User via GoTrue REST API
    Auth-->>API: User Created (Pending Email Confirmation)
    Auth-->>Client: Gửi Email chứa mã OTP xác thực
    API-->>Client: 200 OK { success: true, message: "Kiểm tra Email OTP" }

    note over Client, Auth: 2. Đăng nhập & Cấp Token (Login)
    Client->>API: POST /api/v1/auth/login (Email, Password)
    API->>Auth: Verify credentials via grant_type=password
    Auth-->>API: Access Token + Refresh Token
    API->>DB: Fetch Profile, Role & Permissions
    DB-->>API: User Profile + Role (Reader/Librarian/Admin) + Permissions
    alt Web Client
        API-->>Client: Access Token (In-Memory) + Refresh Token (HttpOnly Cookie)
    else Mobile Client
        API-->>Client: Access Token + Refresh Token (JSON Body -> SecureStore)
    end

    note over Client, Auth: 3. Cấp lại Token (Refresh Token Rotation)
    Client->>API: POST /api/v1/auth/refresh (Cookie / Header)
    API->>Auth: Refresh via grant_type=refresh_token
    Auth-->>API: New Access Token + New Refresh Token
    API-->>Client: New Access Token + Updated Refresh Token
```

---

## 2. Role-Based Access Control (RBAC) Matrix

| Role | Access Scope | Sample Permissions |
| --- | --- | --- |
| **Reader** (Sinh viên) | Mượn trả sách, xem tiền phạt, nhận gợi ý AI cá nhân hóa | `book:read`, `borrow:create`, `borrow:renew`, `fine:view` |
| **Librarian** (Thủ thư) | Quản lý kho sách, duyệt phiếu mượn/trả tại quầy, xử lý tiền phạt | `book:*`, `borrow:*`, `fine:*`, `report:export` |
| **Admin** (Quản trị viên) | Toàn quyền hệ thống, quản lý người dùng, phân quyền RBAC | `*` (All permissions) |

---

## 3. Business Error Codes

| Error Code | Status Code | Description |
| --- | --- | --- |
| `AUTH_INVALID_CREDENTIALS` | 401 | Email hoặc mật khẩu không đúng |
| `AUTH_EMAIL_NOT_VERIFIED` | 401 | Email chưa được xác minh qua mã OTP |
| `AUTH_ACCOUNT_SUSPENDED` | 403 | Tài khoản đã bị tạm ngưng |
| `AUTH_TOKEN_EXPIRED` | 401 | Access/Refresh Token đã hết hạn |
| `AUTH_WEAK_PASSWORD` | 400 | Mật khẩu không đạt tiêu chuẩn an toàn |
