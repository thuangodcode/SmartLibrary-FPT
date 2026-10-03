-- ============================================================
-- SmartLibrary – Advanced Auth & Registration Migration
-- ============================================================

-- ── 1. ADD NEW VALUES TO account_status ENUM ────────────────
ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'PendingActivation';
ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'PendingDocuments';
ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'PendingApproval';
ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'Rejected';

-- ── 2. CREATE reader_type ENUM ───────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reader_type') THEN
        CREATE TYPE reader_type AS ENUM ('Student', 'Lecturer', 'External');
    END IF;
END $$;

-- ── 3. UPDATE profiles table ──────────────────────────────────
ALTER TABLE profiles 
    ADD COLUMN IF NOT EXISTS reader_type reader_type,
    ADD COLUMN IF NOT EXISTS membership_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS date_of_birth DATE,
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- ── 4. NEW ENUMS FOR REGISTRATION ──────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_type') THEN
        CREATE TYPE document_type AS ENUM ('NationalId', 'StudentCard', 'DriverLicense');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'registration_request_status') THEN
        CREATE TYPE registration_request_status AS ENUM ('Submitted', 'Approved', 'Rejected', 'NeedMoreInfo');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_side') THEN
        CREATE TYPE document_side AS ENUM ('Front', 'Back', 'Selfie');
    END IF;
END $$;

-- ── 5. NEW TABLES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS registration_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    document_type document_type NOT NULL,
    attempt_no INT NOT NULL DEFAULT 1,
    status registration_request_status NOT NULL DEFAULT 'Submitted',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    reject_reason TEXT,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS identity_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES registration_requests(id) ON DELETE CASCADE,
    side document_side NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    sha256 VARCHAR(64) NOT NULL,
    document_last4 VARCHAR(4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS user_import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    total_rows INT NOT NULL DEFAULT 0,
    success_rows INT NOT NULL DEFAULT 0,
    failed_rows INT NOT NULL DEFAULT 0,
    errors JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 6. SEED PERMISSIONS ───────────────────────────────────────
INSERT INTO permissions (code, description) VALUES
    ('registration:review', 'Xét duyệt hồ sơ đăng ký độc giả'),
    ('registration:view-documents', 'Xem ảnh giấy tờ tùy thân'),
    ('user:import', 'Import danh sách người dùng hàng loạt'),
    ('user:create-reader', 'Tạo tài khoản độc giả (Student/Lecturer)')
ON CONFLICT (code) DO NOTHING;

-- Assign to Roles
DO $$
DECLARE
    librarian_role_id UUID;
    admin_role_id UUID;
BEGIN
    SELECT id INTO librarian_role_id FROM roles WHERE name = 'Librarian';
    SELECT id INTO admin_role_id FROM roles WHERE name = 'Admin';

    IF librarian_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT librarian_role_id, id FROM permissions WHERE code IN ('registration:review', 'registration:view-documents', 'user:import', 'user:create-reader')
        ON CONFLICT DO NOTHING;
    END IF;

    IF admin_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT admin_role_id, id FROM permissions WHERE code IN ('registration:review', 'registration:view-documents', 'user:import', 'user:create-reader')
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- ── 7. STORAGE BUCKET ─────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public) 
VALUES ('identity-documents', 'identity-documents', false)
ON CONFLICT (id) DO NOTHING;
