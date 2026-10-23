CREATE TABLE IF NOT EXISTS book_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    borrow_record_id UUID NOT NULL REFERENCES borrow_records(id),
    book_copy_id UUID NOT NULL REFERENCES book_copies(id),
    reader_id UUID NOT NULL REFERENCES profiles(id),
    kind VARCHAR(20) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'Unknown',
    status VARCHAR(40) NOT NULL DEFAULT 'PendingReview',
    description TEXT,
    replacement_value DECIMAL(12,2),
    assessed_fee DECIMAL(12,2),
    include_overdue BOOLEAN NOT NULL DEFAULT FALSE,
    compensation_fine_id UUID REFERENCES fines(id) ON DELETE SET NULL,
    overdue_fine_id UUID REFERENCES fines(id) ON DELETE SET NULL,
    reported_by UUID REFERENCES profiles(id),
    confirmed_by UUID REFERENCES profiles(id),
    confirmed_at TIMESTAMPTZ,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_book_incidents_reader ON book_incidents(reader_id);
CREATE INDEX IF NOT EXISTS idx_book_incidents_status ON book_incidents(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_book_incidents_open_loan
    ON book_incidents(borrow_record_id)
    WHERE is_deleted = FALSE AND status IN ('PendingReview', 'CompensationPending');
