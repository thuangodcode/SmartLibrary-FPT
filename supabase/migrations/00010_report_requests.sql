-- Separate assignment lifecycle for admin-requested librarian reports.
CREATE TABLE IF NOT EXISTS report_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    librarian_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    requested_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    template_id UUID NOT NULL REFERENCES report_templates(id) ON DELETE RESTRICT,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    name VARCHAR(250),
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    report_id UUID REFERENCES reports(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_report_requests_period CHECK (period_end > period_start)
);
CREATE INDEX IF NOT EXISTS idx_report_requests_librarian_status_created
    ON report_requests(librarian_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_requests_template ON report_requests(template_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_report_requests_report ON report_requests(report_id);

ALTER TABLE reports ADD COLUMN IF NOT EXISTS request_id UUID;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_reports_report_requests'
    ) THEN
        ALTER TABLE reports ADD CONSTRAINT fk_reports_report_requests
            FOREIGN KEY (request_id) REFERENCES report_requests(id) ON DELETE RESTRICT;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_reports_request ON reports(request_id);
