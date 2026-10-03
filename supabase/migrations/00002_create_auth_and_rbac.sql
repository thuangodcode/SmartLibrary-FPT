-- ============================================================
-- SmartLibrary – Authentication & Full RBAC Migration
-- Migration file: 00002_create_auth_and_rbac.sql
-- ============================================================

-- ── 1. ACCOUNT STATUS ENUM ───────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_status') THEN
        CREATE TYPE account_status AS ENUM ('PendingVerification', 'Active', 'Suspended');
    END IF;
END $$;

-- ── 2. ROLES TABLE ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Default Roles
INSERT INTO roles (name, description) VALUES
    ('Reader', 'Sinh viên / Độc giả thư viện, mượn trả và nhận gợi ý AI'),
    ('Librarian', 'Thủ thư quản lý kho sách, xử lý phiếu mượn và duyệt phạt'),
    ('Admin', 'Quản trị viên toàn quyền hệ thống, quản lý người dùng & phân quyền')
ON CONFLICT (name) DO NOTHING;

-- ── 3. PERMISSIONS TABLE ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. ROLE_PERMISSIONS JOIN TABLE ─────────────────────────────
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Seed Permissions (resource:action)
INSERT INTO permissions (code, description) VALUES
    ('book:read', 'Xem thông tin sách'),
    ('book:create', 'Tạo sách mới'),
    ('book:update', 'Cập nhật thông tin sách'),
    ('book:delete', 'Xóa sách'),
    ('borrow:create', 'Đăng ký mượn sách'),
    ('borrow:process', 'Duyệt/Xử lý phiếu mượn tại quầy'),
    ('borrow:renew', 'Gia hạn thời gian giữ sách'),
    ('fine:view', 'Xem danh sách tiền phạt'),
    ('fine:manage', 'Duyệt/Miễn giảm tiền phạt'),
    ('user:manage', 'Quản lý tài khoản và phân quyền người dùng'),
    ('report:export', 'Xuất báo cáo thống kê thư viện')
ON CONFLICT (code) DO NOTHING;

-- Assign Permissions to Roles
DO $$
DECLARE
    reader_role_id UUID;
    librarian_role_id UUID;
    admin_role_id UUID;
BEGIN
    SELECT id INTO reader_role_id FROM roles WHERE name = 'Reader';
    SELECT id INTO librarian_role_id FROM roles WHERE name = 'Librarian';
    SELECT id INTO admin_role_id FROM roles WHERE name = 'Admin';

    -- Reader permissions
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT reader_role_id, id FROM permissions WHERE code IN ('book:read', 'borrow:create', 'borrow:renew', 'fine:view')
    ON CONFLICT DO NOTHING;

    -- Librarian permissions
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT librarian_role_id, id FROM permissions WHERE code IN ('book:read', 'book:create', 'book:update', 'borrow:create', 'borrow:process', 'borrow:renew', 'fine:view', 'fine:manage', 'report:export')
    ON CONFLICT DO NOTHING;

    -- Admin permissions (All permissions)
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT admin_role_id, id FROM permissions
    ON CONFLICT DO NOTHING;
END $$;

-- ── 5. UPDATE PROFILES TABLE FOR RBAC ─────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status account_status NOT NULL DEFAULT 'PendingVerification';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Migrate existing role enum values to role_id
DO $$
DECLARE
    r_id UUID;
BEGIN
    SELECT id INTO r_id FROM roles WHERE name = 'Reader';
    UPDATE profiles SET role_id = r_id WHERE role_id IS NULL;
END $$;

-- ── 6. AUTH AUDIT LOGS TABLE ───────────────────────────────────
CREATE TABLE IF NOT EXISTS auth_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    event VARCHAR(50) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_user ON auth_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_event ON auth_audit_logs(event);
CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_created ON auth_audit_logs(created_at DESC);

-- ── 7. TRIGGER FOR AUTO CREATING PROFILE ON SIGNUP ──────────────
CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS TRIGGER AS $$
DECLARE
    default_role_id UUID;
BEGIN
    SELECT id INTO default_role_id FROM public.roles WHERE name = 'Reader';

    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        student_id,
        role_id,
        status,
        created_at,
        updated_at
    )
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'student_id',
        default_role_id,
        'PendingVerification',
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create Trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_signup();

-- ── 8. RLS POLICIES FOR AUTH AUDIT LOGS ────────────────────────
ALTER TABLE auth_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_audit_logs_admin_select" ON auth_audit_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN roles r ON p.role_id = r.id
            WHERE p.id = auth.uid() AND r.name = 'Admin'
        )
    );
